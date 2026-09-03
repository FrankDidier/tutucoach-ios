import React, {useEffect, useMemo, useState, useCallback} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useFocusEffect} from '@react-navigation/native';
import {Images} from '../assets/images';
import {useTheme} from '../theme/ThemeContext';
import {getDeviceId} from '../services/device';
import {getMembership} from '../services/account';
import {payWithWeChat} from '../services/wechat';
import {getJson} from '../services/api';

const {width: SCREEN_W} = Dimensions.get('window');
const S = SCREEN_W / 375;
const px = n => Math.round(n * S);

// 默认展示价（服务端拉取失败时回退）；真实扣款仍以服务端为准。
const DEFAULT_PLANS = [
  {id: 'yearly', name: '年卡', price: '888', original: '¥1188.00'},
  {id: 'quarterly', name: '季卡', price: '228', original: '¥299.00'},
  {id: 'monthly', name: '月卡', price: '88', original: '¥128.00'},
];

function parsePlansFromApi(j) {
  if (!j || !j.ok || !Array.isArray(j.plans) || !j.plans.length) return null;
  const monthly = j.plans.find(p => p.id === 'monthly');
  const mAmt = monthly ? parseFloat(monthly.amount || monthly.price) : 88;
  return j.plans.map(p => {
    const amt = parseFloat(p.amount || p.price || '0');
    const price = String(Math.round(amt));
    let original = '';
    if (p.id === 'yearly') original = `¥${Math.round(mAmt * 12)}.00`;
    else if (p.id === 'quarterly') original = `¥${Math.round(mAmt * 3)}.00`;
    else original = `¥${Math.round(mAmt * 1.2)}.00`;
    return {id: p.id, name: p.name || p.id, price, original};
  });
}

