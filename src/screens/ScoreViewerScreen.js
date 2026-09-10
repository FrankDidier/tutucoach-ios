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
import {fetchScore, uploadScore} from '../services/score';
import {getDeviceId} from '../services/device';
import {pickFromGallery, captureFromCamera} from '../services/imagePicker';

const SCORE_IMG_OPTS = {maxWidth: 1800, maxHeight: 2400, quality: 0.92};

export default function ScoreViewerScreen({navigation, route}) {
  const {colors} = useTheme();
  const ui = useMemo(() => makeStyles(colors), [colors]);
  const {width: winW} = useWindowDimensions();
  const pageW = winW - 32;
  const {studentId = '', pieceName = ''} = route?.params || {};
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manifest, setManifest] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchScore(studentId || getDeviceId(), pieceName, '', 'student');
      setManifest(r?.manifest || null);
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
    Alert.alert('上传乐谱给老师', '请选择来源', [
      {
        text: '拍照拍谱',
        onPress: () => doStudentUpload(() => captureFromCamera(SCORE_IMG_OPTS)),
      },
      {
        text: '从相册选择',
        onPress: () => doStudentUpload(() => pickFromGallery(SCORE_IMG_OPTS)),
      },
      {text: '取消', style: 'cancel'},
    ]);
  };

  const doStudentUpload = async picker => {
    const file = await picker();
    if (!file || file.cancelled) return;
    if (file.error || !file.uri) {
      Alert.alert('上传失败', file.error === 'permission' ? '请在设置中允许相机/相册权限。' : '未能读取照片。');
      return;
    }
    setBusy(true);
    try {
      const r = await uploadScore('', studentId || getDeviceId(), pieceName, file, {
        mode: 'append',
        uploader: 'student',
      });
      if (r?.ok) {
        Alert.alert('已提交', '已发给老师审核，通过后才会显示在乐谱里。');
        load();
      } else {
        Alert.alert('上传失败', r?.error === 'missing_teacher' ? '还没绑定老师，请先让老师把你加入班级。' : '请稍后重试。');
      }
    } catch (e) {
      Alert.alert('上传失败', '网络异常，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={ui.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
      <ScreenHeader title="乐谱重点" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={ui.scroll}>
        <Text style={ui.title}>{pieceName || '当前曲目'}</Text>
        <Text style={ui.hint}>可补拍乐谱页发给老师审核；陪练语音不会因看谱中断。</Text>
        <TouchableOpacity style={ui.uploadBtn} onPress={onStudentUpload} disabled={busy}>
          <Text style={ui.uploadText}>{busy ? '上传中…' : '拍照/选图上传给老师'}</Text>
        </TouchableOpacity>
        {loading ? <ActivityIndicator color={colors.primary} style={{marginTop: 24}} /> : null}
        {!loading && !manifest?.pages?.length ? (
          <Text style={ui.empty}>这首曲目还没有老师发布的乐谱。你可以先拍照上传，老师审核后就会出现在这里。</Text>
        ) : null}
        {(manifest?.pages || []).map(page => {
          const pageH = page.width ? Math.max(120, pageW * (page.height / page.width)) : pageW * 1.35;
          const boxes = (manifest.confirmed_annotations || manifest.annotations || []).filter(
            b => (b.page || 0) === page.index,
          );
          const pageTerms = (manifest.term_overlays || []).filter(t => (t.page || 0) === page.index);
          return (
            <View key={page.name} style={ui.pageCard}>
              <Text style={ui.pageTitle}>第 {page.index + 1} 页</Text>
              <View style={{width: pageW, height: pageH}}>
                <Image
                  source={{uri: `https://tutujiaolian.com${page.url}`}}
                  style={{width: pageW, height: pageH, borderRadius: 12}}
                  resizeMode="contain"
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
                {pageTerms.map(ov => (
                  <View
                    key={ov.id || `${ov.term}_${ov.x}_${ov.y}`}
                    style={[
                      ui.termOv,
                      {
                        left: (ov.x || 0) * pageW,
                        top: (ov.y || 0) * pageH,
                        width: Math.max(36, (ov.w || 0.12) * pageW),
                        height: Math.max(20, (ov.h || 0.035) * pageH),
                      },
                    ]}>
                    <Text style={ui.termOvText} numberOfLines={1}>
                      {ov.short || ov.translation || ov.term}
                    </Text>
                  </View>
                ))}
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
      marginBottom: 14,
    },
    uploadText: {color: '#fff', fontSize: 14, fontWeight: '700'},
    empty: {fontSize: 14, color: colors.textSecondary, marginTop: 18, lineHeight: 22},
    pageCard: {marginBottom: 16},
    pageTitle: {fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 8},
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
      backgroundColor: 'rgba(232,246,255,0.92)',
      borderWidth: 1,
      borderColor: '#7EB6D9',
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    termOvText: {fontSize: 11, fontWeight: '700', color: '#0B3D5C'},
    termCard: {backgroundColor: colors.card, borderRadius: 16, padding: 16, marginTop: 6},
    termTitle: {fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginBottom: 6},
    termLine: {fontSize: 13.5, lineHeight: 20, color: colors.textPrimary, marginBottom: 8},
  });
