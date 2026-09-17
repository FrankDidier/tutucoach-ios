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
  PanResponder,
  Alert,
  useWindowDimensions,
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

function EditableDivider({divider, pageW, pageH, onChange, onDelete}) {
  const liveRef = useRef(Number(divider.x) || 0.5);
  const startRef = useRef(liveRef.current);
  const pageWRef = useRef(pageW);
  const [liveX, setLiveX] = useState(liveRef.current);

  useEffect(() => {
    pageWRef.current = pageW;
  }, [pageW]);

  useEffect(() => {
    const next = Number(divider.x) || 0.5;
    liveRef.current = next;
    setLiveX(next);
  }, [divider.x, divider.id]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = liveRef.current;
      },
      onPanResponderMove: (_, g) => {
        const next = clamp(
          startRef.current + g.dx / Math.max(1, pageWRef.current),
          0.02,
          0.98,
        );
        liveRef.current = next;
        setLiveX(next);
      },
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) < 5 && Math.abs(g.dy) < 5) {
          onDelete(divider.id);
          return;
        }
        onChange(divider.id, liveRef.current);
      },
    }),
  ).current;

  // 只跨它所在的那一行谱表，所以是「短竖线」
  const y0 = divider.y0 != null ? Number(divider.y0) : 0.04;
  const y1 = divider.y1 != null ? Number(divider.y1) : 0.96;
  const top = Math.max(0, y0 * pageH);
  const height = Math.max(24, (y1 - y0) * pageH);

  return (
    <View
      {...responder.panHandlers}
      style={[styles.dividerHitV, {left: liveX * pageW - 15, top, height}]}>
      <View style={styles.dividerLineV} />
    </View>
  );
}

function DrawLayer({pageIdx, pageW, pageH, onDraw}) {
  const startRef = useRef({x: 0, y: 0});
  const [ghost, setGhost] = useState(null);
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const {locationX, locationY} = e.nativeEvent;
        startRef.current = {x: locationX, y: locationY};
        setGhost({x: locationX, y0: locationY, y1: locationY});
      },
      onPanResponderMove: (e, g) => {
        const y = startRef.current.y + g.dy;
        setGhost({
          x: startRef.current.x,
          y0: Math.min(startRef.current.y, y),
          y1: Math.max(startRef.current.y, y),
        });
      },
      onPanResponderRelease: (_, g) => {
        const sx = startRef.current.x;
        const sy = startRef.current.y;
        const ey = sy + g.dy;
        setGhost(null);
        const y0 = Math.min(sy, ey);
        const y1 = Math.max(sy, ey);
        onDraw(pageIdx, {
          x: clamp(sx / Math.max(1, pageW), 0.02, 0.98),
          y0: clamp(y0 / Math.max(1, pageH), 0, 0.98),
          y1: clamp(Math.max(y1, y0 + 28) / Math.max(1, pageH), 0.02, 1),
        });
      },
    }),
  ).current;

  return (
    <View
      {...responder.panHandlers}
      style={[styles.drawLayer, {width: pageW, height: pageH}]}>
      {ghost ? (
        <View
          style={[
            styles.dividerLineV,
            {
              position: 'absolute',
              left: ghost.x - 1.5,
              top: ghost.y0,
              height: Math.max(24, ghost.y1 - ghost.y0),
            },
          ]}
        />
      ) : null}
    </View>
  );
}

