// #4 曲目解读 + 教案（老师端）。输入曲目名 + 作曲家，AI 生成专业解读与可上课的教案。
// - 场景切换：启蒙 / 考级 / 比赛 / 考学，教案侧重点随之调整（用现成模板套用）。
// - 一键选取曲目重点：从「陪练重点」里直接挑一首已设曲目的重点填进来，教案会据此调整、呼应。
// - 内置多套排版样式（清新 / 雅致 / 简约），一键切换，无需外部 UI 设计。
// - 点任一板块 → 弹出「板块详解」页，AI 就该板块展开更细致的讲解。
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
import {
  generateLessonPlan,
  generateLessonSection,
  fetchReminders,
} from '../services/companionChat';
import {listStudents} from '../services/students';
import {getDeviceId} from '../services/device';

const CATEGORIES = [
  {key: 'general', label: '通用'},
  {key: 'qimeng', label: '启蒙'},
  {key: 'kaoji', label: '考级'},
  {key: 'bisai', label: '比赛'},
  {key: 'kaoxue', label: '考学'},
];

// 内置排版样式（无需外部 UI）：切换后教案结果区的配色/字号/行距/标题样式随之变化。
const PLAN_STYLES = [
  {
    key: 'fresh',
    label: '清新',
    result: {backgroundColor: Colors.white},
    header: {color: Colors.pinkDark, fontSize: 16.5, letterSpacing: 0},
    accent: Colors.pinkPrimary,
    body: {color: Colors.textPrimary, fontSize: 14.5, lineHeight: 24},
    underline: false,
  },
  {
    key: 'elegant',
    label: '雅致',
    result: {backgroundColor: '#FBF6EE'},
    header: {color: '#7A5B34', fontSize: 17.5, letterSpacing: 1},
    accent: '#C9A063',
    body: {color: '#4A4038', fontSize: 15.5, lineHeight: 28},
    underline: false,
  },
  {
    key: 'minimal',
    label: '简约',
    result: {backgroundColor: Colors.white},
    header: {color: '#1C1C1E', fontSize: 15.5, letterSpacing: 0},
    accent: '#1C1C1E',
    body: {color: '#3A3A3C', fontSize: 14, lineHeight: 23},
    underline: true,
  },
];

const SECTION_RE = /^\d+[、.．]/;

// 把教案文本解析为「开头说明 + 若干板块」。板块以「1、标题」这种行为界。
function parseSections(text) {
  const lines = String(text || '').split('\n');
  const sections = [];
  const preamble = [];
  let cur = null;
  for (const ln of lines) {
    const t = ln.trim();
    if (SECTION_RE.test(t)) {
      if (cur) sections.push(cur);
      cur = {title: t, body: []};
    } else if (cur) {
      cur.body.push(ln);
    } else {
      preamble.push(ln);
    }
  }
  if (cur) sections.push(cur);
  return {preamble: preamble.join('\n').trim(), sections};
}

