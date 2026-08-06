// 陪练提示设置（老师端）—— 对应安卓 StudentReminderActivity。
// 老师从班级学生里选一个，按「曲目」分别设置「AI 陪练模式」的重点播报内容 + 播报频率。
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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {getDeviceId} from '../services/device';
import {registerAccount} from '../services/account';
import {fetchStudents} from '../services/teacher';
import {listStudents} from '../services/students';
import {fetchReminders, savePieces} from '../services/companionChat';

const FREQ_MIN = 10;
const FREQ_MAX = 600;

// 老师给学生起的「备注名」本地存储（按老师区分）。很多学生是匿名设备号、没有昵称，
// 后台只能显示 id 尾号；这里让老师给每个学生取个看得懂的名字，长期保存。
const remarksKey = tid => `student_remarks:${tid}`;

export default function StudentReminderScreen({navigation}) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [sel, setSel] = useState(null); // {id, name}
  const remarksRef = useRef({}); // {studentId: 备注名}
  const rosterRef = useRef({}); // {studentId(学生码): 班级备注名} —— 来自「学生录入」本地班级名单
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
      const keys = Object.keys(rosterRef.current).concat(Object.keys(remarksRef.current));
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
      const candidates = [
        prev,
        '732343f2-9a5c-4a2d-afcd-3694a5aa4d09',
      ].filter(Boolean);
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
      // 先读「学生录入」的本地班级名单：这里老师已经给每个学生起了名字 + 学生码。
      // 和安卓一致——点进来就直接按班级学生的备注名显示，无需再手动补备注。
      let roster = [];
      try {
        roster = (await listStudents()) || [];
      } catch (e) {
        roster = [];
      }
      const rmap = {};
      roster.forEach(s => {
        if (s && s.studentId) rmap[s.studentId] = (s.name || '').trim();
      });
      rosterRef.current = rmap;

      try {
        await registerAccount(getDeviceId(), 'teacher');
      } catch (e) {}

      // 合并两个来源，按学生码去重：① 本地班级名单（有名字、可能学生还没打开过 App）
      // ② 后台已入班学生。班级名单里的备注名优先，让老师一眼看懂。
      const byId = {};
      roster.forEach(s => {
        if (!s || !s.studentId) return; // 没有学生码无法定向下发提醒，跳过
        byId[s.studentId] = {
          id: s.studentId,
          name: (s.name || '').trim() || s.studentId.slice(-6),
        };
      });
      try {
        const r = await fetchStudents(getDeviceId());
        if (r && r.ok && Array.isArray(r.students)) {
          r.students.forEach(s => {
            byId[s.user_id] = {id: s.user_id, name: displayName(s)};
          });
        }
      } catch (e) {}

      if (alive) {
        setStudents(Object.values(byId));
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 保存/更新某学生的备注名（本地长期保存 + 立即刷新界面）。
  const setRemark = (studentId, name) => {
    const clean = (name || '').trim();
    const map = {...remarksRef.current};
    if (clean) map[studentId] = clean;
    else delete map[studentId];
    remarksRef.current = map;
    AsyncStorage.setItem(remarksKey(getDeviceId()), JSON.stringify(map)).catch(() => {});
    setStudents(prev =>
      prev.map(s => (s.id === studentId ? {...s, name: clean || s.id.slice(-6)} : s)),
    );
    setSel(prev =>
      prev && prev.id === studentId ? {...prev, name: clean || prev.id.slice(-6)} : prev,
    );
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

  const onSave = async () => {
    if (!sel) {
      Alert.alert('提示', '请先选择一个学生');
      return;
    }
    const clean = pieces
      .map(p => ({name: (p.name || '').trim(), lines: (p.lines || []).filter(Boolean)}))
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
      <ScreenHeader
        title="陪练提示设置"
        onBack={() => navigation?.goBack?.()}
        right={
          sel ? (
            <TouchableOpacity onPress={onSave} disabled={saving} activeOpacity={0.7}>
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
            {/* 选择学生 */}
            <Text style={styles.sectionLabel}>选择学生</Text>
            <View style={styles.chipWrap}>
              {students.map(s => {
                const active = sel && sel.id === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.stuChip, active && styles.stuChipActive]}
                    onPress={() => selectStudent(s)}
                    activeOpacity={0.85}>
                    <Text
                      style={[styles.stuChipText, active && styles.stuChipTextActive]}
                      numberOfLines={1}>
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.stuChip, styles.stuChipAdd]}
                onPress={() => setManualOpen(true)}
                activeOpacity={0.85}>
                <Text style={styles.stuChipAddText}>＋ 学生码</Text>
              </TouchableOpacity>
            </View>
            {students.length === 0 ? (
              <Text style={styles.emptyHint}>
                还没有学生。到「我的 → 学生录入」把学生的姓名 + 学生码加进班级，这里就会直接按姓名显示；
                或让学生在「AI 陪练模式」里复制学生码，用上面「＋ 学生码」快速录入。
              </Text>
            ) : (
              <Text style={styles.emptyHint}>
                名单来自「学生录入」的班级名字。看到 id 尾号的是还没录入班级的学生，选中后点「✎ 备注名」给 TA 起个名字即可。
              </Text>
            )}

            {sel ? (
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
                    <TouchableOpacity onPress={() => renameStudent(sel)} activeOpacity={0.8}>
                      <Text style={styles.renameBtn}>✎ 备注名</Text>
                    </TouchableOpacity>
                  </View>

                  {/* 播报频率 */}
                  <View style={styles.freqCard}>
                    <Text style={styles.freqLabel}>播报频率（每 {freq} 秒左右一次）</Text>
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
                    <TouchableOpacity onPress={() => openEditor(-1)} activeOpacity={0.8}>
                      <Text style={styles.addPiece}>＋ 添加曲目</Text>
                    </TouchableOpacity>
                  </View>

                  {pieces.length === 0 ? (
                    <Text style={styles.emptyHint}>
                      还没有曲目。点「＋ 添加曲目」，为不同曲子分别设置要反复强调的重点。
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
                          <Text style={styles.pieceEmpty}>（暂无重点内容）</Text>
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
            <Text style={styles.modalFieldLabel}>重点内容（每行一条）</Text>
            <TextInput
              style={styles.modalMultiline}
              value={editLines}
              onChangeText={setEditLines}
              placeholder={'手腕放松，不要塌下去\n注意第二小节的节奏\n手指立起来，指尖发力'}
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
            <Text style={styles.modalFieldLabel}>学生码（学生在陪练模式里复制）</Text>
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
    </SafeAreaView>
  );
}

const makeStyles = colors =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg},
    flex: {flex: 1},
    center: {paddingVertical: 40, alignItems: 'center', justifyContent: 'center'},
    scroll: {padding: 16, paddingBottom: 40},
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    chipWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8},
    stuChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 18,
      backgroundColor: colors.card,
      maxWidth: 150,
    },
    stuChipActive: {backgroundColor: colors.primary},
    stuChipText: {fontSize: 13, color: colors.textPrimary, fontWeight: '600'},
    stuChipTextActive: {color: '#fff'},
    stuChipAdd: {backgroundColor: colors.cardAlt},
    stuChipAddText: {fontSize: 13, color: colors.primaryDark, fontWeight: '700'},
    emptyHint: {
      fontSize: 12.5,
      color: colors.textSecondary,
      lineHeight: 19,
      marginTop: 6,
      marginBottom: 6,
    },
    selRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 14,
    },
    selName: {flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginRight: 10},
    renameBtn: {fontSize: 13, fontWeight: '700', color: colors.accent},
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
    freqValue: {fontSize: 20, fontWeight: '800', color: colors.textPrimary, minWidth: 60, textAlign: 'center'},
    piecesHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 16,
    },
    addPiece: {fontSize: 14, fontWeight: '700', color: colors.accent, marginBottom: 8},
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
    pieceName: {flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary},
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
    modalBtn: {flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center'},
    modalBtnGhost: {backgroundColor: colors.bg},
    modalBtnGhostText: {fontSize: 15, fontWeight: '700', color: colors.textSecondary},
    modalBtnPrimary: {backgroundColor: colors.primary},
    modalBtnPrimaryText: {fontSize: 15, fontWeight: '700', color: '#fff'},
  });