function EditableBox({box, pageW, pageH, onOpen, onChange}) {
  const liveRef = useRef({x: box.x || 0, y: box.y || 0, w: box.w || 0.84, h: box.h || 0.1});
  const startRef = useRef({...liveRef.current});
  const modeRef = useRef('move');
  const [live, setLive] = useState(liveRef.current);

  useEffect(() => {
    const next = {x: box.x || 0, y: box.y || 0, w: box.w || 0.84, h: box.h || 0.1};
    liveRef.current = next;
    setLive(next);
  }, [box.x, box.y, box.w, box.h, box.id]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: evt => {
        startRef.current = {...liveRef.current};
        const {locationX, locationY} = evt.nativeEvent;
        const w = (liveRef.current.w || 0.84) * pageW;
        const h = (liveRef.current.h || 0.1) * pageH;
        modeRef.current = locationX > w - 28 && locationY > h - 28 ? 'resize' : 'move';
      },
      onPanResponderMove: (_, g) => {
        let next;
        if (modeRef.current === 'resize') {
          next = {
            ...startRef.current,
            w: clamp(startRef.current.w + g.dx / pageW, 0.12, 0.95),
            h: clamp(startRef.current.h + g.dy / pageH, 0.06, 0.5),
          };
        } else {
          next = {
            ...startRef.current,
            x: clamp(startRef.current.x + g.dx / pageW, 0, 0.92),
            y: clamp(startRef.current.y + g.dy / pageH, 0, 0.92),
          };
        }
        liveRef.current = next;
        setLive(next);
      },
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) {
          onOpen(box);
          return;
        }
        onChange(box.id, liveRef.current);
      },
    }),
  ).current;

  return (
    <View
      {...responder.panHandlers}
      style={[
        styles.box,
        {
          left: (live.x || 0) * pageW,
          top: (live.y || 0) * pageH,
          width: clamp(live.w || 0.5, 0.12, 0.95) * pageW,
          height: clamp(live.h || 0.1, 0.06, 0.5) * pageH,
        },
      ]}>
      <Text style={styles.boxLabel} numberOfLines={2}>
        {box.label || '重点'}
      </Text>
      <View style={styles.handle} />
    </View>
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
  const [drawMode, setDrawMode] = useState(false);
  const [naturalSizes, setNaturalSizes] = useState({});
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [termOpen, setTermOpen] = useState(false);
  const [termIdx, setTermIdx] = useState(-1);
  const [termKey, setTermKey] = useState('');
  const [termValue, setTermValue] = useState('');

  const load = async () => {
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
      const r = await suggestScore(getDeviceId(), studentId, pieceName, lines);
      if (r?.ok) {
        setManifest(prev => ({
          ...(prev || {}),
          annotations: Array.isArray(r.annotations) ? r.annotations : [],
          dividers: normDividers(r.dividers),
        }));
        setDividers(normDividers(r.dividers));
        if (Array.isArray(r.term_translations)) {
          setTerms(r.term_translations);
        }
        if (Array.isArray(r.term_overlays)) {
          setTermOverlays(r.term_overlays);
        }
        Alert.alert(
          '已生成分段线',
          '每行谱表上有一条橙色短竖线：左右拖到段落结尾，点一下可删除；也可用「手指划线」自己画。完成后点「按分段线生成重点框」。',
        );
      } else {
        Alert.alert('生成失败', 'AI 暂时没生成出分段线，请稍后再试。');
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
      Alert.alert('提示', '请先用「手指划线」在谱子上划几条竖线，或点「AI 分段线」。');
      return;
    }
    setDrawMode(false);
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
        Alert.alert('已生成重点框', '可再拖动/点一下改文字，最后点「保存确认」。');
      } else {
        Alert.alert('生成失败', '请稍后重试。');
      }
    } catch (e) {
      Alert.alert('生成失败', '网络异常，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const changeDividerPos = (id, x) => {
    setDividers(prev => prev.map(d => (d.id === id ? {...d, x, orientation: 'v'} : d)));
  };

  const removeDivider = id => {
    Alert.alert('删除这条分段线？', '点「删除」移除；想移动请直接左右拖动它。', [
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
        label: '分段',
        ...geom,
      },
    ]);
  };

  const addDivider = pageIdx =>
    addDividerAt(pageIdx, {x: 0.5, y0: 0.08, y1: 0.24});

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

  const changeBoxGeom = (id, geom) => {
    setManifest(prev => ({
      ...(prev || {}),
      annotations: (prev?.annotations || []).map(b => (b.id === id ? {...b, ...geom} : b)),
    }));
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
      <ScrollView contentContainerStyle={ui.scroll} scrollEnabled={!drawMode}>
        <View style={ui.card}>
          <Text style={ui.title}>{pieceName || '未命名曲目'}</Text>
          <Text style={ui.sub}>学生：{studentName || studentId.slice(-6)}</Text>
          <Text style={ui.help}>
            拍照可连拍多页；相册一次多选。分段有两种方式：①「手指划线」打开后，在谱子上竖着划一小段就是一条分段线；②「AI 分段线」先自动给每行谱表一条，再左右拖。点一下线可删除。划好后点「按分段线生成重点框」。
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
            <TouchableOpacity
              style={[ui.btn, drawMode ? ui.btnDanger : ui.btnGhost]}
              onPress={() => setDrawMode(v => !v)}>
              <Text style={drawMode ? ui.btnText : ui.btnGhostText}>
                {drawMode ? '划线中·点此结束' : '手指划线'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ui.btn, ui.btnGhost]} onPress={onSuggest}>
              <Text style={ui.btnGhostText}>AI 分段线</Text>
            </TouchableOpacity>
          </View>
          <View style={ui.row}>
            <TouchableOpacity style={ui.btn} onPress={onBoxesFromDividers}>
              <Text style={ui.btnText}>按分段线生成重点框</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ui.btn, ui.btnGhost]}
              onPress={() => setDividers([])}>
              <Text style={ui.btnGhostText}>清空分段线</Text>
            </TouchableOpacity>
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
                <View style={{flexDirection: 'row', gap: 14}}>
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
                {boxes.map(box => (
                  <EditableBox
                    key={box.id}
                    box={box}
                    pageW={pageW}
                    pageH={pageH}
                    onOpen={openEdit}
                    onChange={changeBoxGeom}
                  />
                ))}
                {pageDivs.map(d => (
                  <EditableDivider
                    key={d.id}
                    divider={d}
                    pageW={pageW}
                    pageH={pageH}
                    onChange={changeDividerPos}
                    onDelete={removeDivider}
                  />
                ))}
                {drawMode ? (
                  <DrawLayer
                    pageIdx={page.index}
                    pageW={pageW}
                    pageH={pageH}
                    onDraw={addDividerAt}
                  />
                ) : null}
                {pageTerms.map(ov => {
                  const fontSize = Math.max(10, Math.min(14, (ov.h || 0.025) * pageH * 0.85));
                  return (
                    <View
                      key={ov.id || `${ov.term}_${ov.x}_${ov.y}`}
                      pointerEvents="none"
                      style={[
                        styles.termOv,
                        {
                          left: (ov.x || 0) * pageW,
                          top: (ov.y || 0) * pageH,
                          width: Math.max(32, (ov.w || 0.08) * pageW),
                          height: Math.max(16, (ov.h || 0.022) * pageH),
                          zIndex: 12,
                        },
                      ]}>
                      <Text
                        style={[styles.termOvText, {fontSize}]}
                        numberOfLines={1}
                        allowFontScaling={false}>
                        {ov.short || ov.translation || ov.term}
                      </Text>
                    </View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#FFB300',
    backgroundColor: 'rgba(255,179,0,0.18)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  boxLabel: {fontSize: 12, fontWeight: '700', color: '#4A3100'},
  handle: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 14,
    height: 14,
    borderRadius: 2,
    backgroundColor: '#FFB300',
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
  drawLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 30,
    backgroundColor: 'rgba(255,122,47,0.06)',
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
