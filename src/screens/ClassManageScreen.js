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
import {registerAccount, bindTeacher, unbindTeacher} from '../services/account';
import {fetchStudents} from '../services/teacher';
import {listStudents, saveStudent, deleteStudent, syncRosterFromServer} from '../services/students';

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
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [students, setStudents] = useState([]);
  const [query, setQuery] = useState('');

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
    // 微信合并后备注键挂在旧老师 ID 上：迁到当前 tid（无本地旧键则无副作用）。
    try {
      const {getPreviousUserId} = require('../services/device');
      const prev = (await getPreviousUserId()) || '';
      const candidates = [prev, '732343f2-9a5c-4a2d-afcd-3694a5aa4d09'].filter(
        Boolean,
      );
      let cur = {};
      try {
        cur = JSON.parse((await AsyncStorage.getItem(remarksKey(tid))) || '{}') || {};
      } catch (e) {
        cur = {};
      }
      let changed = false;
      for (const old of candidates) {
        if (!old || old === tid) continue;
        try {
          const map =
            JSON.parse((await AsyncStorage.getItem(remarksKey(old))) || '{}') ||
            {};
          Object.keys(map).forEach(k => {
            if (map[k] && !cur[k]) {
              cur[k] = map[k];
              changed = true;
            }
          });
        } catch (e) {}
      }
      if (changed) {
        await AsyncStorage.setItem(remarksKey(tid), JSON.stringify(cur));
      }
      remarks = cur;
    } catch (e) {
      try {
        const raw = await AsyncStorage.getItem(remarksKey(tid));
        remarks = raw ? JSON.parse(raw) || {} : {};
      } catch (e2) {
        remarks = {};
      }
    }

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

    // 合并后本地「学生录入」常丢：把服务端已有昵称的学生补进本机名册。
    try {
      rosterList = await syncRosterFromServer(serverStudents);
      roster = {};
      rosterList.forEach(s => {
        if (s && s.studentId) roster[s.studentId] = (s.name || '').trim();
      });
    } catch (e) {}

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
          `服务端找不到「${full}」。\n\n请让学生：打开最新版 App →（若用微信）先完成微信登录 →「我的」→ 复制完整 ID，再粘贴到这里。\n重装后 ID 可能已合并到微信主账号，请用登录后显示的完整 ID。`,
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

  const removeFromClass = async item => {
    const sid = (item.fullId || item.id || '').trim();
    const name = item.name || '该学生';
    Alert.alert(
      '移出班级',
      `确定把「${name}」从班级管理里移除吗？\n（不会删除学生本人的账号与练习记录）`,
      [
        {text: '取消', style: 'cancel'},
        {
          text: '移除',
          style: 'destructive',
          onPress: async () => {
            try {
              if (item.pending && item.localId) {
                await deleteStudent(item.localId);
                load();
                return;
              }
              if (!sid || sid.length < 6) {
                Alert.alert('无法移除', '缺少有效学生 ID。');
                return;
              }
              const tid = getDeviceId();
              const r = await unbindTeacher(tid, sid);
              if (r && r.ok) {
                // 同步从本机录入名单去掉（若有）
                try {
                  const local = await listStudents();
                  const hit = local.find(
                    s =>
                      s.studentId &&
                      (s.studentId === sid ||
                        sid.endsWith(s.studentId) ||
                        s.studentId.endsWith(sid.slice(-8))),
                  );
                  if (hit) await deleteStudent(hit.localId);
                } catch (e) {}
                Alert.alert('已移除', `「${name}」已移出班级。`);
                load();
              } else {
                Alert.alert(
                  '移除失败',
                  (r && r.error) || '请稍后重试',
                );
              }
            } catch (e) {
              Alert.alert('移除失败', '网络异常，请稍后重试。');
            }
          },
        },
      ],
    );
  };

  const onStudentPress = item => {
    if (item.pending) {
      Alert.alert(item.name, '该学生尚未入班，是否现在加入正式班级名单？', [
        {text: '取消', style: 'cancel'},
        {text: '粘贴完整 ID', onPress: () => promptPasteFullId(item)},
        {text: '加入班级', onPress: () => joinClass(item)},
        {text: '从名单删除', style: 'destructive', onPress: () => removeFromClass(item)},
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
      {
        text: '移出班级',
        style: 'destructive',
        onPress: () => removeFromClass(item),
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
      onPress={() => onStudentPress(item)}
      onLongPress={() => removeFromClass(item)}>
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
              <Image
                source={
                  colors.mode === 'dark' ? Images.classVipDark : Images.classVipLight
                }
                style={styles.vipIcon}
                resizeMode="contain"
              />
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
            <Text style={styles.practiceLabel}>本周练习时长：</Text>
            <Text style={styles.practiceValue}>
              {fmtMinutes(item.weekMinutes)}
            </Text>
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />

      <ScreenHeader title="班级管理" onBack={() => navigation?.goBack?.()} />

      {/* 蓝湖 组2491 搜索框 345×44 @ (15,98)：内含 search-2-line 图标(20×20)+「搜索学生」 */}
      <View style={styles.searchBar}>
        <View style={styles.searchShell}>
          <View style={styles.searchIcon}>
            <View style={styles.searchRing} />
            <View style={styles.searchHandle} />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="搜索学生"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
          />
        </View>
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
      paddingHorizontal: 15,
      paddingTop: 12,
      paddingBottom: 8,
    },
    searchShell: {
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.inputBg,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardAlt,
    },
    // 蓝湖 search-2-line 20×20：用两枚 View 画描边放大镜（环 + 手柄），随主题取色、任意密度清晰。
    searchIcon: {
      width: 18,
      height: 18,
      marginRight: 8,
    },
    searchRing: {
      position: 'absolute',
      top: 1,
      left: 1,
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 1.6,
      borderColor: colors.textMuted,
    },
    searchHandle: {
      position: 'absolute',
      right: 1.5,
      bottom: 2,
      width: 6,
      height: 1.6,
      borderRadius: 1,
      backgroundColor: colors.textMuted,
      transform: [{rotate: '45deg'}],
    },
    searchInput: {
      flex: 1,
      height: 44,
      fontSize: 15,
      color: colors.textPrimary,
      paddingVertical: 0,
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
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    list: {
      paddingHorizontal: 15,
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
      minHeight: 120,
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
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    vipIcon: {
      width: 18,
      height: 18,
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
      // 蓝湖 班级管理 时长值实测 ≈ #B090F8 淡紫（非主色 #7F47FE 深紫）。用 accent(#B595FF) 对齐蓝湖，
      // 与安卓 practiceSpan 值色 #B595FF 保持两端一致。
      fontSize: 13,
      fontWeight: '600',
      color: colors.accent,
    },
  });

export default ClassManageScreen;
