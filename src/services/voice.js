// 语音播报（TTS）封装 —— 对应安卓 AICoach 的系统 TextToSpeech 回退路径。
// 懒加载 react-native-tts：未安装时全部为安全 no-op，安装后自动生效（无需改业务代码）。
import {Platform} from 'react-native';

let Tts = null;
let inited = false;
let available = false;

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

// rate: 语速倍率（安卓 speechRate，默认 1.0）。pitch: 音高（默认 1.0）。
export function speak(text, {rate = 1.0, pitch = 1.0, flush = true} = {}) {
  if (!text || !ensure()) return;
  try {
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
  if (!ensure()) return;
  try {
    Tts.stop();
  } catch (e) {}
}

export function isAvailable() {
  return ensure();
}

export default {speak, stop, isAvailable};
