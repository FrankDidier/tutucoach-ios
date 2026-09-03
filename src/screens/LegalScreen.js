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

const LegalScreen = ({route}) => {
  const doc = route?.params?.doc || 'privacy';
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [title, setTitle] = useState(doc === 'terms' ? '用户服务协议' : '隐私政策');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const j = await getJson(`/api/legal/${doc}`);
        if (alive && j && j.ok && j.html) {
          setTitle(j.title || title);
          setBody(stripHtml(j.html));
          return;
        }
        // 兜底：直接拉官网 HTML
        const res = await fetch(
          `https://tutujiaolian.com/${doc === 'terms' ? 'terms' : 'privacy'}.html`,
        );
        const html = await res.text();
        if (alive && html) setBody(stripHtml(html));
      } catch (e) {
        if (alive) {
          setBody('内容加载失败，请检查网络后重试，或访问 tutujiaolian.com 查看。');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [doc, title]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
      <ScreenHeader title={title} />
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.accent} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
          <Text style={styles.body}>{body}</Text>
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
    body: {
      color: colors.textPrimary,
      fontSize: 14,
      lineHeight: 22,
    },
  });

export default LegalScreen;
