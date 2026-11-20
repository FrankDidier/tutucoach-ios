// 陪练提示设置（老师端）—— 对应安卓 StudentReminderActivity。
// 老师从班级学生里选一个，按「曲目」分别设置「AI 陪练模式」的重点播报内容 + 播报频率。
import {SafeAreaView as EdgeSafeArea} from 'react-native-safe-area-context';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {Images} from '../assets/images';
import LanhuCTA from '../components/LanhuCTA';
import LanhuSheet from '../components/LanhuSheet';
import {lastLessonText} from '../utils/lastLesson';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getItem, setItem} from '../services/storage';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {getDeviceId} from '../services/device';
import {registerAccount} from '../services/account';
import {fetchStudents} from '../services/teacher';
import {listStudents, syncRosterFromServer} from '../services/students';
import {
  fetchReminders,
  savePieces,
  fetchLessonStudents,
} from '../services/companionChat';

const {width: SCREEN_W} = Dimensions.get('window');
const px = n => Math.round((n * SCREEN_W) / 375);

const FREQ_MIN = 10;
const FREQ_MAX = 600;

// 老师给学生起的「备注名」本地存储（按老师区分）。很多学生是匿名设备号、没有昵称，
// 后台只能显示 id 尾号；这里让老师给每个学生取个看得懂的名字，长期保存。
const remarksKey = tid => `student_remarks:${tid}`;

