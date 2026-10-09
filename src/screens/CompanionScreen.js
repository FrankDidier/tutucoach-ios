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
  AppState,
  NativeModules,
  useWindowDimensions,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {Images} from '../assets/images';
import {BASE_URL} from '../services/config';
import {getDeviceId} from '../services/device';
import {getItem, setItem} from '../services/storage';
import {syncPractice} from '../services/account';
import {chat, fetchReminders, refineTarot, saveCompanionProfile} from '../services/companionChat';
import {createCompanionSession} from '../services/companionSession';
import {clearCompanionTarot, setCompanionTarot} from '../services/companionTarot';
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

// 聊天回复像微信一样连发几条短消息：按行拆，最多五条。
// 括号里的小动作留在气泡里，只是不念；只有动作的一行并到下一条前面。
function chatLines(s) {
  const out = [];
  let action = '';
  String(s || '')
    .split(/\n+/)
    .map(x => x.replace(/^\s*(?:[-·•]|\d+[.、])\s*/, '').trim())
    .filter(Boolean)
    .forEach(x => {
      if (!stripParentheticals(x)) {
        action += x;
        return;
      }
      out.push(action + x);
      action = '';
    });
  return out.slice(0, 5).map(x => (x.length > 80 ? x.slice(0, 80) : x));
}

// 从分身人设(systemPrompt)里的「语言：中文/英语/日语/韩语」一行解析朗读语言。
// 与 AISettingsScreen.parseSpeakLang 保持一致：海马濑人=日语，须念日文开场白才正确。
function parseSpeakLang(persona) {
  const m = String(persona || '').match(
    /(?:^|\n)\s*语言\s*[：:]\s*([^\n；;，,。]+)/,
  );
  if (!m) return 'zh';
  const v = m[1].trim().toLowerCase();
  if (/英|en/.test(v)) return 'en';
  if (/日|ja|jp/.test(v)) return 'ja';
  if (/韩|ko|kr/.test(v)) return 'ko';
  return 'zh';
}
import {
  getSelectedCoachId,
  getCachedCoachAvatarUri,
  setCachedCoachAvatarUri,
  getCachedCoachAvatarThumb,
  rememberCoachAvatarThumb,
  previewAvatarUrl,
  getCachedCoachProfile,
  setCachedCoachProfile,
  profileById,
  isVoiceEnabled,
  peekCompanionPhoto,
} from '../services/coachPrefs';
import {fetchCoaches} from '../services/coach';
import MetronomeCard from '../components/MetronomeCard';
import {createActiveTimer} from '../utils/activeTimer';
import {onPracticeEnd} from '../services/companion';
import {useTheme} from '../theme/ThemeContext';

let bubbleKey = 1;

const Ear = NativeModules.TutuRecorder || null;
const PRACTICE_MIN_KEY = 'companion_practice_min';
const PRACTICE_CHOICES = [10, 15, 20, 30, 45, 60];

