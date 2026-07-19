// #4 曲目解读 + 教案（老师端）。输入曲目名 + 作曲家，AI 生成专业解读与可上课的教案。
// - 场景切换：启蒙 / 考级 / 比赛 / 考学，教案侧重点随之调整（用现成模板套用）。
// - 一键选取曲目重点：从「陪练重点」里直接挑一首已设曲目的重点填进来，教案会据此调整、呼应。
import React, {useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {Colors} from '../utils/colors';
import ScreenHeader from '../components/ScreenHeader';
import {generateLessonPlan, fetchReminders} from '../services/companionChat';
import {listStudents} from '../services/students';
import {getDeviceId} from '../services/device';

const CATEGORIES = [
  {key: 'general', label: '通用'},
  {key: 'qimeng', label: '启蒙'},
  {key: 'kaoji', label: '考级'},
  {key: 'bisai', label: '比赛'},
  {key: 'kaoxue', label: '考学'},
];

// 简单排版：给「1、标题」这种板块行加粗、放大，让教案更好读（内置排版样式，无需外部 UI）。
function renderPlan(text) {
  const lines = String(text || '').split('\n');
  return lines.map((ln, i) => {
    const t = ln.trim();
    const isSection = /^\d+[、.．]/.test(t); // 1、xxx / 1.xxx
    if (isSection) {
      return (
        <Text key={i} style={styles.planSection}>
          {t}
        </Text>
      );
    }
    if (!t) return <Text key={i} style={styles.planGap}>{'\n'}</Text>;
    return (
      <Text key={i} style={styles.planLine} selectable>
        {ln}
      </Text>
    );
  });
}

export default function LessonPlanScreen({navigation}) {
  const [piece, setPiece] = useState('');
  const [composer, setComposer] = useState('');
  const [focus, setFocus] = useState('');
  const [category, setCategory] = useState('general');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState('');
  const scrollRef = useRef(null);

  // 「一键选取曲目重点」弹窗状态
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerStudents, setPickerStudents] = useState([]); // [{id,name}]
  const [pickerPieces, setPickerPieces] = useState(null); // null=选学生阶段；[]=已选学生
  const teacherId = useRef(getDeviceId()).current;

  const onGenerate = async () => {
    const p = piece.trim();
    if (!p) {
      Alert.alert('提示', '请先填写曲目名称');
      return;
    }
    setLoading(true);
    setPlan('');
    try {
      const r = await generateLessonPlan(
        p,
        composer.trim(),
        focus.trim(),
        category,
      );
      if (r && r.ok && r.text) {
        setPlan(r.text);
        setTimeout(() => scrollRef.current?.scrollToEnd?.({animated: true}), 300);
      } else {
        Alert.alert('生成失败', '请稍后重试（生成较慢，请保持网络畅通）。');
      }
    } catch (e) {
      Alert.alert('生成失败', '网络异常，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const onCopy = () => {
    if (!plan) return;
    Clipboard.setString(plan);
    Alert.alert('已复制', '教案已复制，可粘贴到「陪练提示设置」或备课笔记里。');
  };

  // 打开「选取曲目重点」：先列出班级学生。
  const openPicker = async () => {
    setPickerOpen(true);
    setPickerPieces(null);
    setPickerLoading(true);
    try {
      const roster = (await listStudents()) || [];
      const list = roster
        .filter(s => s && s.studentId)
        .map(s => ({
          id: s.studentId,
          name: (s.name || '').trim() || s.studentId.slice(-6),
        }));
      setPickerStudents(list);
    } catch (e) {
      setPickerStudents([]);
    } finally {
      setPickerLoading(false);
    }
  };

  // 选中学生 → 拉取其已设曲目重点。
  const pickStudent = async stu => {
    setPickerLoading(true);
    try {
      const r = await fetchReminders(stu.id, teacherId);
      setPickerPieces((r && r.pieces) || []);
    } catch (e) {
      setPickerPieces([]);
    } finally {
      setPickerLoading(false);
    }
  };

  // 选中某首曲目 → 填入曲目名 + 重点，关闭弹窗。
  const pickPiece = pc => {
    if (pc.name) setPiece(pc.name);
    const lines = (pc.lines || []).join('\n');
    setFocus(lines);
    setPickerOpen(false);
    Alert.alert('已选取', `已把《${pc.name}》的陪练重点填入，生成教案时会围绕这些重点调整。`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.pinkBg} />
      <ScreenHeader title="曲目解读 · 教案" onBack={() => navigation?.goBack?.()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>教学场景</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map(c => {
                const on = category === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.chip, on && styles.chipOn]}
                    activeOpacity={0.85}
                    onPress={() => setCategory(c.key)}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, {marginTop: 14}]}>曲目名称</Text>
            <TextInput
              style={styles.input}
              value={piece}
              onChangeText={setPiece}
              placeholder="如：致爱丽丝 / 车尔尼599 No.1"
              placeholderTextColor={Colors.textSecondary}
            />
            <Text style={[styles.fieldLabel, {marginTop: 12}]}>作曲家（可选）</Text>
            <TextInput
              style={styles.input}
              value={composer}
              onChangeText={setComposer}
              placeholder="如：贝多芬"
              placeholderTextColor={Colors.textSecondary}
            />

            <View style={[styles.focusHead, {marginTop: 12}]}>
              <Text style={styles.fieldLabel}>关联已设重点（可选）</Text>
              <TouchableOpacity onPress={openPicker} activeOpacity={0.75}>
                <Text style={styles.pickBtn}>＋ 一键选取曲目重点</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldHint}>
              点右上角从「陪练重点」直接选一首已设曲目的重点填进来，教案会围绕这些重点调整。
            </Text>
            <TextInput
              style={styles.multiline}
              value={focus}
              onChangeText={setFocus}
              placeholder={'如：左手分解和弦要轻\n右手主旋律突出\n注意第 9 小节渐强'}
              placeholderTextColor={Colors.textSecondary}
              multiline
            />
            <TouchableOpacity
              style={styles.genBtn}
              onPress={onGenerate}
              activeOpacity={0.88}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.genBtnText}>生成解读 + 教案</Text>
              )}
            </TouchableOpacity>
            {loading ? (
              <Text style={styles.loadingHint}>
                AI 正在备课，约需 1 分钟，请保持网络畅通、不要离开本页…
              </Text>
            ) : null}
          </View>

          {plan ? (
            <View style={styles.card}>
              <View style={styles.resultHead}>
                <Text style={styles.resultTitle}>解读 + 教案</Text>
                <TouchableOpacity onPress={onCopy} activeOpacity={0.7}>
                  <Text style={styles.copyBtn}>复制全文</Text>
                </TouchableOpacity>
              </View>
              <View>{renderPlan(plan)}</View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 选取曲目重点弹窗 */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>
                {pickerPieces == null ? '选择学生' : '选择曲目'}
              </Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Text style={styles.modalClose}>关闭</Text>
              </TouchableOpacity>
            </View>
            {pickerLoading ? (
              <ActivityIndicator color={Colors.pinkPrimary} style={{marginVertical: 24}} />
            ) : pickerPieces == null ? (
              <FlatList
                data={pickerStudents}
                keyExtractor={s => s.id}
                style={styles.modalList}
                ListEmptyComponent={
                  <Text style={styles.modalEmpty}>
                    还没有班级学生。请先在「学生录入」里添加学生。
                  </Text>
                }
                renderItem={({item}) => (
                  <TouchableOpacity
                    style={styles.modalRow}
                    onPress={() => pickStudent(item)}>
                    <Text style={styles.modalRowText}>{item.name}</Text>
                    <Text style={styles.modalRowArrow}>›</Text>
                  </TouchableOpacity>
                )}
              />
            ) : (
              <FlatList
                data={pickerPieces}
                keyExtractor={(p, i) => p.name + i}
                style={styles.modalList}
                ListEmptyComponent={
                  <Text style={styles.modalEmpty}>
                    该学生还没有设置曲目重点。可先在「陪练提示设置」里添加。
                  </Text>
                }
                renderItem={({item}) => (
                  <TouchableOpacity
                    style={styles.modalRow}
                    onPress={() => pickPiece(item)}>
                    <View style={{flex: 1}}>
                      <Text style={styles.modalRowText}>{item.name}</Text>
                      <Text style={styles.modalRowSub} numberOfLines={1}>
                        {(item.lines || []).join('；') || '（无重点内容）'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.pinkBg},
  flex: {flex: 1},
  scroll: {padding: 16, paddingBottom: 40},
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  fieldLabel: {fontSize: 13, fontWeight: '700', color: Colors.textPrimary},
  fieldHint: {fontSize: 11.5, color: Colors.pinkDark, marginTop: 4, lineHeight: 17},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 8},
  chip: {
    paddingHorizontal: 16,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.pinkBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.pinkLight,
  },
  chipOn: {backgroundColor: Colors.pinkPrimary, borderColor: Colors.pinkPrimary},
  chipText: {fontSize: 14, fontWeight: '600', color: Colors.textSecondary},
  chipTextOn: {color: '#fff'},
  input: {
    marginTop: 6,
    height: 42,
    borderRadius: 10,
    backgroundColor: Colors.pinkBg,
    paddingHorizontal: 12,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  focusHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickBtn: {fontSize: 12.5, fontWeight: '700', color: Colors.pinkPrimary},
  multiline: {
    marginTop: 8,
    minHeight: 90,
    borderRadius: 10,
    backgroundColor: Colors.pinkBg,
    padding: 12,
    fontSize: 14,
    color: Colors.textPrimary,
    textAlignVertical: 'top',
  },
  genBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.pinkPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  loadingHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 18,
  },
  resultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  resultTitle: {fontSize: 15, fontWeight: '800', color: Colors.textPrimary},
  copyBtn: {fontSize: 13.5, fontWeight: '700', color: Colors.pinkPrimary},
  planSection: {
    fontSize: 15.5,
    lineHeight: 26,
    fontWeight: '800',
    color: Colors.pinkDark,
    marginTop: 10,
    marginBottom: 2,
  },
  planLine: {fontSize: 14.5, lineHeight: 24, color: Colors.textPrimary},
  planGap: {fontSize: 6, lineHeight: 8},
  modalMask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 28,
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    maxHeight: '70%',
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  modalTitle: {fontSize: 16, fontWeight: '800', color: Colors.textPrimary},
  modalClose: {fontSize: 14, color: Colors.pinkPrimary, fontWeight: '700'},
  modalList: {flexGrow: 0},
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.pinkLight,
  },
  modalRowText: {fontSize: 15, fontWeight: '600', color: Colors.textPrimary},
  modalRowSub: {fontSize: 12, color: Colors.textSecondary, marginTop: 3},
  modalRowArrow: {fontSize: 20, color: Colors.textSecondary},
  modalEmpty: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    lineHeight: 20,
  },
});
