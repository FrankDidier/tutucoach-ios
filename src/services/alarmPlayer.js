// 报警铃声播放 —— 对应安卓 AlarmSoundManager.playAlarm/playPreview/stopAlarm。
// 懒加载 react-native-sound；音频文件已打包进 App 主 bundle（ios/TutuCoachRN/Sounds/*.wav）。
import {alarmFileById} from '../utils/alarmSounds';

let Sound = null;
let ready = false;
const cache = {}; // filename -> Sound 实例
let playing = null;

function ensure() {
  if (ready) return Sound;
  ready = true;
  try {
    // eslint-disable-next-line global-require
    Sound = require('react-native-sound');
    Sound.setCategory('Playback');
  } catch (e) {
    Sound = null;
  }
  return Sound;
}

function load(file) {
  return new Promise(resolve => {
    if (!ensure()) {
      resolve(null);
      return;
    }
    if (cache[file]) {
      resolve(cache[file]);
      return;
    }
    const s = new Sound(file, Sound.MAIN_BUNDLE, err => {
      if (err) {
        resolve(null);
        return;
      }
      cache[file] = s;
      resolve(s);
    });
  });
}

export function stopAlarm() {
  if (playing) {
    try {
      playing.stop();
    } catch (e) {}
    playing = null;
  }
}

// 播放指定 id 的铃声（用于选择预览，或免费版周期报警）。
export async function playAlarmId(id) {
  const file = alarmFileById(id);
  const s = await load(file);
  if (!s) return;
  stopAlarm();
  playing = s;
  try {
    s.stop(() => {
      s.setNumberOfLoops(0);
      s.play(() => {});
    });
  } catch (e) {}
}

export default {playAlarmId, stopAlarm};
