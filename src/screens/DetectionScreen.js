import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  StatusBar,
  Alert,
  Modal,
  Switch,
  ScrollView,
} from 'react-native';
import {Colors} from '../utils/colors';
import {Images} from '../assets/images';
import ScreenHeader from '../components/ScreenHeader';
import {getDeviceId} from '../services/device';
import {syncPractice} from '../services/account';
import {requestSummary} from '../services/coach';
import {speak, stop as stopSpeak} from '../services/voice';
import {
  getSelectedCoachId,
  profileById,
  isVoiceEnabled,
  setVoiceEnabled,
} from '../services/coachPrefs';
import {onPracticeError, onPracticeEnd, resetSession} from '../services/companion';
import {ALARM_SOUNDS, alarmNameById} from '../utils/alarmSounds';
import {playAlarmId, stopAlarm} from '../services/alarmPlayer';
import {getItem, setItem} from '../services/storage';
import {pick} from '../utils/rabbitMessages';
import TutuDetector, {TutuDetectorView} from 'tutu-detector';

const SPEAK_COOLDOWN_MS = 3000; // 对应 AICoach.speakCooldownMs 默认 3000
const ENCOURAGE_INTERVAL_MS = 25000; // 对应 aiTimer 鼓励间隔 ~25s
const ALARM_PERIOD_SEC = 3; // 对应免费版 monitorPeriod 默认 3 秒
const ALARM_MATCH_TARGET = 70; // 周期匹配率门槛（%），低于则报警

const BTN_START = {r: 255, g: 107, b: 138};
const BTN_END = {r: 255, g: 138, b: 171};
const BTN_STEPS = 28;

function lerpChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function lerpRgb(from, to, t) {
  return `rgb(${lerpChannel(from.r, to.r, t)},${lerpChannel(
    from.g,
    to.g,
    t,
  )},${lerpChannel(from.b, to.b, t)})`;
}

