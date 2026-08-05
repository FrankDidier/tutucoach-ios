// #4 曲目解读 + 教案（老师端）。输入曲目名 + 作曲家，AI 生成专业解读与可上课的教案。
// - 场景切换：启蒙 / 考级 / 比赛 / 考学，教案侧重点随之调整（用现成模板套用）。
// - 一键选取曲目重点：从「陪练重点」里直接挑一首已设曲目的重点填进来，教案会据此调整、呼应。
// - 内置多套排版样式（清新 / 雅致 / 简约），一键切换，无需外部 UI 设计。
// - 点任一板块 → 弹出「板块详解」页，AI 就该板块展开更细致的讲解。
import React, {useMemo, useRef, useState} from 'react';
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
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {
  generateLessonPlan,
  generateLessonSection,
  fetchReminders,
  recommendPieces,
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

// 曲目推荐的场景与教案略有不同：把「启蒙」换成「重奏」（启蒙场景在推荐里会忽略已填程度、
// 逻辑混乱）。通用场景的第三个方向是「教材推荐」而非「冷门」。
const REC_CATEGORIES = [
  {key: 'general', label: '通用'},
  {key: 'hezou', label: '重奏'},
  {key: 'kaoji', label: '考级'},
  {key: 'bisai', label: '比赛'},
  {key: 'kaoxue', label: '考学'},
];

// 内置排版样式（无需外部 UI）：切换后教案结果区的配色/字号/行距/标题样式随之变化。
// 「清新」跟随主题令牌；「雅致 / 简约」是自成一套的固定排版配色（与明暗主题无关）。
const makePlanStyles = colors => [
  {
    key: 'fresh',
    label: '清新',
    result: {backgroundColor: colors.card},
    header: {color: colors.primaryDark, fontSize: 16.5, letterSpacing: 0},
    accent: colors.accent,
    body: {color: colors.textPrimary, fontSize: 14.5, lineHeight: 24},
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
    result: {backgroundColor: '#FFFFFF'},
    header: {color: '#1C1C1E', fontSize: 15.5, letterSpacing: 0},
    accent: '#1C1C1E',
    body: {color: '#3A3A3C', fontSize: 14, lineHeight: 23},
    underline: true,
  },
];

// 8 个顶层板块的标题形如「1、曲目背景」。要点：只认「数字 + 顿号(、)」，
// 允许前面带 Markdown 记号（###、** 等，模型偶尔会加）。板块内部的分点用
// 「1.」「（1）」等，不带顿号，所以不会被误判成板块 → 只有 8 个板块可点详解。
const SECTION_RE = /^#{0,6}\s*\*{0,2}\s*\d+、/;

// 清掉模型偶尔输出的 Markdown 记号（#、*、` 等），让排版干净。
function cleanMd(s) {
  return String(s == null ? '' : s)
    .replace(/`+/g, '')
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/^(\s*)[-*]\s+/, '$1· ')
    .replace(/\s+$/, '');
}

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
      cur = {title: cleanMd(t), body: []};
    } else if (cur) {
      cur.body.push(ln);
    } else {
      preamble.push(ln);
    }
  }
  if (cur) sections.push(cur);
  return {preamble: cleanMd(preamble.join('\n')).trim(), sections};
}

// 富文本渲染：清掉 Markdown 记号，并把小标题行（原文带 #/** / 短行以「：」结尾）加粗。
function renderRich(text, bodyStyle) {
  const lines = String(text || '').split('\n');
  return lines.map((ln, i) => {
    const t = ln.trim();
    if (!t) return <View key={i} style={{height: 8}} />;
    const isHead =
      /^#{1,6}\s/.test(t) ||
      /^\*\*.+\*\*$/.test(t) ||
      SECTION_RE.test(t) ||
      /^[【（(]/.test(t) ||
      (t.length <= 18 && /[:：]$/.test(t));
    const clean = cleanMd(ln);
    if (!clean.trim()) return <View key={i} style={{height: 8}} />;
    return (
      <Text
        key={i}
        selectable
        style={[bodyStyle, isHead && {fontWeight: '800', marginTop: 6}]}>
        {clean}
      </Text>
    );
  });
}

export default function LessonPlanScreen({navigation}) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const PLAN_STYLES = useMemo(() => makePlanStyles(colors), [colors]);
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

  // 「板块详解」页状态
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTitle, setDetailTitle] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailText, setDetailText] = useState('');

  // 顶部模式：plan=生成教案；recommend=曲目推荐
  const [mode, setMode] = useState('plan');
  // 曲目推荐输入 + 结果
  const [recCategory, setRecCategory] = useState('general');
  const [recLevel, setRecLevel] = useState('');
  const [recAge, setRecAge] = useState('');
  const [recYears, setRecYears] = useState('');
  const [recLoading, setRecLoading] = useState(false);
  const [recResult, setRecResult] = useState(null); // {technique,musicality,niche,raw}

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

  const onRecommend = async () => {
    setRecLoading(true);
    setRecResult(null);
    try {
      const r = await recommendPieces(
        recLevel.trim(),
        recAge.trim(),
        recYears.trim(),
        recCategory,
      );
      if (r && r.ok) {
        setRecResult(r);
        setTimeout(() => scrollRef.current?.scrollToEnd?.({animated: true}), 300);
      } else {
        Alert.alert('推荐失败', '请稍后重试（生成较慢，请保持网络畅通）。');
      }
    } catch (e) {
      Alert.alert('推荐失败', '网络异常，请稍后重试。');
    } finally {
      setRecLoading(false);
    }
  };

  // 点某首推荐曲目 → 带入教案生成（切到「生成教案」并填好曲目/作曲家）。
  const useRecommendedPiece = it => {
    setPiece(it.name || '');
    setComposer(it.composer || '');
    setMode('plan');
    setPlan('');
    setTimeout(() => scrollRef.current?.scrollTo?.({y: 0, animated: true}), 200);
    Alert.alert('已带入', `已填入《${it.name}》，可直接点「生成解读 + 教案」。`);
  };

  const onCopy = () => {
    if (!plan) return;
    const clean = plan
      .split('\n')
      .map(cleanMd)
      .join('\n');
    Clipboard.setString(clean);
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
      const r = await fetchReminders(stu.id, getDeviceId());
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
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
      <ScreenHeader title="曲目解读 · 教案" onBack={() => navigation?.goBack?.()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* 顶部模式切换：生成教案 / 曲目推荐 */}
          <View style={styles.modeRow}>
            {[
              {k: 'plan', l: '生成教案'},
              {k: 'recommend', l: '曲目推荐'},
            ].map(m => {
              const on = mode === m.k;
              return (
                <TouchableOpacity
                  key={m.k}
                  style={[styles.modeTab, on && styles.modeTabOn]}
                  activeOpacity={0.85}
                  onPress={() => setMode(m.k)}>
                  <Text style={[styles.modeTabText, on && styles.modeTabTextOn]}>
                    {m.l}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {mode === 'plan' ? (
          <>
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
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={[styles.fieldLabel, {marginTop: 12}]}>作曲家（可选）</Text>
            <TextInput
              style={styles.input}
              value={composer}
              onChangeText={setComposer}
              placeholder="如：贝多芬"
              placeholderTextColor={colors.textSecondary}
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
              placeholderTextColor={colors.textSecondary}
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
                  {renderRich(sec.body.join('\n'), [styles.body, theme.body])}
                </View>
              ))}
            </View>
          ) : null}
          </>
          ) : (
          <>
          {/* 曲目推荐 */}
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>教学场景</Text>
            <View style={styles.chipRow}>
              {REC_CATEGORIES.map(c => {
                const on = recCategory === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.chip, on && styles.chipOn]}
                    activeOpacity={0.85}
                    onPress={() => setRecCategory(c.key)}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, {marginTop: 14}]}>学生程度</Text>
            <TextInput
              style={styles.input}
              value={recLevel}
              onChangeText={setRecLevel}
              placeholder="如：拜厄下册 / 车尔尼599 / 考级 4 级水平"
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={[styles.fieldLabel, {marginTop: 12}]}>生理年龄</Text>
            <TextInput
              style={styles.input}
              value={recAge}
              onChangeText={setRecAge}
              placeholder="如：7 岁 / 12 岁 / 成人"
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={[styles.fieldLabel, {marginTop: 12}]}>学琴时长</Text>
            <TextInput
              style={styles.input}
              value={recYears}
              onChangeText={setRecYears}
              placeholder="如：半年 / 2 年 / 5 年"
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={[styles.fieldHint, {marginTop: 8}]}>
              {recCategory === 'hezou'
                ? '重奏场景按「双钢琴 / 四手联弹 / 与其他乐器重奏」三类各推荐几项。点某项可直接带入教案生成。'
                : `按学生的程度、年龄、学琴时长和场景，从「偏重技术 / 偏重乐感 / ${
                    recCategory === 'general' ? '教材推荐' : '冷门'
                  }」三个方向各推荐几项。点某项可直接带入教案生成。`}
            </Text>
            <TouchableOpacity
              style={styles.genBtn}
              onPress={onRecommend}
              activeOpacity={0.88}
              disabled={recLoading}>
              {recLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.genBtnText}>推荐曲目</Text>
              )}
            </TouchableOpacity>
            {recLoading ? (
              <Text style={styles.loadingHint}>
                AI 正在挑选适合的曲目，请稍候…
              </Text>
            ) : null}
          </View>

          {recResult ? (
            <View style={styles.card}>
              {recResult.raw ? (
                <Text style={[styles.body]} selectable>
                  {recResult.raw}
                </Text>
              ) : (
                [
                  {
                    key: 'technique',
                    title:
                      recCategory === 'hezou' ? '① 双钢琴' : '① 偏重技术',
                    data: recResult.technique,
                  },
                  {
                    key: 'musicality',
                    title:
                      recCategory === 'hezou' ? '② 四手联弹' : '② 偏重乐感',
                    data: recResult.musicality,
                  },
                  {
                    key: 'niche',
                    title:
                      recCategory === 'hezou'
                        ? '③ 与其他乐器重奏'
                        : recCategory === 'general'
                        ? '③ 教材推荐'
                        : '③ 冷门推荐',
                    data: recResult.niche,
                  },
                ].map(grp => (
                  <View key={grp.key} style={{marginBottom: 6}}>
                    <View style={styles.recGroupHead}>
                      <View style={styles.recAccent} />
                      <Text style={styles.recGroupTitle}>{grp.title}</Text>
                    </View>
                    {(grp.data || []).length === 0 ? (
                      <Text style={styles.recEmpty}>暂无</Text>
                    ) : (
                      (grp.data || []).map((it, i) => (
                        <TouchableOpacity
                          key={i}
                          style={styles.recItem}
                          activeOpacity={0.7}
                          onPress={() => useRecommendedPiece(it)}>
                          <View style={styles.recItemTop}>
                            <Text style={styles.recName}>{it.name}</Text>
                            {it.composer ? (
                              <Text style={styles.recComposer}>{it.composer}</Text>
                            ) : null}
                          </View>
                          {it.reason ? (
                            <Text style={styles.recReason}>{it.reason}</Text>
                          ) : null}
                          <Text style={styles.recUse}>用这首生成教案 ›</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                ))
              )}
            </View>
          ) : null}
          </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 板块详解页 */}
      <Modal
        visible={detailOpen}
        animationType="slide"
        onRequestClose={() => setDetailOpen(false)}>
        <SafeAreaView style={styles.detailContainer}>
          <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
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
              <ActivityIndicator color={colors.primary} size="large" />
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
              <ActivityIndicator color={colors.primary} style={{marginVertical: 24}} />
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

const makeStyles = colors =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg},
    flex: {flex: 1},
    scroll: {padding: 16, paddingBottom: 40},
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 8,
      shadowOffset: {width: 0, height: 2},
      elevation: 2,
    },
    fieldLabel: {fontSize: 13, fontWeight: '700', color: colors.textPrimary},
    fieldHint: {fontSize: 11.5, color: colors.primaryDark, marginTop: 4, lineHeight: 17},
    modeRow: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: 22,
      padding: 4,
      marginBottom: 14,
    },
    modeTab: {
      flex: 1,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeTabOn: {backgroundColor: colors.primary},
    modeTabText: {fontSize: 14, fontWeight: '700', color: colors.textSecondary},
    modeTabTextOn: {color: '#fff'},
    recGroupHead: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 6,
    },
    recAccent: {
      width: 4,
      height: 16,
      borderRadius: 2,
      backgroundColor: colors.primary,
      marginRight: 8,
    },
    recGroupTitle: {fontSize: 15, fontWeight: '800', color: colors.primaryDark},
    recEmpty: {fontSize: 13, color: colors.textSecondary, marginBottom: 6},
    recItem: {
      backgroundColor: colors.bg,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
    },
    recItemTop: {flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap'},
    recName: {fontSize: 15.5, fontWeight: '800', color: colors.textPrimary},
    recComposer: {fontSize: 12.5, color: colors.textSecondary, marginLeft: 8},
    recReason: {fontSize: 13, color: colors.textPrimary, lineHeight: 20, marginTop: 4},
    recUse: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.accent,
      marginTop: 6,
    },
    chipRow: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 8},
    chip: {
      paddingHorizontal: 16,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    chipOn: {backgroundColor: colors.primary, borderColor: colors.primary},
    chipText: {fontSize: 14, fontWeight: '600', color: colors.textSecondary},
    chipTextOn: {color: '#fff'},
    input: {
      marginTop: 6,
      height: 42,
      borderRadius: 10,
      backgroundColor: colors.bg,
      paddingHorizontal: 12,
      fontSize: 15,
      color: colors.textPrimary,
    },
    focusHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    pickBtn: {fontSize: 12.5, fontWeight: '700', color: colors.accent},
    multiline: {
      marginTop: 8,
      minHeight: 90,
      borderRadius: 10,
      backgroundColor: colors.bg,
      padding: 12,
      fontSize: 14,
      color: colors.textPrimary,
      textAlignVertical: 'top',
    },
    genBtn: {
      marginTop: 16,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    genBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
    loadingHint: {
      fontSize: 12,
      color: colors.textSecondary,
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
    resultTitle: {fontSize: 15, fontWeight: '800', color: colors.textPrimary},
    copyBtn: {fontSize: 13.5, fontWeight: '700', color: colors.accent},
    styleRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 6},
    styleLabel: {fontSize: 12.5, color: colors.textSecondary, marginRight: 8},
    styleChip: {
      paddingHorizontal: 12,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    styleChipOn: {backgroundColor: colors.primary, borderColor: colors.primary},
    styleChipText: {fontSize: 12.5, fontWeight: '700', color: colors.textSecondary},
    styleChipTextOn: {color: '#fff'},
    tapHint: {fontSize: 11.5, color: colors.textSecondary, marginBottom: 8},
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
    body: {fontSize: 14.5, lineHeight: 24, color: colors.textPrimary},
    // 详解页
    detailContainer: {flex: 1, backgroundColor: colors.bg},
    detailTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 6,
    },
    detailTitle: {flex: 1, fontSize: 17, fontWeight: '800', color: colors.textPrimary},
    detailLoading: {flex: 1, alignItems: 'center', justifyContent: 'center'},
    detailScroll: {padding: 16, paddingBottom: 40},
    detailBody: {fontSize: 15, lineHeight: 26, color: colors.textPrimary},
    modalMask: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'center',
      padding: 28,
    },
    modalCard: {
      backgroundColor: colors.card,
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
    modalTitle: {fontSize: 16, fontWeight: '800', color: colors.textPrimary},
    modalClose: {fontSize: 14, color: colors.accent, fontWeight: '700'},
    modalList: {flexGrow: 0},
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.cardBorder,
    },
    modalRowText: {fontSize: 15, fontWeight: '600', color: colors.textPrimary},
    modalRowSub: {fontSize: 12, color: colors.textSecondary, marginTop: 3},
    modalRowArrow: {fontSize: 20, color: colors.textSecondary},
    modalEmpty: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: 28,
      paddingHorizontal: 16,
      lineHeight: 20,
    },
  });
