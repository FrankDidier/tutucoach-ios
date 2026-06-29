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

// rate: 语速倍率（安卓 speechRate，默认 1.0）。pitch: 音高（默认 1.0）。
// voiceId: 百度声音复刻音色 ID（>0 用老师本人音色，0 用系统音色）。
export function speak(text, {rate = 1.0, pitch = 1.0, voiceId = 0, flush = true} = {}) {
  if (!text) return;
  // iOS 首选原生合成器/声音复刻。
  const native = iosNativeTts();
  if (native) {
    try {
      // voiceId>0：走声音复刻（后端拉老师本人音色 WAV），失败时原生侧自动回退系统音色。
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

export default {speak, stop, prewarm, isAvailable};
