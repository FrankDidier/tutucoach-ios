// 蓝湖「课堂重点详情」
import {SafeAreaView as EdgeSafeArea} from 'react-native-safe-area-context';
import React, {useMemo} from 'react';
import {View, Text, StyleSheet, SafeAreaView, ScrollView} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';

function fmt(ts) {
  if (!ts) return '';
  const d = new Date(ts * (ts > 1e12 ? 1 : 1000));
  const p = n => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

export default function LessonDetailScreen({navigation, route}) {
  const lesson = route?.params?.lesson || {};
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const segments = lesson.segments || [];

  return (
    <EdgeSafeArea edges={['bottom', 'left', 'right']} style={styles.root}>
      <ScreenHeader title="课堂重点详情" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.panel}>
          <Text style={styles.when}>{fmt(lesson.at)}</Text>
          {segments.length === 0 ? (
            <Text style={styles.empty}>本课暂无分段重点。</Text>
          ) : (
            segments.map((seg, i) => {
              const points = seg.points || [];
              const count = points.length;
              return (
                <View key={`${lesson.session_id || 'les'}-${i}`} style={styles.segCard}>
                  <View style={styles.segHead}>
                    <Text style={styles.piece} numberOfLines={1}>
                      {seg.piece ? `《${seg.piece}》` : '本节课'}
                    </Text>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{count}条重点</Text>
                    </View>
                  </View>
                  <Text style={styles.points}>
                    {points
                      .map(p => {
                        const text = typeof p === 'string' ? p : p?.text || '';
                        return `· ${text}`;
                      })
                      .filter(Boolean)
                      .join('\n')}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </EdgeSafeArea>
  );
}

function makeStyles(colors, dark) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    body: {paddingHorizontal: 15, paddingBottom: 40},
    panel: {
      backgroundColor: dark ? '#040428' : colors.card,
      borderRadius: 14,
      padding: 12,
      minHeight: 200,
    },
    when: {color: colors.textSecondary, fontSize: 12, marginBottom: 12, marginLeft: 8},
    empty: {color: colors.textSecondary, textAlign: 'center', marginTop: 40},
    segCard: {
      backgroundColor: dark ? 'rgba(19,20,68,1)' : '#F7F7F7',
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    segHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    piece: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '700',
      marginRight: 8,
    },
    badge: {
      backgroundColor: dark ? 'rgba(181,149,255,0.18)' : 'rgba(255,53,95,0.12)',
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    badgeText: {color: colors.primary, fontSize: 12, fontWeight: '600'},
    points: {color: colors.textPrimary, fontSize: 14, lineHeight: 22},
  });
}
