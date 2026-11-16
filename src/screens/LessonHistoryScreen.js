// 学生端：蓝湖「课堂重点」列表 → 点「查看记录」进详情。
import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
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
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

export default function LessonHistoryScreen({navigation}) {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
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
      <ScreenHeader title="课堂重点" onBack={() => navigation.goBack()} />
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
        {lessons == null ? (
          <ActivityIndicator color={colors.primary} style={{marginTop: 40}} />
        ) : !lessons.length ? (
          <Text style={styles.empty}>还没有课堂重点。老师用「上课录音」确认后会出现在这里。</Text>
        ) : (
          lessons.map(les => {
            const pieces = (les.segments || []).length;
            return (
              <TouchableOpacity
                key={les.session_id}
                style={styles.card}
                activeOpacity={0.88}
                onPress={() => navigation.navigate('LessonDetail', {lesson: les})}>
                <View style={styles.mid}>
                  <Text style={styles.title}>
                    课堂重点·{pieces || 0}首曲目
                  </Text>
                  <Text style={styles.when}>{fmt(les.at)}</Text>
                </View>
                <Text style={styles.link}>查看记录</Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors, dark) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    body: {padding: 15, paddingBottom: 40},
    empty: {color: colors.textSecondary, fontSize: 14, marginTop: 24, textAlign: 'center'},
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: dark ? '#040428' : colors.card,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 16,
      marginBottom: 12,
      minHeight: 70,
    },
    mid: {flex: 1, marginRight: 10},
    title: {color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 6},
    when: {color: colors.textSecondary, fontSize: 12},
    link: {color: colors.primary, fontSize: 13, fontWeight: '600'},
  });
}
