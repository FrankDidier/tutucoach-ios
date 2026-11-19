import React, {useEffect, useMemo, useState, useCallback} from 'react';
import {useFocusEffect} from '@react-navigation/native';
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
  Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {builtInProfiles} from '../utils/coachProfiles';
import {fetchCoaches} from '../services/coach';
import {getSelectedCoachId, setSelectedCoachId, setCachedCoachAvatarUri} from '../services/coachPrefs';
import {getDeviceId} from '../services/device';
import {fetchWallet, unlockCoach, freeUsesFromWallet} from '../services/guangbi';
import {Images} from '../assets/images';
import {BASE_URL} from '../services/config';
import {useTheme} from '../theme/ThemeContext';

const {width: SCREEN_W} = Dimensions.get('window');
const S = SCREEN_W / 375;
const px = n => Math.round(n * S);

// 蓝湖 AI选择 卡片副标题：AI分身 / 温柔亲和
function stillUnlocked(id, wallet, coach) {
  // 公测免费期内所有角色可直接用，不弹光币解锁。
  if (wallet && (wallet.freeBeta || wallet.free_beta)) return true;
  if ((coach && Number(coach.rentPrice) || 0) <= 0) return true;
  const exp = wallet && wallet.unlockExpires && wallet.unlockExpires[id];
  if (exp && Number(exp) * 1000 <= Date.now()) return false;
  if (coach && coach.unlocked) return true;
  return !!(wallet && (wallet.unlocked || []).includes(id));
}

