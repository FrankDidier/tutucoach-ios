// 学生端：历次课堂重点，给家长也能翻看。
import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {getDeviceId} from '../services/device';
import {fetchLessonHistory, markLessonRecap} from '../services/companionChat';
import {getJson} from '../services/api';

function fmt(ts) {
  if (!ts) return '';
  const d = new Date(ts * (ts > 1e12 ? 1 : 1000));
  const p = n => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function LessonHistoryScreen({navigation}) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [lessons, setLessons] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const sid = getDeviceId();
    const items = await fetchLessonHistory(sid);
    setLessons(items);
    try {
      const resp = await getJson('/api/lesson/recap', {student_id: sid});
      if (resp && resp.id) await markLessonRecap(resp.id);
    } catch (e) {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader title="课堂重点历史" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }>
        <Text style={styles.hint}>老师上课录音整理后的重点会留在这里，家长也可以随时翻看。</Text>
        {lessons == null ? (
          <ActivityIndicator color={colors.primary} style={{marginTop: 40}} />
        ) : !lessons.length ? (
          <Text style={styles.empty}>还没有课堂重点。老师用「上课录音」确认后会出现在这里。</Text>
        ) : (
          lessons.map(les => (
            <View key={les.session_id} style={styles.card}>
              <Text style={styles.when}>{fmt(les.at)}</Text>
              {(les.segments || []).map((seg, i) => (
                <View key={`${les.session_id}-${i}`} style={styles.seg}>
                  <Text style={styles.piece}>《{seg.piece || '本节课'}》</Text>
                  {(seg.points || []).map((p, j) => {
                    const text = typeof p === 'string' ? p : p.text;
                    const tag =
                      p && p.target === 'section' && p.seg
                        ? `第${p.seg}段`
                        : '通用';
                    return (
                      <Text key={j} style={styles.point}>
                        · [{tag}] {text}
                      </Text>
                    );
                  })}
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    body: {padding: 16, paddingBottom: 40},
    hint: {color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 12},
    empty: {color: colors.textSecondary, fontSize: 14, marginTop: 24, textAlign: 'center'},
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
    },
    when: {color: colors.textSecondary, fontSize: 12, marginBottom: 8, fontWeight: '600'},
    seg: {marginBottom: 10},
    piece: {color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginBottom: 4},
    point: {color: colors.textPrimary, fontSize: 14, lineHeight: 22, marginLeft: 2},
  });
}
