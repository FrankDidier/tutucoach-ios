import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  useWindowDimensions,
} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {fetchScore, uploadScore, deleteScore} from '../services/score';
import {getDeviceId} from '../services/device';
import {pickFromGallery, captureFromCamera} from '../services/imagePicker';

const SCORE_IMG_OPTS = {maxWidth: 1800, maxHeight: 2400, quality: 0.92};

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

export default function ScoreViewerScreen({navigation, route}) {
  const {colors} = useTheme();
  const ui = useMemo(() => makeStyles(colors), [colors]);
  const {width: winW} = useWindowDimensions();
  const pageW = winW - 32;
  const {studentId = '', pieceName = ''} = route?.params || {};
  const sid = studentId || getDeviceId();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manifest, setManifest] = useState(null);
  const [naturalSizes, setNaturalSizes] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchScore(sid, pieceName, '', 'student');
      setManifest(r?.manifest || null);
      setNaturalSizes({});
    } catch (e) {
      setManifest(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceName, studentId]);

  const onStudentUpload = () => {
    Alert.alert('上传乐谱', '请选择来源', [
      {
        text: '拍照拍谱（可连拍）',
        onPress: () => doStudentCamera(false),
      },
      {
        text: '从相册多选',
        onPress: () => doStudentUpload(() => pickFromGallery({...SCORE_IMG_OPTS, selectionLimit: 0})),
      },
      {text: '取消', style: 'cancel'},
    ]);
  };

  const doStudentCamera = async hasPagesAlready => {
    const file = await captureFromCamera(SCORE_IMG_OPTS);
    if (!file || file.cancelled) return;
    if (file.error || !file.uri) {
      Alert.alert('上传失败', file.error === 'permission' ? '请在设置中允许相机/相册权限。' : '未能读取照片。');
      return;
    }
    setBusy(true);
    try {
      const r = await uploadScore('', sid, pieceName, file, {
        mode: 'append',
        uploader: 'student',
      });
      if (r?.ok) {
        await load();
        Alert.alert('已上传', '这一页已加进乐谱，翻译好的术语马上就能看。继续拍下一页？', [
          {text: '完成', style: 'cancel'},
          {text: '继续拍', onPress: () => doStudentCamera(true)},
        ]);
      } else {
        Alert.alert('上传失败', '请稍后重试。');
      }
    } catch (e) {
      Alert.alert('上传失败', '网络异常，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const doStudentUpload = async picker => {
    const picked = await picker();
    if (!picked || picked.cancelled) return;
    if (picked.error) {
      Alert.alert('上传失败', picked.error === 'permission' ? '请在设置中允许相机/相册权限。' : '未能读取照片。');
      return;
    }
    const files = picked.files?.length ? picked.files : picked.uri ? [picked] : [];
    if (!files.length) {
      Alert.alert('上传失败', '未能读取照片。');
      return;
    }
    setBusy(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const r = await uploadScore('', sid, pieceName, files[i], {
          mode: 'append',
          uploader: 'student',
        });
        if (!r?.ok) {
          Alert.alert('上传失败', `第 ${i + 1} 页失败，请稍后重试。`);
          return;
        }
      }
      Alert.alert('已上传', `${files.length} 页已加进乐谱，翻译好的术语马上就能看。`);
      load();
    } catch (e) {
      Alert.alert('上传失败', '网络异常，请稍后重试。');
    } finally {
      setBusy(false);
    }
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
            const r = await deleteScore('', sid, pieceName, pageIndex);
            if (r?.ok) {
              setManifest(r.manifest || null);
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

  const deleteAll = () => {
    if (!manifest?.pages?.length) {
      Alert.alert('提示', '当前没有乐谱可删。');
      return;
    }
    Alert.alert('删除全部乐谱', '将删除本曲目全部乐谱页，确认吗？', [
      {text: '取消', style: 'cancel'},
      {
        text: '全部删除',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const r = await deleteScore('', sid, pieceName, null);
            if (r?.ok) {
              setManifest(null);
              setNaturalSizes({});
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

  return (
    <SafeAreaView style={ui.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
      <ScreenHeader title="乐谱重点" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={ui.scroll}>
        <Text style={ui.title}>{pieceName || '当前曲目'}</Text>
        <Text style={ui.hint}>
          补拍的乐谱页会立刻加进来并翻译术语；要删旧谱：每页右边「删除本页」，或点下方「删除全部乐谱」。
        </Text>
        <TouchableOpacity style={ui.uploadBtn} onPress={onStudentUpload} disabled={busy}>
          <Text style={ui.uploadText}>{busy ? '处理中…' : '拍照/选图上传乐谱'}</Text>
        </TouchableOpacity>
        {(manifest?.pages || []).length ? (
          <TouchableOpacity style={ui.dangerBtn} onPress={deleteAll} disabled={busy}>
            <Text style={ui.dangerText}>删除全部乐谱</Text>
          </TouchableOpacity>
        ) : null}
        {loading ? <ActivityIndicator color={colors.primary} style={{marginTop: 24}} /> : null}
        {!loading && !manifest?.pages?.length ? (
          <Text style={ui.empty}>这首曲目还没有乐谱。拍照上传后马上就能看到翻译好的术语。</Text>
        ) : null}
        {(manifest?.pages || []).map(page => {
          const key = page.name || String(page.index);
          const pageH = pageFrameHeight(pageW, page, naturalSizes[key]);
          const boxes = (manifest.confirmed_annotations || manifest.annotations || []).filter(
            b => (b.page || 0) === page.index,
          );
          const pageTerms = (manifest.term_overlays || []).filter(t => (t.page || 0) === page.index);
          return (
            <View key={key} style={ui.pageCard}>
              <View style={ui.pageHead}>
                <Text style={ui.pageTitle}>第 {page.index + 1} 页</Text>
                <TouchableOpacity onPress={() => deletePage(page.index)}>
                  <Text style={ui.deleteLink}>删除本页</Text>
                </TouchableOpacity>
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
                  <View
                    key={box.id}
                    style={[
                      ui.box,
                      {
                        left: (box.x || 0) * pageW,
                        top: (box.y || 0) * pageH,
                        width: (box.w || 0.84) * pageW,
                        height: (box.h || 0.1) * pageH,
                      },
                    ]}>
                    <Text style={ui.boxLabel}>{box.label}</Text>
                  </View>
                ))}
                {pageTerms.map(ov => {
                  const fontSize = Math.max(10, Math.min(14, (ov.h || 0.025) * pageH * 0.85));
                  return (
                    <View
                      key={ov.id || `${ov.term}_${ov.x}_${ov.y}`}
                      pointerEvents="none"
                      style={[
                        ui.termOv,
                        {
                          left: (ov.x || 0) * pageW,
                          top: (ov.y || 0) * pageH,
                          width: Math.max(32, (ov.w || 0.08) * pageW),
                          height: Math.max(16, (ov.h || 0.022) * pageH),
                          zIndex: 12,
                        },
                      ]}>
                      <Text
                        style={[ui.termOvText, {fontSize}]}
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
        {(manifest?.term_translations || []).length ? (
          <View style={ui.termCard}>
            <Text style={ui.termTitle}>音乐术语（已标在谱面）</Text>
            <Text style={ui.hint}>蓝色小条覆盖在原文位置；下方为完整列表。</Text>
            {(manifest.term_translations || []).map((term, idx) => (
              <Text key={`${term.term}_${idx}`} style={ui.termLine}>
                {term.term}：{term.translation}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = colors =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg},
    scroll: {padding: 16, paddingBottom: 28},
    title: {fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginBottom: 8},
    hint: {fontSize: 12.5, lineHeight: 18, color: colors.textSecondary, marginBottom: 10},
    uploadBtn: {
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    uploadText: {color: '#fff', fontSize: 14, fontWeight: '700'},
    dangerBtn: {
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: '#D14343',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    dangerText: {color: '#D14343', fontSize: 14, fontWeight: '700'},
    empty: {fontSize: 14, color: colors.textSecondary, marginTop: 18, lineHeight: 22},
    pageCard: {marginBottom: 16},
    pageHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8},
    pageTitle: {fontSize: 14, fontWeight: '700', color: colors.textPrimary},
    deleteLink: {fontSize: 13, fontWeight: '700', color: '#D14343'},
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
    termCard: {backgroundColor: colors.card, borderRadius: 16, padding: 16, marginTop: 6},
    termTitle: {fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginBottom: 6},
    termLine: {fontSize: 13.5, lineHeight: 20, color: colors.textPrimary, marginBottom: 8},
  });
