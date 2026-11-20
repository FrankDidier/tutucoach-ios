// 蓝湖「课堂重点详情」
import {SafeAreaView as EdgeSafeArea} from 'react-native-safe-area-context';
import React, {useMemo} from 'react';
import {View, Text, StyleSheet, ScrollView, Image, Dimensions} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {Images} from '../assets/images';

const {width: SCREEN_W} = Dimensions.get('window');
const px = n => Math.round((n * SCREEN_W) / 375);

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
          <View style={styles.whenRow}>
            <Image source={Images.icCalendar} style={styles.calendar} />
            <Text style={styles.when}>{fmt(lesson.at)}</Text>
          </View>
          {segments.length === 0 ? (
            <Text style={styles.empty}>本课暂无分段重点。</Text>
          ) : (
            segments.map((seg, i) => {
              const points = (seg.points || [])
                .map(p => (typeof p === 'string' ? p : p?.text || '').trim())
                .filter(Boolean);
              return (
                <View key={`${lesson.session_id || 'les'}-${i}`} style={styles.segCard}>
                  <View style={styles.segHead}>
                    <Image
                      source={dark ? Images.ldPieceDark : Images.ldPieceLight}
                      style={styles.pieceIcon}
                    />
                    <Text style={styles.piece} numberOfLines={1}>
                      {seg.piece ? `《${seg.piece}》` : '本节课'}
                    </Text>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{points.length}条重点</Text>
                    </View>
                  </View>
                  {points.map((t, j) => (
                    <View key={j} style={styles.pointRow}>
                      <Text style={styles.dot}>•</Text>
                      <Text style={styles.point}>{t}</Text>
                    </View>
                  ))}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </EdgeSafeArea>
  );
}

// 蓝湖：面板 345 r10 (15,99)，日期 12/500 + 日历 16 (10,13)；曲目卡 325 r10，间距 10：
// 图标 28 (10,10)；曲名 14/400 (48,16)；N条重点 58×24 r4 (右 10, 上 13)；正文 12/400 lh21 自 y48
function makeStyles(colors, dark) {
  const ink = dark ? '#FFFFFF' : '#261216';
  const sub = dark ? '#A1A1B4' : '#A6A6A6';
  const accent = dark ? '#B595FF' : '#FF355F';
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: dark ? '#020014' : '#FAFAFA'},
    body: {paddingHorizontal: px(15), paddingTop: px(11), paddingBottom: px(40)},
    panel: {
      backgroundColor: dark ? '#040428' : '#FFFFFF',
      borderRadius: px(10),
      paddingHorizontal: px(10),
      paddingTop: px(13),
      paddingBottom: px(10),
      minHeight: px(200),
    },
    whenRow: {flexDirection: 'row', alignItems: 'center', height: px(17), marginBottom: px(10)},
    calendar: {width: px(16), height: px(16), marginRight: px(6), tintColor: sub},
    when: {color: sub, fontSize: px(12), lineHeight: px(17), fontWeight: '500'},
    empty: {color: sub, textAlign: 'center', marginTop: px(40), fontSize: px(13)},
    segCard: {
      backgroundColor: dark ? '#131444' : '#FFF5F7',
      borderRadius: px(10),
      paddingHorizontal: px(10),
      paddingTop: px(10),
      paddingBottom: px(12),
      marginBottom: px(10),
    },
    segHead: {flexDirection: 'row', alignItems: 'center', height: px(28), marginBottom: px(10)},
    pieceIcon: {width: px(28), height: px(28), marginRight: px(10)},
    piece: {flex: 1, color: ink, fontSize: px(14), lineHeight: px(17), marginRight: px(8)},
    badge: {
      minWidth: px(58),
      height: px(24),
      paddingHorizontal: px(6),
      borderRadius: px(4),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: dark ? 'rgba(181,149,255,0.2)' : 'rgba(255,53,95,0.1)',
    },
    badgeText: {color: accent, fontSize: px(11), lineHeight: px(15)},
    pointRow: {flexDirection: 'row'},
    dot: {color: ink, fontSize: px(12), lineHeight: px(21), width: px(12)},
    point: {flex: 1, color: ink, fontSize: px(12), lineHeight: px(21)},
  });
}
