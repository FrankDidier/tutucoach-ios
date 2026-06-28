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
import {syncPractice, getMembership} from '../services/account';
import {requestSummary, fetchCoaches} from '../services/coach';
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
import {pickFromGallery, captureFromCamera} from '../services/imagePicker';
import TutuDetector, {TutuDetectorView} from 'tutu-detector';

const SPEAK_COOLDOWN_MS = 3000; // 对应 AICoach.speakCooldownMs 默认 3000
const ENCOURAGE_INTERVAL_MS = 25000; // 对应 aiTimer 鼓励间隔 ~25s
const ALARM_PERIOD_SEC = 3; // 对应免费版 monitorPeriod 默认 3 秒
const ALARM_MATCH_TARGET = 70; // 周期匹配率门槛（%），低于则报警

// 检测设置项（对应安卓 MainActivity 设置弹窗）。
const SETTINGS_KEY = 'det_settings';
const SENSITIVITY_ANGLE = {strict: 18, normal: 22, lenient: 28}; // 灵敏度 → 角度阈值
const SPEAK_FREQ_MS = {fast: 2000, normal: 3000, slow: 5000}; // AI 播报频率 → 冷却
const DEFAULT_SETTINGS = {
  sensitivity: 'normal',
  period: 3,
  matchTarget: 70,
  speakFreq: 'normal',
};
const SENS_OPTIONS = [
  {key: 'strict', label: '严格(18°)'},
  {key: 'normal', label: '标准(22°)'},
  {key: 'lenient', label: '宽松(28°)'},
];
const PERIOD_OPTIONS = [2, 3, 5];
const MATCH_OPTIONS = [60, 70, 80];
const FREQ_OPTIONS = [
  {key: 'fast', label: '快(2s)'},
  {key: 'normal', label: '标准(3s)'},
  {key: 'slow', label: '慢(5s)'},
];

// 把后台教练记录映射成检测页用的语音 profile（在内置兜底之上覆盖自定义字段）。
function serverCoachToProfile(c, base) {
  if (!c) return base;
  const nonEmpty = a => (Array.isArray(a) && a.length ? a : null);
  return {
    ...base,
    displayName: c.name || base.displayName,
    greeting: c.greeting || base.greeting,
    speechRate: c.speechRate || base.speechRate || 1.0,
    pitch: c.pitch || base.pitch || 1.0,
    encouragements: nonEmpty(c.encouragements) || base.encouragements,
    errorTemplates: nonEmpty(c.errorTemplates) || base.errorTemplates,
    noHandReminders: nonEmpty(c.noHandReminders) || base.noHandReminders,
    celebrations:
      nonEmpty(c.celebrations) || base.celebrations || base.celebrationPhrases,
    voiceId: c.voiceId || 0,
  };
}

