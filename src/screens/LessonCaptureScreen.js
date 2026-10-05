// 上课录音。老师说「现在开始下一首」时切开曲目，确认后挂到这个学生的曲目重点。
import React, {useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  NativeModules,
} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {getDeviceId} from '../services/device';
import {speak} from '../services/voice';
import {startLesson, pushLessonChunk, confirmLesson} from '../services/companionChat';

const Ear = NativeModules.TutuRecorder || null;

export default function LessonCaptureScreen({navigation}) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [studentId, setStudentId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [listening, setListening] = useState(false);
  const [segments, setSegments] = useState([]);
  const [pieces, setPieces] = useState({});
  const stopRef = useRef(false);

  const begin = async () => {
    const sid = studentId.trim();
    if (!sid) {
      Alert.alert('先填写学生码');
      return;
    }
    const started = await startLesson(getDeviceId(), sid);
    if (!started) {
      Alert.alert('没能开始', '网络不好，过一会儿再试。');
      return;
    }
    setSessionId(started.session_id);
    setSegments([]);
    stopRef.current = false;
    setListening(true);
    if (started.say) {
      try {
        speak(started.say, {lang: 'zh'});
      } catch (e) {}
    }
    const loop = async () => {
      while (!stopRef.current) {
        if (!Ear || !Ear.listenOnce) {
          Alert.alert('这台手机还不能边听边记', '可以先把老师说的重点打在下面。');
          break;
        }
        try {
          const heard = await Ear.listenOnce();
          const text = ((heard && heard.text) || '').trim();
          if (text && !stopRef.current) {
            const resp = await pushLessonChunk(started.session_id, text);
            if (resp && resp.segments) setSegments(resp.segments);
          }
        } catch (e) {}
      }
    };
    loop();
  };

  const end = () => {
    stopRef.current = true;
    setListening(false);
  };

  const confirm = async () => {
    if (!sessionId) return;
    const body = (segments.length ? segments : [{idx: 0, points: []}]).map(seg => ({
      idx: seg.idx,
      piece: (pieces[seg.idx] || seg.piece || '').trim(),
      points: seg.points || [],
    }));
    const resp = await confirmLesson(sessionId, getDeviceId(), studentId.trim(), body);
    if (!resp) {
      Alert.alert('没能挂上', '网络不好，再确认一次。');
      return;
    }
    Alert.alert('已挂到曲目重点', '学生下次打开陪练，会听到这节课记下的一句。');
    navigation.goBack();
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="上课录音" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.hint}>
          开始后会先说一句：请老师在换曲子时说「现在开始下一首」。确认之后，这些句子写进该学生的曲目重点。
        </Text>
        <TextInput
          style={styles.input}
          value={studentId}
          onChangeText={setStudentId}
          placeholder="学生码"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
        />
        {!listening ? (
          <TouchableOpacity style={styles.btn} onPress={begin}>
            <Text style={styles.btnText}>{sessionId ? '继续听' : '开始上课'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btn} onPress={end}>
            <Text style={styles.btnText}>先停一下</Text>
          </TouchableOpacity>
        )}
        {segments.map(seg => (
          <View key={String(seg.idx)} style={styles.card}>
            <TextInput
              style={styles.input}
              value={pieces[seg.idx] != null ? pieces[seg.idx] : seg.piece || ''}
              onChangeText={t => setPieces(prev => ({...prev, [seg.idx]: t}))}
              placeholder={'第 ' + (seg.idx + 1) + ' 首的曲名'}
              placeholderTextColor={colors.textSecondary}
            />
            {(seg.points || []).map((p, i) => (
              <Text key={i} style={styles.point}>
                {p}
              </Text>
            ))}
            {!(seg.points || []).length && seg.text ? (
              <Text style={styles.point}>{seg.text}</Text>
            ) : null}
          </View>
        ))}
        {sessionId && !listening ? (
          <TouchableOpacity style={styles.btn} onPress={confirm}>
            <Text style={styles.btnText}>确认并挂到曲目</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    body: {padding: 16, paddingBottom: 40},
    hint: {color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 12},
    input: {
      borderWidth: 1,
      borderColor: colors.border || '#ddd',
      borderRadius: 10,
      padding: 10,
      color: colors.textPrimary,
      marginBottom: 10,
    },
    btn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 14,
    },
    btnText: {color: '#fff', fontWeight: '700'},
    card: {
      backgroundColor: colors.card || '#fff',
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    point: {color: colors.textPrimary, fontSize: 15, marginBottom: 4},
  });
}
