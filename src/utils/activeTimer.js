// 前台计时器：只累计 App 处于「前台活跃」的时间，切到别的软件（后台/挂起）期间不计。
// 用于练琴时长统计——学生反馈：陪练时切到别的 App，兔兔教练在后台不应该继续算时间。
import {AppState} from 'react-native';

export function createActiveTimer() {
  let activeMs = 0; // 已累计的前台毫秒
  let lastTs = Date.now(); // 上次进入前台的时刻
  let isActive = AppState.currentState === 'active';

  const onChange = next => {
    const now = Date.now();
    if (isActive) {
      // 之前在前台：把这段前台时间累加进去
      activeMs += now - lastTs;
    }
    isActive = next === 'active';
    lastTs = now; // 无论切到前台还是后台，都以此刻作为新的起点
  };

  const sub = AppState.addEventListener('change', onChange);

  return {
    // 当前累计的前台毫秒（含当前这段仍在前台的时间）。
    elapsedMs() {
      let ms = activeMs;
      if (isActive) ms += Date.now() - lastTs;
      return ms;
    },
    elapsedMinutes() {
      return this.elapsedMs() / 60000;
    },
    reset() {
      activeMs = 0;
      lastTs = Date.now();
      isActive = AppState.currentState === 'active';
    },
    dispose() {
      try {
        sub.remove();
      } catch (e) {}
    },
  };
}
