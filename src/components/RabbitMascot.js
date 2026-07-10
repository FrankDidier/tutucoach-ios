// 兔子逐帧动画播放器 —— 对应安卓 WelcomeFragment 的 5 动作逻辑。
// RN iOS 的 <Image> 原生不动 APNG/WebP，所以这里用「逐帧 PNG」自绘。
//
// 为避免逐帧切 source 时 iOS 每帧临时解码导致的「卡顿」，这里改用
// 「当前动作的所有帧一次性叠层挂载 + 只切透明度」的做法：一个动作的帧只在进入时
// 解码一次，之后播放全程只是 GPU 改 opacity，循环（待机/说话）非常顺滑。
// 一次最多只挂一个动作的帧（≤70 张 260×299），内存可控。
//
// 播放逻辑：
//   · 待机(stand)：连续循环；
//   · 说话(talk)：talking=true 时循环，声音结束(talking=false)回到待机；
//   · 开心/庆祝/思考：待机时每隔 5–10s 随机播一次，播完回待机。
import React, {useEffect, useRef, useState} from 'react';
import {Image, View, StyleSheet} from 'react-native';
import {RABBIT_FRAMES, RABBIT_FPS} from '../assets/anim/rabbitFrames';

const FRAME_MS = Math.round(1000 / RABBIT_FPS);
const IDLE_ACTIONS = ['happy', 'celebrate', 'think'];
const IDLE_MIN_MS = 5000;
const IDLE_MAX_MS = 10000;

// 单帧：只在自己「是否可见」变化时才重渲染，避免每帧把整套帧全部 reconcile（更省、更顺）。
const Frame = React.memo(function Frame({src, visible}) {
  return (
    <Image
      source={src}
      resizeMode="contain"
      fadeDuration={0}
      style={[StyleSheet.absoluteFill, {opacity: visible ? 1 : 0}]}
    />
  );
});

export default function RabbitMascot({style, talking, loopAction}) {
  // loopAction：固定循环播放某个动作（如「练琴」页固定播庆祝），忽略待机/说话/随机逻辑。
  const initial = loopAction || 'stand';
  const [action, setActionState] = useState(initial);
  const [frameIdx, setFrameIdx] = useState(0);
  const stateRef = useRef({a: initial, i: 0, oneShot: false});
  const tickRef = useRef(null);
  const idleRef = useRef(null);
  const talkingRef = useRef(false);
  const aliveRef = useRef(true);

  const setAction = (a, oneShot) => {
    stateRef.current = {a, i: 0, oneShot: !!oneShot};
    setActionState(a);
    setFrameIdx(0);
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
        if (loopAction) {
          ni = 0; // 固定动作：一直循环
        } else if (s.oneShot) {
          // 一次性动作播完 → 回到待机并重新排下一次随机动作。
          stateRef.current = {a: 'stand', i: 0, oneShot: false};
          setActionState('stand');
          setFrameIdx(0);
          scheduleIdleAction();
          return;
        }
        ni = 0; // 循环（待机/说话）
      }
      stateRef.current = {...s, i: ni};
      setFrameIdx(ni);
    }, FRAME_MS);
    if (!loopAction) scheduleIdleAction();
    return () => {
      aliveRef.current = false;
      if (tickRef.current) clearInterval(tickRef.current);
      if (idleRef.current) clearTimeout(idleRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loopAction) return; // 固定动作模式：忽略说话/待机切换
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

  const frames = RABBIT_FRAMES[action] || RABBIT_FRAMES.stand;
  const shown = Math.min(frameIdx, frames.length - 1);

  // 当前动作的所有帧叠层挂载；只有当前帧 opacity=1，其余=0。
  // 帧只在进入该动作时解码一次，播放全程零解码 → 顺滑不卡。
  return (
    <View style={style}>
      {frames.map((src, i) => (
        <Frame key={`${action}-${i}`} src={src} visible={i === shown} />
      ))}
    </View>
  );
}
