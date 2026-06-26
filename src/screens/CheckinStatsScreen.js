import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, SafeAreaView, ScrollView, StatusBar} from 'react-native';
import {Colors} from '../utils/colors';
import ScreenHeader from '../components/ScreenHeader';
import {getStats} from '../services/companion';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// 与 RabbitCompanion.currentDayNumber 同口径（本地正午取 UTC 天序号）。
function dayNumberOf(year, month, dom) {
  return Math.floor(new Date(year, month, dom, 12, 0, 0, 0).getTime() / DAY_MS);
}

const StatCell = ({value, label}) => (
  <View style={styles.statCell}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const CheckinStatsScreen = ({navigation}) => {
  const [stats, setStats] = useState({
    streak: 0,
    totalDays: 0,
    totalMinutes: 0,
    points: 0,
    days: [],
  });

  useEffect(() => {
    let alive = true;
    getStats().then(s => alive && setStats(s));
    return () => {
      alive = false;
    };
  }, []);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDom = now.getDate();
  const practiced = new Set(stats.days);

  const first = new Date(year, month, 1, 12, 0, 0);
  const leadBlanks = first.getDay(); // Sunday=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < leadBlanks; i++) cells.push(null);
  for (let dom = 1; dom <= daysInMonth; dom++) cells.push(dom);
  while (cells.length % 7 !== 0) cells.push(null);

  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScreenHeader title="打卡统计" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.statRow}>
          <StatCell value={stats.streak} label="连续天数" />
          <StatCell value={stats.totalDays} label="累计打卡" />
          <StatCell value={stats.totalMinutes} label="累计分钟" />
          <StatCell value={stats.points} label="积分" />
        </View>

        <View style={styles.calendarCard}>
          <Text style={styles.monthLabel}>{`${year}年${month + 1}月 · 打卡`}</Text>
          <View style={styles.weekRow}>
            {WEEKDAYS.map(d => (
              <Text key={d} style={styles.weekday}>
                {d}
              </Text>
            ))}
          </View>
          {rows.map((row, ri) => (
            <View key={ri} style={styles.dayRow}>
              {row.map((dom, ci) => {
                if (dom == null) {
                  return <View key={ci} style={styles.dayCell} />;
                }
                const isPracticed = practiced.has(dayNumberOf(year, month, dom));
                const isToday = dom === todayDom;
                return (
                  <View key={ci} style={styles.dayCell}>
                    <View
                      style={[
                        styles.dayInner,
                        isPracticed && styles.dayPracticed,
                      ]}>
                      <Text
                        style={[
                          styles.dayText,
                          isPracticed && styles.dayTextPracticed,
                          !isPracticed && isToday && styles.dayTextToday,
                        ]}>
                        {dom}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.pinkBg},
  scroll: {padding: 16, paddingBottom: 40},
  statRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 3},
    elevation: 2,
  },
  statCell: {flex: 1, alignItems: 'center'},
  statValue: {fontSize: 24, fontWeight: '800', color: Colors.pinkPrimary},
  statLabel: {fontSize: 12, color: Colors.textSecondary, marginTop: 6},
  calendarCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 3},
    elevation: 2,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 14,
    textAlign: 'center',
  },
  weekRow: {flexDirection: 'row', marginBottom: 8},
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  dayRow: {flexDirection: 'row', marginTop: 4},
  dayCell: {flex: 1, height: 38, alignItems: 'center', justifyContent: 'center'},
  dayInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPracticed: {backgroundColor: Colors.pinkPrimary},
  dayText: {fontSize: 13, color: Colors.textPrimary},
  dayTextPracticed: {color: '#fff', fontWeight: '700'},
  dayTextToday: {color: Colors.pinkPrimary, fontWeight: '700'},
});

export default CheckinStatsScreen;