const DEFAULT_NO_HAND = ['手呢？快放回琴键上来～', '看不到你的手啦，对准镜头哦。'];
const NO_HAND_AFTER_MS = 10000; // 连续无手 10 秒后提醒
const NO_HAND_COOLDOWN_MS = 15000; // 无手提醒间隔

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
  const [vip, setVip] = useState(true); // 免费公测期默认全员会员；按 /api/membership 校正
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

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
  const speakCooldownRef = useRef(SPEAK_COOLDOWN_MS);
  const periodTargetRef = useRef(ALARM_PERIOD_SEC);
  const matchTargetRef = useRef(ALARM_MATCH_TARGET);
  const lastHandSeenRef = useRef(0); // 最近一次检测到手的时刻
  const lastNoHandSpeakRef = useRef(0); // 最近一次「无手提醒」播报时刻
  // 组件是否仍挂载：用于阻止卸载/返回后到达的原生回调再 setState（配合原生侧守卫，杜绝闪退）。
  const aliveRef = useRef(true);

  // 应用检测设置：写入运行期 refs + 原生角度阈值，可选持久化。
  const applySettings = async (next, persist) => {
    setSettings(next);
    periodTargetRef.current = next.period;
    matchTargetRef.current = next.matchTarget;
    speakCooldownRef.current = SPEAK_FREQ_MS[next.speakFreq] || SPEAK_COOLDOWN_MS;
    try {
      await TutuDetector.setAngleThreshold(
        SENSITIVITY_ANGLE[next.sensitivity] || 22,
      );
    } catch (e) {}
    if (persist) {
      try {
        await setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch (e) {}
    }
  };

  // 载入已选教练 / 语音开关 / 铃声选择 / 检测设置 / 会员状态。
  useEffect(() => {
    let alive = true;
    (async () => {
      const id = route?.params?.coachId || (await getSelectedCoachId());
      // 先用内置角色兜底，再用后台自定义资料（自定义文案/语速/音色）覆盖。
      const base = profileById(id);
      const von = await isVoiceEnabled();
      const savedAlarm = Number((await getItem('alarm_sound_id')) || '0');
      let saved = DEFAULT_SETTINGS;
      try {
        const raw = await getItem(SETTINGS_KEY);
        if (raw) saved = {...DEFAULT_SETTINGS, ...JSON.parse(raw)};
      } catch (e) {}
      if (!alive) return;
      setCoachId(id);
      profileRef.current = base;
      setCoachName(base.displayName);
      setVoiceOn(von);
      const aId = Number.isNaN(savedAlarm) ? 0 : savedAlarm;
      setAlarmId(aId);
      alarmIdRef.current = aId;
      await applySettings(saved, false);

      // 拉取后台教练，命中所选 id 则覆盖为老师自定义资料（与安卓一致）。
      try {
        const res = await fetchCoaches();
        const list = (res && (res.coaches || res.data)) || [];
        const sc = list.find(c => c.id === id);
        if (alive && sc) {
          const merged = serverCoachToProfile(sc, base);
          profileRef.current = merged;
          setCoachName(merged.displayName);
        }
      } catch (e) {}

      // 会员状态（用于免费版会员铃声解锁）；公测期通常 is_vip=true。
      try {
        const m = await getMembership(getDeviceId());
        if (alive && m && m.ok) setVip(!!m.is_vip);
      } catch (e) {}
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.coachId]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (tickTimer.current) clearInterval(tickTimer.current);
      stopSpeak();
      stopAlarm();
    };
  }, []);

  // 返回前先停止检测（把 active 置 false），让原生相机/MediaPipe 有序停下，
  // 再配合原生 willMoveToWindow 的彻底清理，避免“进入检测后返回”闪退。
  const handleBack = () => {
    setDetecting(false);
    if (tickTimer.current) {
      clearInterval(tickTimer.current);
      tickTimer.current = null;
    }
    stopSpeak();
    stopAlarm();
    navigation?.goBack?.();
  };

  // 教练说话（带语速/音高/冷却），仅 AI 陪练版 + 已开启语音。
  const coachSpeak = (text, {force = false} = {}) => {
    if (!premium || !voiceOn || !text) return;
    const now = Date.now();
    if (!force && now - lastSpeakRef.current < speakCooldownRef.current) return;
    lastSpeakRef.current = now;
    const p = profileRef.current || {};
    speak(text, {rate: p.speechRate || 1.0, pitch: p.pitch || 1.0});
  };

  const onDetectorResult = e => {
    if (!aliveRef.current) return;
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
    // 无手提醒（AI 陪练版）：连续 10 秒检测不到手 → 播报一句，按冷却节流。
    const now0 = Date.now();
    if (r.handDetected) {
      lastHandSeenRef.current = now0;
    } else if (premium && voiceOn) {
      const noHandFor = now0 - (lastHandSeenRef.current || sessionStart.current);
      if (
        noHandFor > NO_HAND_AFTER_MS &&
        now0 - lastNoHandSpeakRef.current > NO_HAND_COOLDOWN_MS
      ) {
        lastNoHandSpeakRef.current = now0;
        const p = profileRef.current || {};
        const list =
          p.noHandReminders && p.noHandReminders.length
            ? p.noHandReminders
            : DEFAULT_NO_HAND;
        coachSpeak(pick(list), {force: true});
      }
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

  // 把检测结果落地为“已设置/未检测到手”的统一提示。
  const reportTemplateResult = res => {
    if (res && (res.hasLeft || res.hasRight)) {
      setHasTemplate(true);
      Alert.alert(
        '模版已设置',
        `已记录${res.hasLeft ? '左手' : ''}${
          res.hasLeft && res.hasRight ? '、' : ''
        }${res.hasRight ? '右手' : ''}目标手型，开始对照练习吧！`,
      );
    } else {
      Alert.alert('未检测到手', '请选择一张手部清晰、完整对准镜头的照片再试一次。');
    }
  };

  // 从一张本地图片设置模版（拍照 / 相册）。native 需要文件系统路径，去掉 file:// 前缀。
  const applyTemplateFromUri = async uri => {
    if (!uri) return;
    const path = uri.replace(/^file:\/\//, '');
    try {
      const res = await TutuDetector.setTemplateFromImage(path);
      reportTemplateResult(res);
    } catch (err) {
      Alert.alert('设置失败', String(err?.message || err));
    }
  };

  const pickTemplateFrom = async source => {
    const r =
      source === 'camera'
        ? await captureFromCamera()
        : await pickFromGallery({maxWidth: 1280, maxHeight: 1280, quality: 0.92});
    if (!r || r.cancelled) return;
    if (r.error) {
      if (r.error === 'no_module') {
        Alert.alert('暂不可用', '图片选择组件未就绪，请稍后重试。');
      } else if (r.error === 'permission') {
        Alert.alert(
          '需要授权',
          source === 'camera'
            ? '请在「设置」中允许兔兔教练使用相机。'
            : '请在「设置」中允许兔兔教练访问相册。',
        );
      } else {
        Alert.alert('选择失败', String(r.error));
      }
      return;
    }
    await applyTemplateFromUri(r.uri);
  };

  // 定格当前实时画面为模版（需正在检测）。
  const captureLiveTemplate = async () => {
    try {
      const res = await TutuDetector.captureTemplateFromLive();
      reportTemplateResult(res);
    } catch (err) {
      Alert.alert('设置失败', String(err?.message || err));
    }
  };

  // 选择模版来源：拍照 / 相册（+ 检测中可定格当前画面），对应安卓 showTemplateSourceDialog。
  const onSetTemplate = () => {
    const buttons = [
      {text: '拍照', onPress: () => pickTemplateFrom('camera')},
      {text: '从相册选择', onPress: () => pickTemplateFrom('gallery')},
    ];
    if (detecting) {
      buttons.push({text: '定格当前画面', onPress: captureLiveTemplate});
    }
    buttons.push({text: '取消', style: 'cancel'});
    Alert.alert('设置目标手型', '选择手型模版来源', buttons, {cancelable: true});
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
      lastHandSeenRef.current = Date.now();
      lastNoHandSpeakRef.current = 0;
      setDetecting(true);
      tickTimer.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - sessionStart.current) / 1000));
        // 免费版周期报警：每 ALARM_PERIOD_SEC 秒评估周期匹配率，过低则播放铃声。
        periodSecRef.current += 1;
        if (periodSecRef.current >= periodTargetRef.current) {
          periodSecRef.current = 0;
          const total = periodTotalRef.current;
          const rate = total > 0 ? (periodMatchRef.current / total) * 100 : 100;
          if (!premium && total > 0 && rate < matchTargetRef.current) {
            playAlarmId(alarmIdRef.current);
          }
          periodMatchRef.current = 0;
          periodTotalRef.current = 0;
        }
      }, 1000);
      // 开场问候（AI 陪练版）：优先用分身「问候语」，没有则用默认开场白。
      if (premium && voiceOn) {
        const p = profileRef.current || {};
        coachSpeak(p.greeting || '开始监测，注意保持正确手型', {force: true});
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
            // 表现优秀（匹配率≥85%）时，用分身「庆祝语」作为点评开头。
            const celebs = p.celebrations || p.celebrationPhrases;
            const cheer =
              rate >= 85 && celebs && celebs.length ? pick(celebs) + ' ' : '';
            speak(cheer + s.text, {
              rate: p.speechRate || 1.0,
              pitch: p.pitch || 1.0,
            });
          }
          Alert.alert('本次练习点评', s.text);
        }
      }
    } catch (e) {
      // 离线时静默：练习数据下次再补传（可接入本地缓存重试）
    }
  };

  const onSelectAlarm = async sound => {
    if (!sound.free && !vip) {
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
        onBack={handleBack}
        right={
          <TouchableOpacity
            onPress={() => setShowSettings(true)}
            hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
            accessibilityLabel="检测设置">
            <Text style={styles.gearText}>⚙</Text>
          </TouchableOpacity>
        }
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
                const locked = !s.free && !vip;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.alarmItem}
                    activeOpacity={0.7}
                    onPress={() => onSelectAlarm(s)}>
                    <Text
                      style={[styles.alarmName, locked && styles.alarmLocked]}>
                      {s.name}
                      {locked ? ' 🔒' : ''}
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

      <Modal
        visible={showSettings}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettings(false)}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowSettings(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <Text style={styles.modalTitle}>检测设置</Text>
            <ScrollView style={styles.alarmList}>
              <Text style={styles.settingLabel}>灵敏度（角度阈值）</Text>
              <View style={styles.segRow}>
                {SENS_OPTIONS.map(o => (
                  <TouchableOpacity
                    key={o.key}
                    style={[
                      styles.segItem,
                      settings.sensitivity === o.key && styles.segItemActive,
                    ]}
                    onPress={() =>
                      applySettings({...settings, sensitivity: o.key}, true)
                    }>
                    <Text
                      style={[
                        styles.segText,
                        settings.sensitivity === o.key && styles.segTextActive,
                      ]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.settingLabel}>监测周期（秒）</Text>
              <View style={styles.segRow}>
                {PERIOD_OPTIONS.map(v => (
                  <TouchableOpacity
                    key={v}
                    style={[
                      styles.segItem,
                      settings.period === v && styles.segItemActive,
                    ]}
                    onPress={() =>
                      applySettings({...settings, period: v}, true)
                    }>
                    <Text
                      style={[
                        styles.segText,
                        settings.period === v && styles.segTextActive,
                      ]}>
                      {v}s
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.settingLabel}>达标匹配率（%）</Text>
              <View style={styles.segRow}>
                {MATCH_OPTIONS.map(v => (
                  <TouchableOpacity
                    key={v}
                    style={[
                      styles.segItem,
                      settings.matchTarget === v && styles.segItemActive,
                    ]}
                    onPress={() =>
                      applySettings({...settings, matchTarget: v}, true)
                    }>
                    <Text
                      style={[
                        styles.segText,
                        settings.matchTarget === v && styles.segTextActive,
                      ]}>
                      {v}%
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.settingLabel}>AI 播报频率</Text>
              <View style={styles.segRow}>
                {FREQ_OPTIONS.map(o => (
                  <TouchableOpacity
                    key={o.key}
                    style={[
                      styles.segItem,
                      settings.speakFreq === o.key && styles.segItemActive,
                    ]}
                    onPress={() =>
                      applySettings({...settings, speakFreq: o.key}, true)
                    }>
                    <Text
                      style={[
                        styles.segText,
                        settings.speakFreq === o.key && styles.segTextActive,
                      ]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowSettings(false)}>
              <Text style={styles.modalCloseText}>完成</Text>
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
  gearText: {fontSize: 20, color: '#333333'},
  settingLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 14,
    marginBottom: 8,
  },
  segRow: {flexDirection: 'row', gap: 8},
  segItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.greyDivider,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  segItemActive: {
    backgroundColor: Colors.pinkPrimary,
    borderColor: Colors.pinkPrimary,
  },
  segText: {fontSize: 13, color: Colors.textPrimary, fontWeight: '600'},
  segTextActive: {color: '#fff'},
});

export default DetectionScreen;
