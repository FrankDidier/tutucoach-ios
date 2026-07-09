// 迷你节拍器控件（开关 + 速度 1–300 + 拍点闪烁）。两种检测模式共用。
import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import {Metronome} from '../services/metronome';

export default function MetronomeBar({style}) {
  const engineRef = useRef(null);
  const dot = useRef(new Animated.Value(0.25)).current;
  const holdTimer = useRef(null);
  const [running, setRunning] = useState(false);
  const [bpm, setBpm] = useState(90);

  useEffect(() => {
    engineRef.current = new Metronome(() => {
      dot.setValue(1);
      Animated.timing(dot, {
        toValue: 0.25,
        duration: 120,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      if (holdTimer.current) clearInterval(holdTimer.current);
      if (engineRef.current) engineRef.current.release();
    };
  }, [dot]);

  const toggle = () => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.isRunning()) {
      eng.stop();
      setRunning(false);
      dot.setValue(0.25);
    } else {
      eng.start();
      setRunning(true);
    }
  };

  const step = delta => {
    const eng = engineRef.current;
    if (!eng) return;
    setBpm(eng.setBpm(eng.bpm + delta));
  };

  const startHold = delta => {
    step(delta);
    if (holdTimer.current) clearInterval(holdTimer.current);
    let first = true;
    holdTimer.current = setInterval(() => {
      step(delta);
      first = false;
    }, first ? 260 : 60);
  };

  const endHold = () => {
    if (holdTimer.current) {
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
  };

  return (
    <View style={[styles.pill, style]}>
      <TouchableOpacity onPress={toggle} activeOpacity={0.7}>
        <Text style={[styles.toggle, running && styles.toggleOn]}>
          {running ? '🎵 停止' : '🎵 节拍器'}
        </Text>
      </TouchableOpacity>
      <Animated.View style={[styles.dot, {opacity: dot}]} />
      <View style={styles.sep} />
      <TouchableOpacity
        onPress={() => step(-1)}
        onLongPress={() => startHold(-1)}
        onPressOut={endHold}
        delayLongPress={300}
        activeOpacity={0.6}>
        <Text style={styles.btn}>−</Text>
      </TouchableOpacity>
      <Text style={styles.bpm}>{bpm}</Text>
      <Text style={styles.unit}>BPM</Text>
      <TouchableOpacity
        onPress={() => step(1)}
        onLongPress={() => startHold(1)}
        onPressOut={endHold}
        delayLongPress={300}
        activeOpacity={0.6}>
        <Text style={styles.btn}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  toggle: {fontSize: 14, fontWeight: 'bold', color: '#666'},
  toggleOn: {color: '#E94F8A'},
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E94F8A',
    marginLeft: 8,
    marginRight: 4,
  },
  sep: {width: 1, height: 20, backgroundColor: 'rgba(0,0,0,0.12)', marginHorizontal: 6},
  btn: {fontSize: 20, color: '#333', width: 34, textAlign: 'center'},
  bpm: {fontSize: 18, fontWeight: 'bold', color: '#222', width: 44, textAlign: 'center'},
  unit: {fontSize: 10, color: '#999', marginRight: 2},
});
