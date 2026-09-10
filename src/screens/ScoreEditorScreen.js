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
  uploadScore,
  recognizeScoreTerms,
} from '../services/score';

const SCORE_IMG_OPTS = {maxWidth: 1800, maxHeight: 2400, quality: 0.92};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
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
    } catch (e) {
      setManifest(null);
      setTerms([]);
      setTermOverlays([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, pieceName]);

  const doUpload = async picker => {
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
      const hadPages = !!(manifest?.pages?.length);
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
      Alert.alert('上传失败', '网络异常，请稍后重试。');
    } finally {
      setBusy(false);
    }
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
        }));
        if (Array.isArray(r.term_translations)) {
          setTerms(r.term_translations);
        }
        if (Array.isArray(r.term_overlays)) {
          setTermOverlays(r.term_overlays);
        }
      } else {
        Alert.alert('生成失败', 'AI 暂时没生成出建议框，请稍后再试。');
      }
    } catch (e) {
      Alert.alert('生成失败', '网络异常，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

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
      });
      if (r?.ok) {
        setManifest(r.manifest || {...manifest, annotations});
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
            拍照可连拍多页；相册一次多选（按选中顺序为第1、2、3…页）。框可拖动，右下角缩放；点一下改文字。
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
              <Text style={ui.btnGhostText}>AI 乐句/乐段框</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ui.btn} onPress={() => saveAll(false)}>
              <Text style={ui.btnText}>保存确认</Text>
            </TouchableOpacity>
          </View>
          {hasPending ? (
            <TouchableOpacity style={[ui.btn, {marginTop: 12}]} onPress={() => saveAll(true)}>
              <Text style={ui.btnText}>通过并发布学生上传</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {loading || busy ? (
          <ActivityIndicator color={colors.primary} style={{marginTop: 24}} />
        ) : null}

        {(manifest?.pages || []).map(page => {
          const pageH = page.width ? Math.max(120, pageW * (page.height / page.width)) : pageW * 1.35;
          const boxes = (manifest.annotations || []).filter(b => (b.page || 0) === page.index);
          const pageTerms = (termOverlays || []).filter(t => (t.page || 0) === page.index);
          const badge = page.pending_review ? ' · 待审' : page.uploaded_by === 'student' ? ' · 学生补传' : '';
          return (
            <View key={page.name} style={ui.pageCard}>
              <View style={ui.pageHead}>
                <Text style={ui.pageTitle}>
                  第 {page.index + 1} 页{badge}
                </Text>
                <TouchableOpacity onPress={() => addBox(page.index)}>
                  <Text style={ui.pageAction}>＋ 手动加框</Text>
                </TouchableOpacity>
              </View>
              <View style={{width: pageW, height: pageH}}>
                <Image
                  source={{uri: `https://tutujiaolian.com${page.url}`}}
                  style={{width: pageW, height: pageH, borderRadius: 12}}
                  resizeMode="contain"
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
                {pageTerms.map(ov => {
                  const fontSize = Math.max(9, Math.min(15, (ov.h || 0.025) * pageH * 0.75));
                  return (
                    <View
                      key={ov.id || `${ov.term}_${ov.x}_${ov.y}`}
                      pointerEvents="none"
                      style={[
                        styles.termOv,
                        {
                          left: (ov.x || 0) * pageW,
                          top: (ov.y || 0) * pageH,
                          width: Math.max(28, (ov.w || 0.06) * pageW),
                          height: Math.max(12, (ov.h || 0.02) * pageH),
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
  termOv: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderWidth: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  termOvText: {
    fontWeight: '500',
    color: '#1A3A4A',
    textShadowColor: 'rgba(255,255,255,0.92)',
    textShadowOffset: {width: 0.6, height: 0.6},
    textShadowRadius: 1.5,
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