// 蓝湖 AI选择 卡片副标题：「AI分身·专业指导」/「AI分身·温柔内敛」
function styleLabel(style) {
  if (style === 'STRICT' || style === 'PROFESSIONAL') return 'AI分身·专业指导';
  return 'AI分身·温柔内敛';
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
  const [wallet, setWallet] = useState({
    balance: 0,
    unlocked: [],
    unlockExpires: {},
    freeUses: null,
    freeBeta: false,
  });
  const [unlocking, setUnlocking] = useState(false);

  const loadWalletAndCoaches = useCallback(async () => {
    try {
      const r = await fetchCoaches();
      if (r && r.ok && Array.isArray(r.coaches)) {
        // 空数组也要落盘：小提琴/二胡无角色时绝不能回退到本地 3 个旧预制。
        setRemoteCoaches(r.coaches.filter(c => c.enabled !== false));
      }
    } catch (e) {}
    try {
      const w = await fetchWallet(getDeviceId());
      if (w && w.ok) {
        setWallet({
          balance: Number(w.balance) || 0,
          unlocked: Array.isArray(w.unlocked) ? w.unlocked : [],
          unlockExpires: w.unlockExpires || {},
          freeUses: freeUsesFromWallet(w),
          freeBeta: !!(w.free_beta || w.freeBeta),
        });
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await getSelectedCoachId();
      if (alive && saved) setSelected(saved);
      await loadWalletAndCoaches();
    })();
    return () => {
      alive = false;
    };
  }, [loadWalletAndCoaches]);

  useFocusEffect(
    useCallback(() => {
      loadWalletAndCoaches();
    }, [loadWalletAndCoaches]),
  );

  const onConfirm = async () => {
    if (remoteCoaches != null && remoteCoaches.length === 0) {
      Alert.alert('暂无角色', '当前乐器暂无可选角色，请先在后台为该乐器配置角色。');
      return;
    }
    const picked = (remoteCoaches || []).find(x => x.id === selected);
    const price = picked ? Number(picked.rentPrice) || 0 : 0;
    const already = stillUnlocked(selected, wallet, picked);
    if (picked && !already) {
      if (unlocking) return;
      const freeLeft =
        wallet.freeUses && Number(wallet.freeUses.remaining) > 0
          ? Number(wallet.freeUses.remaining)
          : 0;
      const bal = Number(wallet.balance) || 0;
      // 有免费次数时不要求光币余额；否则余额不足才拦截。
      if (freeLeft <= 0 && bal < price) {
        Alert.alert(
          '光币不够',
          `解锁「${picked.name}」需要 ${price} 光币，当前 ${bal} 光币。订阅可获得光币。`,
        );
        return;
      }
      const msg =
        freeLeft > 0
          ? `本月还有 ${freeLeft} 次免费解锁，确认免费使用「${picked.name}」一整天？\n（不扣光币；到期后需再解锁）`
          : `用 ${price} 光币解锁「${picked.name}」一整天？到期后需再花光币。`;
      const go = await new Promise(resolve => {
        Alert.alert(
          freeLeft > 0 ? '免费解锁' : '解锁角色',
          msg,
          [
            {text: '取消', style: 'cancel', onPress: () => resolve(false)},
            {text: freeLeft > 0 ? '免费使用' : '解锁', onPress: () => resolve(true)},
          ],
        );
      });
      if (!go) return;
      setUnlocking(true);
      try {
        const r = await unlockCoach(selected, getDeviceId());
        if (!r || !r.ok) {
          Alert.alert(
            '解锁失败',
            r && r.error === 'insufficient' ? '光币不够，请先订阅获取光币。' : '请稍后重试',
          );
          return;
        }
        setWallet(prev => ({
          balance: Number(r.balance) || prev.balance,
          unlocked: Array.from(new Set([...(prev.unlocked || []), selected])),
          unlockExpires: {
            ...(prev.unlockExpires || {}),
            [selected]: Number(r.expiresAt) || Math.floor(Date.now() / 1000) + 86400,
          },
          freeUses: freeUsesFromWallet(r) || prev.freeUses,
          freeBeta: !!(r.free_beta || r.freeBeta) || !!prev.freeBeta,
        }));
      } catch (e) {
        Alert.alert('解锁失败', '网络异常，请稍后重试');
        return;
      } finally {
        setUnlocking(false);
      }
    }
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
    // remoteCoaches===null：尚未拉到服务器，临时用内置占位；
    // 已拉到（含空数组）：严格按服务器结果，避免小提琴/二胡空列表回退出 3 个旧预制。
    const source =
      remoteCoaches == null
        ? builtInProfiles.map(p => ({
            id: p.id,
            name: p.displayName,
            style: p.style,
            rentPrice: p.id === 'coach_pro' ? 0 : 80,
            unlocked: p.id === 'coach_pro',
          }))
        : remoteCoaches.map(c => ({
            id: c.id,
            name: c.name,
            style: c.style,
            avatarUrl: c.avatarUrl,
            rentPrice: Number(c.rentPrice) || 0,
            unlocked: !!c.unlocked,
          }));
    return source.map(c => ({
      id: c.id,
      name: c.name,
      styleText: styleLabel(c.style),
      avatar: avatarSource(c),
      rentPrice: c.rentPrice || 0,
      unlocked: stillUnlocked(c.id, wallet, c),
    }));
  }, [remoteCoaches, wallet]);

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
          <Text style={styles.walletHint}>{wallet.balance || 0} 光币</Text>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {remoteCoaches != null && gridItems.length === 0 ? (
            <Text style={styles.emptyHint}>当前乐器暂无可选角色</Text>
          ) : (
            gridItems.map(item => {
              const active = selected === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.9}
                  style={styles.cell}
                  onPress={() => setSelected(item.id)}>
                  <View style={styles.cardImgWrap}>
                    <Image
                      source={item.avatar}
                      style={styles.cardImg}
                      resizeMode="cover"
                    />
                  </View>
                  <View style={styles.cardTextPanel}>
                    <Text
                      style={[styles.cellName, active && styles.cellNameSelected]}
                      numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.cellSubtitle} numberOfLines={1}>
                      {item.unlocked
                        ? item.styleText
                        : item.rentPrice > 0
                          ? `${item.rentPrice} 光币解锁一天`
                          : item.styleText}
                    </Text>
                  </View>
                  {active ? <View style={styles.cardBorder} pointerEvents="none" /> : null}
                </TouchableOpacity>
              );
            })
          )}
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
    walletHint: {width: 72, textAlign: 'right', fontSize: 12, color: colors.textMuted, paddingRight: 8},
    // 蓝湖卡片区从 y≈98；顶栏后 padTop 约 10
    scroll: {paddingHorizontal: px(15), paddingTop: px(22), paddingBottom: 130},
    emptyHint: {
      width: '100%',
      textAlign: 'center',
      color: colors.textMuted,
      fontSize: 14,
      paddingVertical: px(40),
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    // 蓝湖 AI选择：卡片 165×165（列间距 15、行间距 15）；上部 159×159 立绘（内缩 3），
    // 底部 165×50 文字面板（名称 15/600 + 副标题 12 #A1A1B4）。
    cell: {
      width: px(165),
      height: px(165),
      marginBottom: px(15),
      backgroundColor: colors.card,
      borderRadius: px(16),
      overflow: 'hidden',
    },
    cardImgWrap: {
      position: 'absolute',
      top: px(3),
      left: px(3),
      width: px(159),
      height: px(159),
      borderRadius: px(13),
      overflow: 'hidden',
      backgroundColor: dark ? '#2A1A5E' : '#FFEDF1',
    },
    cardImg: {width: '100%', height: '100%'},
    cardTextPanel: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: px(50),
      paddingLeft: px(10),
      paddingTop: px(5),
      backgroundColor: colors.card,
    },
    // t1 选中：边 #B595FF；t2 选中：粉边（矩形 1182）
    cardBorder: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: px(16),
      borderWidth: 1.5,
      borderColor: dark ? '#B595FF' : colors.primary,
    },
    cellName: {fontSize: 15, fontWeight: '600', color: colors.textPrimary, lineHeight: px(20)},
    cellNameSelected: {color: colors.textPrimary},
    cellSubtitle: {fontSize: 12, color: '#A1A1B4', marginTop: px(2), lineHeight: px(17)},
    // 蓝湖：底部整条面板（卡片色，高 60）+ 确认按钮 343×44（边距 16 / 上 8）
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: px(16),
      paddingBottom: 30,
      paddingTop: 8,
      backgroundColor: colors.card,
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
