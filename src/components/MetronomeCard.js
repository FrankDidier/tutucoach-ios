// 大号节拍器卡片（陪练模式用）：两行深色卡片。
// 上行「🎵 节拍器 + 开始/停止（白胶囊）」；下行「− 90 BPM +（圆形按钮，可键盘输入）」。
// 复用与迷你节拍器相同的 Metronome 引擎，1–300 BPM。
import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Image,
  Keyboard,
} from 'react-native';
import {Metronome} from '../services/metronome';
import {Images} from '../assets/images';

export default function MetronomeCard({style}) {
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
      Animated.timing(dot, {toValue: 0.25, duration: 140, useNativeDriver: true}).start();
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

  const dotScale = dot.interpolate({inputRange: [0.25, 1], outputRange: [1, 1.6]});

  return (
    <View style={[styles.card, style]}>
      {/* 上行 */}
      <View style={styles.row}>
        <Image source={Images.metroNote} style={styles.note} resizeMode="contain" />
        <Text style={styles.title}>节拍器</Text>
        <View style={{flex: 1}} />
        <TouchableOpacity onPress={toggle} activeOpacity={0.85} style={styles.startBtn}>
          <Text style={styles.startText}>{running ? '停止' : '开始'}</Text>
        </TouchableOpacity>
      </View>

      {/* 下行 */}
      <View style={[styles.row, {marginTop: 14}]}>
        <TouchableOpacity
          style={styles.circle}
          onPress={() => step(-1)}
          onLongPress={() => startHold(-1)}
          onPressOut={endHold}
          delayLongPress={300}
          activeOpacity={0.6}>
          <Image source={Images.metroMinus} style={styles.stepIcon} resizeMode="contain" />
        </TouchableOpacity>

        <View style={{flex: 1}} />

        <Animated.View
          style={[styles.dot, {opacity: dot, transform: [{scale: dotScale}]}]}
        />
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

        <View style={{flex: 1}} />

        <TouchableOpacity
          style={styles.circle}
          onPress={() => step(1)}
          onLongPress={() => startHold(1)}
          onPressOut={endHold}
          delayLongPress={300}
          activeOpacity={0.6}>
          <Image source={Images.metroPlus} style={styles.stepIcon} resizeMode="contain" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(23,18,46,0.8)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  row: {flexDirection: 'row', alignItems: 'center'},
  note: {width: 20, height: 20, tintColor: '#fff'},
  title: {fontSize: 16, fontWeight: 'bold', color: '#fff', marginLeft: 8},
  startBtn: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  startText: {fontSize: 15, fontWeight: 'bold', color: '#17122E'},
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIcon: {width: 16, height: 16, tintColor: '#fff'},
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#B98CFF',
    marginRight: 10,
  },
  bpm: {fontSize: 26, fontWeight: 'bold', color: '#fff', textAlign: 'center', minWidth: 52},
  bpmInput: {padding: 0},
  unit: {fontSize: 12, color: 'rgba(255,255,255,0.7)', marginLeft: 2},
});
