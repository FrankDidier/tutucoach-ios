import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Image,
  ActivityIndicator,
  TextInput,
  Modal,
  Pressable,
  Alert,
  useWindowDimensions,
  Platform,
  Dimensions,
} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {getDeviceId} from '../services/device';
import {pickFromGallery, captureFromCamera} from '../services/imagePicker';
import {pickPdf} from '../services/documentPicker';
import {
  fetchScore,
  saveScore,
  suggestScore,
  boxesFromDividers,
  uploadScore,
  recognizeScoreTerms,
  recognizeTermAt,
  deleteScore,
} from '../services/score';

const SCORE_IMG_OPTS = {maxWidth: 1800, maxHeight: 2400, quality: 0.92};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function pageFrameHeight(pageW, page, natural) {
  const nw = natural?.w || 0;
  const nh = natural?.h || 0;
  if (nw > 0 && nh > 0) {
    return Math.max(160, pageW * (nh / nw));
  }
  const w = Number(page?.width) || 0;
  const h = Number(page?.height) || 0;
  if (w > 0 && h > 0) {
    const ratio = h / w;
    if (ratio >= 0.35 && ratio <= 3.5) {
      return Math.max(160, pageW * ratio);
    }
  }
  return pageW * 1.35;
}

function TapOnly({onPress, style, children}) {
  // 点一下才响应；手指一动就把事件还给滚动，线和框不会跟着跑，也能下拉。
  const start = useRef({x: 0, y: 0});
  return (
    <View
      style={style}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => false}
      onResponderTerminationRequest={() => true}
      onResponderGrant={e => {
        start.current = {x: e.nativeEvent.pageX, y: e.nativeEvent.pageY};
      }}
      onResponderRelease={e => {
        const dx = e.nativeEvent.pageX - start.current.x;
        const dy = e.nativeEvent.pageY - start.current.y;
        if (Math.hypot(dx, dy) < 12) onPress(e);
      }}>
      {children}
    </View>
  );
}

function SimpleDivider({divider, pageW, pageH, onDelete}) {
  const y0 = divider.y0 != null ? Number(divider.y0) : 0.04;
  const y1 = divider.y1 != null ? Number(divider.y1) : 0.96;
  const top = Math.max(0, y0 * pageH);
  const height = Math.max(28, (y1 - y0) * pageH);
  const left = (Number(divider.x) || 0.5) * pageW - 12;

  return (
    <TapOnly
      onPress={() => onDelete(divider.id)}
      style={[styles.dividerHitV, {left, top, height, width: 24}]}>
      <View style={styles.dividerLineV} />
    </TapOnly>
  );
}

function SimpleBox({box, pageW, pageH, onOpen}) {
  // 一段跨好几行时会有好几个方框，只有第一个写标题，其余几行留白
  const cont = !!box.cont;
  return (
    <TapOnly
      onPress={() => onOpen(box)}
      style={[
        styles.box,
        cont ? styles.boxCont : null,
        {
          left: (box.x || 0) * pageW,
          top: (box.y || 0) * pageH,
          width: clamp(box.w || 0.5, 0.06, 0.96) * pageW,
          height: clamp(box.h || 0.1, 0.05, 0.55) * pageH,
        },
      ]}>
      {cont ? null : (
        <View style={styles.boxLabelPill}>
          <Text style={styles.boxLabel} numberOfLines={1}>
            {box.label || '重点'}
          </Text>
        </View>
      )}
    </TapOnly>
  );
}

// 1.5.124 及更早存过横向分段线（只有 y），新版一律用竖线，旧数据直接丢掉。
function normDividers(arr) {
  return (Array.isArray(arr) ? arr : [])
    .filter(d => d && d.x != null)
    .map(d => ({...d, orientation: 'v'}));
}

