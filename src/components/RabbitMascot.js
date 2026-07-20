// 兔子动画 —— 与安卓端完全对齐：用「原生 APNG 播放视图」(TutuRabbitView) 逐帧硬件解码，
// 分辨率 480×552、20fps，顺滑清晰、内存可控（ImageIO 按需解码，不再一次性挂载整套 PNG）。
//
// 本组件只负责「决定当前该播哪个动作」，真正的逐帧播放交给原生：
//   · 待机(stand)：连续循环；
//   · 说话(talk)：talking=true 时循环，声音结束(talking=false)回到待机；
//   · 开心/庆祝/思考：待机时每隔 5–10s 随机播一次，播完回待机；
//   · loopAction：固定循环某动作（如「练琴」页固定播庆祝），忽略上面逻辑。
import React, {useEffect, useRef, useState} from 'react';
import {View, StyleSheet, requireNativeComponent, UIManager} from 'react-native';

const RABBIT_FPS = 20;
const IDLE_ACTIONS = ['happy', 'celebrate', 'think'];
const IDLE_MIN_MS = 5000;
const IDLE_MAX_MS = 10000;
// 各一次性动作时长(ms) = 帧数 / 帧率。帧数与打包的 APNG 一致。
const ACTION_FRAMES = {happy: 40, celebrate: 32, think: 53};
const actionMs = a => Math.round(((ACTION_FRAMES[a] || 40) / RABBIT_FPS) * 1000);

const HAS_NATIVE = !!UIManager.getViewManagerConfig?.('TutuRabbitView');
const TutuRabbitNative = HAS_NATIVE ? requireNativeComponent('TutuRabbitView') : null;

export default function RabbitMascot({style, talking, loopAction}) {
  const [action, setAction] = useState(loopAction || 'stand');
  const actionRef = useRef(loopAction || 'stand');
  const talkingRef = useRef(false);
  const idleRef = useRef(null);
  const oneShotRef = useRef(null);
  const aliveRef = useRef(true);

  const apply = a => {
    actionRef.current = a;
    setAction(a);
  };

  const clearTimers = () => {
    if (idleRef.current) {
      clearTimeout(idleRef.current);
      idleRef.current = null;
    }
    if (oneShotRef.current) {
      clearTimeout(oneShotRef.current);
      oneShotRef.current = null;
    }
  };

  const scheduleIdle = () => {
    if (idleRef.current) clearTimeout(idleRef.current);
    const delay = IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS);
    idleRef.current = setTimeout(() => {
      if (!aliveRef.current) return;
      // 仅在真正「待机静止」且没在说话时，才随机蹦出一个小动作。
      if (!talkingRef.current && actionRef.current === 'stand') {
        const pick = IDLE_ACTIONS[Math.floor(Math.random() * IDLE_ACTIONS.length)];
        apply(pick);
        // 原生会无限循环该 APNG；到时长后切回待机并排下一次随机动作。
        oneShotRef.current = setTimeout(() => {
          if (!aliveRef.current) return;
          apply('stand');
          scheduleIdle();
        }, actionMs(pick));
      } else {
        scheduleIdle();
      }
    }, delay);
  };

  useEffect(() => {
    aliveRef.current = true;
    if (!loopAction) scheduleIdle();
    return () => {
      aliveRef.current = false;
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loopAction) return; // 固定动作模式：忽略说话/待机切换
    talkingRef.current = !!talking;
    clearTimers();
    if (talking) {
      apply('talk'); // 循环说话，直到声音结束
    } else {
      apply('stand');
      scheduleIdle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talking]);

  const shown = loopAction || action;

  if (!TutuRabbitNative) {
    return <View style={style} />; // 原生模块缺失时的安全占位（正常 iOS 构建不会发生）
  }

  return (
    <View style={style}>
      <TutuRabbitNative action={shown} style={StyleSheet.absoluteFill} />
    </View>
  );
}
