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
  TouchableOpacity,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Colors} from '../utils/colors';
import {Images} from '../assets/images';
import ScreenHeader from '../components/ScreenHeader';
import {getDeviceId} from '../services/device';
import {registerAccount} from '../services/account';
import {fetchStudents} from '../services/teacher';
import {listStudents} from '../services/students';

const remarksKey = tid => `student_remarks:${tid}`;

// 老师给学生起的名字优先级：班级名单备注名(学生录入) > 老师备注名 > 后台昵称 > id 尾号。
// roster/remarks 的 key 可能是「学生码」（user_id 的尾段），故按 精确 / 尾号 双向匹配兜底。
function resolveName(userId, backendNick, roster, remarks) {
  const uid = userId || '';
  const tryMaps = key => (roster[key] || remarks[key] || '').trim();
  let n = tryMaps(uid);
  if (!n) {
    // 尾号匹配：名单里的学生码是 user_id 的后缀，或反之。
    const keys = Object.keys(roster).concat(Object.keys(remarks));
    for (const k of keys) {
      if (!k) continue;
      if (uid.endsWith(k) || k.endsWith(uid)) {
        n = (roster[k] || remarks[k] || '').trim();
        if (n) break;
      }
    }
  }
  return n || (backendNick || '').trim() || uid.slice(-6);
}

let Clipboard = null;
try {
  // eslint-disable-next-line global-require
  Clipboard = require('@react-native-clipboard/clipboard').default;
} catch (e) {
  Clipboard = null;
}

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
      const tid = getDeviceId();
      try {
        // 确保本设备已是「老师」账号，教师统计才查得到本班学生。
        await registerAccount(tid, 'teacher');
      } catch (e) {}

      // 读取老师本地设置的班级名单 + 备注名，用来把「id 码」显示成真实名字。
      let roster = {};
      let remarks = {};
      try {
        const list = (await listStudents()) || [];
        list.forEach(s => {
          if (s && s.studentId) roster[s.studentId] = (s.name || '').trim();
        });
      } catch (e) {}
      try {
        const raw = await AsyncStorage.getItem(remarksKey(tid));
        remarks = raw ? JSON.parse(raw) || {} : {};
      } catch (e) {}

      try {
        const r = await fetchStudents(tid);
        if (alive && r && r.ok && Array.isArray(r.students)) {
          setStudents(
            r.students.map(s => ({
              id: s.user_id,
              name: resolveName(s.user_id, s.nickname, roster, remarks),
              studentId: s.user_id.slice(-8),
              // 累计练习时长（后端新增 total_minutes；老后端只有 week_minutes 时兜底）。
              totalHours: fmtMinutes(
                s.total_minutes != null ? s.total_minutes : s.week_minutes,
              ),
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

  const onStudentPress = item => {
    Alert.alert(item.name, `完整 ID：${item.id}`, [
      {text: '关闭', style: 'cancel'},
      {
        text: '复制 ID',
        onPress: () => {
          if (Clipboard) {
            Clipboard.setString(item.id);
            Alert.alert('已复制', '学生完整 ID 已复制');
          }
        },
      },
    ]);
  };

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return students;
    return students.filter(
      s => s.name.includes(q) || s.studentId.includes(q),
    );
  }, [students, query]);

  const renderStudent = ({item}) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => onStudentPress(item)}>
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
          <Text style={styles.practiceLabel}>累计练习：</Text>
          <Text style={styles.practiceValue}>{item.totalHours}</Text>
        </Text>
        <Text style={styles.practiceLine}>
          <Text style={styles.practiceLabel}>平均正确率：</Text>
          <Text style={styles.practiceValue}>
            {item.avgRate != null ? `${item.avgRate}%` : '—'}
          </Text>
        </Text>
      </View>
    </TouchableOpacity>
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
