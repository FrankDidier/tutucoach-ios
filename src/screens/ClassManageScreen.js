import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  StatusBar,
} from 'react-native';
import {Colors} from '../utils/colors';
import {Images} from '../assets/images';
import ScreenHeader from '../components/ScreenHeader';
import {getDeviceId} from '../services/device';
import {fetchStudents} from '../services/teacher';

function fmtMinutes(min) {
  const m = Math.round(min || 0);
  if (m < 60) return `${m}分钟`;
  return `${Math.floor(m / 60)}小时${m % 60}分钟`;
}

const ClassManageScreen = ({navigation}) => {
  const [students, setStudents] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetchStudents(getDeviceId());
        if (alive && r && r.ok && Array.isArray(r.students)) {
          setStudents(
            r.students.map(s => ({
              id: s.user_id,
              name: s.nickname || s.user_id.slice(-6),
              studentId: s.user_id.slice(-8),
              weeklyHours: fmtMinutes(s.week_minutes),
              avgRate: s.avg_match_rate,
              isVip: !!s.is_vip,
            })),
          );
        }
      } catch (e) {
        // 离线时显示空列表
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return students;
    return students.filter(
      s => s.name.includes(q) || s.studentId.includes(q),
    );
  }, [students, query]);

  const renderStudent = ({item}) => (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <Image
          source={Images.avatarRabbit}
          style={styles.avatar}
          resizeMode="cover"
        />
        <View style={styles.nameBlock}>
          <View style={styles.nameRow}>
            <Text style={styles.studentName}>{item.name}</Text>
            {item.isVip ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>V</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.studentId}>ID:{item.studentId}</Text>
        </View>
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.practiceLine}>
          <Text style={styles.practiceLabel}>本周练习：</Text>
          <Text style={styles.practiceValue}>{item.weeklyHours}</Text>
        </Text>
        <Text style={styles.practiceLine}>
          <Text style={styles.practiceLabel}>平均正确率：</Text>
          <Text style={styles.practiceValue}>
            {item.avgRate != null ? `${item.avgRate}%` : '—'}
          </Text>
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.pinkBg} />

      <ScreenHeader title="班级管理" onBack={() => navigation?.goBack?.()} />

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="搜索学生"
          placeholderTextColor={Colors.textSecondary}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <View style={styles.listHeaderRow}>
        <Image
          source={Images.menuStudentEntry}
          style={styles.listHeaderIcon}
          resizeMode="contain"
        />
        <Text style={styles.listHeader}>学生列表({filtered.length})</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={row => row.id}
        renderItem={renderStudent}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.emptyHint}>
            还没有学生入班。让学生在「我的」里复制 ID，老师录入即可。
          </Text>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.pinkBg,
  },
  searchBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchInput: {
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    fontSize: 14,
    color: Colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.pinkLight,
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  listHeaderIcon: {
    width: 24,
    height: 24,
    marginRight: 6,
  },
  listHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyHint: {
    textAlign: 'center',
    color: Colors.textSecondary,
    fontSize: 13,
    paddingHorizontal: 32,
    paddingTop: 40,
    lineHeight: 20,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.pinkLight,
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  badge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.pinkPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 11,
    color: Colors.white,
    fontWeight: '800',
  },
  studentId: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  cardRight: {
    marginLeft: 8,
    maxWidth: '46%',
  },
  practiceLine: {
    textAlign: 'right',
  },
  practiceLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  practiceValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.pinkPrimary,
  },
});

export default ClassManageScreen;
