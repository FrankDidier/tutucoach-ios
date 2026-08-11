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
  Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {builtInProfiles} from '../utils/coachProfiles';
import {fetchCoaches} from '../services/coach';
import {getSelectedCoachId, setSelectedCoachId, setCachedCoachAvatarUri} from '../services/coachPrefs';
import {Images} from '../assets/images';
import {BASE_URL} from '../services/config';
import {useTheme} from '../theme/ThemeContext';

const {width: SCREEN_W} = Dimensions.get('window');
const S = SCREEN_W / 375;
const px = n => Math.round(n * S);

// 蓝湖 AI选择 卡片副标题：AI分身 / 温柔亲和
function styleLabel(style) {
  if (style === 'ENCOURAGING' || style === 'PLAYFUL') return '温柔亲和';
  return 'AI分身';
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

const AISelectScreen = ({navigation, route}) => {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
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
    // 预缓存分身头像 URL，进陪练时可瞬时铺背景（修「点进陪伴要等一下才出图」）
    try {
      const c = (remoteCoaches || []).find(x => x.id === selected);
      if (c?.avatarUrl) {
        const uri = c.avatarUrl.startsWith('http')
          ? c.avatarUrl
          : BASE_URL + c.avatarUrl;
        await setCachedCoachAvatarUri(selected, uri);
        Image.prefetch(uri).catch(() => {});
      }
    } catch (e) {}
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
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor="transparent" translucent />
      {/* 顶部背景（蓝湖 375x220），深/浅两版 */}
      <Image
        source={dark ? Images.aiselectTopDark : Images.aiselectTopLight}
        style={styles.topBg}
        resizeMode="cover"
        pointerEvents="none"
      />
      <SafeAreaView>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backHit} onPress={() => navigation?.goBack?.()}>
            <Text style={styles.backChevron}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>AI选择</Text>
          <View style={styles.backHit} />
        </View>
      </SafeAreaView>

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
                  <Text
                    style={[styles.cellName, active && styles.cellNameSelected]}
                    numberOfLines={1}>
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
          <LinearGradient
            colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
            start={{x: 0.5, y: 0}}
            end={{x: 0.5, y: 1}}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.confirmLabelWrap} pointerEvents="none">
            <Text style={styles.confirmLabel}>确认</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const makeStyles = (colors, dark) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg},
    topBg: {position: 'absolute', top: 0, left: 0, right: 0, height: px(220)},
    header: {
      height: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
    },
    backHit: {width: 44, height: 44, justifyContent: 'center', alignItems: 'center'},
    backChevron: {fontSize: 30, color: colors.textPrimary, marginTop: -4},
    headerTitle: {fontSize: 18, fontWeight: '600', color: colors.textPrimary},
    // 蓝湖卡片区从 y≈98；顶栏后 padTop 约 10
    scroll: {paddingHorizontal: px(15), paddingTop: px(10), paddingBottom: 100},
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    // 蓝湖 165×80，列间距 15，行间距 15
    cell: {
      width: px(165),
      height: px(80),
      marginBottom: px(15),
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: px(16),
      paddingHorizontal: px(10),
      borderWidth: 2,
      borderColor: 'transparent',
    },
    // t1 选中：底 #131444 + 边 #B595FF；t2 选中：白底 + 粉边
    cellSelected: {
      borderColor: dark ? '#B595FF' : colors.primary,
      backgroundColor: dark ? colors.cardAlt : '#FFFFFF',
    },
    avatarCircle: {
      width: px(44),
      height: px(44),
      borderRadius: px(22),
      backgroundColor: '#FFEDF1',
      overflow: 'hidden',
    },
    avatarImg: {width: '100%', height: '100%'},
    cellTextCol: {flex: 1, marginLeft: px(10)},
    cellName: {fontSize: 15, fontWeight: '600', color: colors.textPrimary},
    cellNameSelected: {color: dark ? '#B595FF' : colors.textPrimary},
    cellSubtitle: {fontSize: 12, color: '#979797', marginTop: 4},
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: px(16),
      paddingBottom: 28,
      paddingTop: 10,
    },
    // 蓝湖确认 343×44
    confirmOuter: {
      height: px(44),
      borderRadius: px(22),
      overflow: 'hidden',
      justifyContent: 'center',
    },
    confirmLabelWrap: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
    },
    confirmLabel: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
  });

export default AISelectScreen;