// 详解页里的富文本：把小标题行（数字、/ 【…】 / 短行以「：」结尾）加粗，正文正常。
function renderRich(text, bodyStyle) {
  const lines = String(text || '').split('\n');
  return lines.map((ln, i) => {
    const t = ln.trim();
    if (!t) return <View key={i} style={{height: 8}} />;
    const isHead =
      SECTION_RE.test(t) ||
      /^[【（(]/.test(t) ||
      (t.length <= 18 && /[:：]$/.test(t));
    return (
      <Text
        key={i}
        selectable
        style={[bodyStyle, isHead && {fontWeight: '800', marginTop: 6}]}>
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
  const [styleKey, setStyleKey] = useState('fresh');
  const scrollRef = useRef(null);

  // 「一键选取曲目重点」弹窗状态
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerStudents, setPickerStudents] = useState([]); // [{id,name}]
  const [pickerPieces, setPickerPieces] = useState(null); // null=选学生阶段；[]=已选学生
  const teacherId = useRef(getDeviceId()).current;

  // 「板块详解」页状态
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTitle, setDetailTitle] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailText, setDetailText] = useState('');

  const theme =
    PLAN_STYLES.find(s => s.key === styleKey) || PLAN_STYLES[0];

  const onGenerate = async () => {
    const p = piece.trim();
    if (!p) {
      Alert.alert('提示', '请先填写曲目名称');
      return;
    }
    setLoading(true);
    setPlan('');
    try {
      const r = await generateLessonPlan(p, composer.trim(), focus.trim(), category);
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

  // 点某个板块 → 打开详解页并向 AI 请求更详细讲解。
  const openSectionDetail = async section => {
    setDetailTitle(section.title);
    setDetailText('');
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const r = await generateLessonSection(
        piece.trim(),
        composer.trim(),
        section.title,
        (section.body || []).join('\n').trim(),
        category,
      );
      if (r && r.ok && r.text) {
        setDetailText(r.text);
      } else {
        setDetailText('生成失败了，请返回后重试～');
      }
    } catch (e) {
      setDetailText('网络异常，请返回后重试。');
    } finally {
      setDetailLoading(false);
    }
  };

  const onCopyDetail = () => {
    if (!detailText) return;
    Clipboard.setString(detailTitle + '\n\n' + detailText);
    Alert.alert('已复制', '本板块详解已复制。');
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

  const pickPiece = pc => {
    if (pc.name) setPiece(pc.name);
    const lines = (pc.lines || []).join('\n');
    setFocus(lines);
    setPickerOpen(false);
    Alert.alert('已选取', `已把《${pc.name}》的陪练重点填入，生成教案时会围绕这些重点调整。`);
  };

  const parsed = plan ? parseSections(plan) : null;

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

          {parsed ? (
            <View style={[styles.card, theme.result]}>
              <View style={styles.resultHead}>
                <Text style={styles.resultTitle}>解读 + 教案</Text>
                <TouchableOpacity onPress={onCopy} activeOpacity={0.7}>
                  <Text style={styles.copyBtn}>复制全文</Text>
                </TouchableOpacity>
              </View>

              {/* 排版样式切换 */}
              <View style={styles.styleRow}>
                <Text style={styles.styleLabel}>排版</Text>
                {PLAN_STYLES.map(s => {
                  const on = styleKey === s.key;
                  return (
                    <TouchableOpacity
                      key={s.key}
                      style={[styles.styleChip, on && styles.styleChipOn]}
                      activeOpacity={0.85}
                      onPress={() => setStyleKey(s.key)}>
                      <Text
                        style={[styles.styleChipText, on && styles.styleChipTextOn]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.tapHint}>点任一板块可让 AI 展开更详细的讲解 ›</Text>

              {parsed.preamble ? (
                <Text style={[styles.body, theme.body, {marginBottom: 4}]} selectable>
                  {parsed.preamble}
                </Text>
              ) : null}

              {parsed.sections.map((sec, idx) => (
                <View key={idx} style={styles.section}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => openSectionDetail(sec)}
                    style={[
                      styles.sectionHead,
                      theme.underline && styles.sectionHeadUnderline,
                    ]}>
                    <View
                      style={[styles.accentBar, {backgroundColor: theme.accent}]}
                    />
                    <Text
                      style={[
                        styles.sectionTitle,
                        {color: theme.header.color, fontSize: theme.header.fontSize,
                          letterSpacing: theme.header.letterSpacing},
                      ]}>
                      {sec.title}
                    </Text>
                    <Text style={[styles.sectionMore, {color: theme.accent}]}>
                      详解 ›
                    </Text>
                  </TouchableOpacity>
                  {sec.body.map((ln, i) =>
                    ln.trim() ? (
                      <Text key={i} style={[styles.body, theme.body]} selectable>
                        {ln}
                      </Text>
                    ) : (
                      <View key={i} style={{height: 6}} />
                    ),
                  )}
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 板块详解页 */}
      <Modal
        visible={detailOpen}
        animationType="slide"
        onRequestClose={() => setDetailOpen(false)}>
        <SafeAreaView style={styles.detailContainer}>
          <StatusBar barStyle="dark-content" backgroundColor={Colors.pinkBg} />
          <ScreenHeader
            title="板块详解"
            onBack={() => setDetailOpen(false)}
          />
          <View style={styles.detailTitleWrap}>
            <Text style={styles.detailTitle}>{detailTitle}</Text>
            {!detailLoading && detailText ? (
              <TouchableOpacity onPress={onCopyDetail} activeOpacity={0.7}>
                <Text style={styles.copyBtn}>复制</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {detailLoading ? (
            <View style={styles.detailLoading}>
              <ActivityIndicator color={Colors.pinkPrimary} size="large" />
              <Text style={styles.loadingHint}>AI 正在展开这个板块的详细讲解…</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.detailScroll}
              showsVerticalScrollIndicator={false}>
              {renderRich(detailText, styles.detailBody)}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

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
  styleRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 6},
  styleLabel: {fontSize: 12.5, color: Colors.textSecondary, marginRight: 8},
  styleChip: {
    paddingHorizontal: 12,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.pinkBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.pinkLight,
  },
  styleChipOn: {backgroundColor: Colors.pinkPrimary, borderColor: Colors.pinkPrimary},
  styleChipText: {fontSize: 12.5, fontWeight: '700', color: Colors.textSecondary},
  styleChipTextOn: {color: '#fff'},
  tapHint: {fontSize: 11.5, color: Colors.textSecondary, marginBottom: 8},
  section: {marginBottom: 8},
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    marginTop: 8,
    marginBottom: 3,
  },
  sectionHeadUnderline: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  accentBar: {width: 4, height: 18, borderRadius: 2, marginRight: 8},
  sectionTitle: {flex: 1, fontWeight: '800', lineHeight: 26},
  sectionMore: {fontSize: 12.5, fontWeight: '700', marginLeft: 8},
  body: {fontSize: 14.5, lineHeight: 24, color: Colors.textPrimary},
  // 详解页
  detailContainer: {flex: 1, backgroundColor: Colors.pinkBg},
  detailTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  detailTitle: {flex: 1, fontSize: 17, fontWeight: '800', color: Colors.textPrimary},
  detailLoading: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  detailScroll: {padding: 16, paddingBottom: 40},
  detailBody: {fontSize: 15, lineHeight: 26, color: Colors.textPrimary},
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
