// 兔子逐帧动画播放器 —— 对应安卓 WelcomeFragment 的 5 动作逻辑。
// RN iOS 的 <Image> 原生不动 APNG/WebP，所以这里用「逐帧 PNG」（480×552 全分辨率，与安卓同源）自绘。
//
// 顺滑关键：一个动作的所有帧一次性叠层挂载，播放时【不做任何 React setState】，
// 只用 Animated.Value.setValue 直接切换每帧的 opacity —— 这些更新走原生 UI 线程，
// 不触发 React 重渲染/reconcile，因此循环（待机/说话）非常顺滑，不再「卡」。
//
// 播放逻辑：
//   · 待机(stand)：连续循环；
//   · 说话(talk)：talking=true 时循环，声音结束(talking=false)回到待机；
//   · 开心/庆祝/思考：待机时每隔 5–10s 随机播一次，播完回待机。
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, View, StyleSheet} from 'react-native';
import {RABBIT_FRAMES, RABBIT_FPS} from '../assets/anim/rabbitFrames';

const FRAME_MS = Math.round(1000 / RABBIT_FPS);
const IDLE_ACTIONS = ['happy', 'celebrate', 'think'];
const IDLE_MIN_MS = 5000;
const IDLE_MAX_MS = 10000;

const imgStyle = [
  StyleSheet.absoluteFill,
  {width: '100%', height: '100%', resizeMode: 'contain'},
];

export default function RabbitMascot({style, talking, loopAction}) {
  const initial = loopAction || 'stand';
  const [action, setActionState] = useState(initial);
  const frames = RABBIT_FRAMES[action] || RABBIT_FRAMES.stand;

  // 每个动作独立的一组 opacity（动作切换时重建；不随帧变化触发渲染）。
  const opacities = useMemo(
    () => frames.map((_, i) => new Animated.Value(i === 0 ? 1 : 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action],
  );
  const opacitiesRef = useRef(opacities);
  opacitiesRef.current = opacities;

  const stateRef = useRef({a: initial, i: 0, oneShot: false});
  const tickRef = useRef(null);
  const idleRef = useRef(null);
  const talkingRef = useRef(false);
  const aliveRef = useRef(true);

  // 切换动作：重置索引，让第 0 帧可见（opacities 由 useMemo 在渲染后重建为 [1,0,0,...]）。
  const setAction = (a, oneShot) => {
    stateRef.current = {a, i: 0, oneShot: !!oneShot};
    setActionState(a);
  };

  const scheduleIdleAction = () => {
    if (idleRef.current) clearTimeout(idleRef.current);
    const delay = IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS);
    idleRef.current = setTimeout(() => {
      if (!aliveRef.current) return;
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
      const fr = RABBIT_FRAMES[s.a] || RABBIT_FRAMES.stand;
      const ops = opacitiesRef.current;
      // opacities 尚未与当前动作对齐（刚切动作、useMemo 还没重建完）时跳过这一拍。
      if (!ops || ops.length !== fr.length) return;
      let ni = s.i + 1;
      if (ni >= fr.length) {
        if (loopAction) {
          ni = 0;
        } else if (s.oneShot) {
          // 一次性动作播完 → 回待机 + 排下一次随机动作。
          stateRef.current = {a: 'stand', i: 0, oneShot: false};
          setActionState('stand');
          scheduleIdleAction();
          return;
        } else {
          ni = 0;
        }
      }
      // 只切两帧的透明度（原生线程），不做 React 渲染。
      if (ops[s.i]) ops[s.i].setValue(0);
      if (ops[ni]) ops[ni].setValue(1);
      stateRef.current = {...s, i: ni};
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
    if (loopAction) return;
    talkingRef.current = !!talking;
    if (talking) {
      if (idleRef.current) clearTimeout(idleRef.current);
      setAction('talk', false);
    } else {
      setAction('stand', false);
      scheduleIdleAction();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talking]);

  // 当前动作的所有帧叠层挂载；只在动作切换时重挂载（每帧一次性解码），播放全程零渲染。
  return (
    <View style={style}>
      {frames.map((src, i) => (
        <Animated.Image
          key={`${action}-${i}`}
          source={src}
          fadeDuration={0}
          style={[imgStyle, {opacity: opacities[i]}]}
        />
      ))}
    </View>
  );
}
