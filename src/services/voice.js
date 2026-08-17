// 语音播报（TTS）封装 —— 对应安卓 AICoach 的系统 TextToSpeech 回退路径。
// 懒加载 react-native-tts：未安装时全部为安全 no-op，安装后自动生效（无需改业务代码）。
import {Platform, NativeModules} from 'react-native';
import {BASE_URL} from './config';

let Tts = null;
let inited = false;
let available = false;

// iOS：每次播报前重新激活音频会话。系统相机/相册选择器、来电、其它 App 都可能
// 在「App 没有真正回到前台」的情况下把我们的 Playback 会话改掉/停掉（这正是
// 「拍完模版后兔兔就没声音」的根因）。幂等调用，原生侧只是重设并激活会话。
function reactivateAudioSessionIOS() {
  if (Platform.OS !== 'ios') return;
  try {
    NativeModules.TutuDetector &&
      NativeModules.TutuDetector.reactivateAudioSession &&
      NativeModules.TutuDetector.reactivateAudioSession();
  } catch (e) {}
}

// 防止自动锁屏（仅在「检测 / AI 陪练」页开启，离开时关闭）。iOS 走原生 idleTimerDisabled。
export function setKeepAwake(on) {
  if (Platform.OS !== 'ios') return;
  try {
    NativeModules.TutuDetector &&
      NativeModules.TutuDetector.setKeepAwake &&
      NativeModules.TutuDetector.setKeepAwake(!!on);
  } catch (e) {}
}

function ensure() {
  if (inited) return available;
  inited = true;
  try {
    // eslint-disable-next-line global-require
    Tts = require('react-native-tts').default || require('react-native-tts');
    try {
      Tts.setDefaultLanguage('zh-CN');
    } catch (e) {}
    // iOS 关键修复：默认 TTS 会被「静音拨片(响铃/静音开关)」静音，导致很多用户“听不到兔兔说话”。
    // 设为 ignore 后即使手机处于静音档位也能正常播报（与安卓系统 TTS 行为一致）。
    // 不要开 ducking：react-native-tts 的 ducking 会在每句话结束时 setActive:NO，
    // 把我们在 AppDelegate 里统一激活的音频会话停掉，反而导致后续没声音。
    // 音频会话的激活/分类统一由原生 AppDelegate(tutu_activateAudioSession) 负责。
    if (Platform.OS === 'ios') {
      try {
        Tts.setIgnoreSilentSwitch('ignore');
      } catch (e) {}
    }
    available = true;
  } catch (e) {
    available = false;
  }
  return available;
}

// iOS：是否可用原生合成器（TutuDetector.ttsSpeak）。react-native-tts 在 release/真机上
// 经常说不出话，所以 iOS 一律优先走我们自己的原生 AVSpeechSynthesizer 兜底。
function iosNativeTts() {
  if (Platform.OS !== 'ios') return null;
  const m = NativeModules.TutuDetector;
  return m && typeof m.ttsSpeak === 'function' ? m : null;
}

// 按「实际要念的这句文字」判断语种（逐句判定，而不是锁死角色配置的语种）。
// 这样才能同时修好两个问题：
//   ① 日语角色偶发「个别字念成中文」——只要句子含假名，就强制 Japanese boost，
//      不再交给后端 auto 识别（auto 对共享汉字常回退成中文读音）。
//   ② 学生在聊天框要求 AI「用别的语言说」——AI 回复变成该语言后，这里据文字识别出
//      对应语种朗读（此前锁死角色语种，导致英文/日文回复仍被按原语种念，客户反馈「AI 不听了」）。
// 返回 'ja' | 'ko' | 'zh' | 'en' | ''（空=交给调用方/后端决定）。
export function detectSpeakLang(text) {
  const s = String(text || '');
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(s)) return 'ja'; // 平/片假名 → 日语
  if (/[\uac00-\ud7a3\u1100-\u11ff]/.test(s)) return 'ko'; // 谚文 → 韩语
  if (/[\u4e00-\u9fff]/.test(s)) return 'zh'; // 含汉字（且无假名/谚文）→ 中文
  if (/[a-zA-Z]/.test(s)) return 'en'; // 纯拉丁字母 → 英语
  return '';
}

// rate: 语速倍率（安卓 speechRate，默认 1.0）。pitch: 音高（默认 1.0）。
// coachId: 角色 id —— 新版走 MiniMax（本人克隆音色优先，否则按风格用预置音色兜底），
//          支持中/英/日/韩。lang 默认 'auto'；实际按上面 detectSpeakLang 逐句判定。
// voiceId: 旧版百度声音复刻音色 ID（仅兼容老逻辑；有 coachId 时优先走 coachId）。
export function speak(
  text,
  {rate = 1.0, pitch = 1.0, voiceId = 0, coachId = '', lang = 'auto', flush = true} = {},
) {
  if (!text) return;
  // 逐句语种优先：文字里已经能确定语种时以文字为准；否则退回调用方传入的 lang（角色配置）。
  const effLang = detectSpeakLang(text) || lang || 'auto';
  // iOS 首选原生合成器/声音复刻。
  const native = iosNativeTts();
  if (native) {
    // 关键：原生合成器路径之前没有重新激活音频会话，导致「App 挂后台/切走一会儿
    // 再回来点兔子没声音」。这里先幂等地重设并激活会话，再播报（与 react-native-tts
    // 回退路径保持一致）。
    reactivateAudioSessionIOS();
    try {
      // 新版：按角色走 MiniMax。后端拉本人克隆音色 / 预置音色的 mp3，失败原生侧回退系统音色。
      if (coachId && typeof native.ttsSpeakCoach === 'function') {
        native.ttsSpeakCoach(
          String(text),
          String(coachId),
          rate || 1.0,
          pitch || 1.0,
          BASE_URL,
          effLang || 'auto',
        );
        return;
      }
      // 旧版兼容：百度整数音色。
      if (voiceId > 0 && typeof native.ttsSpeakCloned === 'function') {
        native.ttsSpeakCloned(
          String(text),
          Number(voiceId) || 0,
          rate || 1.0,
          pitch || 1.0,
          BASE_URL,
        );
        return;
      }
      native.ttsSpeak(String(text), rate || 1.0, pitch || 1.0);
      return;
    } catch (e) {}
  }
  if (!ensure()) return;
  try {
    reactivateAudioSessionIOS();
    if (flush) {
      Tts.stop();
    }
    // react-native-tts: rate 0~1 较自然；将 0.5~1.5 的倍率映射到 0.3~0.6 区间。
    try {
      Tts.setDefaultRate(Math.max(0.1, Math.min(1, 0.4 * rate)), true);
    } catch (e) {}
    try {
      Tts.setDefaultPitch(pitch);
    } catch (e) {}
    Tts.speak(text);
  } catch (e) {}
}

export function stop() {
  const native = iosNativeTts();
  if (native) {
    try {
      native.ttsStop();
    } catch (e) {}
    return;
  }
  if (!ensure()) return;
  try {
    Tts.stop();
  } catch (e) {}
}

// iOS：预热原生合成器，建立音频通道，避免「第一句没声音、后面才有声」的冷启动问题。
// 在进入检测页时调用一次即可（幂等，静默播放一个空串）。
export function prewarm() {
  const native = iosNativeTts();
  if (native && typeof native.ttsPrewarm === 'function') {
    try {
      native.ttsPrewarm();
    } catch (e) {}
  }
}

export function isAvailable() {
  if (iosNativeTts()) return true;
  return ensure();
}

export default {speak, stop, prewarm, isAvailable, setKeepAwake};
