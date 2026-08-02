// 大号节拍器卡片：陪练 / 手型检测两套样式，1:1 对齐蓝湖。
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
import {useTheme} from '../theme/ThemeContext';

// variant: 'companion' | 'detect'
export default function MetronomeCard({style, variant = 'companion'}) {
  const {colors, mode} = useTheme();
  const detect = variant === 'detect';
  const detectAccent = mode === 'dark' ? '#B595FF' : '#FF355F';
  const detectBtn = colors.primary;
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
    holdTimer.current = setInterval(() => step(delta), 80);
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

  const dotScale = dot.interpolate({
    inputRange: [0.25, 1],
    outputRange: [1, 1.6],
  });

  const detectLight = detect && mode === 'light';
  const cardTone = detectLight
    ? {
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(240,59,97,0.2)',
      }
    : detect
      ? {
          backgroundColor: 'rgba(26,26,26,0.6)',
          borderColor: 'rgba(255,255,255,0.1)',
        }
      : null;
  const titleColor = detectLight ? '#1A1A1A' : '#fff';
  const unitColor = detect
    ? detectAccent
    : 'rgba(255,255,255,0.7)';
  const bpmColor = detect ? detectAccent : '#fff';
  // 蓝湖连续轨道：detect 浅粉 / 深半透明；companion 深半透明条
  const trackTone = detectLight
    ? {backgroundColor: '#FFE1E8'}
    : detect
      ? {backgroundColor: 'rgba(255,255,255,0.1)'}
      : {backgroundColor: 'rgba(0,0,0,0.28)'};
  const circleTone = detect
    ? {
        backgroundColor: '#fff',
        ...(detectLight ? {} : {}),
      }
    : {backgroundColor: 'rgba(255,255,255,0.12)'};

  return (
    <View style={[styles.card, cardTone, style]}>
      <View style={styles.row}>
        <Image
          source={Images.metroNote}
          style={[styles.note, {tintColor: detect ? detectAccent : '#fff'}]}
          resizeMode="contain"
        />
        <Text style={[styles.title, {color: titleColor}]}>节拍器</Text>
        <View style={{flex: 1}} />
        <TouchableOpacity
          onPress={toggle}
          activeOpacity={0.85}
          style={[styles.startBtn, detect && {backgroundColor: detectBtn}]}>
          <Text style={[styles.startText, detect && styles.startTextDetect]}>
            {running ? '停止' : '开始'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 蓝湖：± 与 BPM 嵌在连续轨道内 */}
      <View style={[styles.track, trackTone]}>
        <TouchableOpacity
          style={[styles.circle, circleTone]}
          onPress={() => step(-1)}
          onLongPress={() => startHold(-1)}
          onPressOut={endHold}
          delayLongPress={300}
          activeOpacity={0.6}>
          <Image
            source={Images.metroMinus}
            style={[
              styles.stepIcon,
              {tintColor: detect ? detectAccent : '#fff'},
            ]}
            resizeMode="contain"
          />
        </TouchableOpacity>

        <View style={{flex: 1}} />

        {!detect ? (
          <Animated.View
            style={[styles.dot, {opacity: dot, transform: [{scale: dotScale}]}]}
          />
        ) : null}
        {editing ? (
          <TextInput
            style={[styles.bpm, styles.bpmInput, {color: bpmColor}]}
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
            <Text style={[styles.bpm, {color: bpmColor}]}>{bpm}</Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.unit, {color: unitColor}]}>BPM</Text>

        <View style={{flex: 1}} />

        <TouchableOpacity
          style={[styles.circle, circleTone]}
          onPress={() => step(1)}
          onLongPress={() => startHold(1)}
          onPressOut={endHold}
          delayLongPress={300}
          activeOpacity={0.6}>
          <Image
            source={Images.metroPlus}
            style={[
              styles.stepIcon,
              {tintColor: detect ? detectAccent : '#fff'},
            ]}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(26,26,26,0.6)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  row: {flexDirection: 'row', alignItems: 'center'},
  note: {width: 20, height: 20, tintColor: '#fff'},
  title: {fontSize: 14, fontWeight: 'bold', color: '#fff', marginLeft: 8},
  startBtn: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  startText: {fontSize: 14, fontWeight: 'bold', color: '#1A1A1A'},
  startTextDetect: {color: '#fff'},
  track: {
    marginTop: 14,
    height: 40,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIcon: {width: 14, height: 14},
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#B98CFF',
    marginRight: 10,
  },
  bpm: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    minWidth: 52,
  },
  bpmInput: {padding: 0},
  unit: {fontSize: 12, marginLeft: 2},
});
