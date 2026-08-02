import React, {useCallback, useEffect, useMemo, useState} from 'react';
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
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Images} from '../assets/images';
import ScreenHeader from '../components/ScreenHeader';
import {useTheme} from '../theme/ThemeContext';
import {getDeviceId} from '../services/device';
import {registerAccount, bindTeacher} from '../services/account';
import {fetchStudents} from '../services/teacher';
import {listStudents, saveStudent} from '../services/students';

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

// 老师可切换查看的练琴时长区间。
const RANGES = [
  {key: 'week', label: '1周', field: 'weekMinutes', title: '本周练习'},
  {key: 'month', label: '1个月', field: 'monthMinutes', title: '本月练习'},
  {key: 'all', label: '所有', field: 'totalMinutes', title: '累计练习'},
];

const ClassManageScreen = ({navigation}) => {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [students, setStudents] = useState([]);
  const [query, setQuery] = useState('');
  const [range, setRange] = useState('all'); // 默认看「所有」

  const load = useCallback(async () => {
    const tid = getDeviceId();
    try {
      // 确保本设备已是「老师」账号，教师统计才查得到本班学生。
      await registerAccount(tid, 'teacher');
    } catch (e) {}

    // 读取老师本地设置的班级名单 + 备注名，用来把「id 码」显示成真实名字。
    let roster = {};
    let remarks = {};
    let rosterList = [];
    try {
      rosterList = (await listStudents()) || [];
      rosterList.forEach(s => {
        if (s && s.studentId) roster[s.studentId] = (s.name || '').trim();
      });
    } catch (e) {}
    try {
      const raw = await AsyncStorage.getItem(remarksKey(tid));
      remarks = raw ? JSON.parse(raw) || {} : {};
    } catch (e) {}

    // 一个录入学生（studentId）是否已经出现在服务端「已入班」名单里（精确 / 尾号双向匹配）。
    const matchesServer = (sid, serverStudents) => {
      const k = (sid || '').trim();
      if (!k) return false;
      return serverStudents.some(u => {
        const uid = u.user_id || '';
        return uid === k || uid.endsWith(k) || k.endsWith(uid);
      });
    };

    let serverStudents = [];
    try {
      const r = await fetchStudents(tid);
      if (r && r.ok && Array.isArray(r.students)) serverStudents = r.students;
    } catch (e) {
      // 离线：serverStudents 为空，仍能展示本地录入名单
    }

    const merged = serverStudents.map(s => ({
      id: s.user_id,
      name: resolveName(s.user_id, s.nickname, roster, remarks),
      studentId: s.user_id.slice(-8),
      fullId: s.user_id,
      // 三个区间的练琴时长（老后端只有 week_minutes 时做兜底）。
      weekMinutes: s.week_minutes || 0,
      monthMinutes:
        s.month_minutes != null ? s.month_minutes : s.week_minutes || 0,
      totalMinutes:
        s.total_minutes != null ? s.total_minutes : s.week_minutes || 0,
      avgRate: s.avg_match_rate,
      isVip: !!s.is_vip,
      pending: false,
    }));

    // 合并本机「学生录入」里、服务端还没入班的学生（少了些人 → 一并列出）。
    // 同时对填了完整 ID(≥12) 的学生自动重试入班绑定，下次刷新即可显示练习数据。
    const rebindIds = [];
    rosterList.forEach(s => {
      const sid = (s && s.studentId ? s.studentId : '').trim();
      const nm = (s && s.name ? s.name : '').trim();
      if (!nm) return;
      if (sid && matchesServer(sid, serverStudents)) return; // 已入班，跳过
      merged.push({
        id: sid || `local_${s.localId || nm}`,
        name: nm,
        studentId: sid ? sid.slice(-8) : '—',
        fullId: sid,
        localId: s.localId,
        canBind: sid.length >= 8, // ≥8 位即可尝试入班（后端支持唯一尾号匹配）
        weekMinutes: 0,
        monthMinutes: 0,
        totalMinutes: 0,
        avgRate: null,
        isVip: false,
        pending: true, // 未入班：显示「待入班」，练习数据入班后才有
      });
      if (sid.length >= 8) rebindIds.push(sid);
    });

    // 去重：同一个学生（服务端 user_id / 录入学号 / 姓名 尾号双向匹配）只保留一条，
    // 已入班的优先于「待入班」。修复：名单里出现重复学生（如两个同 ID 的「雷欧」）。
    const deduped = [];
    const sameStudent = (a, b) => {
      const ka = (a.fullId || a.id || '').trim();
      const kb = (b.fullId || b.id || '').trim();
      if (ka && kb && (ka === kb || ka.endsWith(kb) || kb.endsWith(ka)))
        return true;
      // 都没完整 ID 时按姓名判重（避免同一个人被录两遍）。
      if (!a.fullId && !b.fullId)
        return (a.name || '').trim() === (b.name || '').trim();
      return false;
    };
    merged.forEach(row => {
      const hitIdx = deduped.findIndex(d => sameStudent(d, row));
      if (hitIdx < 0) {
        deduped.push(row);
      } else if (deduped[hitIdx].pending && !row.pending) {
        // 已入班的记录信息更全，替换掉之前的「待入班」占位。
        deduped[hitIdx] = row;
      }
    });

    setStudents(deduped);

    // 后台自动重试绑定（不阻塞 UI）；成功的学生下次进入即从服务端拿到练习数据。
    for (const sid of rebindIds) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await bindTeacher(tid, sid);
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 用完整 ID 更新本地名册并立刻入班（解决「只录了尾号 / 错号」）。
  const saveIdAndJoin = async (item, rawId) => {
    const sid = (rawId || '').trim().replace(/\s+/g, '');
    if (sid.length < 8) {
      Alert.alert('提示', '请粘贴学生在「我的」页复制的完整 ID（至少 8 位）。');
      return;
    }
    try {
      await saveStudent({
        localId: item.localId,
        name: item.name,
        studentId: sid,
        note: '',
      });
    } catch (e) {}
    await joinClass({...item, fullId: sid});
  };

  const promptPasteFullId = item => {
    const goEntry = () =>
      navigation.navigate('StudentEntry', {
        editName: item.name,
        editStudentId: item.fullId || '',
        editLocalId: item.localId,
      });
    // Alert.prompt 仅 iOS；安卓跳转录入页粘贴完整 ID。
    if (Platform.OS !== 'ios' || typeof Alert.prompt !== 'function') {
      goEntry();
      return;
    }
    Alert.prompt(
      '粘贴完整学生 ID',
      `「${item.name}」当前 ID「${item.fullId || '未填'}」在服务端找不到。\n\n请让学生打开 App →「我的」→ 点复制完整 ID，再粘贴到这里。`,
      [
        {text: '取消', style: 'cancel'},
        {text: '去录入页', onPress: goEntry},
        {
          text: '保存并入班',
          onPress: v => saveIdAndJoin(item, v),
        },
      ],
      'plain-text',
      item.fullId || '',
    );
  };

  // 手动把「待入班」的学生加入正式班级（点一下学生卡片即可）。
  const joinClass = async item => {
    const full = (item.fullId || '').trim();
    if (full.length < 8) {
      Alert.alert(
        '无法入班',
        '该学生还没有填写 ID。请让学生打开 App →「我的」→ 复制完整 ID。',
        [
          {text: '取消', style: 'cancel'},
          {text: '粘贴完整 ID', onPress: () => promptPasteFullId(item)},
        ],
      );
      return;
    }
    try {
      const tid = getDeviceId();
      await registerAccount(tid, 'teacher');
      const r = await bindTeacher(tid, full);
      if (r && r.ok) {
        Alert.alert('已入班', `「${item.name}」已加入你的班级。`);
        load(); // 刷新，拿到练习数据
        return;
      }
      if (r && (r.error === 'student_not_found' || r.error === 'not_found')) {
        Alert.alert(
          '入班失败',
          `服务端找不到「${full}」。\n\n常见原因：只录了尾号且该学生还没打开过 App，或 ID 抄错。\n请让学生打开最新版 App（会自动注册）→「我的」→ 复制完整 ID，再粘贴补全。`,
          [
            {text: '取消', style: 'cancel'},
            {text: '粘贴完整 ID', onPress: () => promptPasteFullId(item)},
            {
              text: '去录入页',
              onPress: () =>
                navigation.navigate('StudentEntry', {
                  editName: item.name,
                  editStudentId: item.fullId || '',
                  editLocalId: item.localId,
                }),
            },
          ],
        );
        return;
      }
      Alert.alert('入班失败', (r && r.message) || '请稍后重试。');
    } catch (e) {
      Alert.alert('入班失败', '网络异常，请稍后重试。');
    }
  };

  const onStudentPress = item => {
    if (item.pending) {
      // 待入班：主操作就是「加入班级」；也可直接补全 ID。
      Alert.alert(item.name, '该学生尚未入班，是否现在加入正式班级名单？', [
        {text: '取消', style: 'cancel'},
        {text: '粘贴完整 ID', onPress: () => promptPasteFullId(item)},
        {text: '加入班级', onPress: () => joinClass(item)},
      ]);
      return;
    }
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

  const rangeCfg = RANGES.find(r => r.key === range) || RANGES[2];

  const renderStudent = ({item}) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => onStudentPress(item)}>
      <View style={styles.cardTopRow}>
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
            {item.pending ? (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingText}>待入班</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.studentId}>ID:{item.studentId}</Text>
        </View>
      </View>

      {item.pending ? (
        <View style={styles.practiceBar}>
          <Text style={styles.pendingHint}>
            {item.canBind ? '未入班 · 点此加入班级' : '未入班 · 补全完整 ID 后可入班'}
          </Text>
        </View>
      ) : (
        <View style={styles.practiceBar}>
          <Text style={styles.practiceLine}>
            <Text style={styles.practiceLabel}>{rangeCfg.title}时长：</Text>
            <Text style={styles.practiceValue}>
              {fmtMinutes(item[rangeCfg.field])}
            </Text>
            {item.avgRate != null ? (
              <Text style={styles.practiceLabel}>
                {'   '}正确率：
                <Text style={styles.practiceValue}>{item.avgRate}%</Text>
              </Text>
            ) : null}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />

      <ScreenHeader title="班级管理" onBack={() => navigation?.goBack?.()} />

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="搜索学生"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {/* 练琴时长区间：1周 / 1个月 / 所有 */}
      <View style={styles.rangeRow}>
        {RANGES.map(r => {
          const on = r.key === range;
          return (
            <TouchableOpacity
              key={r.key}
              style={[styles.rangeChip, on && styles.rangeChipOn]}
              activeOpacity={0.85}
              onPress={() => setRange(r.key)}>
              <Text style={[styles.rangeChipText, on && styles.rangeChipTextOn]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.listHeaderRow}>
        <Image
          source={Images.studentListCap}
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

const makeStyles = colors =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    searchBar: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    searchInput: {
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.inputBg,
      paddingHorizontal: 16,
      fontSize: 14,
      color: colors.textPrimary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardAlt,
    },
    rangeRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingBottom: 10,
      gap: 8,
    },
    rangeChip: {
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: 16,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardAlt,
    },
    rangeChipOn: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    rangeChipText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    rangeChipTextOn: {
      color: '#FFFFFF',
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
      color: colors.textPrimary,
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    emptyHint: {
      textAlign: 'center',
      color: colors.textSecondary,
      fontSize: 13,
      paddingHorizontal: 32,
      paddingTop: 40,
      lineHeight: 20,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
      borderWidth: colors.mode === 'dark' ? 1 : 0,
      borderColor: colors.cardBorder,
      shadowColor: '#000',
      shadowOpacity: colors.mode === 'dark' ? 0.25 : 0.05,
      shadowRadius: 8,
      shadowOffset: {width: 0, height: 2},
      elevation: 2,
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.cardAlt,
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
      color: colors.textPrimary,
    },
    badge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    badgeText: {
      fontSize: 11,
      color: '#FFFFFF',
      fontWeight: '800',
    },
    pendingBadge: {
      paddingHorizontal: 8,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.cardAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
    pendingText: {
      fontSize: 10,
      color: colors.textSecondary,
      fontWeight: '700',
    },
    pendingHint: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    studentId: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },
    practiceBar: {
      marginTop: 12,
      backgroundColor: colors.inputBg,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    practiceLine: {
      fontSize: 13,
    },
    practiceLabel: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    practiceValue: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
  });

export default ClassManageScreen;