const DetectionScreen = ({navigation, route}) => {
  const premium = !!route?.params?.premium;
  const [detecting, setDetecting] = useState(false);
  const [matchRate, setMatchRate] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorText, setErrorText] = useState('');
  const [hasTemplate, setHasTemplate] = useState(false);
  const [coachId, setCoachId] = useState(route?.params?.coachId || 'coach_pro');
  const [coachName, setCoachName] = useState('点击选择');
  const [showRingtone, setShowRingtone] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [alarmId, setAlarmId] = useState(0);

  const sessionStart = useRef(0);
  const sessionMatchRate = useRef(0);
  const tickTimer = useRef(null);
  const profileRef = useRef(profileById('coach_pro'));
  const lastSpeakRef = useRef(0);
  const lastEncourageRef = useRef(0);
  const periodMatchRef = useRef(0);
  const periodTotalRef = useRef(0);
  const periodSecRef = useRef(0);
  const alarmIdRef = useRef(0);

  // 载入已选教练 / 语音开关 / 铃声选择。
  useEffect(() => {
    let alive = true;
    (async () => {
      const id = route?.params?.coachId || (await getSelectedCoachId());
      const prof = profileById(id);
      const von = await isVoiceEnabled();
      const savedAlarm = Number((await getItem('alarm_sound_id')) || '0');
      if (!alive) return;
      setCoachId(id);
      profileRef.current = prof;
      setCoachName(prof.displayName);
      setVoiceOn(von);
      const aId = Number.isNaN(savedAlarm) ? 0 : savedAlarm;
      setAlarmId(aId);
      alarmIdRef.current = aId;
    })();
    return () => {
      alive = false;
    };
  }, [route?.params?.coachId]);

  useEffect(() => {
    return () => {
      if (tickTimer.current) clearInterval(tickTimer.current);
      stopSpeak();
      stopAlarm();
    };
  }, []);

  // 教练说话（带语速/音高/冷却），仅 AI 陪练版 + 已开启语音。
  const coachSpeak = (text, {force = false} = {}) => {
    if (!premium || !voiceOn || !text) return;
    const now = Date.now();
    if (!force && now - lastSpeakRef.current < SPEAK_COOLDOWN_MS) return;
    lastSpeakRef.current = now;
    const p = profileRef.current || {};
    speak(text, {rate: p.speechRate || 1.0, pitch: p.pitch || 1.0});
  };

  const onDetectorResult = e => {
    const r = e?.nativeEvent || {};
    if (typeof r.matchRate === 'number') {
      setMatchRate(r.matchRate);
      sessionMatchRate.current = r.matchRate;
    }
    const hasError = Array.isArray(r.errors) && r.errors.length > 0;
    if (hasError) {
      setErrorText(r.errors[0]);
    } else if (r.hasMatch && r.pass) {
      setErrorText('');
    }
    if (!detecting) return;
    onPracticeError(hasError);
    // 周期匹配统计（免费版周期报警用）。
    if (r.hasMatch || hasError) {
      periodTotalRef.current += 1;
      if (!hasError && r.pass) periodMatchRef.current += 1;
    }
    // AI 实时语音反馈（对应 AICoach.processFrameResult / aiTimer）。
    if (premium && voiceOn) {
      const p = profileRef.current || {};
      if (hasError) {
        const tpl =
          p.errorTemplates && p.errorTemplates.length
            ? pick(p.errorTemplates)
            : '注意，%s需要纠正';
        coachSpeak(tpl.replace('%s', r.errors[0]));
      } else {
        const now = Date.now();
        if (now - lastEncourageRef.current > ENCOURAGE_INTERVAL_MS) {
          lastEncourageRef.current = now;
          if (p.encouragements && p.encouragements.length) {
            coachSpeak(pick(p.encouragements));
          }
        }
      }
    }
  };

  const onSetTemplate = async () => {
    if (!detecting) {
      Alert.alert(
        '设置目标手型',
        '请先点「启动」，把手摆成正确姿势对准摄像头，然后回到此处点「拍照/选模版」定格为目标模版。',
      );
      return;
    }
    try {
      const res = await TutuDetector.captureTemplateFromLive();
      if (res && (res.hasLeft || res.hasRight)) {
        setHasTemplate(true);
        Alert.alert(
          '模版已设置',
          `已记录${res.hasLeft ? '左手' : ''}${
            res.hasLeft && res.hasRight ? '、' : ''
          }${res.hasRight ? '右手' : ''}目标手型，开始对照练习吧！`,
        );
      } else {
        Alert.alert('未检测到手', '请把手完整对准摄像头后再试一次。');
      }
    } catch (err) {
      Alert.alert('设置失败', String(err?.message || err));
    }
  };

  const onToggleDetect = async () => {
    if (!detecting) {
      sessionStart.current = Date.now();
      setMatchRate(0);
      setElapsedSec(0);
      setErrorText('');
      resetSession();
      lastSpeakRef.current = 0;
      lastEncourageRef.current = Date.now();
      periodMatchRef.current = 0;
      periodTotalRef.current = 0;
      periodSecRef.current = 0;
      setDetecting(true);
      tickTimer.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - sessionStart.current) / 1000));
        // 免费版周期报警：每 ALARM_PERIOD_SEC 秒评估周期匹配率，过低则播放铃声。
        periodSecRef.current += 1;
        if (periodSecRef.current >= ALARM_PERIOD_SEC) {
          periodSecRef.current = 0;
          const total = periodTotalRef.current;
          const rate = total > 0 ? (periodMatchRef.current / total) * 100 : 100;
          if (!premium && total > 0 && rate < ALARM_MATCH_TARGET) {
            playAlarmId(alarmIdRef.current);
          }
          periodMatchRef.current = 0;
          periodTotalRef.current = 0;
        }
      }, 1000);
      // 开始监测语音（AI 陪练版）。
      if (premium && voiceOn) {
        coachSpeak('开始监测，注意保持正确手型', {force: true});
      }
      return;
    }
    setDetecting(false);
    if (tickTimer.current) {
      clearInterval(tickTimer.current);
      tickTimer.current = null;
    }
    stopSpeak();
    stopAlarm();
    const minutes = Math.max(0, (Date.now() - sessionStart.current) / 60000);
    if (minutes < 0.05) return; // 太短不计
    const rate = sessionMatchRate.current || 0;
    // 更新打卡/连续天数/积分/成就（对应 RabbitCompanion.onPracticeEnd）。
    try {
      await onPracticeEnd(rate, Math.max(1, Math.round(minutes)));
    } catch (e) {}
    try {
      await syncPractice(getDeviceId(), Number(minutes.toFixed(2)), rate);
      // AI 陪练版：请求个性化点评并语音播报（对应 speakLong）。
      if (premium) {
        const s = await requestSummary({
          coachId,
          minutes: Number(minutes.toFixed(1)),
          matchRate: rate,
        });
        if (s && s.ok && s.text) {
          if (voiceOn) {
            const p = profileRef.current || {};
            speak(s.text, {rate: p.speechRate || 1.0, pitch: p.pitch || 1.0});
          }
          Alert.alert('本次练习点评', s.text);
        }
      }
    } catch (e) {
      // 离线时静默：练习数据下次再补传（可接入本地缓存重试）
    }
  };

  const onSelectAlarm = async sound => {
    if (sound.locked) {
      Alert.alert('会员铃声', '该铃声为会员专属，开通会员后可使用。');
      return;
    }
    setAlarmId(sound.id);
    alarmIdRef.current = sound.id;
    await setItem('alarm_sound_id', sound.id);
    playAlarmId(sound.id); // 选择即预览（对应安卓 selectAlarm + playPreview）
    setShowRingtone(false);
  };

  const onToggleVoice = async on => {
    setVoiceOn(on);
    await setVoiceEnabled(on);
    if (!on) stopSpeak();
  };

  // 第二张卡：免费版=铃声选择；AI 陪练版=选择教练。
  const onSecondCard = () => {
    if (premium) {
      navigation.navigate('AISelect', {returnTo: 'Detection'});
    } else {
      setShowRingtone(true);
    }
  };

  const correctSec = Math.round((elapsedSec * matchRate) / 100);
  const incorrectSec = Math.max(0, elapsedSec - correctSec);

  const btnStripes = useMemo(
    () =>
      Array.from({length: BTN_STEPS}, (_, i) =>
        lerpRgb(BTN_START, BTN_END, i / (BTN_STEPS - 1)),
      ),
    [],
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.pinkBg} />

      <ScreenHeader
        title={premium ? '智能AI陪练' : '手型检测'}
        onBack={() => navigation?.goBack?.()}
      />

      <View style={styles.body}>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.9}
            onPress={onSetTemplate}>
            <Image
              source={Images.photoTemplate}
              style={styles.actionIcon}
              resizeMode="contain"
            />
            <Text style={styles.actionTitle}>拍照/选模版</Text>
            <Text style={styles.actionHint}>
              {hasTemplate ? '已设置' : '点击设置'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.9}
            onPress={onSecondCard}>
            <Image
              source={premium ? Images.avatarRabbit : Images.ringtoneSelect}
              style={styles.actionIcon}
              resizeMode="contain"
            />
            <Text style={styles.actionTitle}>
              {premium ? '兔兔教练' : '铃声选择'}
            </Text>
            <Text style={styles.actionHint}>
              {premium ? coachName : alarmNameById(alarmId)}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cameraWrap}>
          <View style={styles.cameraBox}>
            {TutuDetectorView ? (
              <TutuDetectorView
                style={StyleSheet.absoluteFill}
                active={detecting}
                onResult={onDetectorResult}
              />
            ) : null}
            {!detecting ? (
              <Text style={styles.cameraPlaceholder}>相机预览</Text>
            ) : null}
            {detecting && errorText ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errorText}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.rabbitOverlay}>
            <Image
              source={Images.avatarRabbit}
              style={styles.rabbitAvatar}
              resizeMode="contain"
            />
            <Text style={styles.rabbitLabel}>兔兔老师</Text>
          </View>
        </View>

        <View style={styles.templateRow}>
          <Text style={styles.templateText}>目标手型模版</Text>
          <Text style={hasTemplate ? styles.templateSet : styles.templateMuted}>
            {hasTemplate ? '已设置' : '未设置'}
          </Text>
        </View>

        <Text style={styles.statsPink}>
          正确：{correctSec}s | 不正确：{incorrectSec}s | 占比：
          {Math.round(matchRate)}%
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          activeOpacity={0.88}
          style={styles.ctaOuter}
          onPress={onToggleDetect}>
          <View style={styles.ctaGradientRow}>
            {btnStripes.map((color, i) => (
              <View
                key={`b-${i}`}
                style={[styles.btnStripe, {backgroundColor: color}]}
              />
            ))}
          </View>
          <View style={styles.ctaLabelWrap} pointerEvents="none">
            <Text style={styles.ctaLabel}>{detecting ? '停止' : '启动'}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showRingtone}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRingtone(false)}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowRingtone(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <Text style={styles.modalTitle}>铃声选择</Text>
            <View style={styles.voiceRow}>
              <Text style={styles.voiceLabel}>AI语音播报</Text>
              <Switch
                value={voiceOn}
                onValueChange={onToggleVoice}
                trackColor={{true: Colors.pinkPrimary, false: '#ccc'}}
              />
            </View>
            <ScrollView style={styles.alarmList}>
              {ALARM_SOUNDS.map(s => {
                const active = s.id === alarmId;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.alarmItem}
                    activeOpacity={0.7}
                    onPress={() => onSelectAlarm(s)}>
                    <Text
                      style={[
                        styles.alarmName,
                        s.locked && styles.alarmLocked,
                      ]}>
                      {s.name}
                      {s.locked ? ' 🔒' : ''}
                    </Text>
                    {active ? <Text style={styles.alarmCheck}>✓</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowRingtone(false)}>
              <Text style={styles.modalCloseText}>关闭</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.pinkBg,
  },
  headerWrap: {
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerGradient: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  headerStripe: {
    flex: 1,
    height: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  backHit: {
    width: 40,
    justifyContent: 'center',
  },
  backText: {
    fontSize: 22,
    color: Colors.white,
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.white,
  },
  headerSpacer: {
    width: 40,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  actionIcon: {
    width: 48,
    height: 48,
    marginBottom: 8,
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  actionHint: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  cameraWrap: {
    flex: 1,
    minHeight: 220,
    marginBottom: 14,
  },
  cameraBox: {
    flex: 1,
    backgroundColor: '#D8D8D8',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  cameraPlaceholder: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  rabbitOverlay: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  rabbitAvatar: {
    width: 24,
    height: 24,
  },
  rabbitLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  templateText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  templateMuted: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  templateSet: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.pinkPrimary,
  },
  errorBanner: {
    position: 'absolute',
    left: 10,
    top: 10,
    right: 10,
    backgroundColor: 'rgba(244,67,54,0.92)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  errorBannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  statsPink: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.pinkPrimary,
    marginBottom: 8,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 8,
  },
  ctaOuter: {
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  ctaGradientRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  btnStripe: {
    flex: 1,
    height: '100%',
  },
  ctaLabelWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaLabel: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '82%',
    maxHeight: '70%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.greyDivider,
    marginBottom: 4,
  },
  voiceLabel: {fontSize: 15, fontWeight: '600', color: Colors.textPrimary},
  alarmList: {flexGrow: 0},
  alarmItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.greyDivider,
  },
  alarmName: {fontSize: 15, color: Colors.textPrimary},
  alarmLocked: {color: Colors.textSecondary},
  alarmCheck: {fontSize: 16, color: Colors.pinkPrimary, fontWeight: '700'},
  modalClose: {
    marginTop: 14,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.pinkPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {color: '#fff', fontSize: 15, fontWeight: '700'},
});

export default DetectionScreen;