export default function StudentReminderScreen({navigation}) {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  // 蓝湖只画了「选学生」这一步：pick → 点「开始设置」进入该生的频率 / 曲目重点编辑（edit）
  const [step, setStep] = useState('pick');
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [sel, setSel] = useState(null); // {id, name}
  const remarksRef = useRef({}); // {studentId: 备注名}
  const rosterRef = useRef({}); // {studentId(学生码): 班级备注名} —— 来自「学生录入」本地班级名单
  const [rosterList, setRosterList] = useState([]); // [{id, name}] 班级名册，供一键选取
  const [rosterPickerOpen, setRosterPickerOpen] = useState(false);
  const [pieces, setPieces] = useState([]); // [{name, lines:[]}]
  const [freq, setFreq] = useState(45);
  const [saving, setSaving] = useState(false);
  const [loadingStudent, setLoadingStudent] = useState(false);

  // 曲目编辑弹窗
  const [editorOpen, setEditorOpen] = useState(false);
  const [editIdx, setEditIdx] = useState(-1);
  const [editName, setEditName] = useState('');
  const [editLines, setEditLines] = useState('');

  // 手动录入学生码弹窗
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualName, setManualName] = useState('');

  // 名字优先级：班级名单备注名(学生录入) > 老师备注名 > 后台昵称 > id 尾号。
  // 后台 nickname 在账号合并后会从陪练提示 student_name 回填，故应优先于尾号。
  const displayName = s => {
    const id = s.user_id || s.id || '';
    const tryMaps = key =>
      (rosterRef.current[key] || remarksRef.current[key] || '').trim();
    let n = tryMaps(id);
    if (!n && id.length > 6) {
      // 学生码可能是尾号形式
      const keys = Object.keys(rosterRef.current).concat(
        Object.keys(remarksRef.current),
      );
      for (const k of keys) {
        if (k && (id.endsWith(k) || k.endsWith(id.slice(-6)))) {
          n = tryMaps(k);
          if (n) break;
        }
      }
    }
    return n || s.nickname || s.name || s.student_name || id.slice(-6);
  };

  // 把旧账号下的本地备注迁到当前老师 ID（微信合并后常见）。
  const migrateLocalRemarks = async tid => {
    try {
      const {getPreviousUserId} = require('../services/device');
      const prev = (await getPreviousUserId()) || '';
      // 常见旧 UUID（微信登录前）也尝试迁一次；无本地键则无副作用。
      const candidates = [prev, '732343f2-9a5c-4a2d-afcd-3694a5aa4d09'].filter(
        Boolean,
      );
      let cur = {};
      try {
        cur =
          JSON.parse((await AsyncStorage.getItem(remarksKey(tid))) || '{}') ||
          {};
      } catch (e) {
        cur = {};
      }
      let changed = false;
      for (const old of candidates) {
        if (!old || old === tid) continue;
        try {
          const raw = await AsyncStorage.getItem(remarksKey(old));
          const map = raw ? JSON.parse(raw) || {} : {};
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
      remarksRef.current = cur;
    } catch (e) {
      remarksRef.current = {};
    }
  };

  // QA audit: one-shot open roster picker (verify_open_roster=1)
  useEffect(() => {
    (async () => {
      try {
        if ((await getItem('verify_open_roster')) === '1') {
          await setItem('verify_open_roster', '');
          setRosterPickerOpen(true);
        }
      } catch (e) {}
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const tid = getDeviceId();
      await migrateLocalRemarks(tid);
      if (!Object.keys(remarksRef.current || {}).length) {
        try {
          const raw = await AsyncStorage.getItem(remarksKey(tid));
          remarksRef.current = raw ? JSON.parse(raw) || {} : {};
        } catch (e) {
          remarksRef.current = {};
        }
      }
      // 先读「学生录入」的本地班级名单；若为空则从服务端班级同步（账号合并后常空）。
      let roster = [];
      try {
        roster = (await listStudents()) || [];
      } catch (e) {
        roster = [];
      }
      try {
        const r = await fetchStudents(tid);
        if (r && r.ok && Array.isArray(r.students) && r.students.length) {
          roster = (await syncRosterFromServer(r.students)) || roster;
        }
      } catch (e) {}
      const rmap = {};
      const rlist = [];
      roster.forEach(s => {
        if (!s) return;
        const sid = (s.studentId || '').trim();
        if (!sid) return;
        const nm = (s.name || '').trim() || sid.slice(-6);
        rmap[sid] = nm;
        rlist.push({id: sid, name: nm});
      });
      rosterRef.current = rmap;

      try {
        await registerAccount(getDeviceId(), 'teacher');
      } catch (e) {}

      // 合并两个来源，按学生码去重：① 本地班级名单（有名字、可能学生还没打开过 App）
      // ② 后台已入班学生。班级名单里的备注名优先，让老师一眼看懂。
      const byId = {};
      rlist.forEach(s => {
        byId[s.id] = {id: s.id, name: s.name};
      });
      try {
        const r = await fetchStudents(getDeviceId());
        if (r && r.ok && Array.isArray(r.students)) {
          r.students.forEach(s => {
            const uid = s.user_id || '';
            if (!uid) return;
            const nick = (s.nickname || '').trim();
            // 服务端带回的备注名（陪练提示 student_name）写入本地 remarks，跨端一致
            if (
              nick &&
              nick !== uid &&
              nick !== uid.slice(-6) &&
              nick !== uid.slice(-8) &&
              !remarksRef.current[uid]
            ) {
              remarksRef.current[uid] = nick;
            }
            if (!byId[uid]) {
              byId[uid] = {id: uid, name: displayName(s)};
            } else if (
              nick &&
              (!byId[uid].name || byId[uid].name === uid.slice(-6))
            ) {
              byId[uid] = {...byId[uid], name: displayName(s)};
            }
            if (s.last_lesson_at) byId[uid].last_lesson_at = s.last_lesson_at;
          });
          try {
            await AsyncStorage.setItem(
              remarksKey(getDeviceId()),
              JSON.stringify(remarksRef.current || {}),
            );
          } catch (e) {}
        }
      } catch (e) {}

      // 学生格副标题「今天上过课 / 昨天 / M月D日」：最近一次上课时间来自上课录音
      try {
        const ls = (await fetchLessonStudents(getDeviceId())) || [];
        ls.forEach(x => {
          if (x && x.id && x.last_lesson_at && byId[x.id])
            byId[x.id].last_lesson_at = x.last_lesson_at;
        });
      } catch (e) {}

      if (alive) {
        setRosterList(rlist);
        setStudents(Object.values(byId));
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 保存/更新某学生的备注名（本地 + 服务端 student_name，跨端同步）
  const setRemark = (studentId, name) => {
    const clean = (name || '').trim();
    const map = {...remarksRef.current};
    if (clean) map[studentId] = clean;
    else delete map[studentId];
    remarksRef.current = map;
    AsyncStorage.setItem(remarksKey(getDeviceId()), JSON.stringify(map)).catch(
      () => {},
    );
    setStudents(prev =>
      prev.map(s =>
        s.id === studentId ? {...s, name: clean || s.id.slice(-6)} : s,
      ),
    );
    setSel(prev =>
      prev && prev.id === studentId
        ? {...prev, name: clean || prev.id.slice(-6)}
        : prev,
    );
    // 写回服务端：保留已有曲目/频率，只更新 student_name（安卓同步时才能看到备注）
    (async () => {
      try {
        const tid = getDeviceId();
        const r = await fetchReminders(studentId, tid);
        const ps = Array.isArray(r.pieces) ? r.pieces : [];
        await savePieces(
          tid,
          studentId,
          clean || studentId.slice(-6),
          ps,
          r.freqSec || 45,
        );
      } catch (e) {}
    })();
  };

  const renameStudent = stu => {
    Alert.prompt(
      '备注名',
      '给这个学生起个看得懂的名字（如：小明）',
      [
        {text: '取消', style: 'cancel'},
        {
          text: '保存',
          onPress: text => setRemark(stu.id, text),
        },
      ],
      'plain-text',
      remarksRef.current[stu.id] || '',
    );
  };

  const selectStudent = async stu => {
    setSel(stu);
    setStep('edit');
    setLoadingStudent(true);
    try {
      const r = await fetchReminders(stu.id, getDeviceId());
      setFreq(Math.max(FREQ_MIN, Math.min(FREQ_MAX, r.freqSec || 45)));
      let ps = Array.isArray(r.pieces) ? r.pieces : [];
      // 兼容旧数据：只有无曲目的 reminders 时，塞进一个「默认」曲目方便编辑。
      if (!ps.length && Array.isArray(r.reminders) && r.reminders.length) {
        ps = [{name: '默认', lines: r.reminders}];
      }
      setPieces(ps.map(p => ({name: p.name, lines: [...(p.lines || [])]})));
    } catch (e) {
      setPieces([]);
      setFreq(45);
    } finally {
      setLoadingStudent(false);
    }
  };

  const stepFreq = delta => {
    setFreq(f => Math.max(FREQ_MIN, Math.min(FREQ_MAX, f + delta)));
  };

  const openEditor = idx => {
    if (idx >= 0) {
      setEditIdx(idx);
      setEditName(pieces[idx].name || '');
      setEditLines((pieces[idx].lines || []).join('\n'));
    } else {
      setEditIdx(-1);
      setEditName('');
      setEditLines('');
    }
    setEditorOpen(true);
  };

  const saveEditor = () => {
    const name = editName.trim();
    if (!name) {
      Alert.alert('提示', '请填写曲目名称');
      return;
    }
    const lines = editLines
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    setPieces(prev => {
      const next = [...prev];
      if (editIdx >= 0) {
        next[editIdx] = {name, lines};
      } else {
        next.push({name, lines});
      }
      return next;
    });
    setEditorOpen(false);
  };

  const deletePiece = idx => {
    Alert.alert('删除曲目', `确定删除「${pieces[idx].name}」及其重点内容？`, [
      {text: '取消', style: 'cancel'},
      {
        text: '删除',
        style: 'destructive',
        onPress: () => setPieces(prev => prev.filter((_, i) => i !== idx)),
      },
    ]);
  };

  /** 一键清空该曲通用重点（保留曲目名；分段重点在乐谱页另有重置）。 */
  const resetPieceLines = idx => {
    const name = pieces[idx]?.name || '该曲';
    const n = (pieces[idx]?.lines || []).length;
    if (!n) {
      Alert.alert('提示', '当前没有通用重点可清空。');
      return;
    }
    Alert.alert(
      '重置通用重点？',
      `清空「${name}」里已写的 ${n} 条通用重点？清空后记得点「保存设置」。`,
      [
        {text: '取消', style: 'cancel'},
        {
          text: '重置',
          style: 'destructive',
          onPress: () =>
            setPieces(prev => {
              const next = [...prev];
              next[idx] = {...next[idx], lines: []};
              return next;
            }),
        },
      ],
    );
  };

  const onSave = async () => {
    if (!sel) {
      Alert.alert('提示', '请先选择一个学生');
      return;
    }
    const clean = pieces
      .map(p => ({
        name: (p.name || '').trim(),
        lines: (p.lines || []).filter(Boolean),
      }))
      .filter(p => p.name);
    setSaving(true);
    try {
      const ok = await savePieces(getDeviceId(), sel.id, sel.name, clean, freq);
      if (ok) {
        Alert.alert('已保存', '该学生进入「AI 陪练模式」时即会播报这些重点。');
      } else {
        Alert.alert('保存失败', '网络异常，请稍后重试。');
      }
    } catch (e) {
      Alert.alert('保存失败', '网络异常，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };

  const addManualStudent = () => {
    const code = manualCode.trim();
    if (!code) {
      Alert.alert('提示', '请粘贴学生码');
      return;
    }
    const name = manualName.trim() || code.slice(-6);
    const stu = {id: code, name};
    setStudents(prev =>
      prev.find(s => s.id === code) ? prev : [stu, ...prev],
    );
    if (manualName.trim()) setRemark(code, manualName.trim());
    setManualOpen(false);
    setManualCode('');
    setManualName('');
    selectStudent(stu);
  };

  const totalLines = useMemo(
    () => pieces.reduce((n, p) => n + (p.lines ? p.lines.length : 0), 0),
    [pieces],
  );

  return (
    <EdgeSafeArea edges={['left', 'right']} style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
      <ScreenHeader
        title="陪练提示设置"
        onBack={() =>
          step === 'edit' ? setStep('pick') : navigation?.goBack?.()
        }
        right={
          step === 'edit' && sel ? (
            <TouchableOpacity
              onPress={onSave}
              disabled={saving}
              activeOpacity={0.7}>
              <Text style={styles.saveHeader}>{saving ? '...' : '保存'}</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {step === 'pick' ? (
              <>
                {/* 蓝湖 345×95 说明卡 (15,98) */}
                <View style={styles.tipCard}>
                  <Text style={styles.tipTitle}>每个学生单独设置</Text>
                  <Text style={styles.tipBody}>
                    为学生设置专属的陪练频率和提醒内容，AI
                    分身将根据设置进行个性化陪练。
                  </Text>
                </View>

                {/* 蓝湖 选择上课学生 345 宽 r10 (15,208) */}
                <View style={styles.pickCard}>
                  <View style={styles.pickHead}>
                    <Text style={styles.pickTitle}>选择上课学生</Text>
                    <TouchableOpacity
                      style={styles.rosterPill}
                      activeOpacity={0.85}
                      onPress={() => {
                        // 名册 = 本地录入 ∪ 服务端入班；以前只看 rosterList，服务端有人时按钮会误报「空」
                        const pool =
                          (rosterList && rosterList.length
                            ? rosterList
                            : students) || [];
                        if (!pool.length) {
                          Alert.alert(
                            '班级名册为空',
                            '请先到「我的 → 学生信息录入」添加学生（姓名 + 学号），或等班级管理同步后再来。',
                          );
                          return;
                        }
                        setRosterPickerOpen(true);
                      }}>
                      <Image
                        source={Images.capAdd}
                        style={styles.rosterPillIcon}
                      />
                      <Text style={styles.rosterPillText}>从班级名册选择</Text>
                    </TouchableOpacity>
                  </View>
                  {students.length ? (
                    <View style={styles.stuGrid}>
                      {students.map(s => {
                        const on = sel && sel.id === s.id;
                        return (
                          <TouchableOpacity
                            key={s.id}
                            style={[styles.stuTile, on && styles.stuTileOn]}
                            activeOpacity={0.85}
                            onPress={() => setSel(s)}
                            onLongPress={() => renameStudent(s)}>
                            <Image
                              source={
                                dark
                                  ? Images.remindAvatarDark
                                  : Images.remindAvatarLight
                              }
                              style={styles.stuAvatar}
                            />
                            <View style={styles.stuTexts}>
                              <Text style={styles.stuName} numberOfLines={1}>
                                {s.name}
                              </Text>
                              <Text style={styles.stuSub} numberOfLines={1}>
                                {lastLessonText(s.last_lesson_at)}
                              </Text>
                            </View>
                            {on ? (
                              <View style={styles.stuTick}>
                                <Image
                                  source={Images.icCheckLine}
                                  style={styles.stuTickIcon}
                                />
                              </View>
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.emptyHint}>
                      还没有学生。点「从班级名册选择」，或让学生在「AI
                      陪练模式」复制学生码后点「添加学生」录入。
                    </Text>
                  )}
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => setManualOpen(true)}>
                    <LinearGradient
                      colors={
                        dark ? ['#B595FF', '#7F47FE'] : ['#FF7A9A', '#FF355F']
                      }
                      start={{x: 0.5, y: 0}}
                      end={{x: 0.5, y: 1}}
                      style={styles.addStuBtn}>
                      <Text style={styles.addStuText}>添加学生</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}

            {step === 'edit' && sel ? (
              loadingStudent ? (
                <View style={styles.center}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : (
                <>
                  {/* 已选学生 + 备注名 */}
                  <View style={styles.selRow}>
                    <Text style={styles.selName} numberOfLines={1}>
                      当前学生：{sel.name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => renameStudent(sel)}
                      activeOpacity={0.8}>
                      <Text style={styles.renameBtn}>备注名</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.stuCodeHint}>
                    学生码：{sel.id}
                    {'\n'}请与学生端「学生码」一致，否则曲目会对不上。
                  </Text>

                  {/* 播报频率 */}
                  <View style={styles.freqCard}>
                    <Text style={styles.freqLabel}>
                      播报频率（每 {freq} 秒左右一次）
                    </Text>
                    <View style={styles.freqRow}>
                      <TouchableOpacity
                        style={styles.freqBtn}
                        onPress={() => stepFreq(-5)}>
                        <Text style={styles.freqBtnText}>－</Text>
                      </TouchableOpacity>
                      <Text style={styles.freqValue}>{freq}s</Text>
                      <TouchableOpacity
                        style={styles.freqBtn}
                        onPress={() => stepFreq(5)}>
                        <Text style={styles.freqBtnText}>＋</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* 曲目列表 */}
                  <View style={styles.piecesHeader}>
                    <Text style={styles.sectionLabel}>
                      曲目重点（{pieces.length} 个曲目 · {totalLines} 条）
                    </Text>
                    <TouchableOpacity
                      onPress={() => openEditor(-1)}
                      activeOpacity={0.8}>
                      <Text style={styles.addPiece}>＋ 添加曲目</Text>
                    </TouchableOpacity>
                  </View>

                  {pieces.length === 0 ? (
                    <Text style={styles.emptyHint}>
                      还没有曲目。点「＋
                      添加曲目」，为不同曲子分别设置要反复强调的重点。
                    </Text>
                  ) : (
                    pieces.map((p, idx) => (
                      <View key={idx} style={styles.pieceCard}>
                        <View style={styles.pieceTop}>
                          <Text style={styles.pieceName} numberOfLines={1}>
                            🎵 {p.name}
                          </Text>
                          <View style={styles.pieceActions}>
                            <TouchableOpacity onPress={() => openEditor(idx)}>
                              <Text style={styles.pieceEdit}>编辑</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() =>
                                navigation.navigate('ScoreEditor', {
                                  studentId: sel.id,
                                  studentName: sel.name,
                                  pieceName: p.name,
                                  lines: p.lines || [],
                                })
                              }>
                              <Text style={styles.pieceEdit}>乐谱</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => resetPieceLines(idx)}>
                              <Text style={styles.pieceEdit}>重置</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => deletePiece(idx)}>
                              <Text style={styles.pieceDelete}>删除</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        {p.lines && p.lines.length ? (
                          p.lines.map((ln, i) => (
                            <Text key={i} style={styles.pieceLine}>
                              · {ln}
                            </Text>
                          ))
                        ) : (
                          <Text style={styles.pieceEmpty}>
                            （暂无重点内容）
                          </Text>
                        )}
                      </View>
                    ))
                  )}

                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={onSave}
                    disabled={saving}
                    activeOpacity={0.88}>
                    <Text style={styles.saveBtnText}>
                      {saving ? '保存中…' : '保存设置'}
                    </Text>
                  </TouchableOpacity>
                </>
              )
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
      {!loading && step === 'pick' ? (
        <LanhuCTA
          title="开始设置"
          fontSize={dark ? 15 : 16}
          onPress={() => {
            if (!sel) {
              Alert.alert('提示', '请先选择一个学生');
              return;
            }
            selectStudent(sel);
          }}
        />
      ) : null}

      {/* 曲目编辑弹窗 */}
      <Modal
        visible={editorOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditorOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editIdx >= 0 ? '编辑曲目' : '添加曲目'}
            </Text>
            <Text style={styles.modalFieldLabel}>曲目名称</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="如：小星星 / 拜厄第 5 条"
              placeholderTextColor={colors.textSecondary}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
              <Text style={styles.modalFieldLabel}>重点内容（每行一条）</Text>
              <TouchableOpacity
                onPress={() => {
                  if (!String(editLines || '').trim()) {
                    Alert.alert('提示', '当前没有重点可清空。');
                    return;
                  }
                  Alert.alert(
                    '重置通用重点？',
                    '清空输入框里已写的重点内容？',
                    [
                      {text: '取消', style: 'cancel'},
                      {
                        text: '重置',
                        style: 'destructive',
                        onPress: () => setEditLines(''),
                      },
                    ],
                  );
                }}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                <Text
                  style={[
                    styles.pieceEdit,
                    {color: colors.danger || '#D14343'},
                  ]}>
                  重置
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalMultiline}
              value={editLines}
              onChangeText={setEditLines}
              placeholder={
                '手腕放松，不要塌下去\n注意第二小节的节奏\n手指立起来，指尖发力'
              }
              placeholderTextColor={colors.textSecondary}
              multiline
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setEditorOpen(false)}>
                <Text style={styles.modalBtnGhostText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={saveEditor}>
                <Text style={styles.modalBtnPrimaryText}>确定</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 手动录入学生码 */}
      <Modal
        visible={manualOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setManualOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>录入学生码</Text>
            <Text style={styles.modalFieldLabel}>
              学生码（学生在陪练模式里复制）
            </Text>
            <TextInput
              style={styles.modalInput}
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="粘贴学生码"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
            />
            <Text style={styles.modalFieldLabel}>备注名（可选）</Text>
            <TextInput
              style={styles.modalInput}
              value={manualName}
              onChangeText={setManualName}
              placeholder="如：小明"
              placeholderTextColor={colors.textSecondary}
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setManualOpen(false)}>
                <Text style={styles.modalBtnGhostText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={addManualStudent}>
                <Text style={styles.modalBtnPrimaryText}>确定</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 蓝湖「班级名册弹窗」：点学生即添加并进入该生的陪练重点设置 */}
      <LanhuSheet
        visible={rosterPickerOpen}
        onClose={() => setRosterPickerOpen(false)}
        title="从班级名册选择"
        subtitle="点击选择学生后进入该学生的陪练重点设置">
        <ScrollView
          style={styles.rosterList}
          showsVerticalScrollIndicator={false}>
          {(rosterList.length ? rosterList : students).map(s => (
            <TouchableOpacity
              key={s.id}
              style={styles.rosterRow}
              activeOpacity={0.85}
              onPress={() => {
                setRosterPickerOpen(false);
                setStudents(prev =>
                  prev.find(x => x.id === s.id) ? prev : [s, ...prev],
                );
                selectStudent(s);
              }}>
              <Image
                source={
                  dark ? Images.remindAvatarDark : Images.remindAvatarLight
                }
                style={styles.stuAvatar}
              />
              <View style={styles.stuTexts}>
                <Text style={styles.stuName} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text style={styles.stuSub} numberOfLines={1}>
                  {s.id}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LanhuSheet>
    </EdgeSafeArea>
  );
}

const makeStyles = (colors, dark) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: dark ? '#020014' : '#FAFAFA'},
    flex: {flex: 1},
    center: {
      paddingVertical: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: {padding: px(15), paddingTop: px(10), paddingBottom: px(40)},
    // 蓝湖 说明卡 345×95 r10：标题 16/600 (15,14)，正文 12 lh20 (15,41)
    tipCard: {
      backgroundColor: dark ? '#040428' : '#FFFFFF',
      borderRadius: px(10),
      paddingHorizontal: px(15),
      paddingTop: px(14),
      paddingBottom: px(14),
      marginBottom: px(15),
    },
    tipTitle: {
      fontSize: px(16),
      lineHeight: px(22),
      fontWeight: '600',
      color: dark ? '#FFFFFF' : '#261216',
    },
    tipBody: {
      fontSize: px(12),
      lineHeight: px(20),
      marginTop: px(5),
      color: dark ? '#A1A1B4' : '#A6A6A6',
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    // 蓝湖 选择上课学生 345 宽 r10：标题 14/600 (15,15)；名册 120×24 r4 (210,13)；学生格 150×60 r6 间距 15；添加学生 315×44 r10
    pickCard: {
      backgroundColor: dark ? '#040428' : '#FFFFFF',
      borderRadius: px(10),
      paddingHorizontal: px(15),
      paddingTop: px(13),
      paddingBottom: px(19),
    },
    pickHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: px(24),
    },
    pickTitle: {
      fontSize: px(14),
      lineHeight: px(20),
      fontWeight: '600',
      color: dark ? '#FFFFFF' : '#261216',
    },
    rosterPill: {
      width: px(120),
      height: px(24),
      borderRadius: px(4),
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: px(8),
      backgroundColor: dark ? 'rgba(181,149,255,0.2)' : 'rgba(255,53,95,0.1)',
    },
    rosterPillIcon: {
      width: px(16),
      height: px(16),
      marginRight: px(5),
      tintColor: dark ? '#B595FF' : '#FF355F',
    },
    rosterPillText: {
      fontSize: px(12),
      lineHeight: px(17),
      fontWeight: '500',
      color: dark ? '#B595FF' : '#FF355F',
    },
    stuGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginTop: px(15),
    },
    stuTile: {
      width: px(150),
      height: px(60),
      borderRadius: px(6),
      marginBottom: px(15),
      paddingLeft: px(11),
      backgroundColor: dark ? '#131443' : '#FAFAFA',
      borderWidth: 1,
      borderColor: 'transparent',
      flexDirection: 'row',
      alignItems: 'center',
      overflow: 'hidden',
    },
    stuTileOn: {
      borderColor: dark ? '#B595FF' : '#FF355F',
      backgroundColor: dark ? '#131443' : '#FFF5F7',
    },
    stuAvatar: {width: px(36), height: px(36), borderRadius: px(18)},
    stuTexts: {flex: 1, marginLeft: px(5), marginRight: px(6)},
    stuName: {
      fontSize: px(14),
      lineHeight: px(17),
      fontWeight: '500',
      color: dark ? '#FFFFFF' : '#261216',
    },
    stuSub: {
      fontSize: px(12),
      lineHeight: px(17),
      marginTop: px(1),
      color: dark ? '#A1A1B4' : '#A6A6A6',
    },
    stuTick: {
      position: 'absolute',
      right: -1,
      bottom: -1,
      width: px(20),
      height: px(20),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: dark ? '#B595FF' : '#FF3660',
    },
    stuTickIcon: {
      width: px(16),
      height: px(16),
      tintColor: dark ? '#040428' : '#FFFFFF',
    },
    addStuBtn: {
      height: px(44),
      borderRadius: px(10),
      alignItems: 'center',
      justifyContent: 'center',
    },
    addStuText: {
      fontSize: px(14),
      lineHeight: px(20),
      fontWeight: '500',
      color: '#FFFFFF',
    },
    // 蓝湖 班级名册弹窗：行 335×60 r6，间距 15；头像 36 (11,12)
    rosterList: {maxHeight: px(300)},
    rosterRow: {
      height: px(60),
      borderRadius: px(6),
      marginBottom: px(15),
      paddingLeft: px(11),
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: dark ? '#131444' : '#FAFAFA',
    },
    emptyHint: {
      fontSize: px(12),
      color: dark ? '#A1A1B4' : '#A6A6A6',
      lineHeight: px(19),
      marginTop: px(15),
      marginBottom: px(15),
    },
    selRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 14,
    },
    selName: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
      marginRight: 10,
    },
    renameBtn: {fontSize: 13, fontWeight: '700', color: colors.accent},
    stuCodeHint: {
      marginTop: 6,
      fontSize: 12,
      lineHeight: 17,
      color: colors.textSecondary,
    },
    freqCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      marginTop: 10,
      marginBottom: 6,
    },
    freqLabel: {fontSize: 13, fontWeight: '700', color: colors.textPrimary},
    freqRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      marginTop: 10,
    },
    freqBtn: {
      width: 44,
      height: 40,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    freqBtnText: {fontSize: 22, color: colors.accent, fontWeight: '700'},
    freqValue: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.textPrimary,
      minWidth: 60,
      textAlign: 'center',
    },
    piecesHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 16,
    },
    addPiece: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.accent,
      marginBottom: 8,
    },
    pieceCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
    },
    pieceTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    pieceName: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    pieceActions: {flexDirection: 'row', gap: 14, marginLeft: 8},
    pieceEdit: {fontSize: 13, color: colors.accent, fontWeight: '700'},
    pieceDelete: {fontSize: 13, color: '#E5484D', fontWeight: '700'},
    pieceLine: {fontSize: 13.5, color: colors.textPrimary, lineHeight: 22},
    pieceEmpty: {fontSize: 13, color: colors.textSecondary},
    saveBtn: {
      marginTop: 18,
      height: 50,
      borderRadius: 25,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
    saveHeader: {fontSize: 15, fontWeight: '700', color: colors.accent},
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    modalCard: {
      width: '100%',
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 18,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 12,
    },
    modalFieldLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 10,
      marginBottom: 6,
    },
    modalInput: {
      height: 42,
      borderRadius: 10,
      backgroundColor: colors.bg,
      paddingHorizontal: 12,
      fontSize: 15,
      color: colors.textPrimary,
    },
    modalMultiline: {
      minHeight: 110,
      borderRadius: 10,
      backgroundColor: colors.bg,
      padding: 12,
      fontSize: 14,
      color: colors.textPrimary,
      textAlignVertical: 'top',
    },
    modalBtnRow: {flexDirection: 'row', gap: 12, marginTop: 18},
    modalBtn: {
      flex: 1,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalBtnGhost: {backgroundColor: colors.bg},
    modalBtnGhostText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    modalBtnPrimary: {backgroundColor: colors.primary},
    modalBtnPrimaryText: {fontSize: 15, fontWeight: '700', color: '#fff'},
  });