function clock(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function CompanionScreen({navigation}) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const primed = peekCompanionPhoto();
  const [coachName, setCoachName] = useState('专业老师');
  const [avatarUri, setAvatarUri] = useState(primed.uri || null);
  const [thumbData, setThumbData] = useState(primed.thumb || null);
  const [sharpReady, setSharpReady] = useState(false);
  const [avatarBgFailed, setAvatarBgFailed] = useState(false);
  const [bgUri, setBgUri] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState(false);
  const [pieces, setPieces] = useState([]);
  const [pieceIdx, setPieceIdx] = useState(-1);
  // 默认按住说话：小朋友不会打字也能聊。
  const [voiceMode, setVoiceMode] = useState(true);
  const [talk, setTalk] = useState('');
  const [talkHint, setTalkHint] = useState('');
  const [practiceMin, setPracticeMin] = useState(0);
  const [leftSec, setLeftSec] = useState(0);
  const [timeUp, setTimeUp] = useState(false);
  const talkRef = useRef(null);
  const hintTimer = useRef(null);
  const leftRef = useRef(0);

  const scrollRef = useRef(null);
  const profileRef = useRef(profileById('coach_pro'));
  const coachIdRef = useRef('coach_pro');
  const avatarUriRef = useRef(peekCompanionPhoto().uri || null);
  const studentIdRef = useRef('');
  const historyRef = useRef([]); // [{role, content}]
  const remindersRef = useRef([]);
  const piecesRef = useRef([]);
  const pieceIdxRef = useRef(-1);
  const freqRef = useRef(45);
  const busyRef = useRef(false);
  const pausedRef = useRef(false);
  const typingRef = useRef(false);
  const typingIdleTimer = useRef(null);
  const mutedRef = useRef(false);
  const aliveRef = useRef(true);
  const focusCountRef = useRef(0);
  /** Keep companion TTS running while viewing score. */
  const scoreViewerOpenRef = useRef(false);
  const sessionStartRef = useRef(0); // 本次陪练开始时间，退出时计入练琴时长
  const roundRef = useRef(null);
  const [tarotOn, setTarotOn] = useState(false);
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
  // 策略：先同步本地 id + 缓存头像 URL（瞬时出图），再后台拉服务器刷新（不挡开场）。
  const reloadCoach = async ({blocking = false} = {}) => {
    const id = await getSelectedCoachId();
    const base = profileById(id);
    coachIdRef.current = id;
    profileRef.current = base;
    if (aliveRef.current) {
      setCoachName(base.displayName || '专业老师');
    }
    // 瞬时：用上次成功的头像 URL 铺背景（第二次及以后进陪练不再「等一下才出图」）
    try {
      const [cached, thumb] = await Promise.all([
        getCachedCoachAvatarUri(id),
        getCachedCoachAvatarThumb(id),
      ]);
      if (aliveRef.current && thumb) setThumbData(thumb);
      if (aliveRef.current && cached && cached !== avatarUriRef.current) {
        avatarUriRef.current = cached;
        setAvatarUri(cached);
        setSharpReady(false);
        setAvatarBgFailed(false);
      }
    } catch (e) {}
    // 瞬时：用上次成功缓存的分身资料补上正确的开场白/语言（自定义分身不在内置列表里，
    // 否则会先说 coach_pro 的默认开场白）。服务器刷新会在其后覆盖为最新。
    try {
      const cp = await getCachedCoachProfile(id);
      if (cp) {
        profileRef.current = {
          ...base,
          ...cp,
          id,
        };
        if (aliveRef.current && cp.displayName) setCoachName(cp.displayName);
      }
    } catch (e) {}

    const refreshFromServer = async () => {
      try {
        const res = await fetchCoaches();
        const list = (res && (res.coaches || res.data)) || [];
        const sc = list.find(c => c.id === id);
        if (!aliveRef.current || !sc) return;
        const persona = sc.systemPrompt || sc.system_prompt || base.systemPrompt;
        profileRef.current = {
          ...base,
          id: sc.id || id || base.id,
          displayName: sc.name || base.displayName,
          greeting: sc.greeting || base.greeting,
          systemPrompt: persona,
          speakLang: parseSpeakLang(persona),
          speechRate: sc.speechRate || base.speechRate || 1.0,
          pitch: sc.pitch || base.pitch || 1.0,
          voiceId: sc.voiceId || 0,
        };
        // 写回缓存，供下次瞬时使用正确开场白/语言。
        try {
          await setCachedCoachProfile(id, profileRef.current);
        } catch (e) {}
        setCoachName(profileRef.current.displayName);
        if (sc.avatarUrl) {
          const uri = /^https?:/.test(sc.avatarUrl)
            ? sc.avatarUrl
            : BASE_URL + sc.avatarUrl;
          try {
            await setCachedCoachAvatarUri(id, uri);
          } catch (e) {}
          // 预热后切换；已缓存同图时 RN 会命中磁盘/内存，几乎瞬时
          // 马上铺上，不等下载结束。预热只为下次进页更快。
          if (aliveRef.current && uri !== avatarUriRef.current) {
            avatarUriRef.current = uri;
            setAvatarUri(uri);
            setSharpReady(false);
            setAvatarBgFailed(false);
          }
          const preview = previewAvatarUrl(uri);
          if (preview) Image.prefetch(preview).catch(() => {});
          Image.prefetch(uri).catch(() => {});
          rememberCoachAvatarThumb(id, uri);
        } else if (aliveRef.current) {
          avatarUriRef.current = null;
          setAvatarUri(null);
          setAvatarBgFailed(false);
        }
      } catch (e) {}
    };

    if (blocking) {
      await refreshFromServer();
    } else {
      refreshFromServer();
    }
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
      // 先铺自定义背景（本地读取，瞬时），保证首屏不因等网络而空白。
      try {
        const customBg = await getCompanionBgUri();
        if (aliveRef.current && customBg) {
          setBgUri(customBg);
        }
      } catch (e) {}

      // 头像从缓存瞬时铺上；开场白必须等分身资料就绪再念——自定义分身(刁王/海马濑人)
      // 的开场白/语言只在缓存或服务器里，若不等就会念成 coach_pro 的默认「同学你好…」。
      // （1.5.100 起改成非阻塞导致开场白抢跑说了默认句，这里改回「等资料就绪再开场」。）
      await reloadCoach({blocking: true});

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

      roundRef.current = createCompanionSession({
        studentId: () => studentIdRef.current,
        pieceName: () =>
          pieceIdxRef.current >= 0 && piecesRef.current[pieceIdxRef.current]
            ? piecesRef.current[pieceIdxRef.current].name
            : '',
        globalLines: () => (remindersRef.current || []).slice(),
        freqSec: () => freqRef.current,
        coachId: () => coachIdRef.current,
        studentName: () => studentNameSafe(),
        history: () => historyRef.current,
        isPaused: () => pausedRef.current && !scoreViewerOpenRef.current,
        isTyping: () => typingRef.current,
        speak: text => {
          if (text) addAiBubble(text, true);
        },
        pushAssistant: text => pushHistory('assistant', text),
        onHeard: (text, opts) => {
          if (opts && opts.profile) {
            addUserBubble(text);
            pushHistory('user', text);
            return;
          }
          onSendText(text);
        },
      });
      roundRef.current.start();
    })();

    return () => {
      if (roundRef.current) {
        const round = roundRef.current;
        roundRef.current = null;
        round.finish();
      }
      aliveRef.current = false;
      pausedRef.current = true;
      recordCompanionPractice();
      if (activeTimerRef.current) {
        activeTimerRef.current.dispose();
        activeTimerRef.current = null;
      }
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
    const reloadPieces = async () => {
      try {
        const sid = studentIdRef.current || getDeviceId();
        const r = await fetchReminders(sid, null);
        if (!aliveRef.current) return;
        freqRef.current = Math.max(10, r.freqSec || 45);
        const next = r.pieces || [];
        piecesRef.current = next;
        if (next.length) {
          const keep = Math.max(0, Math.min(pieceIdxRef.current, next.length - 1));
          pieceIdxRef.current = keep >= 0 ? keep : 0;
          applyPiece(pieceIdxRef.current);
          setPieces(next);
          setPieceIdx(pieceIdxRef.current);
        } else {
          remindersRef.current = r.reminders || [];
          setPieces([]);
          setPieceIdx(-1);
        }
      } catch (e) {}
    };
    const unsubFocus = navigation.addListener('focus', () => {
      focusCountRef.current += 1;
      scoreViewerOpenRef.current = false;
      if (focusCountRef.current <= 1) return;
      aliveRef.current = true;
      pausedRef.current = false;
      reloadCoach({blocking: false});
      reloadPieces();
    });
    // 离开本页（去选分身页）时暂停主动陪聊并停掉正在播的语音，避免在选择页说话。
    // 看乐谱时保持语音，不打断陪练。
    const unsubBlur = navigation.addListener('blur', () => {
      if (scoreViewerOpenRef.current) return;
      pausedRef.current = true;
      try {
        stopSpeak();
      } catch (e) {}
    });
    const appState = AppState.addEventListener('change', next => {
      if (!roundRef.current) return;
      if (next === 'background') roundRef.current.onBackground();
      else if (next === 'active') roundRef.current.onForeground();
    });
    return () => {
      unsubFocus();
      unsubBlur();
      appState.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  // 键盘弹起时把麦让给系统听写（键盘上的话筒），两边同时开麦会闪退。
  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const shown = Keyboard.addListener(showEv, () => {
      if (roundRef.current && roundRef.current.pauseEar) roundRef.current.pauseEar('keyboard', true);
    });
    const hidden = Keyboard.addListener(hideEv, () => {
      if (roundRef.current && roundRef.current.pauseEar) roundRef.current.pauseEar('keyboard', false);
    });
    return () => {
      shown.remove();
      hidden.remove();
      if (hintTimer.current) clearTimeout(hintTimer.current);
      if (talkRef.current && Ear && Ear.talkCancel) Ear.talkCancel().catch(() => {});
    };
  }, []);

  // 练琴计时：只在陪练页开着、App 在前台时走（看乐谱也算）。
  useEffect(() => {
    getItem(PRACTICE_MIN_KEY).then(v => {
      const min = parseInt(v, 10) || 0;
      if (!aliveRef.current || min <= 0) return;
      setPracticeMin(min);
      leftRef.current = min * 60;
      setLeftSec(min * 60);
    });
    const tickTimer = setInterval(() => {
      if (leftRef.current <= 0) return;
      if (AppState.currentState !== 'active') return;
      if (pausedRef.current && !scoreViewerOpenRef.current) return;
      leftRef.current -= 1;
      setLeftSec(leftRef.current);
      if (leftRef.current <= 0) {
        setTimeUp(true);
        if (roundRef.current && roundRef.current.timeUp) roundRef.current.timeUp();
      }
    }, 1000);
    return () => clearInterval(tickTimer);
  }, []);

  // ============ 曲目 ============
  const applyPiece = idx => {
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
        if (roundRef.current) roundRef.current.setPiece(piecesRef.current[i].name);
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
      if (toSpeak && roundRef.current && roundRef.current.noteSpoken) {
        roundRef.current.noteSpoken(toSpeak);
      }
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

  // ============ 清除记忆 ============
  // 只忘掉学生是谁（名字、性别、年龄、爱好），不动角色性格，也不删练琴进度和老师的重点。
  const forgetMe = () => {
    const round = roundRef.current;
    try {
      stopSpeak();
    } catch (e) {}
    historyRef.current = [];
    setMessages([]);
    if (round && round.forget) round.forget();
  };

  const askForget = () => {
    Alert.alert(
      '重新认识',
      'TA 会忘掉你的名字、性别、年龄和爱好，然后重新问你。练琴进度和老师的重点不会删。',
      [
        {text: '取消', style: 'cancel'},
        {text: '重新认识', style: 'destructive', onPress: forgetMe},
      ],
    );
  };

  // ============ 学生打字 ============
  // 「我不叫杨同」「叫我小桐」「忘了我吧」这类话先交给陪练规则，认出来就不再走闲聊。
  const FIX_WORDS = /我叫|叫我|名字|叫错|记错|忘了我|忘掉我|忘记我|把我忘|重新认识|记忆|我是(?:男|女)|岁/;
  const SECTION_WORDS = /(?:练|弹)得?(?:差不多|好|会)了|差不多了|(?:这段|这一段).{0,4}(?:可以了|行了|好了)|下一段|还没(?:练|弹)好|再练(?:一会|会儿|练)/;

  // 「要注意什么」「重点是什么」：照老师的原话按编号说，不让角色自己编。
  const POINT_WORDS = /重点|注意(?:些|点)?什么|要注意|老师(?:说|讲|交代)了?什么/;

  const showUser = text => {
    addUserBubble(text);
    pushHistory('user', text);
  };

  // 先给陪练规则认；规则不接（返回空）就当聊天。
  const ruleOrChat = (text, run) => {
    setSending(true);
    Promise.resolve(run())
      .then(plan => {
        if (plan && !plan.chat) {
          setSending(false);
          return;
        }
        sendChat(text);
      })
      .catch(() => sendChat(text));
  };

  const onSendText = text => {
    if (!text) return;
    const round = roundRef.current;
    if (round && round.ended && round.ended()) {
      showUser(text);
      sendChat(text);
      return;
    }
    if (round && round.markVoice) round.markVoice();
    const awaiting = !!(round && round.awaiting && round.awaiting());
    if (round && round.said && !awaiting && FIX_WORDS.test(text)) {
      showUser(text);
      ruleOrChat(text, () => round.said(text));
      return;
    }
    if (round && round.askPoints && POINT_WORDS.test(text)) {
      showUser(text);
      ruleOrChat(text, () => round.askPoints());
      return;
    }
    if (awaiting && round.answerTyped) {
      showUser(text);
      ruleOrChat(text, () => round.answerTyped(text));
      return;
    }
    // 没被问也主动说「这段差不多了」「还没练好」：按他自己对这一段的判断走，不当闲聊。
    if (round && round.volunteerSection && SECTION_WORDS.test(text)) {
      showUser(text);
      ruleOrChat(text, () => round.volunteerSection(text));
      return;
    }
    showUser(text);
    sendChat(text);
  };

  const sendChat = () => {
    setSending(true);
    busyRef.current = true;
    const round = roundRef.current;
    chat(
      coachIdRef.current,
      studentNameSafe(),
      historyRef.current,
      'chat',
      '',
      '',
      studentIdRef.current,
      round && round.numberedPoints ? round.numberedPoints() : [],
    )
      .then(res => {
        setSending(false);
        busyRef.current = false;
        const lines = res && res.ok ? chatLines(res.text) : [];
        if (!lines.length) {
          Alert.alert('提示', '网络不太好，再发一次试试～');
          return;
        }
        pushHistory('assistant', lines.join('\n'));
        const spoken = lines.map(stripParentheticals).filter(Boolean).join(' ');
        addAiBubble(lines[0], true, spoken);
        let wait = 0;
        lines.slice(1).forEach((line, i) => {
          wait += 700 + lines[i].length * 70;
          setTimeout(() => {
            if (aliveRef.current) addAiBubble(line, false);
          }, wait);
        });
      })
      .catch(() => {
        setSending(false);
        busyRef.current = false;
      });
  };

  const onSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    Keyboard.dismiss();
    clearTyping();
    onSendText(text);
  };

  // ============ 按住说话（像微信） ============
  const flashHint = text => {
    setTalkHint(text);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setTalkHint(''), 1800);
  };

  const toggleVoiceMode = () => {
    const next = !voiceMode;
    setVoiceMode(next);
    if (next) {
      Keyboard.dismiss();
      clearTyping();
    }
  };

  const finishTalk = (t, r) => {
    if (talkRef.current === t) {
      talkRef.current = null;
      setTalk('');
    }
    const round = roundRef.current;
    if (round && round.pauseEar) round.pauseEar('talk', false);
    if (r && r.denied) {
      Alert.alert('需要麦克风', '请在「设置 › 兔兔教练」里打开麦克风和语音识别，就能按住说话了。');
      return;
    }
    if (r && r.busy) {
      flashHint('麦克风正忙，松开再按一次试试');
      return;
    }
    if (t.cancel) return;
    const text = String((r && r.text) || '').trim();
    if (!text) {
      flashHint('没听清，按住再说一次');
      return;
    }
    onSendText(text);
  };

  const onTalkGrant = e => {
    if (!Ear || !Ear.talkStart) {
      flashHint('这台设备暂时不能语音输入，点左边换成打字');
      return;
    }
    try {
      stopSpeak();
    } catch (err) {}
    const round = roundRef.current;
    if (round && round.pauseEar) round.pauseEar('talk', true);
    const t = {startY: e.nativeEvent.pageY, at: Date.now(), cancel: false};
    talkRef.current = t;
    setTalk('talking');
    Ear.talkStart()
      .catch(() => ({text: ''}))
      .then(r => finishTalk(t, r));
  };

  const onTalkMove = e => {
    const t = talkRef.current;
    if (!t) return;
    const up = t.startY - e.nativeEvent.pageY > 60;
    if (up !== t.cancel) {
      t.cancel = up;
      setTalk(up ? 'cancel' : 'talking');
    }
  };

  const onTalkRelease = () => {
    const t = talkRef.current;
    if (!t) return;
    const short = Date.now() - t.at < 500;
    if (short && !t.cancel) flashHint('说话时间太短');
    if (t.cancel || short) {
      t.cancel = true;
      Ear.talkCancel().catch(() => {});
    } else {
      Ear.talkEnd().catch(() => {});
    }
    talkRef.current = null;
    setTalk('');
  };

  const onTalkTerminate = () => {
    const t = talkRef.current;
    if (!t) return;
    t.cancel = true;
    Ear.talkCancel().catch(() => {});
    talkRef.current = null;
    setTalk('');
  };

  // ============ 练琴计时 ============
  const startCountdown = min => {
    setPracticeMin(min);
    setItem(PRACTICE_MIN_KEY, String(min));
    leftRef.current = min * 60;
    setLeftSec(min * 60);
    if (timeUp) {
      setTimeUp(false);
      if (roundRef.current && roundRef.current.restart) roundRef.current.restart();
    }
  };

  const pickPracticeTime = () => {
    const opts = PRACTICE_CHOICES.map(m => ({
      text: `${m} 分钟`,
      onPress: () => startCountdown(m),
    }));
    opts.push({text: '不限时', onPress: () => startCountdown(0)});
    opts.push({text: '取消', style: 'cancel'});
    Alert.alert('这次练多久？', '时间到了 TA 会提醒你休息', opts);
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
          // 存 data URI：App 更新后沙盒目录会换名字，存 file:// 路径的话背景就丢了
          const r = await pickFromGallery({
            base64: true,
            maxWidth: 2048,
            maxHeight: 2048,
            quality: 0.92,
          });
          if (r?.cancelled || r?.error) return;
          const keep = r.dataUri || r.uri;
          if (!keep) return;
          await setCompanionBgUri(keep);
          setBgUri(keep);
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

  const remoteSource = uri => {
    if (!uri) return null;
    if (String(uri).startsWith('http')) return {uri, cache: 'force-cache'};
    return {uri};
  };
  const showRole = !bgUri && avatarUri && !avatarBgFailed;
  const previewUri = showRole ? (thumbData || previewAvatarUrl(avatarUri)) : null;
  const bgSource = bgUri
    ? remoteSource(bgUri)
    : previewUri
      ? remoteSource(previewUri)
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
          defaultSource={previewUri ? undefined : Images.companionPhoto}
          style={bgFillStyle}
          resizeMode="cover"
          onError={() => {
            // 自定义图失败才清；角色图失败仅退回钢琴，保留顶部小头像
            if (bgUri) {
              // 老版本存的 file:// 路径更新后会失效，顺手清掉
              setBgUri(null);
              setCompanionBgUri(null);
            }
            else if (avatarUri && !avatarBgFailed) setAvatarBgFailed(true);
          }}
        />
        {showRole ? (
          <Image
            source={remoteSource(avatarUri)}
            style={[bgFillStyle, {opacity: sharpReady ? 1 : 0}]}
            resizeMode="cover"
            onLoad={() => setSharpReady(true)}
          />
        ) : null}
        {/* 仅长按换背景：不拦截点击，避免挡住聊天/节拍器 */}
        <TouchableOpacity
          activeOpacity={1}
          onLongPress={changeBackground}
          style={StyleSheet.absoluteFill}
          delayLongPress={450}
          pointerEvents="box-only"
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
              source={avatarUri ? (String(avatarUri).startsWith('http') ? {uri: avatarUri, cache: 'force-cache'} : {uri: avatarUri}) : Images.coachPro}
              style={styles.headerAvatar}
            />
            <Text style={styles.coachName} numberOfLines={1}>
              {coachName} ▾
            </Text>
          </TouchableOpacity>
          <View style={{flex: 1}} />
          <TouchableOpacity
            onPress={pickPracticeTime}
            style={[styles.timerPill, timeUp && styles.timerPillDone]}
            accessibilityLabel="练琴计时">
            <Text style={styles.timerText} numberOfLines={1}>
              {timeUp ? '时间到' : practiceMin > 0 ? '⏱ ' + clock(leftSec) : '⏱ 计时'}
            </Text>
          </TouchableOpacity>
          {/* 蓝湖仅「学生码 + 音量」；换背景走长按背景图（见上方） */}
          <TouchableOpacity
            onPress={askForget}
            style={[styles.iconCircle, {marginRight: 10}]}
            accessibilityLabel="重新认识">
            <Text style={styles.forgetIcon}>↺</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={showMyCode} style={styles.iconCircle}>
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
          <View style={styles.pieceBar}>
            <TouchableOpacity style={{flex: 1}} onPress={pickPiece}>
              <Text style={styles.pieceText}>🎵 当前曲目：{pieceName}  ▾</Text>
            </TouchableOpacity>
            {pieceIdx >= 0 && pieceIdx < pieces.length ? (
              <TouchableOpacity
                onPress={() => {
                  const next = !tarotOn;
                  setTarotOn(next);
                  saveCompanionProfile(studentIdRef.current, {tarot_on: next});
                  if (!next) {
                    clearCompanionTarot();
                    return;
                  }
                  refineTarot(pieceName || '这一段').then(card => {
                    if (!card) return;
                    setCompanionTarot({
                      piece: pieceName,
                      page: 0,
                      y: 0,
                      name: card.name,
                      line: card.line,
                    });
                    addAiBubble((card.name || '塔罗') + '：' + (card.line || ''), false);
                  });
                }}>
                <Text style={styles.pieceViewBtn}>{tarotOn ? '塔罗开' : '塔罗'}</Text>
              </TouchableOpacity>
            ) : null}
            {pieceIdx >= 0 && pieceIdx < pieces.length ? (
              <TouchableOpacity
                onPress={() => {
                  scoreViewerOpenRef.current = true;
                  navigation.navigate('ScoreViewer', {
                    studentId: studentIdRef.current,
                    pieceName,
                  });
                }}>
                <Text style={styles.pieceViewBtn}>看乐谱</Text>
              </TouchableOpacity>
            ) : null}
          </View>
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

        {/* 输入区：左边切换按住说话 / 打字，像微信 */}
        {talkHint ? (
          <View style={styles.hintWrap} pointerEvents="none">
            <Text style={styles.hintText}>{talkHint}</Text>
          </View>
        ) : null}
        <View style={styles.inputBar}>
          <View style={styles.inputShell}>
            <TouchableOpacity
              style={styles.modeBtn}
              onPress={toggleVoiceMode}
              accessibilityLabel={voiceMode ? '切换到打字' : '切换到按住说话'}>
              <Image
                source={voiceMode ? Images.companionKeyboard : Images.companionMic}
                style={styles.modeIcon}
                resizeMode="contain"
              />
            </TouchableOpacity>
            {voiceMode ? (
              <View
                style={[styles.holdBtn, talk ? styles.holdBtnOn : null]}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderTerminationRequest={() => false}
                onResponderGrant={onTalkGrant}
                onResponderMove={onTalkMove}
                onResponderRelease={onTalkRelease}
                onResponderTerminate={onTalkTerminate}
                accessibilityRole="button"
                accessibilityLabel="按住说话">
                <Text style={styles.holdText}>{talk ? '松开 发送' : '按住 说话'}</Text>
              </View>
            ) : (
              <>
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
              </>
            )}
          </View>
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      {talk ? (
        <View style={styles.talkLayer} pointerEvents="none">
          <View style={[styles.talkCard, talk === 'cancel' && styles.talkCardCancel]}>
            <Image source={Images.companionMic} style={styles.talkMic} resizeMode="contain" />
            <Text style={styles.talkCardText}>
              {talk === 'cancel' ? '松开手指，取消发送' : '松开 发送，上滑 取消'}
            </Text>
          </View>
        </View>
      ) : null}
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
    maxWidth: 124,
  },
  timerPill: {
    height: 30,
    minWidth: 64,
    paddingHorizontal: 10,
    borderRadius: 15,
    marginRight: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerPillDone: {backgroundColor: 'rgba(255,170,60,0.85)'},
  timerText: {color: '#fff', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums']},
  headerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  coachName: {color: '#fff', fontSize: 14, fontWeight: '600', maxWidth: 80},
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
  pieceBar: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pieceText: {color: '#fff', fontSize: 13},
  pieceViewBtn: {color: '#FFE3A1', fontSize: 12.5, fontWeight: '700', marginLeft: 10},
  forgetIcon: {color: '#fff', fontSize: 18, fontWeight: '700', marginTop: -1},
  chat: {flex: 1},
  chatContent: {padding: 12, paddingBottom: 8},
  bubble: {maxWidth: '82%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10},
  // 蓝湖气泡正文 13；AI 底 #1A1A1A
  bubbleAi: {alignSelf: 'flex-start', backgroundColor: '#1A1A1A'},
  bubbleUser: {alignSelf: 'flex-end', backgroundColor: colors.primary},
  bubbleAiText: {color: '#fff', fontSize: 13, lineHeight: 20},
  bubbleUserText: {color: '#fff', fontSize: 13, lineHeight: 20},
  metro: {marginBottom: 10, marginHorizontal: 14},
  inputBar: {
    backgroundColor: 'transparent',
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  // 蓝湖输入壳 345×40（屏宽缩放由外层 padding 承担）
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 22,
    paddingLeft: 4,
    paddingRight: 6,
    minHeight: 44,
  },
  modeBtn: {width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginRight: 4},
  modeIcon: {width: 24, height: 24},
  holdBtn: {
    flex: 1,
    height: 36,
    marginRight: 2,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdBtnOn: {backgroundColor: 'rgba(255,255,255,0.38)'},
  holdText: {color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 1},
  hintWrap: {alignItems: 'center', marginBottom: 2},
  hintText: {
    color: '#fff',
    fontSize: 12.5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    overflow: 'hidden',
  },
  talkLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  talkCard: {
    width: 168,
    height: 168,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  talkCardCancel: {backgroundColor: 'rgba(200,40,40,0.82)'},
  talkMic: {width: 64, height: 64, marginBottom: 16},
  talkCardText: {color: '#fff', fontSize: 13, textAlign: 'center'},
  input: {
    flex: 1,
    maxHeight: 100,
    paddingVertical: 0,
    paddingRight: 8,
    color: '#fff',
    fontSize: 14,
  },
  sendBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {opacity: 0.4},
  sendIcon: {width: 28, height: 28},
  });
