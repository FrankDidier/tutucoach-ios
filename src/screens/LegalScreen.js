import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {getJson} from '../services/api';

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function loadDoc(doc) {
  try {
    const j = await getJson(`/api/legal/${doc}`);
    if (j && j.ok && j.html) return stripHtml(j.html);
  } catch (e) {}
  try {
    const res = await fetch(
      `https://tutujiaolian.com/${doc === 'terms' ? 'terms' : 'privacy'}.html`,
    );
    const html = await res.text();
    if (html) return stripHtml(html);
  } catch (e) {}
  return '';
}

/** 合并展示隐私政策 + 用户服务协议（公安合规：App 内可查阅）。 */
const LegalScreen = () => {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [privacy, setPrivacy] = useState('');
  const [terms, setTerms] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [p, t] = await Promise.all([loadDoc('privacy'), loadDoc('terms')]);
      if (!alive) return;
      setPrivacy(p || '隐私政策加载失败，请访问 tutujiaolian.com/privacy.html');
      setTerms(t || '用户服务协议加载失败，请访问 tutujiaolian.com/terms.html');
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
      <ScreenHeader title="隐私与用户协议" />
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.accent} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
          <Text style={styles.sectionTitle}>一、隐私政策</Text>
          <Text style={styles.body}>{privacy}</Text>
          <Text style={[styles.sectionTitle, styles.sectionGap]}>二、用户服务协议</Text>
          <Text style={styles.body}>{terms}</Text>
        </ScrollView>
      )}
    </View>
  );
};

const makeStyles = colors =>
  StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    loader: {marginTop: 48},
    scroll: {paddingHorizontal: 20, paddingBottom: 40},
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 17,
      fontWeight: '600',
      marginBottom: 10,
    },
    sectionGap: {marginTop: 28},
    body: {
      color: colors.textPrimary,
      fontSize: 14,
      lineHeight: 22,
    },
  });

export default LegalScreen;
