// #4 曲目解读 + 教案（老师端）。输入曲目名 + 作曲家，AI 生成专业解读与可上课的教案。
// - 场景切换：启蒙 / 考级 / 比赛 / 考学，教案侧重点随之调整（用现成模板套用）。
// - 一键选取曲目重点：从「陪练重点」里直接挑一首已设曲目的重点填进来，教案会据此调整、呼应。
// - 内置多套排版样式（清新 / 雅致 / 简约），一键切换，无需外部 UI 设计。
// - 点任一板块 → 弹出「板块详解」页，AI 就该板块展开更细致的讲解。
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
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  Image,
  Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {Images} from '../assets/images';
import Clipboard from '@react-native-clipboard/clipboard';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import InstrumentCard from '../components/InstrumentCard';
import InstrumentPickerModal from '../components/InstrumentPickerModal';
import LanhuCTA from '../components/LanhuCTA';

const {width: SCREEN_W} = Dimensions.get('window');
const px = n => Math.round((n * SCREEN_W) / 375);
import {
  generateLessonPlan,
  generateLessonSection,
  fetchReminders,
  recommendPieces,
} from '../services/companionChat';
import {listStudents} from '../services/students';
import {getDeviceId} from '../services/device';
import {setKeepAwake} from '../services/voice';
import {
  currentInstrument,
  loadInstrument,
  setInstrument,
} from '../services/instrument';

