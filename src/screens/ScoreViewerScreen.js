import React, {useEffect, useMemo, useRef, useState} from 'react';
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
  Modal,
  Dimensions,
  Pressable,
  TextInput,
} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {fetchScore, uploadScore, deleteScore, recognizeTermAt} from '../services/score';
import {getDeviceId} from '../services/device';
import {pickFromGallery, captureFromCamera} from '../services/imagePicker';
import {peekCompanionTarot} from '../services/companionTarot';
import SectionMarks from '../components/SectionMarks';
import {SectionNoteList, SectionNoteSheet} from '../components/SectionNotes';
import {readingSections} from '../utils/sections';

const SCORE_IMG_OPTS = {maxWidth: 1600, quality: 0.92, base64: true};

function scoreImageUri(page, retry) {
  const u = page?.url;
  if (!u) return '';
  let out = String(u);
  if (!(out.startsWith('http') || out.startsWith('data:'))) {
    out = `https://tutujiaolian.com${out}`;
  }
  const n = Number(retry) || 0;
  if (n > 0 && out.startsWith('http')) {
    out += (out.includes('?') ? '&' : '?') + `_e=${n}`;
  }
  return out;
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

export default function ScoreViewerScreen({navigation, route}) {
  const {colors} = useTheme();
  const ui = useMemo(() => makeStyles(colors), [colors]);
  const {width: winW} = useWindowDimensions();
  const pageW = winW - 32;
  const [imgRetry, setImgRetry] = useState({});
  const {studentId = '', pieceName = ''} = route?.params || {};
  const sid = studentId || getDeviceId();
  const [loading, setLoading] = useState(true);
  const [tarot, setTarot] = useState(peekCompanionTarot());
  const [busy, setBusy] = useState(false);
  const [askTerm, setAskTerm] = useState(null);
  const [askText, setAskText] = useState('');
  const [manifest, setManifest] = useState(null);
  const [naturalSizes, setNaturalSizes] = useState({});
  const [zoomPage, setZoomPage] = useState(null);
  const [zoomScale, setZoomScale] = useState(1);
  const marks = useMemo(
    () => readingSections(manifest?.confirmed_annotations || manifest?.annotations || []),
    [manifest],
  );
  // 点「第几段」看老师给这一段写的重点；点重点列表跳到谱上那一段，并闪一下。
  const [openSec, setOpenSec] = useState(null);
  const [focusN, setFocusN] = useState(0);
  const scrollRef = useRef(null);
  const pageTops = useRef({});
  const focusTimer = useRef(null);
  const showSection = sec => setOpenSec(sec);
  // 点谱上有颜色的地方（不只是「第几段」小标签）就看这一段的重点；框外一点点也算，手指粗。
  const tapPage = (pageIdx, frameW, frameH, evt) => {
    const lx = evt?.nativeEvent?.locationX;
    const ly = evt?.nativeEvent?.locationY;
    if (!(lx >= 0) || !(ly >= 0) || !frameW || !frameH) return;
    const x = lx / frameW;
    const y = ly / frameH;
    const pad = 0.012;
    const sec = marks.find(s =>
      (s.rects || []).some(
        r =>
          (r.page || 0) === pageIdx &&
          x >= (r.x || 0) - pad &&
          x <= (r.x || 0) + (r.w || 0) + pad &&
          y >= (r.y || 0) - pad &&
          y <= (r.y || 0) + (r.h || 0) + pad,
      ),
    );
    if (sec) showSection(sec);
  };
  const locate = sec => {
    setOpenSec(null);
    if (!sec) return;
    const head = sec.head || (sec.rects || [])[0] || {};
    const pg = (manifest?.pages || []).find(p => p.index === (head.page || 0));
    const key = pg ? pg.name || String(pg.index) : '';
    const top = pageTops.current[head.page || 0];
    if (pg && top != null && scrollRef.current) {
      const pageH = pageFrameHeight(pageW, pg, naturalSizes[key]);
      scrollRef.current.scrollTo({y: Math.max(0, top + (head.y || 0) * pageH - 90), animated: true});
    }
    setFocusN(sec.n);
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => setFocusN(0), 2200);
  };
  useEffect(() => () => focusTimer.current && clearTimeout(focusTimer.current), []);

  // 学生也能像老师一样：点蓝条改错词，长按谱面空白处认没标出来的术语并记进术语库。
  const recognizeAtTap = async (pageIdx, x, y, typed = '', replaceId = '') => {
    setBusy(true);
    try {
      const r = await recognizeTermAt('', sid, pieceName, pageIdx, x, y, {
        term: typed,
        replaceId,
      });
      if (r?.ok) {
        setManifest(prev => {
          if (!prev) return prev;
          const next = {...prev};
          if (Array.isArray(r.term_overlays)) next.term_overlays = r.term_overlays;
          if (Array.isArray(r.term_translations)) next.term_translations = r.term_translations;
          return next;
        });
        if (r.needs_confirm && !typed) {
          Alert.alert(
            '认出来了，对吗？',
            `${r.term}：${r.translation}\n不对的话点「我来改」，改过的会记进术语库。`,
            [
              {
                text: '就是它',
                onPress: () => confirmTerm(pageIdx, x, y, r.term),
              },
              {
                text: '我来改',
                onPress: () => {
                  setAskText(r.term || '');
                  setAskTerm({
                    page: pageIdx,
                    x,
                    y,
                    ocr: r.ocr || '',
                    replaceId: '',
                  });
                },
              },
            ],
          );
        } else {
          Alert.alert('已识别', `${r.term}：${r.translation}\n已记进术语库，以后别的曲子也认得。`);
        }
      } else if (r?.error === 'not_recognized') {
        setAskText('');
        setAskTerm({page: pageIdx, x, y, ocr: r.ocr || '', replaceId: ''});
      } else {
        Alert.alert('识别失败', '请稍后重试，或换个位置点在术语正中间。');
      }
    } catch (e) {
      Alert.alert('识别失败', '网络异常，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const confirmTerm = async (pageIdx, x, y, term, replaceId = '') => {
    if (!term) return;
    setBusy(true);
    try {
      const r = await recognizeTermAt('', sid, pieceName, pageIdx, x, y, {
        term,
        replaceId,
      });
      if (r?.ok) {
        setManifest(prev => {
          if (!prev) return prev;
          const next = {...prev};
          if (Array.isArray(r.term_overlays)) next.term_overlays = r.term_overlays;
          if (Array.isArray(r.term_translations)) next.term_translations = r.term_translations;
          return next;
        });
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

  const askFixOverlay = ov => {
    const cx = (ov.x || 0) + (ov.w || 0) / 2;
    const cy = (ov.y || 0) + (ov.h || 0) / 2;
    Alert.alert('改成正确的术语', '改过的会记进术语库，以后别的曲子也按这个来。', [
      {
        text: '重新识别',
        onPress: () => recognizeAtTap(ov.page || 0, cx, cy, '', ''),
      },
      {
        text: '我来改',
        onPress: () => {
          setAskText(ov.term || '');
          setAskTerm({
            page: ov.page || 0,
            x: cx,
            y: cy,
            ocr: '',
            replaceId: ov.id || '',
          });
        },
      },
      {text: '取消', style: 'cancel'},
    ]);
  };

  const onPageLongPress = (pageIdx, frameW, frameH, evt) => {
    const lx = evt?.nativeEvent?.locationX;
    const ly = evt?.nativeEvent?.locationY;
    if (!(lx >= 0) || !(ly >= 0) || !frameW || !frameH) return;
    recognizeAtTap(pageIdx, lx / frameW, ly / frameH, '', '');
  };

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

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => setTarot(peekCompanionTarot()));
    return unsub;
  }, [navigation]);

  const retryPage = key => {
    setImgRetry(prev => {
      const n = prev[key] || 0;
      if (n >= 2) return prev;
      return {...prev, [key]: n + 1};
    });
  };

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
      {
        text: '上传 PDF',
        onPress: () => doStudentPdf(),
      },
      {text: '取消', style: 'cancel'},
    ]);
  };

  const doStudentPdf = async () => {
    const {pickPdf} = require('../services/documentPicker');
    const file = await pickPdf();
    if (!file || file.cancelled) return;
    if (file.error || !file.uri) {
      Alert.alert('上传失败', file.error === 'no_module' ? '当前版本暂不支持选 PDF，请更新 App。' : '未能读取 PDF。');
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
        Alert.alert('已上传', 'PDF 已加进乐谱，翻译好的术语马上就能看。');
      } else {
        Alert.alert('上传失败', '请稍后重试。');
      }
    } catch (e) {
      Alert.alert('上传失败', '网络异常，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const refreshStudentTermsSoon = () => {
    // 服务端后台认术语；几秒后再拉一次，谱面已先显示
    const ticks = [1500, 4000, 9000];
    ticks.forEach(ms => setTimeout(() => load(), ms));
  };

  const doStudentCamera = async hasPagesAlready => {
    const file = await captureFromCamera(SCORE_IMG_OPTS);
    if (!file || file.cancelled) return;
    if (file.error || !(file.uri || file.base64 || file.dataUri)) {
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
        if (r.terms_pending || r.manifest?.terms_pending) refreshStudentTermsSoon();
        Alert.alert('已上传', '这一页已加进乐谱，术语识别完成后会自动出现。继续拍下一页？', [
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
    const files = picked.files?.length
      ? picked.files
      : picked.uri || picked.base64 || picked.dataUri
        ? [picked]
        : [];
    if (!files.length) {
      Alert.alert('上传失败', '未能读取照片。');
      return;
    }
    setBusy(true);
    let pending = false;
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
        if (r.terms_pending || r.manifest?.terms_pending) pending = true;
        // 第一页就亮出来
        if (i === 0) {
          setBusy(false);
          await load();
        }
      }
      Alert.alert(
        '已上传',
        pending
          ? `${files.length} 页已加进乐谱，术语正在识别，稍后自动出现。`
          : `${files.length} 页已加进乐谱。`,
      );
      await load();
      if (pending) refreshStudentTermsSoon();
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
      <ScrollView ref={scrollRef} contentContainerStyle={ui.scroll}>
        <Text style={ui.title}>{pieceName || '当前曲目'}</Text>
        <Text style={ui.hint}>
          补拍的乐谱页会立刻加进来并翻译术语。点蓝条可改错词；长按谱面空白处可认没标出来的术语。要删旧谱：每页右边「删除本页」，或点下方「删除全部乐谱」。
        </Text>
        <TouchableOpacity style={ui.uploadBtn} onPress={onStudentUpload} disabled={busy}>
          <Text style={ui.uploadText}>{busy ? '处理中…' : '拍照/选图/PDF 上传乐谱'}</Text>
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
        {marks.length ? <SectionNoteList sections={marks} onPick={locate} /> : null}
        {marks.length && !marks.some(s => s.note) ? (
          <Text style={ui.hint}>谱上同一种颜色是同一段。陪练会按「第一段、第二段」带你练。</Text>
        ) : null}
        {(manifest?.pages || []).map(page => {
          const key = page.name || String(page.index);
          const pageH = pageFrameHeight(pageW, page, naturalSizes[key]);
          const pageTerms = (manifest.term_overlays || []).filter(t => (t.page || 0) === page.index);
          return (
            <View
              key={key}
              style={ui.pageCard}
              onLayout={e => {
                // 卡片顶部 + 页头一行，就是谱面图的顶部
                pageTops.current[page.index] = e.nativeEvent.layout.y + 30;
              }}>
              <View style={ui.pageHead}>
                <Text style={ui.pageTitle}>第 {page.index + 1} 页</Text>
                <View style={{flexDirection: 'row', gap: 14}}>
                  <TouchableOpacity
                    onPress={() => {
                      setZoomScale(1);
                      setZoomPage(page);
                    }}>
                    <Text style={[ui.deleteLink, {color: colors.primary}]}>全屏放大</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deletePage(page.index)}>
                    <Text style={ui.deleteLink}>删除本页</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{width: pageW, height: pageH, backgroundColor: '#F4EFE6', borderRadius: 12, overflow: 'hidden'}}>
                <Image
                  key={`vimg-${key}-${imgRetry[key] || 0}`}
                  source={{uri: scoreImageUri(page, imgRetry[key] || 0), cache: 'force-cache'}}
                  style={{position: 'absolute', left: 0, top: 0, width: pageW, height: pageH, borderRadius: 12}}
                  resizeMode="contain"
                  onError={() => retryPage(key)}
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
                {tarot && tarot.piece === pieceName && (tarot.page || 0) === page.index ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: 8,
                      top: Math.max(8, (tarot.y || 0) * pageH),
                      maxWidth: pageW * 0.72,
                      backgroundColor: 'rgba(28, 18, 48, 0.88)',
                      borderRadius: 10,
                      paddingHorizontal: 8,
                      paddingVertical: 6,
                      zIndex: 20,
                    }}>
                    {tarot.image ? (
                      <Image
                        source={{
                          uri: tarot.image.startsWith('http')
                            ? tarot.image
                            : `https://tutujiaolian.com${tarot.image}`,
                        }}
                        style={{width: 72, height: 120, borderRadius: 6, marginBottom: 4}}
                        resizeMode="cover"
                      />
                    ) : null}
                    <Text style={{color: '#F3D48A', fontSize: 12, fontWeight: '700'}}>
                      {tarot.name}
                    </Text>
                    <Text style={{color: '#FFFFFF', fontSize: 12}}>{tarot.line}</Text>
                  </View>
                ) : null}
                <Pressable
                  onPress={e => (marks.length ? tapPage(page.index, pageW, pageH, e) : null)}
                  onLongPress={e => onPageLongPress(page.index, pageW, pageH, e)}
                  delayLongPress={420}
                  style={{position: 'absolute', left: 0, top: 0, width: pageW, height: pageH}}
                />
                <SectionMarks
                  sections={marks}
                  page={page.index}
                  pageW={pageW}
                  pageH={pageH}
                  onOpen={showSection}
                  focusN={focusN}
                />
                {pageTerms.map(ov => {
                  const label = String(ov.short || ov.translation || ov.term || '');
                  const fontSize = Math.max(10, Math.min(14, (ov.h || 0.025) * pageH * 0.85));
                  const minW = Math.max(36, label.length * (fontSize * 0.95) + 10);
                  return (
                    <Pressable
                      key={ov.id || `${ov.term}_${ov.x}_${ov.y}`}
                      onPress={() => askFixOverlay(ov)}
                      style={[
                        ui.termOv,
                        {
                          left: (ov.x || 0) * pageW,
                          top: (ov.y || 0) * pageH,
                          width: Math.max(minW, (ov.w || 0.1) * pageW),
                          height: Math.max(18, (ov.h || 0.022) * pageH),
                          zIndex: 12,
                        },
                      ]}>
                      <Text
                        style={[ui.termOvText, {fontSize}]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                        allowFontScaling={false}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
        {(manifest?.term_translations || []).length ? (
          <View style={ui.termCard}>
            <Text style={ui.termTitle}>音乐术语（已标在谱面）</Text>
            <Text style={ui.hint}>蓝色小条覆盖在原文位置；点蓝条可改错词，长按谱面可补认没标出来的。下方为完整列表。</Text>
            {(manifest.term_translations || []).map((term, idx) => (
              <Text key={`${term.term}_${idx}`} style={ui.termLine}>
                {term.term}：{term.translation}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={!!zoomPage}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setZoomPage(null)}>
        <SafeAreaView style={{flex: 1, backgroundColor: '#1A1A1A'}}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingHorizontal: 14,
              paddingTop: 8,
              paddingBottom: 6,
            }}>
            <Text style={{color: '#fff', fontSize: 15, fontWeight: '700'}}>
              第 {(zoomPage?.index || 0) + 1} 页
            </Text>
            <TouchableOpacity onPress={() => setZoomPage(null)}>
              <Text style={{color: '#fff', fontSize: 15, fontWeight: '700'}}>关闭</Text>
            </TouchableOpacity>
          </View>
          <Text style={{color: 'rgba(255,255,255,0.72)', fontSize: 12, textAlign: 'center', paddingBottom: 8}}>
            放大后可以上下左右拖动查看
          </Text>
          {zoomPage ? (() => {
            const win = Dimensions.get('window');
            const zw = Math.max(320, win.width);
            const key = zoomPage.name || String(zoomPage.index);
            const baseH = pageFrameHeight(zw, zoomPage, naturalSizes[key]);
            const zh = Math.max(baseH, win.height * 0.55);
            const scale = zoomScale;
            const pageTerms = (manifest?.term_overlays || []).filter(
              t => (t.page || 0) === zoomPage.index,
            );
            const zoomKey = key;
            const imgUri = scoreImageUri(zoomPage, imgRetry[zoomKey] || 0);
            return (
              <ScrollView
                style={{flex: 1, backgroundColor: '#F4EFE6'}}
                contentContainerStyle={{width: zw * scale, height: zh * scale}}
                bounces
                directionalLockEnabled={false}
                showsVerticalScrollIndicator
                showsHorizontalScrollIndicator>
                <View style={{width: zw * scale, height: zh * scale, backgroundColor: '#F4EFE6'}}>
                  {imgUri ? (
                    <Image
                      key={`vzoom-${zoomKey}-${imgRetry[zoomKey] || 0}`}
                      source={{uri: imgUri, cache: 'force-cache'}}
                      style={{width: zw * scale, height: zh * scale}}
                      resizeMode="contain"
                      onError={() => retryPage(zoomKey)}
                    />
                  ) : null}
                  <Pressable
                    onPress={e =>
                      marks.length ? tapPage(zoomPage.index, zw * scale, zh * scale, e) : null
                    }
                    onLongPress={e => onPageLongPress(zoomPage.index, zw * scale, zh * scale, e)}
                    delayLongPress={420}
                    style={{position: 'absolute', left: 0, top: 0, width: zw * scale, height: zh * scale}}
                  />
                  <SectionMarks
                    sections={marks}
                    page={zoomPage.index}
                    pageW={zw * scale}
                    pageH={zh * scale}
                    onOpen={showSection}
                  />
                  {pageTerms.map(ov => {
                    const label = String(ov.short || ov.translation || ov.term || '');
                    return (
                      <Pressable
                        key={ov.id || `${ov.term}_${ov.x}_${ov.y}`}
                        onPress={() => askFixOverlay(ov)}
                        style={[
                          ui.termOv,
                          {
                            left: (ov.x || 0) * zw * scale,
                            top: (ov.y || 0) * zh * scale,
                            width: Math.max(40, (ov.w || 0.1) * zw * scale),
                            height: Math.max(20, (ov.h || 0.022) * zh * scale),
                          },
                        ]}>
                        <Text style={ui.termOvText} numberOfLines={1}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            );
          })() : null}
          {zoomPage && openSec ? (
            <SectionNoteSheet section={openSec} onClose={() => setOpenSec(null)} />
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 28,
              paddingBottom: 18,
              paddingTop: 10,
            }}>
            <TouchableOpacity onPress={() => setZoomScale(s => Math.max(1, +(s - 0.35).toFixed(2)))}>
              <Text style={{color: '#fff', fontWeight: '700', fontSize: 16}}>缩小</Text>
            </TouchableOpacity>
            <Text style={{color: '#fff', fontWeight: '700', fontSize: 16}}>
              {Math.round(zoomScale * 100)}%
            </Text>
            <TouchableOpacity onPress={() => setZoomScale(s => Math.min(3.2, +(s + 0.35).toFixed(2)))}>
              <Text style={{color: '#fff', fontWeight: '700', fontSize: 16}}>放大</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={!!askTerm}
        transparent
        animationType="fade"
        onRequestClose={() => setAskTerm(null)}>
        <View style={ui.modalMask}>
          <View style={ui.modalCard}>
            <Text style={ui.modalTitle}>这串是什么术语？</Text>
            <Text style={ui.hint}>
              {askTerm?.ocr
                ? `谱上读到的是「${askTerm.ocr}」。填对的拼写（如 dimin.），以后每首曲子都能自动认出来。`
                : '填这串术语的拼写（如 dimin.），以后每首曲子都能自动认出来。'}
            </Text>
            <TextInput
              style={ui.input}
              value={askText}
              onChangeText={setAskText}
              autoCapitalize="none"
              placeholder="术语原文，例如 dimin."
              placeholderTextColor={colors.textSecondary}
            />
            <View style={ui.modalRow}>
              <TouchableOpacity
                style={[ui.modalBtn, ui.modalBtnGhost]}
                onPress={() => setAskTerm(null)}>
                <Text style={ui.modalBtnGhostText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={ui.modalBtn}
                onPress={() => {
                  const pack = askTerm;
                  const txt = askText.trim();
                  setAskTerm(null);
                  if (pack && txt) {
                    confirmTerm(pack.page, pack.x, pack.y, txt, pack.replaceId || '');
                  }
                }}>
                <Text style={ui.modalBtnText}>记进术语库</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {!zoomPage && openSec ? (
        <SectionNoteSheet
          section={openSec}
          onClose={() => setOpenSec(null)}
          onLocate={() => locate(openSec)}
        />
      ) : null}
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
      borderWidth: 1.5,
      borderColor: 'rgba(232, 156, 48, 0.85)',
      backgroundColor: 'rgba(255, 196, 77, 0.12)',
      borderRadius: 10,
    },
    boxLabel: {
      alignSelf: 'flex-start',
      marginTop: 4,
      marginLeft: 4,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      overflow: 'hidden',
      backgroundColor: 'rgba(255, 248, 230, 0.92)',
      fontSize: 11,
      fontWeight: '700',
      color: '#6B4A12',
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
    termCard: {backgroundColor: colors.card, borderRadius: 16, padding: 16, marginTop: 6},
    termTitle: {fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginBottom: 6},
    termLine: {fontSize: 13.5, lineHeight: 20, color: colors.textPrimary, marginBottom: 8},
    modalMask: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 18,
    },
    modalTitle: {fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginBottom: 8},
    input: {
      marginTop: 10,
      borderWidth: 1,
      borderColor: colors.border || '#DDD',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      fontSize: 15,
    },
    modalRow: {flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16},
    modalBtn: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    modalBtnText: {color: '#fff', fontWeight: '700'},
    modalBtnGhost: {backgroundColor: 'transparent'},
    modalBtnGhostText: {color: colors.textSecondary, fontWeight: '600'},
  });