export default function ScoreEditorScreen({navigation, route}) {
  const {colors} = useTheme();
  const ui = useMemo(() => makeStyles(colors), [colors]);
  const {width: winW} = useWindowDimensions();
  const pageW = winW - 32;
  const {studentId = '', studentName = '', pieceName = '', lines = []} = route?.params || {};
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manifest, setManifest] = useState(null);
  const [terms, setTerms] = useState([]);
  const [termOverlays, setTermOverlays] = useState([]);
  const [dividers, setDividers] = useState([]);
  const [naturalSizes, setNaturalSizes] = useState({});
  const [pendingFiles, setPendingFiles] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [termOpen, setTermOpen] = useState(false);
  const [termIdx, setTermIdx] = useState(-1);
  const [termKey, setTermKey] = useState('');
  const [termValue, setTermValue] = useState('');
  // 点谱面时做什么：'divider' 加分段线 / 'term' 认术语
  const [tapMode, setTapMode] = useState('divider');
  // 认不出来时，让老师照着 OCR 读到的字补一个
  const [askTerm, setAskTerm] = useState(null);
  const [askText, setAskText] = useState('');
  // 全屏放大看谱（眼神不好也能点准术语）
  const [zoomPage, setZoomPage] = useState(null);
  const [zoomScale, setZoomScale] = useState(1);

  const load = async () => {
    if (route?.params?.preview) {
      setManifest({
        pages: [{index: 0, name: 'preview', url: '', width: 800, height: 1400}],
        annotations: [
          {id: 'preview_box', page: 0, x: 0.06, y: 0.22, w: 0.7, h: 0.28, label: '预览重点框'},
        ],
      });
      setTerms([]);
      setTermOverlays([]);
      setDividers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await fetchScore(studentId, pieceName, getDeviceId(), 'teacher');
      const m = r?.manifest || null;
      setManifest(m);
      setTerms(Array.isArray(m?.term_translations) ? m.term_translations : []);
      setTermOverlays(Array.isArray(m?.term_overlays) ? m.term_overlays : []);
      setDividers(normDividers(m?.dividers));
      setNaturalSizes({});
    } catch (e) {
      setManifest(null);
      setTerms([]);
      setTermOverlays([]);
      setDividers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, pieceName]);

  const doUpload = async (picker, {forceReplace = false} = {}) => {
    const picked = await picker();
    if (!picked || picked.cancelled) return;
    if (picked.error) {
      Alert.alert('上传失败', '未能读取文件，请重试。');
      return;
    }
    const files = picked.files?.length
      ? picked.files
      : picked.uri
        ? [picked]
        : [];
    if (!files.length) {
      Alert.alert('上传失败', '未能读取文件，请重试。');
      return;
    }
    // 多页相册：先预览顺序（第1/2/3页），可上移下移再确认上传
    if (files.length > 1) {
      setPendingFiles({files, forceReplace});
      return;
    }
    await uploadFileList(files, forceReplace);
  };

  const uploadFileList = async (files, forceReplace = false) => {
    setBusy(true);
    try {
      const hadPages = !forceReplace && !!(manifest?.pages?.length);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const useMode = i === 0 && !hadPages ? 'replace' : 'append';
        const r = await uploadScore(getDeviceId(), studentId, pieceName, file, {
          mode: useMode,
          uploader: 'teacher',
        });
        if (r?.ok && r?.manifest) {
          setManifest(r.manifest);
          setTerms(r.manifest.term_translations || []);
          setTermOverlays(r.manifest.term_overlays || []);
        } else {
          Alert.alert('上传失败', `第 ${i + 1} 页未接受，请重试。`);
          break;
        }
      }
    } catch (e) {
      const msg = String(e?.message || e || '');
      Alert.alert(
        '上传失败',
        msg.includes('timeout') ? '上传超时，请检查网络后重试；大谱可先清空再分批上传。' : '网络异常，请稍后重试。',
      );
    } finally {
      setBusy(false);
    }
  };

  const movePending = (idx, dir) => {
    setPendingFiles(prev => {
      if (!prev) return prev;
      const next = [...prev.files];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[idx];
      next[idx] = next[j];
      next[j] = tmp;
      return {...prev, files: next};
    });
  };

  const clearAllScores = () => {
    if (!manifest?.pages?.length) {
      Alert.alert('提示', '当前没有乐谱可删。');
      return;
    }
    Alert.alert('删除全部乐谱', '将删除本曲目全部乐谱页与重点框，确认吗？', [
      {text: '取消', style: 'cancel'},
      {
        text: '清空',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const r = await deleteScore(getDeviceId(), studentId, pieceName, null);
            if (r?.ok) {
              setManifest(null);
              setTerms([]);
              setTermOverlays([]);
              Alert.alert('已清空', '可以重新拍照或从相册上传。');
            } else {
              Alert.alert('删除失败', '请稍后重试。');
            }
          } catch (e) {
            Alert.alert('删除失败', '网络异常，请稍后重试。');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const deletePage = pageIndex => {
    Alert.alert('删除本页', `确认删除第 ${pageIndex + 1} 页？`, [
      {text: '取消', style: 'cancel'},
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const r = await deleteScore(getDeviceId(), studentId, pieceName, pageIndex);
            if (r?.ok) {
              if (r.manifest) {
                setManifest(r.manifest);
                setTerms(r.manifest.term_translations || []);
                setTermOverlays(r.manifest.term_overlays || []);
              } else {
                setManifest(null);
                setTerms([]);
                setTermOverlays([]);
              }
            } else {
              Alert.alert('删除失败', '请稍后重试。');
            }
          } catch (e) {
            Alert.alert('删除失败', '网络异常，请稍后重试。');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const doCameraSequential = () => {
    const shoot = async hasPagesAlready => {
      const file = await captureFromCamera(SCORE_IMG_OPTS);
      if (!file || file.cancelled) return;
      if (file.error || !file.uri) {
        Alert.alert('上传失败', '未能读取照片。');
        return;
      }
      setBusy(true);
      try {
        const r = await uploadScore(getDeviceId(), studentId, pieceName, file, {
          mode: hasPagesAlready ? 'append' : 'replace',
          uploader: 'teacher',
        });
        if (r?.ok && r?.manifest) {
          setManifest(r.manifest);
          setTerms(r.manifest.term_translations || []);
          setTermOverlays(r.manifest.term_overlays || []);
          Alert.alert('继续拍下一页？', '按拍照顺序依次添加乐谱页。', [
            {text: '完成', style: 'cancel'},
            {text: '继续拍', onPress: () => shoot(true)},
          ]);
        } else {
          Alert.alert('上传失败', '服务端未接受该文件。');
        }
      } catch (e) {
        Alert.alert('上传失败', '网络异常，请稍后重试。');
      } finally {
        setBusy(false);
      }
    };
    shoot(!!manifest?.pages?.length);
  };

  const onSuggest = async () => {
    if (!manifest?.pages?.length) {
      Alert.alert('提示', '请先上传乐谱。');
      return;
    }
    setBusy(true);
    try {
      // 「AI 分段线」只刷新术语识别，不再自动撒线（老师点哪里加哪里）
      const r = await suggestScore(getDeviceId(), studentId, pieceName, lines);
      if (r?.ok) {
        if (Array.isArray(r.term_translations)) {
          setTerms(r.term_translations);
        }
        if (Array.isArray(r.term_overlays)) {
          setTermOverlays(r.term_overlays);
        }
        Alert.alert(
          '术语已刷新',
          '请直接点谱面加「段尾」竖线（点线可删除）。加好后点「按分段线生成重点框」。',
        );
      } else {
        Alert.alert('生成失败', '请稍后再试，或直接点谱面加分段线。');
      }
    } catch (e) {
      Alert.alert('生成失败', '网络异常，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const onBoxesFromDividers = async () => {
    if (!manifest?.pages?.length) {
      Alert.alert('提示', '请先上传乐谱。');
      return;
    }
    if (!dividers.length) {
      Alert.alert('提示', '请先点谱面加分段线，再生成重点框。');
      return;
    }
    setBusy(true);
    try {
      const r = await boxesFromDividers(getDeviceId(), studentId, pieceName, dividers, lines);
      if (r?.ok) {
        setManifest(prev => ({
          ...(prev || {}),
          annotations: Array.isArray(r.annotations) ? r.annotations : [],
        }));
        if (Array.isArray(r.dividers)) {
          setDividers(normDividers(r.dividers));
        }
        Alert.alert('已生成重点框', '每条分段线往前一个大框。点框可改文字，最后点「保存确认」。');
      } else {
        Alert.alert('生成失败', '请稍后重试。');
      }
    } catch (e) {
      Alert.alert('生成失败', '网络异常，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const removeDivider = id => {
    Alert.alert('删除这条分段线？', '点「删除」移除；想换位置请删掉后重新点谱面。', [
      {text: '取消', style: 'cancel'},
      {
        text: '删除',
        style: 'destructive',
        onPress: () => setDividers(prev => prev.filter(d => d.id !== id)),
      },
    ]);
  };

  const addDividerAt = (pageIdx, geom) => {
    setDividers(prev => [
      ...prev,
      {
        id: `d_${Date.now()}_${Math.round(Math.random() * 999)}`,
        page: pageIdx,
        orientation: 'v',
        label: '段尾',
        ...geom,
      },
    ]);
  };

  const onPageTap = (pageIdx, pageH, evt) => {
    const ne = evt?.nativeEvent || {};
    const locationX = ne.locationX;
    const locationY = ne.locationY;
    if (!(locationX >= 0) || !(locationY >= 0) || !pageH) return;
    const x = clamp(locationX / Math.max(1, pageW), 0.02, 0.98);
    const y = clamp(locationY / Math.max(1, pageH), 0.02, 0.98);
    if (tapMode === 'term') {
      recognizeAtTap(pageIdx, x, y);
      return;
    }
    // 分段线 = 前一段的终点。点哪里就立一条短竖线，不满意删了重点。
    const half = 0.045;
    addDividerAt(pageIdx, {
      x: clamp(x, 0.03, 0.97),
      y0: clamp(y - half, 0.01, 0.94),
      y1: clamp(y + half, 0.06, 0.99),
    });
  };

  // 点一下谱上没认出来的术语 → 当场识别，并记进术语库（下次同样的词不用再点）
  const recognizeAtTap = async (pageIdx, x, y, typed = '') => {
    if (route?.params?.preview) {
      Alert.alert('预览模式', '预览页不连服务器，装到手机上就能点术语识别了。');
      return;
    }
    setBusy(true);
    try {
      const r = await recognizeTermAt(
        getDeviceId(), studentId, pieceName, pageIdx, x, y, {term: typed},
      );
      if (r?.ok) {
        if (Array.isArray(r.term_overlays)) setTermOverlays(r.term_overlays);
        if (Array.isArray(r.term_translations)) setTerms(r.term_translations);
        if (r.needs_confirm) {
          Alert.alert(
            '认出来了，对吗？',
            `${r.term}：${r.translation}\n不对的话点「我来改」，改过的会记进术语库。`,
            [
              {text: '就是它', onPress: () => confirmTerm(pageIdx, x, y, r.term)},
              {
                text: '我来改',
                onPress: () => {
                  setAskText(r.term || '');
                  setAskTerm({page: pageIdx, x, y, ocr: r.ocr || '', replaceId: r.overlay?.id || ''});
                },
              },
            ],
          );
        } else {
          Alert.alert('已识别', `${r.term}：${r.translation}\n已记进术语库，以后别的曲子也认得。`);
        }
      } else if (r?.error === 'not_recognized') {
        setAskText('');
        setAskTerm({page: pageIdx, x, y, ocr: r.ocr || ''});
      } else {
        Alert.alert('识别失败', '请稍后重试，或换个位置点在术语正中间。');
      }
    } catch (e) {
      Alert.alert('识别失败', '网络异常，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  // 老师确认/改正后再学一遍，这次才写进术语库
  const confirmTerm = async (pageIdx, x, y, term, replaceId = '') => {
    if (!term) return;
    setBusy(true);
    try {
      const r = await recognizeTermAt(
        getDeviceId(), studentId, pieceName, pageIdx, x, y, {term, replaceId},
      );
      if (r?.ok) {
        if (Array.isArray(r.term_overlays)) setTermOverlays(r.term_overlays);
        if (Array.isArray(r.term_translations)) setTerms(r.term_translations);
        Alert.alert('已记住', `${r.term}：${r.translation}\n以后别的曲子出现这个词会自动认出来。`);
      } else {
        Alert.alert('保存失败', '请稍后重试。');
      }
    } catch (e) {
      Alert.alert('保存失败', '网络异常，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const addDivider = pageIdx =>
    addDividerAt(pageIdx, {x: 0.5, y0: 0.1, y1: 0.2});

  const onRecognizeTerms = async () => {
    if (!manifest?.pages?.length) {
      Alert.alert('提示', '请先上传乐谱。');
      return;
    }
    setBusy(true);
    try {
      const r = await recognizeScoreTerms(getDeviceId(), studentId, pieceName);
      if (r?.ok) {
        if (r.manifest) setManifest(r.manifest);
        setTerms(Array.isArray(r.term_translations) ? r.term_translations : []);
        setTermOverlays(Array.isArray(r.term_overlays) ? r.term_overlays : (r.manifest?.term_overlays || []));
        Alert.alert(
          '识别完成',
          (r.term_translations || []).length
            ? `已识别 ${(r.term_translations || []).length} 个术语，已直接标在谱面原文位置。`
            : '未识别到术语，可手动添加。',
        );
      } else {
        Alert.alert('识别失败', '请稍后重试，或手动添加术语。');
      }
    } catch (e) {
      Alert.alert('识别失败', '网络异常，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const openEdit = box => {
    setEditing(box);
    setLabel(box?.label || '');
    setNote(box?.note || '');
    setEditOpen(true);
  };

  const updateBox = next => {
    setManifest(prev => {
      const annotations = (prev?.annotations || []).map(b => (b.id === next.id ? next : b));
      return {...(prev || {}), annotations};
    });
  };

  const addBox = pageIdx => {
    const next = {
      id: `box_${Date.now()}`,
      page: pageIdx,
      x: 0.08,
      y: 0.16,
      w: 0.84,
      h: 0.1,
      label: '新重点',
      note: '',
      status: 'confirmed',
      kind: 'phrase',
    };
    setManifest(prev => ({
      ...(prev || {}),
      annotations: [...(prev?.annotations || []), next],
    }));
    openEdit(next);
  };

  const removeBox = () => {
    if (!editing) return;
    setManifest(prev => ({
      ...(prev || {}),
      annotations: (prev?.annotations || []).filter(b => b.id !== editing.id),
    }));
    setEditOpen(false);
  };

  const saveAll = async (approvePending = false) => {
    if (!manifest?.pages?.length) {
      Alert.alert('提示', '请先上传乐谱。');
      return;
    }
    setBusy(true);
    try {
      const annotations = (manifest.annotations || []).map(b => ({
        ...b,
        label: String(b.label || '').trim().slice(0, 18),
        note: String(b.note || '').trim().slice(0, 36),
        status: 'confirmed',
      }));
      const r = await saveScore(getDeviceId(), studentId, pieceName, annotations, terms, {
        approvePending,
        termOverlays,
        dividers,
      });
      if (r?.ok) {
        setManifest(r.manifest || {...manifest, annotations});
        if (Array.isArray(r.manifest?.dividers)) {
          setDividers(r.manifest.dividers);
        }
        Alert.alert(
          approvePending ? '已通过并发布' : '已保存',
          approvePending
            ? '学生上传的乐谱页已对学生可见。'
            : '学生端进入该曲目后即可查看乐谱和重点框。',
        );
      } else {
        Alert.alert('保存失败', '请稍后重试。');
      }
    } catch (e) {
      Alert.alert('保存失败', '网络异常，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const openTerm = (item, idx) => {
    setTermIdx(idx);
    setTermKey(item?.term || '');
    setTermValue(item?.translation || '');
    setTermOpen(true);
  };

  const saveTerm = () => {
    const term = termKey.trim();
    const translation = termValue.trim();
    if (!term || !translation) {
      Alert.alert('提示', '请填写术语和翻译。');
      return;
    }
    setTerms(prev => {
      const next = [...prev];
      const item = {term, translation};
      if (termIdx >= 0) next[termIdx] = item;
      else next.push(item);
      return next;
    });
    setTermOpen(false);
  };

  const hasPending = !!(manifest?.has_pending_review || (manifest?.pages || []).some(p => p.pending_review));

  return (
    <SafeAreaView style={ui.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
      <ScreenHeader title="乐谱上传与重点框" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={ui.scroll}>
        <View style={ui.card}>
          <Text style={ui.title}>{pieceName || '未命名曲目'}</Text>
          <Text style={ui.sub}>学生：{studentName || studentId.slice(-6)}</Text>
          <Text style={ui.help}>
            操作很简单：①点谱面某处 = 加一条「段尾」竖线；不满意就点线删除再重点。②点「按分段线生成重点框」= 从上一条线到这条线，整段（可跨好几行）都会圈进来。③点框可改文字。相册多选会先显示页序。
          </Text>
          <View style={ui.modeRow}>
            <TouchableOpacity
              style={[ui.modeBtn, tapMode === 'divider' && ui.modeBtnOn]}
              onPress={() => setTapMode('divider')}>
              <Text style={[ui.modeText, tapMode === 'divider' && ui.modeTextOn]}>
                点谱＝加分段线
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ui.modeBtn, tapMode === 'term' && ui.modeBtnOn]}
              onPress={() => setTapMode('term')}>
              <Text style={[ui.modeText, tapMode === 'term' && ui.modeTextOn]}>
                点谱＝认术语
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={ui.help}>
            {tapMode === 'term'
              ? '哪个术语没认出来，就用手指点在那串字上。认出来会直接标在谱上，并记进术语库——以后别的曲子出现同一个词，不用再点。'
              : '要补识别术语，先切到「点谱＝认术语」，再点谱上那串没认出来的字。'}
          </Text>
          <Text style={ui.help}>
            要删旧谱：每页标题右边有「删除本页」，整套删掉点下面红色的「删除全部乐谱」。
          </Text>
          {hasPending ? (
            <Text style={ui.pending}>学生有待审乐谱页，确认后点「通过并发布」。</Text>
          ) : null}
          <View style={ui.row}>
            <TouchableOpacity style={ui.btn} onPress={doCameraSequential}>
              <Text style={ui.btnText}>拍照拍谱</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ui.btn, ui.btnGhost]}
              onPress={() =>
                doUpload(() => pickFromGallery({...SCORE_IMG_OPTS, selectionLimit: 0}))
              }>
              <Text style={ui.btnGhostText}>相册多选</Text>
            </TouchableOpacity>
          </View>
          <View style={ui.row}>
            <TouchableOpacity style={ui.btn} onPress={() => doUpload(pickPdf)}>
              <Text style={ui.btnText}>上传 PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ui.btn, ui.btnGhost]} onPress={onRecognizeTerms}>
              <Text style={ui.btnGhostText}>一键识别术语</Text>
            </TouchableOpacity>
          </View>
          <View style={ui.row}>
            <TouchableOpacity style={[ui.btn, ui.btnGhost]} onPress={onSuggest}>
              <Text style={ui.btnGhostText}>刷新术语</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ui.btn} onPress={onBoxesFromDividers}>
              <Text style={ui.btnText}>按分段线生成重点框</Text>
            </TouchableOpacity>
          </View>
          <View style={ui.row}>
            <TouchableOpacity
              style={[ui.btn, ui.btnGhost]}
              onPress={() => setDividers([])}>
              <Text style={ui.btnGhostText}>清空分段线</Text>
            </TouchableOpacity>
            <View style={{flex: 1}} />
          </View>
          <View style={ui.row}>
            <TouchableOpacity style={ui.btn} onPress={() => saveAll(false)}>
              <Text style={ui.btnText}>保存确认</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ui.btn, ui.btnDanger]} onPress={clearAllScores}>
              <Text style={ui.btnText}>删除全部乐谱</Text>
            </TouchableOpacity>
          </View>
          {hasPending ? (
            <TouchableOpacity style={[ui.btn, {marginTop: 12}]} onPress={() => saveAll(true)}>
              <Text style={ui.btnText}>通过并发布学生上传</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {loading || busy ? (
          <View style={{marginTop: 24, alignItems: 'center'}}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[ui.sub, {marginTop: 8}]}>{busy ? '处理中，请稍候…' : '加载中…'}</Text>
          </View>
        ) : null}

        {(manifest?.pages || []).map(page => {
          const key = page.name || String(page.index);
          const pageH = pageFrameHeight(pageW, page, naturalSizes[key]);
          const boxes = (manifest.annotations || []).filter(b => (b.page || 0) === page.index);
          const pageDivs = (dividers || []).filter(d => (d.page || 0) === page.index);
          const pageTerms = (termOverlays || []).filter(t => (t.page || 0) === page.index);
          const badge = page.pending_review ? ' · 待审' : page.uploaded_by === 'student' ? ' · 学生补传' : '';
          return (
            <View key={key} style={ui.pageCard}>
              <View style={ui.pageHead}>
                <Text style={ui.pageTitle}>
                  第 {page.index + 1} 页{badge}
                </Text>
                <View style={{flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'flex-end'}}>
                  <TouchableOpacity
                    onPress={() => {
                      setZoomScale(1);
                      setZoomPage(page);
                    }}>
                    <Text style={ui.pageAction}>全屏放大</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deletePage(page.index)}>
                    <Text style={[ui.pageAction, {color: '#D14343'}]}>删除本页</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => addDivider(page.index)}>
                    <Text style={ui.pageAction}>＋ 加分段线</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => addBox(page.index)}>
                    <Text style={ui.pageAction}>＋ 手动加框</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{width: pageW, height: pageH}}>
                <TapOnly
                  onPress={e => onPageTap(page.index, pageH, e)}
                  style={{width: pageW, height: pageH}}>
                  {page.url ? (
                  <Image
                    source={{uri: `https://tutujiaolian.com${page.url}`}}
                    style={{width: pageW, height: pageH, borderRadius: 12}}
                    resizeMode="contain"
                    onLoad={e => {
                      const src = e?.nativeEvent?.source || {};
                      const w = Number(src.width) || 0;
                      const h = Number(src.height) || 0;
                      if (w > 0 && h > 0) {
                        setNaturalSizes(prev =>
                          prev[key]?.w === w && prev[key]?.h === h ? prev : {...prev, [key]: {w, h}},
                        );
                      }
                    }}
                  />
                  ) : (
                    <View style={{width: pageW, height: pageH, borderRadius: 12, backgroundColor: '#F4EFE6'}} />
                  )}
                </TapOnly>
                {boxes.map(box => (
                  <SimpleBox
                    key={box.id}
                    box={box}
                    pageW={pageW}
                    pageH={pageH}
                    onOpen={openEdit}
                  />
                ))}
                {pageDivs.map(d => (
                  <SimpleDivider
                    key={d.id}
                    divider={d}
                    pageW={pageW}
                    pageH={pageH}
                    onDelete={removeDivider}
                  />
                ))}
                {pageTerms.map(ov => {
                  const label = String(ov.short || ov.translation || ov.term || '');
                  const fontSize = Math.max(10, Math.min(14, (ov.h || 0.025) * pageH * 0.85));
                  const minW = Math.max(36, label.length * (fontSize * 0.95) + 10);
                  return (
                    <TapOnly
                      key={ov.id || `${ov.term}_${ov.x}_${ov.y}`}
                      onPress={() => {
                        // 标错了就点它改；改过的会记进术语库
                        setAskText(ov.term || '');
                        setAskTerm({
                          page: page.index,
                          x: (ov.x || 0) + (ov.w || 0.08) / 2,
                          y: (ov.y || 0) + (ov.h || 0.02) / 2,
                          ocr: ov.term || '',
                          replaceId: ov.id || '',
                        });
                      }}
                      style={[
                        styles.termOv,
                        {
                          left: (ov.x || 0) * pageW,
                          top: (ov.y || 0) * pageH,
                          width: Math.max(minW, (ov.w || 0.1) * pageW),
                          height: Math.max(18, (ov.h || 0.022) * pageH),
                          zIndex: 12,
                        },
                      ]}>
                      <Text
                        style={[styles.termOvText, {fontSize}]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                        allowFontScaling={false}>
                        {label}
                      </Text>
                    </TapOnly>
                  );
                })}
              </View>
            </View>
          );
        })}

        {manifest?.pages?.length ? (
          <View style={ui.card}>
            <View style={ui.pageHead}>
              <Text style={ui.section}>音乐术语（已标在谱面）</Text>
              <TouchableOpacity onPress={() => openTerm(null, -1)}>
                <Text style={ui.pageAction}>＋ 添加术语</Text>
              </TouchableOpacity>
            </View>
            <Text style={ui.help}>蓝色小条覆盖原文位置；下方列表便于核对修改。</Text>
            {terms.length ? (
              terms.map((term, idx) => (
                <TouchableOpacity key={`${term.term}_${idx}`} onPress={() => openTerm(term, idx)}>
                  <Text style={ui.termLine}>
                    {term.term}：{term.translation}
                  </Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={ui.help}>暂未自动识别到术语，可点「一键识别术语」或手动补充。</Text>
            )}
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={ui.modalMask}>
          <View style={ui.modalCard}>
            <Text style={ui.section}>编辑重点框</Text>
            <TextInput
              style={ui.input}
              value={label}
              onChangeText={setLabel}
              placeholder="重点标题"
              placeholderTextColor={colors.textSecondary}
            />
            <TextInput
              style={[ui.input, ui.noteInput]}
              value={note}
              onChangeText={setNote}
              placeholder="补充说明（可选）"
              placeholderTextColor={colors.textSecondary}
              multiline
            />
            <View style={ui.row}>
              <TouchableOpacity style={[ui.btn, ui.btnDanger]} onPress={removeBox}>
                <Text style={ui.btnText}>删除</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={ui.btn}
                onPress={() => {
                  if (editing) updateBox({...editing, label, note, status: 'confirmed'});
                  setEditOpen(false);
                }}>
                <Text style={ui.btnText}>确定</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={termOpen} transparent animationType="fade" onRequestClose={() => setTermOpen(false)}>
        <View style={ui.modalMask}>
          <View style={ui.modalCard}>
            <Text style={ui.section}>编辑术语翻译</Text>
            <TextInput
              style={ui.input}
              value={termKey}
              onChangeText={setTermKey}
              placeholder="术语"
              placeholderTextColor={colors.textSecondary}
            />
            <TextInput
              style={[ui.input, ui.noteInput]}
              value={termValue}
              onChangeText={setTermValue}
              placeholder="中文解释"
              placeholderTextColor={colors.textSecondary}
              multiline
            />
            <View style={ui.row}>
              {termIdx >= 0 ? (
                <TouchableOpacity
                  style={[ui.btn, ui.btnDanger]}
                  onPress={() => {
                    setTerms(prev => prev.filter((_, i) => i !== termIdx));
                    setTermOpen(false);
                  }}>
                  <Text style={ui.btnText}>删除</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[ui.btn, ui.btnGhost]} onPress={() => setTermOpen(false)}>
                  <Text style={ui.btnGhostText}>取消</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={ui.btn} onPress={saveTerm}>
                <Text style={ui.btnText}>确定</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!askTerm}
        transparent
        animationType="fade"
        onRequestClose={() => setAskTerm(null)}>
        <View style={ui.modalMask}>
          <View style={ui.modalCard}>
            <Text style={ui.section}>这串是什么术语？</Text>
            <Text style={ui.help}>
              {askTerm?.ocr
                ? `谱上读到的是「${askTerm.ocr}」。填对的拼写（如 dimin.），以后每首曲子都能自动认出来。`
                : '填这串术语的拼写（如 dimin.），以后每首曲子都能自动认出来。'}
            </Text>
            <TextInput
              style={[ui.input, {marginTop: 10}]}
              value={askText}
              onChangeText={setAskText}
              autoCapitalize="none"
              placeholder="术语原文，例如 dimin."
              placeholderTextColor={colors.textSecondary}
            />
            <View style={ui.row}>
              <TouchableOpacity
                style={[ui.btn, ui.btnGhost]}
                onPress={() => setAskTerm(null)}>
                <Text style={ui.btnGhostText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={ui.btn}
                onPress={() => {
                  const pack = askTerm;
                  const txt = askText.trim();
                  setAskTerm(null);
                  if (pack && txt) {
                    confirmTerm(pack.page, pack.x, pack.y, txt, pack.replaceId || '');
                  }
                }}>
                <Text style={ui.btnText}>记进术语库</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!pendingFiles}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingFiles(null)}>
        <View style={ui.modalMask}>
          <View style={[ui.modalCard, {maxHeight: '80%'}]}>
            <Text style={ui.section}>确认乐谱页序</Text>
            <Text style={ui.help}>按第 1、2、3… 页顺序上传。点「上移/下移」调整。</Text>
            <ScrollView style={{maxHeight: 360}}>
              {(pendingFiles?.files || []).map((f, idx) => (
                <View key={`${f.uri || idx}_${idx}`} style={styles.orderRow}>
                  <Text style={styles.orderBadge}>{idx + 1}</Text>
                  <Image
                    source={{uri: f.uri}}
                    style={styles.orderThumb}
                    resizeMode="cover"
                  />
                  <View style={{flex: 1}}>
                    <Text style={ui.sub} numberOfLines={1}>
                      第 {idx + 1} 页
                    </Text>
                    <View style={{flexDirection: 'row', gap: 10, marginTop: 6}}>
                      <TouchableOpacity onPress={() => movePending(idx, -1)}>
                        <Text style={ui.pageAction}>上移</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => movePending(idx, 1)}>
                        <Text style={ui.pageAction}>下移</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={ui.row}>
              <TouchableOpacity
                style={[ui.btn, ui.btnGhost]}
                onPress={() => setPendingFiles(null)}>
                <Text style={ui.btnGhostText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={ui.btn}
                onPress={async () => {
                  const pack = pendingFiles;
                  setPendingFiles(null);
                  if (pack?.files?.length) {
                    await uploadFileList(pack.files, !!pack.forceReplace);
                  }
                }}>
                <Text style={ui.btnText}>按此顺序上传</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!zoomPage}
        animationType="slide"
        onRequestClose={() => setZoomPage(null)}>
        <View style={styles.zoomMask}>
          <View style={styles.zoomTop}>
            <Text style={styles.zoomTitle}>
              第 {(zoomPage?.index || 0) + 1} 页 · 双指缩放
            </Text>
            <TouchableOpacity onPress={() => setZoomPage(null)}>
              <Text style={styles.zoomClose}>关闭</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.zoomHint}>
            {tapMode === 'term'
              ? '当前：点谱面＝认术语（放大后更好点准）'
              : '当前：点谱面＝加分段线；也可先切到「认术语」再放大点'}
          </Text>
          {zoomPage ? (() => {
            const zw = Dimensions.get('window').width;
            const zh = pageFrameHeight(zw, zoomPage, naturalSizes[zoomPage.name || String(zoomPage.index)]);
            const pageTerms = (termOverlays || []).filter(t => (t.page || 0) === zoomPage.index);
            const boxes = (manifest?.annotations || []).filter(b => (b.page || 0) === zoomPage.index);
            const pageDivs = (dividers || []).filter(d => (d.page || 0) === zoomPage.index);
            const content = (
              <View style={{width: zw * zoomScale, height: zh * zoomScale}}>
                <TapOnly
                  onPress={e => {
                    const loc = e?.nativeEvent?.locationX != null
                      ? {locationX: e.nativeEvent.locationX / zoomScale, locationY: e.nativeEvent.locationY / zoomScale}
                      : null;
                    if (!loc) return;
                    onPageTap(zoomPage.index, zh, {nativeEvent: loc});
                  }}
                  style={{width: zw * zoomScale, height: zh * zoomScale}}>
                  {zoomPage.url ? (
                    <Image
                      source={{uri: `https://tutujiaolian.com${zoomPage.url}`}}
                      style={{width: zw * zoomScale, height: zh * zoomScale}}
                      resizeMode="contain"
                    />
                  ) : null}
                </TapOnly>
                {boxes.map(box => (
                  <SimpleBox
                    key={box.id}
                    box={box}
                    pageW={zw * zoomScale}
                    pageH={zh * zoomScale}
                    onOpen={b => {
                      setZoomPage(null);
                      openEdit(b);
                    }}
                  />
                ))}
                {pageDivs.map(d => (
                  <SimpleDivider
                    key={d.id}
                    divider={d}
                    pageW={zw * zoomScale}
                    pageH={zh * zoomScale}
                    onDelete={removeDivider}
                  />
                ))}
                {pageTerms.map(ov => {
                  const label = String(ov.short || ov.translation || ov.term || '');
                  const fontSize = Math.max(11, Math.min(16, (ov.h || 0.025) * zh * zoomScale * 0.85));
                  const minW = Math.max(40, label.length * (fontSize * 0.95) + 10);
                  return (
                    <TapOnly
                      key={ov.id || `${ov.term}_${ov.x}_${ov.y}`}
                      onPress={() => {
                        setAskText(ov.term || '');
                        setAskTerm({
                          page: zoomPage.index,
                          x: (ov.x || 0) + (ov.w || 0.08) / 2,
                          y: (ov.y || 0) + (ov.h || 0.02) / 2,
                          ocr: ov.term || '',
                          replaceId: ov.id || '',
                        });
                      }}
                      style={[
                        styles.termOv,
                        {
                          left: (ov.x || 0) * zw * zoomScale,
                          top: (ov.y || 0) * zh * zoomScale,
                          width: Math.max(minW, (ov.w || 0.1) * zw * zoomScale),
                          height: Math.max(20, (ov.h || 0.022) * zh * zoomScale),
                          zIndex: 12,
                        },
                      ]}>
                      <Text style={[styles.termOvText, {fontSize}]} numberOfLines={1}>
                        {label}
                      </Text>
                    </TapOnly>
                  );
                })}
              </View>
            );
            return (
              <ScrollView
                style={{flex: 1}}
                contentContainerStyle={{alignItems: 'center'}}
                maximumZoomScale={Platform.OS === 'ios' ? 4 : 1}
                minimumZoomScale={1}
                bouncesZoom
                centerContent>
                {content}
              </ScrollView>
            );
          })() : null}
          {Platform.OS === 'android' ? (
            <View style={styles.zoomTools}>
              <TouchableOpacity onPress={() => setZoomScale(s => Math.max(1, +(s - 0.4).toFixed(1)))}>
                <Text style={styles.zoomTool}>缩小</Text>
              </TouchableOpacity>
              <Text style={styles.zoomTool}>{Math.round(zoomScale * 100)}%</Text>
              <TouchableOpacity onPress={() => setZoomScale(s => Math.min(3.5, +(s + 0.4).toFixed(1)))}>
                <Text style={styles.zoomTool}>放大</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{height: 24}} />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(232, 156, 48, 0.85)',
    backgroundColor: 'rgba(255, 196, 77, 0.12)',
    borderRadius: 10,
  },
  boxCont: {
    borderColor: 'rgba(232, 156, 48, 0.55)',
    backgroundColor: 'rgba(255, 196, 77, 0.07)',
  },
  boxLabelPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    marginLeft: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 248, 230, 0.92)',
  },
  boxLabel: {fontSize: 11, fontWeight: '700', color: '#6B4A12'},
  handle: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 14,
    height: 14,
    borderRadius: 2,
    backgroundColor: '#FFB300',
  },
  zoomMask: {
    flex: 1,
    backgroundColor: '#0B0B0B',
  },
  zoomTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 54,
    paddingBottom: 10,
  },
  zoomTitle: {color: '#fff', fontSize: 15, fontWeight: '700'},
  zoomClose: {color: '#fff', fontSize: 15, fontWeight: '700'},
  zoomTools: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    paddingBottom: 18,
    paddingTop: 8,
  },
  zoomTool: {color: '#fff', fontSize: 15, fontWeight: '700', paddingHorizontal: 8},
  zoomHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 10,
  },
  dividerHit: {
    position: 'absolute',
    left: 0,
    height: 28,
    justifyContent: 'center',
    zIndex: 20,
  },
  dividerLine: {
    height: 3,
    backgroundColor: '#FF7A2F',
    borderRadius: 2,
    marginHorizontal: 4,
  },
  dividerLabel: {
    position: 'absolute',
    right: 8,
    top: 4,
    fontSize: 10,
    fontWeight: '700',
    color: '#FF7A2F',
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  dividerHitV: {
    position: 'absolute',
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  dividerLineV: {
    width: 3,
    flex: 1,
    alignSelf: 'center',
    backgroundColor: '#FF7A2F',
    borderRadius: 2,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  orderBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#7B61FF',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
    fontWeight: '800',
    fontSize: 14,
  },
  orderThumb: {
    width: 56,
    height: 72,
    borderRadius: 8,
    backgroundColor: '#222',
  },
  termOv: {
    position: 'absolute',
    backgroundColor: 'rgba(64, 156, 255, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(30, 110, 210, 0.95)',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    overflow: 'hidden',
  },
  termOvText: {
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: {width: 0, height: 0.5},
    textShadowRadius: 1,
  },
});

const makeStyles = colors =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg},
    scroll: {padding: 16, paddingBottom: 32},
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
    },
    title: {fontSize: 17, fontWeight: '800', color: colors.textPrimary},
    sub: {fontSize: 12.5, color: colors.textSecondary, marginTop: 4},
    help: {fontSize: 12.5, lineHeight: 19, color: colors.textSecondary, marginTop: 8},
    pending: {
      marginTop: 10,
      padding: 10,
      borderRadius: 10,
      backgroundColor: colors.bg,
      color: colors.textPrimary,
      fontSize: 12.5,
      lineHeight: 18,
    },
    row: {flexDirection: 'row', gap: 10, marginTop: 12},
    modeRow: {flexDirection: 'row', gap: 10, marginTop: 12},
    modeBtn: {
      flex: 1,
      height: 38,
      borderRadius: 19,
      borderWidth: 1.5,
      borderColor: colors.cardBorder,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeBtnOn: {borderColor: colors.primary, backgroundColor: colors.primary},
    modeText: {fontSize: 13, fontWeight: '700', color: colors.textSecondary},
    modeTextOn: {color: '#fff'},
    btn: {
      flex: 1,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnGhost: {backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.cardBorder},
    btnDanger: {backgroundColor: '#D14343'},
    btnText: {color: '#fff', fontSize: 14, fontWeight: '700'},
    btnGhostText: {color: colors.textPrimary, fontSize: 14, fontWeight: '700'},
    pageCard: {marginBottom: 16},
    pageHead: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8},
    pageTitle: {fontSize: 14, fontWeight: '700', color: colors.textPrimary},
    pageAction: {fontSize: 13, fontWeight: '700', color: colors.accent},
    section: {fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginBottom: 10},
    termLine: {fontSize: 13.5, lineHeight: 20, color: colors.textPrimary, marginBottom: 8},
    modalMask: {flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 20},
    modalCard: {backgroundColor: colors.card, borderRadius: 16, padding: 16},
    input: {
      backgroundColor: colors.bg,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      marginBottom: 10,
    },
    noteInput: {minHeight: 88, textAlignVertical: 'top'},
  });