/** 服务端偶发只回 raw（```json ...```）；剥围栏再解析，避免整页原文。 */
function normalizeRecommendResult(r) {
  if (!r) return r;
  if ((r.technique && r.technique.length) || (r.musicality && r.musicality.length) || (r.niche && r.niche.length)) {
    return {...r, raw: undefined};
  }
  let raw = (r.raw || '').trim();
  if (!raw) return r;
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json|JSON)?\s*/, '').replace(/\s*```$/, '').trim();
  }
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const o = JSON.parse(raw.slice(start, end + 1));
      if (o && (o.technique || o.musicality || o.niche)) {
        return {
          ...r,
          technique: o.technique || [],
          musicality: o.musicality || [],
          niche: o.niche || [],
          raw: undefined,
        };
      }
    }
  } catch (e) {}
  return {...r, raw: '推荐结果解析失败，请再点一次「推荐曲目」。'};
}

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
  const {colors, mode: themeMode} = useTheme();
  const dark = themeMode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const [instOpen, setInstOpen] = useState(false);
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
  const [recGradeChip, setRecGradeChip] = useState(0); // 0=未选；1-10=考级快捷
  const [recAge, setRecAge] = useState('');
  const [recYears, setRecYears] = useState('');
  const [recLoading, setRecLoading] = useState(false);
  const [recResult, setRecResult] = useState(null); // {technique,musicality,niche,raw}
  const [recAvoid, setRecAvoid] = useState([]); // 最近已推荐曲名，降低重复
  const [instrument, setInst] = useState(currentInstrument());

  useEffect(() => {
    loadInstrument().then(id => setInst(id));
  }, []);

  // 教案/推荐/板块详解生成较慢，期间禁止自动锁屏，避免黑屏待机打断请求。
  useEffect(() => {
    const busy = loading || recLoading || detailLoading;
    try {
      setKeepAwake(busy);
    } catch (e) {}
    return () => {
      try {
        setKeepAwake(false);
      } catch (e) {}
    };
  }, [loading, recLoading, detailLoading]);

  const pickGrade = n => {
    setRecGradeChip(n);
    setRecLevel(`考级 ${n} 级`);
  };

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
      const r = await generateLessonPlan(p, composer.trim(), focus.trim(), category, instrument);
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
    if (!(recLevel || '').trim()) {
      Alert.alert(
        '请先填写程度',
        recCategory === 'kaoji'
          ? '考级场景请点下方「1–10 级」快捷按钮，或手写如「考级 4 级」。'
          : '请填写学生程度，例如「车尔尼599」或「考级 3 级」，否则难度容易不准。',
      );
      return;
    }
    setRecLoading(true);
    setRecResult(null);
    try {
      const r = await recommendPieces(
        recLevel.trim(),
        recAge.trim(),
        recYears.trim(),
        recCategory,
        recAvoid,
        instrument,
      );
      if (r && r.ok) {
        const normalized = normalizeRecommendResult(r);
        setRecResult(normalized);
        const names = []
          .concat(normalized.technique || [], normalized.musicality || [], normalized.niche || [])
          .map(x => x && x.name)
          .filter(Boolean);
        if (names.length) {
          setRecAvoid(prev => [...names, ...prev].slice(0, 40));
        }
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
  const applyRecommendedPiece = it => {
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
        instrument,
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
    <EdgeSafeArea edges={['left', 'right']} style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
      <ScreenHeader title="曲目解读·教案" onBack={() => navigation?.goBack?.()} />
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
          <InstrumentCard
            instrument={instrument}
            onPick={() => setInstOpen(true)}
            style={styles.instCard}
          />
          <InstrumentPickerModal
            visible={instOpen}
            onClose={() => setInstOpen(false)}
            onSelect={id => {
              setInst(id);
              setInstrument(id);
              setRecResult(null);
            }}
          />

          {mode === 'plan' ? (
          <>
          <View style={styles.formCard}>
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

            <Text style={[styles.fieldLabel, styles.fieldGap]}>曲目名称</Text>
            <TextInput
              style={styles.input}
              value={piece}
              onChangeText={setPiece}
              placeholder="如:致爱丽丝/车尔尼599No.1"
              placeholderTextColor={dark ? '#A1A1B4' : '#A6A6A6'}
            />
            <Text style={[styles.fieldLabel, styles.fieldGap, styles.fieldLabelIndent]}>作曲家</Text>
            <TextInput
              style={styles.input}
              value={composer}
              onChangeText={setComposer}
              placeholder="如:贝多芬"
              placeholderTextColor={dark ? '#A1A1B4' : '#A6A6A6'}
            />

            <View style={styles.focusHead}>
              <Text style={[styles.fieldLabel, styles.fieldLabelIndent, styles.focusLabel]}>关联已设重点</Text>
              <TouchableOpacity onPress={openPicker} activeOpacity={0.75} style={styles.pickPill}>
                <View style={styles.plusIcon}>
                  <View style={[styles.plusBar, styles.plusH]} />
                  <View style={[styles.plusBar, styles.plusV]} />
                </View>
                <Text style={styles.pickBtn}>一键选取曲目重点</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.multiline}
              value={focus}
              onChangeText={setFocus}
              placeholder={'如:左手分解和弦要轻\n右手主旋律突出\n注意第9小节渐强'}
              placeholderTextColor={dark ? '#A1A1B4' : '#A6A6A6'}
              multiline
            />
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
            <View style={styles.chipRow}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
                const on = recGradeChip === n;
                return (
                  <TouchableOpacity
                    key={n}
                    style={[styles.chip, on && styles.chipOn]}
                    activeOpacity={0.85}
                    onPress={() => pickGrade(n)}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {n}级
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              style={[styles.input, {marginTop: 8}]}
              value={recLevel}
              onChangeText={t => {
                setRecLevel(t);
                setRecGradeChip(0);
              }}
              placeholder="或手写：拜厄下册 / 车尔尼599 / 考级 4 级"
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={[styles.fieldHint, {marginTop: 6}]}>
              考级场景请优先点级别按钮，保证推荐难度与所选级别一致。
            </Text>
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
                    recCategory === 'general' || recCategory === 'kaoji'
                      ? '教材推荐'
                      : '冷门'
                  }」三个方向各推荐几项。点某项可直接带入教案生成。`}
            </Text>
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
                        : recCategory === 'general' || recCategory === 'kaoji'
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
                          onPress={() => applyRecommendedPiece(it)}>
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
        <LanhuCTA
          title={mode === 'plan' ? '生成解读+教案' : '推荐曲目'}
          fontSize={dark ? 15 : 16}
          loading={mode === 'plan' ? loading : recLoading}
          onPress={mode === 'plan' ? onGenerate : onRecommend}
        />
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
    </EdgeSafeArea>
  );
}

