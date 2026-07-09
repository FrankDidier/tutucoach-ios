// 兔子逐帧动画播放器 —— 对应安卓 WelcomeFragment 的 5 动作逻辑。
// RN iOS 的 <Image> 原生不动 APNG/WebP，所以这里用「逐帧 PNG + 定时切换 source」自绘，
// 全彩、保留柔和 alpha、Fabric 安全、可完全控制播放逻辑：
//   · 待机(stand)：连续循环；
//   · 说话(talk)：talking=true 时循环，声音结束(talking=false)回到待机；
//   · 开心/庆祝/思考(happy/celebrate/think)：待机时每隔 5–10s 随机播一次，播完回待机。
import React, {useEffect, useRef, useState} from 'react';
import {Image} from 'react-native';
import {RABBIT_FRAMES, RABBIT_FPS} from '../assets/anim/rabbitFrames';

const FRAME_MS = Math.round(1000 / RABBIT_FPS);
const IDLE_ACTIONS = ['happy', 'celebrate', 'think'];
const IDLE_MIN_MS = 5000;
const IDLE_MAX_MS = 10000;

export default function RabbitMascot({style, talking}) {
  const [cur, setCur] = useState({a: 'stand', i: 0});
  const stateRef = useRef({a: 'stand', i: 0, oneShot: false});
  const tickRef = useRef(null);
  const idleRef = useRef(null);
  const talkingRef = useRef(false);
  const aliveRef = useRef(true);

  const setAction = (a, oneShot) => {
    stateRef.current = {a, i: 0, oneShot: !!oneShot};
    setCur({a, i: 0});
  };

  const scheduleIdleAction = () => {
    if (idleRef.current) clearTimeout(idleRef.current);
    const delay = IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS);
    idleRef.current = setTimeout(() => {
      if (!aliveRef.current) return;
      // 仅在真正「待机静止」且没在说话时，才随机蹦出一个小动作。
      if (!talkingRef.current && stateRef.current.a === 'stand') {
        const pick = IDLE_ACTIONS[Math.floor(Math.random() * IDLE_ACTIONS.length)];
        setAction(pick, true);
      } else {
        scheduleIdleAction();
      }
    }, delay);
  };

  useEffect(() => {
    aliveRef.current = true;
    tickRef.current = setInterval(() => {
      const s = stateRef.current;
      const frames = RABBIT_FRAMES[s.a] || RABBIT_FRAMES.stand;
      let ni = s.i + 1;
      if (ni >= frames.length) {
        if (s.oneShot) {
          // 一次性动作播完 → 回到待机并重新排下一次随机动作。
          stateRef.current = {a: 'stand', i: 0, oneShot: false};
          setCur({a: 'stand', i: 0});
          scheduleIdleAction();
          return;
        }
        ni = 0; // 循环（待机/说话）
      }
      stateRef.current = {...s, i: ni};
      setCur({a: s.a, i: ni});
    }, FRAME_MS);
    scheduleIdleAction();
    return () => {
      aliveRef.current = false;
      if (tickRef.current) clearInterval(tickRef.current);
      if (idleRef.current) clearTimeout(idleRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    talkingRef.current = !!talking;
    if (talking) {
      if (idleRef.current) clearTimeout(idleRef.current);
      setAction('talk', false); // 循环说话，直到声音结束
    } else {
      setAction('stand', false);
      scheduleIdleAction();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talking]);

  const frames = RABBIT_FRAMES[cur.a] || RABBIT_FRAMES.stand;
  const src = frames[Math.min(cur.i, frames.length - 1)];
  // fadeDuration=0：关闭 iOS 换图淡入，逐帧才不会闪。
  return <Image source={src} style={style} resizeMode="contain" fadeDuration={0} />;
}
