// 迷你节拍器引擎 —— 对应安卓 MetronomeController。
// 只做最基础的功能：开关 + 速度 1–300 BPM + 匀速咔哒。用 react-native-sound 播放
// 打包在 App 里的 metro_click.wav；计时用 setTimeout 做漂移校正，速度可实时调节。
let Sound = null;
let clickSound = null;
let loading = false;

function ensureSound() {
  if (Sound) return Sound;
  try {
    // eslint-disable-next-line global-require
    Sound = require('react-native-sound');
    Sound.setCategory('Playback');
  } catch (e) {
    Sound = null;
  }
  return Sound;
}

function loadClick() {
  if (clickSound || loading || !ensureSound()) return;
  loading = true;
  clickSound = new Sound('metro_click.wav', Sound.MAIN_BUNDLE, err => {
    loading = false;
    if (err) {
      clickSound = null;
    } else {
      try {
        clickSound.setVolume(1.0); // 最大音量，配合更响的专业咔哒音
      } catch (e) {}
    }
  });
}

export const MIN_BPM = 1;
export const MAX_BPM = 300;
export const DEFAULT_BPM = 90;

export class Metronome {
  constructor(onBeat) {
    this.bpm = DEFAULT_BPM;
    this.running = false;
    this.timer = null;
    this.onBeat = onBeat || null;
    loadClick();
  }

  setBpm(v) {
    this.bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(v)));
    return this.bpm;
  }

  isRunning() {
    return this.running;
  }

  start() {
    if (this.running) return;
    loadClick();
    this.running = true;
    this._expected = Date.now();
    this._loop();
  }

  _loop() {
    if (!this.running) return;
    this._beat();
    const interval = Math.round(60000 / Math.max(MIN_BPM, this.bpm));
    this._expected += interval;
    const drift = Date.now() - this._expected;
    const delay = Math.max(0, interval - drift);
    this.timer = setTimeout(() => this._loop(), delay);
  }

  _beat() {
    if (clickSound) {
      try {
        clickSound.stop(() => {
          clickSound.play(() => {});
        });
      } catch (e) {}
    }
    if (this.onBeat) {
      try {
        this.onBeat();
      } catch (e) {}
    }
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  release() {
    this.stop();
    this.onBeat = null;
  }
}

export default Metronome;
