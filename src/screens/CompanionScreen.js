// AI 陪练模式 —— 对应安卓 CompanionChatActivity。
// 独立于手型检测的「语音 + 对话」陪伴练琴：老师 AI 分身高清图为背景，微信式对话框；
// AI 不定时主动朗读老师设置的重点（可按曲目）+ 结合对话个性陪聊；学生打字则角色扮演式回复（不朗读）。
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {Images} from '../assets/images';
import {BASE_URL} from '../services/config';
import {getDeviceId} from '../services/device';
import {syncPractice} from '../services/account';
import {chat, fetchReminders} from '../services/companionChat';
import {pickFromGallery} from '../services/imagePicker';
import {
  getCompanionBgUri,
  setCompanionBgUri,
} from '../services/profilePrefs';
import {
  speak,
  stop as stopSpeak,
  prewarm as prewarmTts,
  setKeepAwake,
} from '../services/voice';

// 角色扮演的括号内心/情景描写（（…）或(…)）只做文字展示、不朗读。
// 朗读前把括号内容去掉，只念真正对学生说的话。
function stripParentheticals(s) {
  if (!s) return '';
  return String(s)
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
import {
  getSelectedCoachId,
  profileById,
  isVoiceEnabled,
} from '../services/coachPrefs';
import {fetchCoaches} from '../services/coach';
import MetronomeCard from '../components/MetronomeCard';
import {createActiveTimer} from '../utils/activeTimer';
import {onPracticeEnd} from '../services/companion';
import {useTheme} from '../theme/ThemeContext';

let bubbleKey = 1;

export default function CompanionScreen({navigation}) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [coachName, setCoachName] = useState('专业老师');
  const [avatarUri, setAvatarUri] = useState(null);
  const [avatarBgFailed, setAvatarBgFailed] = useState(false);
  const [bgUri, setBgUri] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState(false);
  const [pieces, setPieces] = useState([]);
  const [pieceIdx, setPieceIdx] = useState(-1);

  const scrollRef = useRef(null);
  const profileRef = useRef(profileById('coach_pro'));
  const coachIdRef = useRef('coach_pro');
  const studentIdRef = useRef('');
  const historyRef = useRef([]); // [{role, content}]
  const remindersRef = useRef([]);
  const piecesRef = useRef([]);
  const pieceIdxRef = useRef(-1);
  const reminderIdxRef = useRef(0);
  const freqRef = useRef(45);
  const proactiveCountRef = useRef(0);
  const busyRef = useRef(false);
  const pausedRef = useRef(false);
  const typingRef = useRef(false);
  const typingIdleTimer = useRef(null);
  const mutedRef = useRef(false);
  const greetedRef = useRef(false);
  const nextContextualRef = useRef(false);
  const proactiveTimer = useRef(null);
  const aliveRef = useRef(true);
  const focusCountRef = useRef(0);
  const sessionStartRef = useRef(0); // 本次陪练开始时间，退出时计入练琴时长
  const activeTimerRef = useRef(null); // 只累计前台时间（切到别的软件不计）

  // 退出陪练时，把本次时长计入练琴统计（match_rate=-1：只算时长、不参与正确率平均）。
  const recordCompanionPractice = () => {
    const startedAt = sessionStartRef.current;
    if (!startedAt) return;
    sessionStartRef.current = 0;
    // 只算前台活跃时间：切到别的 App、兔兔教练在后台的那段不计入。
    const minutes = activeTimerRef.current
      ? activeTimerRef.current.elapsedMinutes()
      : (Date.now() - startedAt) / 60000;
    if (minutes < 0.2) return; // 太短（<12 秒）不计
    try {
      syncPractice(
        studentIdRef.current || getDeviceId(),
        Number(minutes.toFixed(2)),
        -1,
      );
    } catch (e) {}
    // 同步更新本地练琴统计（累计分钟 / 连续天数 / 积分），否则首页与「我的」里的
    // 练琴时间不会因陪练而增加——学生反馈「陪练完退出来练琴时间没变」。
    // matchRate 传 0：陪练不参与正确率/心情统计。
    try {
      onPracticeEnd(0, Math.max(1, Math.round(minutes)));
    } catch (e) {}
  };

  // 读取当前所选 AI 分身（名称 / 头像背景 / 音色）。初始化和「切换分身」返回后都会调用。
  const reloadCoach = async () => {
    const id = await getSelectedCoachId();
    const base = profileById(id);
    coachIdRef.current = id;
    profileRef.current = base;
    if (aliveRef.current) {
      setCoachName(base.displayName || '专业老师');
      // 不先清空头像：默认立绘立刻显示，远程图 prefetch 完成后再无缝替换（对齐安卓瞬时背景）
    }
    // 覆盖为后台老师自定义资料（头像 / 音色 / 招呼语）。
    try {
      const res = await fetchCoaches();
      const list = (res && (res.coaches || res.data)) || [];
      const sc = list.find(c => c.id === id);
      if (aliveRef.current && sc) {
        profileRef.current = {
          ...base,
          // 自定义分身必须保留后台真实 id，否则 TTS 会退回 coach_pro 的预设音色。
          id: sc.id || id || base.id,
          displayName: sc.name || base.displayName,
          greeting: sc.greeting || base.greeting,
          speechRate: sc.speechRate || base.speechRate || 1.0,
          pitch: sc.pitch || base.pitch || 1.0,
          voiceId: sc.voiceId || 0,
        };
        setCoachName(profileRef.current.displayName);
        if (sc.avatarUrl) {
          const uri = /^https?:/.test(sc.avatarUrl)
            ? sc.avatarUrl
            : BASE_URL + sc.avatarUrl;
          // 预加载完成后再切换，避免进页先粉兔/空底再闪成立绘
          Image.prefetch(uri)
            .then(() => {
              if (aliveRef.current) {
                setAvatarUri(uri);
                setAvatarBgFailed(false);
              }
            })
            .catch(() => {
              if (aliveRef.current) {
                setAvatarUri(uri);
                setAvatarBgFailed(false);
              }
            });
        } else if (aliveRef.current) {
          setAvatarUri(null);
          setAvatarBgFailed(false);
        }
      }
    } catch (e) {}
  };

  // ============ 初始化 ============
  useEffect(() => {
    aliveRef.current = true;
    sessionStartRef.current = Date.now();
    activeTimerRef.current = createActiveTimer();
    try {
      prewarmTts();
    } catch (e) {}
    // 陪练模式期间不自动锁屏（离开本页会还原）。
    try {
      setKeepAwake(true);
    } catch (e) {}
    (async () => {
      studentIdRef.current = getDeviceId();
      await reloadCoach();
      try {
        const customBg = await getCompanionBgUri();
        // 注意：无自定义背景时不能 return——否则会跳过开场问候/主动陪伴，页面像死机。
        if (aliveRef.current && customBg) {
          Image.getSize(
            customBg,
            () => {
              if (aliveRef.current) setBgUri(customBg);
            },
            async () => {
              try {
                await setCompanionBgUri(null);
              } catch (e) {}
              if (aliveRef.current) setBgUri(null);
            },
          );
        }
      } catch (e) {}

      const von = await isVoiceEnabled();
      mutedRef.current = !von;
      if (aliveRef.current) setMuted(!von);

      // 拉取老师为该生设置的重点（含按曲目分组）。
      try {
        const r = await fetchReminders(studentIdRef.current, null);
        freqRef.current = Math.max(10, r.freqSec || 45);
        piecesRef.current = r.pieces || [];
        if (piecesRef.current.length) {
          pieceIdxRef.current = 0;
          applyPiece(0);
          if (aliveRef.current) {
            setPieces(piecesRef.current);
            setPieceIdx(0);
          }
        } else {
          remindersRef.current = r.reminders || [];
        }
      } catch (e) {}

      openingGreeting();
      scheduleProactive();
    })();

    return () => {
      aliveRef.current = false;
      pausedRef.current = true;
      recordCompanionPractice();
      if (activeTimerRef.current) {
        activeTimerRef.current.dispose();
        activeTimerRef.current = null;
      }
      if (proactiveTimer.current) clearTimeout(proactiveTimer.current);
      if (typingIdleTimer.current) clearTimeout(typingIdleTimer.current);
      try {
        stopSpeak();
      } catch (e) {}
      try {
        setKeepAwake(false);
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 从「切换分身」页返回后（再次获得焦点），刷新所选角色的名称/背景/音色。
  // 首次进入的焦点由初始化负责，这里跳过。
  useEffect(() => {
    const unsubFocus = navigation.addListener('focus', () => {
      focusCountRef.current += 1;
      if (focusCountRef.current <= 1) return;
      aliveRef.current = true;
      pausedRef.current = false;
      reloadCoach();
    });
    // 离开本页（去选分身页）时暂停主动陪聊并停掉正在播的语音，避免在选择页说话。
    const unsubBlur = navigation.addListener('blur', () => {
      pausedRef.current = true;
      try {
        stopSpeak();
      } catch (e) {}
    });
    return () => {
      unsubFocus();
      unsubBlur();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  // ============ 曲目 ============
  const applyPiece = idx => {
    reminderIdxRef.current = 0;
    if (idx >= 0 && idx < piecesRef.current.length) {
      remindersRef.current = (piecesRef.current[idx].lines || []).slice();
    } else {
      remindersRef.current = [];
    }
  };

  const pickPiece = () => {
    if (!piecesRef.current.length) return;
    const opts = piecesRef.current.map((p, i) => ({
      text: p.name || '曲目' + (i + 1),
      onPress: () => {
        pieceIdxRef.current = i;
        applyPiece(i);
        setPieceIdx(i);
        nextContextualRef.current = false;
      },
    }));
    opts.push({text: '取消', style: 'cancel'});
    Alert.alert('选择当前练习的曲目', undefined, opts);
  };

  // ============ 气泡 + 逐字显示 ============
  const pushHistory = (role, content) => {
    historyRef.current.push({role, content});
    if (historyRef.current.length > 20) {
      historyRef.current = historyRef.current.slice(-20);
    }
  };

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      // 用户正在打字时不要抢滚动
      if (!typingRef.current && scrollRef.current) {
        scrollRef.current.scrollToEnd({animated: true});
      }
    });
  };

  const addUserBubble = text => {
    const key = 'u' + bubbleKey++;
    setMessages(prev => [...prev, {key, role: 'user', shown: text, done: true}]);
    scrollToEnd();
  };

  // 逐字显示一条 AI 气泡；speakIt=true 时同时朗读。
  // spokenOverride：朗读用的文本（如对话回复要去掉括号内心描写），不传则朗读 full。
  const addAiBubble = (full, speakIt, spokenOverride) => {
    const key = 'a' + bubbleKey++;
    setMessages(prev => [...prev, {key, role: 'ai', shown: '', done: false}]);
    if (speakIt && !mutedRef.current) {
      const p = profileRef.current || {};
      const toSpeak =
        spokenOverride !== undefined ? spokenOverride : full;
      if (toSpeak) {
        try {
          speak(toSpeak, {
            rate: p.speechRate || 1.0,
            pitch: p.pitch || 1.0,
            coachId: coachIdRef.current || p.id,
            voiceId: p.voiceId || 0,
            lang: p.speakLang || 'auto',
          });
        } catch (e) {}
      }
    }
    // 逐字揭示
    let i = 0;
    const total = full.length;
    const per = Math.max(24, Math.min(90, Math.round((speakIt ? 3500 : 2500) / Math.max(1, total))));
    const timer = setInterval(() => {
      if (!aliveRef.current) {
        clearInterval(timer);
        return;
      }
      i += 1;
      const slice = full.slice(0, i);
      setMessages(prev =>
        prev.map(m => (m.key === key ? {...m, shown: slice, done: i >= total} : m)),
      );
      if (i >= total) {
        clearInterval(timer);
      }
      scrollToEnd();
    }, per);
  };

  // ============ 开场 & 主动陪伴 ============
  const openingGreeting = () => {
    const p = profileRef.current || {};
    const greeting = p.greeting || '我在呢，我们一起练琴吧～';
    greetedRef.current = true;
    addAiBubble(greeting, true);
    // 大模型补一句更自然的招呼（不朗读，避免抢话）。
    chat(coachIdRef.current, studentNameSafe(), [], 'chat', '').then(res => {
      if (res && res.ok && res.text && aliveRef.current) {
        pushHistory('assistant', res.text);
        addAiBubble(res.text, false);
      }
    });
  };

  const studentNameSafe = () => '同学';

  // 「正在打字」只表示学生此刻在操作输入框，用来避免主动播报打断打字。
  // 关键修复：以前是「输入框里只要还有字」就一直算在打字，结果学生打了半句、
  // 收起键盘去练琴（字还留在框里），typingRef 就永远 true，主动播报被彻底卡死，
  // 看起来「像死机」。现在改为：每次操作输入框刷新一个 6s 的空闲计时，
  // 停手 6s（或收起键盘）就自动解除，主动播报恢复；绝不会永久卡住。
  const TYPING_IDLE_MS = 6000;
  const markTyping = () => {
    typingRef.current = true;
    if (typingIdleTimer.current) clearTimeout(typingIdleTimer.current);
    typingIdleTimer.current = setTimeout(() => {
      typingRef.current = false;
    }, TYPING_IDLE_MS);
  };
  const clearTyping = () => {
    typingRef.current = false;
    if (typingIdleTimer.current) {
      clearTimeout(typingIdleTimer.current);
      typingIdleTimer.current = null;
    }
  };

  const scheduleProactive = () => {
    if (proactiveTimer.current) clearTimeout(proactiveTimer.current);
    const base = Math.max(10, freqRef.current) * 1000;
    const delay = base * (0.8 + Math.random() * 0.6);
    proactiveTimer.current = setTimeout(() => {
      if (!pausedRef.current && !busyRef.current && !typingRef.current) {
        doProactive();
      }
      scheduleProactive();
    }, delay);
  };

  const doProactive = () => {
    proactiveCountRef.current += 1;
    // 刚和学生聊过 → 这一条让大模型结合刚才的对话来说，更连贯。
    if (nextContextualRef.current) {
      nextContextualRef.current = false;
      doLlmProactive('');
      return;
    }
    const reminders = remindersRef.current;
    const useReminder = reminders.length && proactiveCountRef.current % 2 === 1;
    if (useReminder) {
      const r = reminders[reminderIdxRef.current % reminders.length];
      reminderIdxRef.current += 1;
      if (r) addAiBubble(r, true);
      return;
    }
    const topic = reminders.length
      ? reminders[reminderIdxRef.current % reminders.length]
      : '';
    doLlmProactive(topic);
  };

  const doLlmProactive = topic => {
    busyRef.current = true;
    chat(coachIdRef.current, studentNameSafe(), historyRef.current, 'proactive', topic)
      .then(res => {
        busyRef.current = false;
        if (pausedRef.current || typingRef.current) return;
        if (res && res.ok && res.text) {
          pushHistory('assistant', res.text);
          addAiBubble(res.text, true);
        } else {
          speakLocalEncouragement();
        }
      })
      .catch(() => {
        busyRef.current = false;
        if (!pausedRef.current && !typingRef.current) speakLocalEncouragement();
      });
  };

  const speakLocalEncouragement = () => {
    const p = profileRef.current || {};
    const banks = p.encouragements || [];
    if (banks.length) {
      addAiBubble(banks[Math.floor(Math.random() * banks.length)], true);
    } else if (remindersRef.current.length) {
      const r = remindersRef.current[reminderIdxRef.current % remindersRef.current.length];
      reminderIdxRef.current += 1;
      addAiBubble(r, true);
    }
  };

  // ============ 学生打字 ============
  const onSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    Keyboard.dismiss();
    clearTyping();
    addUserBubble(text);
    pushHistory('user', text);
    setSending(true);
    busyRef.current = true;
    chat(coachIdRef.current, studentNameSafe(), historyRef.current, 'chat', '')
      .then(res => {
        setSending(false);
        busyRef.current = false;
        if (res && res.ok && res.text) {
          pushHistory('assistant', res.text);
          // 学生打字后，AI 的回复也用语音念出来（去掉括号里的内心/情景描写）。
          addAiBubble(res.text, true, stripParentheticals(res.text));
          nextContextualRef.current = true;
        } else {
          Alert.alert('提示', '网络不太好，再发一次试试～');
        }
      })
      .catch(() => {
        setSending(false);
        busyRef.current = false;
      });
  };

  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      try {
        stopSpeak();
      } catch (e) {}
    }
  };

  const showMyCode = () => {
    const code = studentIdRef.current || '';
    Clipboard.setString(code);
    Alert.alert('我的学生码', code + '\n\n已复制，发给老师即可为你设置陪练重点。');
  };

  const changeBackground = () => {
    const buttons = [
      {
        text: '从相册选择',
        onPress: async () => {
          const r = await pickFromGallery({
            maxWidth: 1600,
            maxHeight: 1600,
            quality: 0.9,
          });
          if (r?.cancelled || r?.error || !r?.uri) return;
          await setCompanionBgUri(r.uri);
          setBgUri(r.uri);
        },
      },
    ];
    if (bgUri) {
      buttons.push({
        text: '恢复角色背景',
        onPress: async () => {
          await setCompanionBgUri(null);
          setBgUri(null);
        },
      });
    }
    buttons.push({text: '取消', style: 'cancel'});
    Alert.alert(
      '陪练背景',
      '默认同所选 AI 分身照片；也可换成自己喜欢的图，长按背景可再改。',
      buttons,
    );
  };

  const pieceName =
    pieceIdx >= 0 && pieceIdx < pieces.length ? pieces[pieceIdx].name : '全部';

  const bgSource = bgUri
    ? {uri: bgUri}
    : avatarUri && !avatarBgFailed
      ? {uri: avatarUri}
      : Images.companionPhoto;
  // 必须用窗口像素铺满：部分机型上 Image 会按素材 intrinsic 宽（如 375）排版，
  // 在 iPhone 16 Pro(393) 等更宽屏右侧露出黑边。
  // 无自定义背景时，自动用当前 AI 分身照片（与旧版安卓一致）。
  const {width: winW, height: winH} = useWindowDimensions();
  const bgFillStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: winW,
    height: winH,
    backgroundColor: '#0B0618',
  };

  return (
    <View style={styles.root}>
      {/* 默认钢琴氛围图；长按可换自己的照片 */}
      <View style={styles.bgLayer} pointerEvents="box-none">
        <Image
          source={bgSource}
          defaultSource={Images.companionPhoto}
          style={bgFillStyle}
          resizeMode="cover"
          onError={() => {
            if (bgUri) setBgUri(null);
            else setAvatarBgFailed(true);
          }}
        />
        <TouchableOpacity
          activeOpacity={1}
          onLongPress={changeBackground}
          style={StyleSheet.absoluteFill}
          delayLongPress={450}
        />
      </View>
      {/* 纵向渐变遮罩：底栏可读 */}
      <Image
        source={Images.companionScrim}
        style={[styles.scrim, {width: winW, height: winH}]}
        resizeMode="stretch"
        pointerEvents="none"
      />
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* 顶部栏：返回 + 教练名半透明胶囊 + 学生码/音量圆钮 */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.namePill}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('AISelect')}>
            <Image
              source={avatarUri ? {uri: avatarUri} : Images.coachPro}
              style={styles.headerAvatar}
            />
            <Text style={styles.coachName} numberOfLines={1}>
              {coachName} ▾
            </Text>
          </TouchableOpacity>
          <View style={{flex: 1}} />
          <TouchableOpacity onPress={changeBackground} style={styles.iconCircle}>
            <Text style={styles.bgBtnText}>背景</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={showMyCode} style={[styles.iconCircle, {marginLeft: 10}]}>
            <Image source={Images.companionCode} style={styles.headerIcon} resizeMode="contain" />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleMute} style={[styles.iconCircle, {marginLeft: 10}]}>
            <Image
              source={Images.companionVolume}
              style={[styles.headerIcon, muted && {opacity: 0.35}]}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>

        {/* 曲目选择条 */}
        {pieces.length > 0 && (
          <TouchableOpacity style={styles.pieceBar} onPress={pickPiece}>
            <Text style={styles.pieceText}>🎵 当前曲目：{pieceName}  ▾</Text>
          </TouchableOpacity>
        )}

        {/* 对话区 */}
        <ScrollView
          ref={scrollRef}
          style={styles.chat}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled">
          {messages.map(m => (
            <View
              key={m.key}
              style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAi]}>
              <Text style={m.role === 'user' ? styles.bubbleUserText : styles.bubbleAiText}>
                {m.shown}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* 大号节拍器 */}
        <MetronomeCard style={styles.metro} />

        {/* 输入区：发送图标在输入胶囊内右侧（蓝湖） */}
        <View style={styles.inputBar}>
          <View style={styles.inputShell}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={t => {
                setInput(t);
                markTyping();
              }}
              onFocus={() => {
                markTyping();
              }}
              onBlur={() => {
                clearTyping();
              }}
              placeholder="和Ta聊天"
              placeholderTextColor="#979797"
              multiline
            />
            <TouchableOpacity
              style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
              onPress={onSend}
              disabled={sending}>
              <Image source={Images.companionSend} style={styles.sendIcon} resizeMode="contain" />
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const makeStyles = colors =>
  StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0B0618', overflow: 'hidden'},
  bgLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  safe: {flex: 1},
  kav: {flex: 1},
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  backBtn: {width: 38, height: 40, justifyContent: 'center'},
  backIcon: {color: '#fff', fontSize: 30},
  namePill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingLeft: 2,
    paddingRight: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
    maxWidth: 160,
  },
  headerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  coachName: {color: '#fff', fontSize: 14, fontWeight: '600', maxWidth: 110},
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bgBtnText: {color: '#fff', fontSize: 10, fontWeight: '600'},
  headerIcon: {width: 18, height: 18},
  pieceBar: {backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 16, paddingVertical: 8},
  pieceText: {color: '#fff', fontSize: 13},
  chat: {flex: 1},
  chatContent: {padding: 12, paddingBottom: 8},
  bubble: {maxWidth: '82%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10},
  bubbleAi: {alignSelf: 'flex-start', backgroundColor: 'rgba(26,26,26,0.88)'},
  bubbleUser: {alignSelf: 'flex-end', backgroundColor: colors.primary},
  bubbleAiText: {color: '#fff', fontSize: 15, lineHeight: 22},
  bubbleUserText: {color: '#fff', fontSize: 15, lineHeight: 22},
  metro: {marginBottom: 10, marginHorizontal: 14},
  inputBar: {
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 22,
    paddingLeft: 18,
    paddingRight: 8,
    minHeight: 44,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingVertical: 10,
    paddingRight: 8,
    color: '#fff',
    fontSize: 15,
  },
  sendBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {opacity: 0.4},
  sendIcon: {width: 26, height: 26},
  });
