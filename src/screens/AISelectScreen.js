import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  StatusBar,
} from 'react-native';
import {builtInProfiles} from '../utils/coachProfiles';
import {fetchCoaches} from '../services/coach';
import {getSelectedCoachId, setSelectedCoachId} from '../services/coachPrefs';
import {Images} from '../assets/images';
import {BASE_URL} from '../services/config';
import ScreenHeader from '../components/ScreenHeader';
import {useTheme} from '../theme/ThemeContext';

// 与安卓 SettingsActivity.styleLabel 一致
function styleLabel(style) {
  if (style === 'STRICT') return '严格型';
  if (style === 'PLAYFUL') return '活泼型';
  return '鼓励型';
}

// 与安卓 SettingsActivity.avatarFor 一致：名字含「老师/专业」用真人头像，否则用兔子吉祥物
function avatarFor(name) {
  const n = name || '';
  if (n.includes('老师') || n.includes('专业')) return Images.avatarUser;
  return Images.rabbitMascot;
}

// 优先用后台上传的自定义头像（avatarUrl），没有再回退到按名字选内置头像。
// 这修复「设置了 AI 分身头像，但角色选择页仍显示原来兔子」的问题。
function avatarSource(coach) {
  const url = coach && coach.avatarUrl;
  if (url) {
    const abs = url.startsWith('http') ? url : BASE_URL + url;
    return {uri: abs};
  }
  return avatarFor(coach && coach.name);
}

const BTN_STEPS = 28;

function lerpChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function lerpRgb(from, to, t) {
  return `rgb(${lerpChannel(from.r, to.r, t)},${lerpChannel(
    from.g,
    to.g,
    t,
  )},${lerpChannel(from.b, to.b, t)})`;
}

const AISelectScreen = ({navigation, route}) => {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [selected, setSelected] = useState('coach_pro');
  const [remoteCoaches, setRemoteCoaches] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await getSelectedCoachId();
      if (alive && saved) setSelected(saved);
      try {
        const r = await fetchCoaches();
        if (alive && r && r.ok && Array.isArray(r.coaches)) {
          setRemoteCoaches(r.coaches.filter(c => c.enabled !== false));
        }
      } catch (e) {
        // 离线时回退到内置角色
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onConfirm = async () => {
    await setSelectedCoachId(selected);
    // 若由检测页跳来选择，回传所选教练。务必保留 premium（AI 陪练版）标记，
    // 否则返回后检测页会退回成「手型检测」（免费版）：变成铃声选择、只有滴滴声、没有语音。
    if (route?.params?.returnTo) {
      navigation.navigate(route.params.returnTo, {
        coachId: selected,
        premium: !!route?.params?.premium,
      });
    } else {
      navigation.goBack();
    }
  };

  const btnStripes = useMemo(() => {
    const start = hexToRgb(colors.primaryGradientStart);
    const end = hexToRgb(colors.primaryGradientEnd);
    return Array.from({length: BTN_STEPS}, (_, i) =>
      lerpRgb(start, end, i / (BTN_STEPS - 1)),
    );
  }, [colors]);

  const gridItems = useMemo(() => {
    const source =
      remoteCoaches && remoteCoaches.length
        ? remoteCoaches.map(c => ({
            id: c.id,
            name: c.name,
            style: c.style,
            avatarUrl: c.avatarUrl,
          }))
        : builtInProfiles.map(p => ({
            id: p.id,
            name: p.displayName,
            style: p.style,
          }));
    return source.map(c => ({
      id: c.id,
      name: c.name,
      styleText: styleLabel(c.style),
      avatar: avatarSource(c),
    }));
  }, [remoteCoaches]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />

      <ScreenHeader title="AI选择" onBack={() => navigation?.goBack?.()} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {gridItems.map(item => {
            const active = selected === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.9}
                style={[styles.cell, active && styles.cellSelected]}
                onPress={() => setSelected(item.id)}>
                <View style={styles.avatarCircle}>
                  <Image
                    source={item.avatar}
                    style={styles.avatarImg}
                    resizeMode="cover"
                  />
                </View>
                <View style={styles.cellTextCol}>
                  <Text style={styles.cellName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.cellSubtitle} numberOfLines={1}>
                    {item.styleText}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          activeOpacity={0.88}
          style={styles.confirmOuter}
          onPress={onConfirm}>
          <View style={styles.confirmGradientRow}>
            {btnStripes.map((color, i) => (
              <View
                key={`c-${i}`}
                style={[styles.confirmStripe, {backgroundColor: color}]}
              />
            ))}
          </View>
          <View style={styles.confirmLabelWrap} pointerEvents="none">
            <Text style={styles.confirmLabel}>确认</Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const makeStyles = colors =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    scroll: {
      padding: 16,
      paddingBottom: 100,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    cell: {
      width: '48.5%',
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 14,
      borderWidth: 2,
      borderColor: colors.mode === 'dark' ? colors.cardBorder : 'transparent',
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 8,
      shadowOffset: {width: 0, height: 2},
      elevation: 1,
    },
    cellSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.cardAlt,
    },
    avatarCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.cardAlt,
      padding: 4,
      overflow: 'hidden',
    },
    avatarImg: {
      width: '100%',
      height: '100%',
      borderRadius: 18,
    },
    cellTextCol: {
      flex: 1,
      marginLeft: 10,
    },
    cellName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    cellSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 20,
      paddingBottom: 28,
      paddingTop: 10,
      backgroundColor: colors.bg,
    },
    confirmOuter: {
      height: 52,
      borderRadius: 26,
      overflow: 'hidden',
      justifyContent: 'center',
    },
    confirmGradientRow: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: 'row',
    },
    confirmStripe: {
      flex: 1,
      height: '100%',
    },
    confirmLabelWrap: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
    },
    confirmLabel: {
      color: colors.onPrimary,
      fontSize: 17,
      fontWeight: '700',
    },
  });

export default AISelectScreen;