const makeStyles = (colors, dark) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg},
    flex: {flex: 1},
    scroll: {paddingHorizontal: px(15), paddingTop: px(10), paddingBottom: px(24)},
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 15,
      marginBottom: 14,
    },
    fieldLabel: {fontSize: px(14), lineHeight: px(20), fontWeight: '600', color: colors.textPrimary},
    fieldGap: {marginTop: px(15)},
    fieldLabelIndent: {marginLeft: px(7)},
    // 蓝湖：表单卡 345×405 r10，内边距 15，顶 10 / 底 18
    formCard: {
      backgroundColor: dark ? '#040428' : '#FFFFFF',
      borderRadius: px(10),
      paddingHorizontal: px(15),
      paddingTop: px(10),
      paddingBottom: px(18),
      marginBottom: px(14),
    },
    fieldHint: {fontSize: 11.5, color: colors.primaryDark, marginTop: 4, lineHeight: 17},
    // 蓝湖：顶部 345×44 胶囊 tab，选中块 165×36
    // 蓝湖：345×44 r22，tab 165×36（左右 5 / 上下 4 / 间距 5）
    modeRow: {
      flexDirection: 'row',
      backgroundColor: dark ? '#040428' : '#FFFFFF',
      borderRadius: px(22),
      paddingVertical: px(4),
      paddingHorizontal: px(5),
      height: px(44),
      gap: px(5),
      marginBottom: px(15),
    },
    modeTab: {
      width: px(165),
      height: px(36),
      borderRadius: px(18),
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeTabOn: {backgroundColor: colors.primary},
    modeTabText: {fontSize: px(14), lineHeight: px(20), fontWeight: '400', color: dark ? '#A1A1B4' : '#6F584F'},
    modeTabTextOn: {color: '#fff', fontWeight: '500'},
    // 乐器选择卡 345×110
    instCard: {marginBottom: px(15)},
    footer: {
      backgroundColor: colors.card,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
    },
    footBtn: {
      height: 44,
      borderRadius: 22,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
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
    chipRow: {flexDirection: 'row', flexWrap: 'wrap', marginTop: px(10), gap: px(15)},
    chip: {
      width: px(50),
      height: px(24),
      borderRadius: px(4),
      backgroundColor: dark ? 'rgba(181,149,255,0.2)' : '#FFEAEF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipOn: {backgroundColor: colors.primary},
    chipText: {fontSize: px(12), lineHeight: px(17), fontWeight: '500', color: dark ? '#B595FF' : '#FF355F'},
    chipTextOn: {color: '#fff'},
    input: {
      marginTop: px(10),
      height: px(44),
      borderRadius: px(8),
      backgroundColor: dark ? '#131444' : '#FAFAFA',
      paddingHorizontal: px(12),
      paddingVertical: 0,
      fontSize: px(14),
      color: colors.textPrimary,
    },
    focusHead: {
      marginTop: px(11),
      height: px(24),
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    focusLabel: {marginTop: px(4)},
    // 蓝湖：130×24 r4，图标 16 (8,4)，文字 (27,3.5) 12/500
    pickPill: {
      width: px(130),
      height: px(24),
      borderRadius: px(4),
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: px(8),
      backgroundColor: dark ? 'rgba(181,149,255,0.2)' : 'rgba(255,53,95,0.1)',
    },
    plusIcon: {width: px(16), height: px(16), marginRight: px(3)},
    plusBar: {position: 'absolute', backgroundColor: dark ? '#B595FF' : '#FF355F'},
    plusH: {left: px(3), top: px(7), width: px(10), height: px(1.5)},
    plusV: {left: px(7), top: px(3), width: px(1.5), height: px(10)},
    pickBtn: {fontSize: px(12), lineHeight: px(17), fontWeight: '500', color: dark ? '#B595FF' : '#FF355F'},
    multiline: {
      marginTop: px(10),
      height: px(100),
      borderRadius: px(8),
      backgroundColor: dark ? '#131444' : '#FAFAFA',
      paddingHorizontal: px(12),
      paddingTop: px(12),
      paddingBottom: px(4),
      fontSize: px(14),
      lineHeight: px(24),
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
