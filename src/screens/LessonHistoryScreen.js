// 学生端：蓝湖「课堂重点」列表 → 点「查看记录」进详情。
import {SafeAreaView as EdgeSafeArea} from 'react-native-safe-area-context';
import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Dimensions,
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
    <EdgeSafeArea edges={['bottom', 'left', 'right']} style={styles.root}>
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
                <Image source={dark ? Images.keyHistDark : Images.keyHistLight} style={styles.icon} />
                <View style={styles.mid}>
                  <Text style={styles.title} numberOfLines={1}>
                    课堂重点·{pieces || 0}首曲目
                  </Text>
                  <Text style={styles.when}>{fmt(les.at)}</Text>
                </View>
                <View style={styles.linkRow}>
                  <Text style={styles.link}>查看记录</Text>
                  <Image
                    source={dark ? Images.icRowArrowDark : Images.icRowArrowLight}
                    style={styles.arrow}
                  />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </EdgeSafeArea>
  );
}

function makeStyles(colors, dark) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: dark ? '#020014' : '#FAFAFA'},
    // 蓝湖 课堂重点 卡 345×80 r10，间距 15：图标 44 (17,18)；标题 16/600 (71,20)；时间 12 (72,45)；查看记录 12 + 箭头 16（右 10，y23）
    body: {paddingHorizontal: px(15), paddingTop: px(10), paddingBottom: px(40)},
    empty: {color: colors.textSecondary, fontSize: px(14), marginTop: px(24), textAlign: 'center'},
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      height: px(80),
      backgroundColor: dark ? '#040428' : '#FFFFFF',
      borderRadius: px(10),
      paddingLeft: px(17),
      paddingTop: px(18),
      paddingRight: px(10),
      marginBottom: px(15),
    },
    icon: {width: px(44), height: px(44), marginRight: px(10)},
    mid: {flex: 1, marginRight: px(8), marginTop: px(2)},
    title: {color: dark ? '#FFFFFF' : '#261216', fontSize: px(16), lineHeight: px(22), fontWeight: '600'},
    when: {color: dark ? '#A1A1B4' : '#A6A6A6', fontSize: px(12), lineHeight: px(17), marginTop: px(3)},
    linkRow: {flexDirection: 'row', alignItems: 'center', marginTop: px(5)},
    link: {color: dark ? '#A1A1B4' : '#A6A6A6', fontSize: px(12), lineHeight: px(17)},
    arrow: {width: px(16), height: px(16), marginLeft: px(2)},
  });
}
