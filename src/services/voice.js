// 语音播报（TTS）封装 —— 对应安卓 AICoach 的系统 TextToSpeech 回退路径。
// 懒加载 react-native-tts：未安装时全部为安全 no-op，安装后自动生效（无需改业务代码）。
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