const SubscriptionScreen = ({navigation}) => {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const [selected, setSelected] = useState('yearly');
  const [agreed, setAgreed] = useState(false);
  const [vip, setVip] = useState(null);
  const [plans, setPlans] = useState(DEFAULT_PLANS);

  const refreshPlans = useCallback(async () => {
    try {
      const j = await getJson('/api/pay/plans', {
        platform: 'ios',
        _t: Date.now(),
      });
      const parsed = parsePlansFromApi(j);
      if (parsed) setPlans(parsed);
    } catch (e) {}
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = await getMembership(getDeviceId());
        if (alive && m && m.ok) setVip(m);
      } catch (e) {}
      if (alive) await refreshPlans();
    })();
    return () => {
      alive = false;
    };
  }, [refreshPlans]);

  useFocusEffect(
    useCallback(() => {
      refreshPlans();
    }, [refreshPlans]),
  );

  const onPurchase = async () => {
    if (!agreed) {
      Alert.alert('提示', '请先阅读并同意《会员购买协议》');
      return;
    }
    try {
      const r = await payWithWeChat(selected, getDeviceId());
      if (r.ok) {
        try {
          const m = await getMembership(getDeviceId());
          if (m && m.ok) setVip(m);
        } catch (e) {}
        Alert.alert('微信支付', '支付成功，会员已开通');
      } else {
        Alert.alert('微信支付', r.message || '支付未完成');
      }
    } catch (e) {
      Alert.alert('微信支付', '网络异常，请重试');
    }
  };

  const isVip = vip && vip.is_vip;

  return (
    <View style={styles.root}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor="transparent" translucent />
      {/* 顶部背景（含电路纹理），深/浅两版 */}
      <Image
        source={dark ? Images.subTopDark : Images.subTopLight}
        style={styles.topBg}
        resizeMode="stretch"
        pointerEvents="none"
      />
      {dark ? (
        <LinearGradient
          colors={['rgba(14,10,35,0)', colors.bg]}
          style={styles.topBgFade}
          pointerEvents="none"
        />
      ) : null}
      <Image
        source={dark ? Images.subCornerLines : Images.subCornerLinesLight}
        style={styles.cornerLines}
        resizeMode="stretch"
        pointerEvents="none"
      />

      {/* 顶部导航：返回 + 居中标题 */}
      <SafeAreaView style={styles.headerSafe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backHit} onPress={() => navigation?.goBack?.()}>
            <Text style={styles.backChevron}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>会员订阅</Text>
          <View style={styles.backHit} />
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* VIP 卡片 345x80（贴图渐变 + 钻石 + svip + 已开通 + 有效期） */}
        <View style={styles.vipCard}>
          <Image source={dark ? Images.subVipDark : Images.subVipLight} style={styles.vipCardBg} resizeMode="stretch" />
          <Image source={dark ? Images.subDiamondDark : Images.subDiamondLight} style={styles.vipDiamond} resizeMode="contain" />
          <Image source={dark ? Images.subSvipDark : Images.subSvipLight} style={styles.vipSvip} resizeMode="contain" />
          <View style={styles.vipBadge}>
            <Text style={styles.vipBadgeText}>{isVip ? '已开通' : '未开通'}</Text>
          </View>
          <Text style={styles.vipDate}>
            {isVip ? `会员有效期至${vip.expire_text}` : '开通后解锁全部 AI 训练功能'}
          </Text>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>会员权益</Text>
          <Image source={dark ? Images.subStarDark : Images.subStarLight} style={styles.sectionStar} resizeMode="contain" />
        </View>

        <View style={styles.benefitCard}>
          <Image source={dark ? Images.subAiDark : Images.subAiLight} style={styles.benefitIcon} resizeMode="contain" />
          <View style={styles.benefitTextCol}>
            <Text style={styles.benefitTitle}>解锁智能AI训练</Text>
            <Text style={styles.benefitSub}>多种AI模型选择</Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, styles.plansTitle]}>选择套餐</Text>
        <View style={styles.plansRow}>
          {plans.map(plan => {
            const on = selected === plan.id;
            return (
              <TouchableOpacity
                key={plan.id}
                style={[styles.planCard, on && styles.planCardSelected]}
                activeOpacity={0.88}
                onPress={() => setSelected(plan.id)}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.originalPrice}>{plan.original}</Text>
                <View style={styles.priceRow}>
                  <Text style={[styles.priceCurrency, on && styles.priceOn]}>¥</Text>
                  <Text style={[styles.priceValue, on && styles.priceOn]}>{plan.price}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.agreementRow} activeOpacity={0.85} onPress={() => setAgreed(a => !a)}>
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed ? <Text style={styles.checkboxMark}>✓</Text> : null}
          </View>
          <Text style={styles.agreementText}>
            已阅读并同意<Text style={styles.agreementLink}>《会员购买协议》</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 底部固定按钮 */}
      <SafeAreaView style={styles.footerSafe}>
        <TouchableOpacity style={styles.purchaseOuter} activeOpacity={0.88} onPress={onPurchase}>
          <LinearGradient
            colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
            start={{x: 0.5, y: 0}}
            end={{x: 0.5, y: 1}}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Text style={styles.purchaseBtnText}>立即开通</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
};

