// 迷你节拍器控件（节拍器标题 + 开始/停止 + 拍点闪烁 + 速度 1–300，可键盘直接输入）。两种检测模式共用。
import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Keyboard,
} from 'react-native';
import {Metronome, MIN_BPM, MAX_BPM} from '../services/metronome';

export default function MetronomeBar({style}) {
  const engineRef = useRef(null);
  const dot = useRef(new Animated.Value(0.25)).current;
  const holdTimer = useRef(null);
  const [running, setRunning] = useState(false);
  const [bpm, setBpm] = useState(90);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('90');

  useEffect(() => {
    engineRef.current = new Metronome(() => {
      dot.setValue(1);
      Animated.timing(dot, {
        toValue: 0.25,
        duration: 140,
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

  const applyBpm = v => {
    const eng = engineRef.current;
    if (!eng) return;
    setBpm(eng.setBpm(v));
  };

  const step = delta => {
    const eng = engineRef.current;
    if (!eng) return;
    applyBpm(eng.bpm + delta);
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

  const beginEdit = () => {
    setDraft(String(bpm));
    setEditing(true);
  };

  const commitEdit = () => {
    const n = parseInt(draft, 10);
    if (!isNaN(n)) applyBpm(n);
    setEditing(false);
    Keyboard.dismiss();
  };

  // 拍点提示：透明度 + 放大的“心跳”效果，更显眼
  const dotScale = dot.interpolate({
    inputRange: [0.25, 1],
    outputRange: [1, 1.6],
  });

  return (
    <View style={[styles.pill, style]}>
      <Text style={styles.title}>🎵 节拍器</Text>
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.8}
        style={[styles.startBtn, running && styles.startBtnOn]}>
        <Text style={styles.startText}>{running ? '停止' : '开始'}</Text>
      </TouchableOpacity>
      <Animated.View
        style={[styles.dot, {opacity: dot, transform: [{scale: dotScale}]}]}
      />
      <View style={styles.sep} />
      <TouchableOpacity
        onPress={() => step(-1)}
        onLongPress={() => startHold(-1)}
        onPressOut={endHold}
        delayLongPress={300}
        activeOpacity={0.6}>
        <Text style={styles.btn}>−</Text>
      </TouchableOpacity>
      {editing ? (
        <TextInput
          style={[styles.bpm, styles.bpmInput]}
          value={draft}
          onChangeText={setDraft}
          onEndEditing={commitEdit}
          onSubmitEditing={commitEdit}
          keyboardType="number-pad"
          maxLength={3}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
        />
      ) : (
        <TouchableOpacity onPress={beginEdit} activeOpacity={0.6}>
          <Text style={styles.bpm}>{bpm}</Text>
        </TouchableOpacity>
      )}
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
  title: {fontSize: 14, fontWeight: 'bold', color: '#666'},
  startBtn: {
    marginLeft: 8,
    backgroundColor: '#E94F8A',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    minWidth: 50,
    alignItems: 'center',
  },
  startBtnOn: {backgroundColor: '#C93A72'},
  startText: {fontSize: 14, fontWeight: 'bold', color: '#fff'},
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E94F8A',
    marginLeft: 10,
    marginRight: 4,
  },
  sep: {width: 1, height: 20, backgroundColor: 'rgba(0,0,0,0.12)', marginHorizontal: 6},
  btn: {fontSize: 20, color: '#333', width: 34, textAlign: 'center'},
  bpm: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222',
    width: 46,
    textAlign: 'center',
  },
  bpmInput: {padding: 0, color: '#E94F8A'},
  unit: {fontSize: 10, color: '#999', marginRight: 2},
});
