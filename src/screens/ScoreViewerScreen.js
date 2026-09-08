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
  useWindowDimensions,
} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {fetchScore} from '../services/score';
import {getDeviceId} from '../services/device';

export default function ScoreViewerScreen({navigation, route}) {
  const {colors} = useTheme();
  const ui = useMemo(() => makeStyles(colors), [colors]);
  const {width: winW} = useWindowDimensions();
  const pageW = winW - 32;
  const {studentId = '', pieceName = ''} = route?.params || {};
  const [loading, setLoading] = useState(true);
  const [manifest, setManifest] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetchScore(studentId || getDeviceId(), pieceName, '');
        setManifest(r?.manifest || null);
      } catch (e) {
        setManifest(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [pieceName, studentId]);

  return (
    <SafeAreaView style={ui.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
      <ScreenHeader title="乐谱重点" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={ui.scroll}>
        <Text style={ui.title}>{pieceName || '当前曲目'}</Text>
        {loading ? <ActivityIndicator color={colors.primary} style={{marginTop: 24}} /> : null}
        {!loading && !manifest?.pages?.length ? (
          <Text style={ui.empty}>这首曲目还没有上传乐谱。</Text>
        ) : null}
        {(manifest?.pages || []).map(page => {
          const pageH = page.width ? Math.max(120, pageW * (page.height / page.width)) : pageW * 1.35;
          const boxes = (manifest.confirmed_annotations || manifest.annotations || []).filter(
            b => (b.page || 0) === page.index,
          );
          return (
            <View key={page.name} style={ui.pageCard}>
              <Text style={ui.pageTitle}>第 {page.index + 1} 页</Text>
              <View style={{width: pageW, height: pageH}}>
                <Image source={{uri: `https://tutujiaolian.com${page.url}`}} style={{width: pageW, height: pageH, borderRadius: 12}} resizeMode="contain" />
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
              </View>
            </View>
          );
        })}
        {(manifest?.term_translations || []).length ? (
          <View style={ui.termCard}>
            <Text style={ui.termTitle}>音乐术语翻译</Text>
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
    title: {fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginBottom: 12},
    empty: {fontSize: 14, color: colors.textSecondary, marginTop: 18},
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
    termCard: {backgroundColor: colors.card, borderRadius: 16, padding: 16, marginTop: 6},
    termTitle: {fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginBottom: 10},
    termLine: {fontSize: 13.5, lineHeight: 20, color: colors.textPrimary, marginBottom: 8},
  });