const makeStyles = (colors, dark) =>
  StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    topBg: {position: 'absolute', top: 0, left: 0, right: 0, height: px(220)},
    // 贴图底沿是 #0E0A23，页底是蓝湖 #020014，iOS 会在 VIP→权益空隙里切出一条硬边。
    // 安卓同一张图在空隙里仍带着紫光；这里把最后一段溶进页底，只深色。
    // 浅色不另铺白雾：安卓也没有 overlay。右白来自蓝湖「背景」白底 + 圆形 2
    // (188,-85,187×187, #FFE1E8, blur 92) 已烤进 sub_top_light，以及 VIP 卡
    // 矩形 14 对角渐变 #FFE5EA → #FFFFFF。
    topBgFade: {
      position: 'absolute',
      top: px(168),
      left: 0,
      right: 0,
      height: px(92),
    },
    // 安卓：match_parent × 220dp、gravity=top、scaleType=fitXY。
    // 宽按屏宽、高按 375 稿 220 等比（px(220)），stretch=fitXY，从根视图 top:0 铺（与 topBg 同起点）。
    cornerLines: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: SCREEN_W,
      height: px(220),
    },
    headerSafe: {},
    header: {
      height: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
    },
    backHit: {width: 44, height: 44, justifyContent: 'center', alignItems: 'center'},
    backChevron: {fontSize: 30, fontWeight: '400', color: colors.textPrimary, marginTop: -4},
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
      ...(dark ? {lineHeight: 25} : null),
    },
    scroll: {flex: 1, backgroundColor: 'transparent'},
    // 蓝湖 t1/t2：内容左右 15；导航底 y=88 → VIP y=111 → paddingTop 23
    scrollContent: {
      paddingHorizontal: 15,
      paddingTop: px(23),
      paddingBottom: px(110),
    },
    // VIP 卡片 345×80 @ y=111；下沿 191 → 会员权益 y=240 → 49
    // 安卓 vipCard：clipChildren=false，贴图 ImageView fitXY、无 cornerRadius。
    // PNG 自带右上切口、1px 白边、矩形 14 左粉右白对角渐变；圆角会裁掉右面白纱。
    vipCard: {height: px(80), marginBottom: px(49), overflow: 'visible'},
    vipCardBg: {position: 'absolute', top: 0, left: 0, width: SCREEN_W - 30, height: px(80)},
    vipDiamond: {position: 'absolute', right: px(18), top: 0, width: px(64), height: px(64)},
    vipSvip: {position: 'absolute', left: px(16), top: px(19), width: px(47), height: px(13), tintColor: colors.textPrimary},
    vipBadge: {
      position: 'absolute',
      left: px(75),
      top: px(16),
      backgroundColor: '#FFFFFF',
      paddingHorizontal: px(8),
      paddingVertical: px(2),
      borderRadius: px(9),
    },
    vipBadgeText: {fontSize: 11, color: '#261216'},
    vipDate: {position: 'absolute', left: px(16), top: px(44), fontSize: 12, color: colors.textPrimary},
    // 会员权益 17 高 @ y=240（星 18）；权益卡 y=273 → 行下 15
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: px(15),
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 0,
      ...(dark ? {lineHeight: 17} : null),
    },
    sectionStar: {
      width: 18,
      height: 18,
      marginLeft: 3,
      marginBottom: 0,
    },
    // 选择套餐 y=363；权益卡下沿 343 → 上 20；套餐卡 y=395 → 标题下 15
    plansTitle: {marginBottom: px(15)},
    benefitCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: dark ? colors.card : '#FFF5F7',
      borderRadius: 16,
      paddingVertical: 13,
      paddingHorizontal: 15,
      marginBottom: px(20),
      height: px(70),
      borderWidth: dark ? 1 : 0,
      borderColor: colors.cardBorder,
    },
    benefitIcon: {width: 44, height: 44, marginRight: 12},
    benefitTextCol: {flex: 1},
    benefitTitle: {fontSize: 14, fontWeight: '500', color: colors.textPrimary},
    benefitSub: {fontSize: 11, color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(38,18,22,0.6)', marginTop: 4},
    plansRow: {flexDirection: 'row', gap: 15},
    planCard: {
      flex: 1,
      height: px(100),
      backgroundColor: dark ? colors.card : '#FFFFFF',
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderWidth: 1.5,
      borderColor: dark ? colors.cardBorder : '#EEE',
    },
    planCardSelected: {
      borderColor: colors.primary,
      borderWidth: 2,
      backgroundColor: dark ? colors.cardAlt : '#FFF5F7',
    },
    planName: {fontSize: 14, fontWeight: '500', color: colors.textPrimary},
    originalPrice: {fontSize: 12, color: '#A6A6A6', textDecorationLine: 'line-through', marginTop: 4},
    priceRow: {flexDirection: 'row', alignItems: 'flex-end', marginTop: 4},
    priceCurrency: {fontSize: 15, fontWeight: '600', color: dark ? '#A6A6A6' : '#261216', marginBottom: 3},
    priceValue: {fontSize: 22, fontWeight: '600', color: dark ? '#A6A6A6' : '#261216'},
    priceOn: {color: colors.primary},
    agreementRow: {flexDirection: 'row', alignItems: 'center', marginTop: px(15)},
    checkbox: {
      width: 18,
      height: 18,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: colors.card,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 8,
    },
    checkboxChecked: {backgroundColor: colors.primary, borderColor: colors.primary},
    checkboxMark: {color: '#FFFFFF', fontSize: 12, fontWeight: '800'},
    agreementText: {flex: 1, fontSize: 12, color: colors.textPrimary},
    agreementLink: {color: colors.primary},
    footerSafe: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    purchaseOuter: {height: px(44), borderRadius: px(22), overflow: 'hidden', justifyContent: 'center', alignItems: 'center'},
    purchaseBtnText: {color: '#FFFFFF', fontSize: 16, fontWeight: '600'},
  });

export default SubscriptionScreen;
