import React, {useEffect, useMemo, useState, useCallback} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  Dimensions,
  Platform,
  Linking,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useFocusEffect} from '@react-navigation/native';
import {Images} from '../assets/images';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import LanhuCTA from '../components/LanhuCTA';
import {getDeviceId} from '../services/device';
import {getMembership} from '../services/account';
import {payWithWeChat} from '../services/wechat';
import {getJson} from '../services/api';
import {buy as buyAppStore, loadProducts, restore as restoreAppStore} from '../services/appStore';

const IOS = Platform.OS === 'ios';

const {width: SCREEN_W} = Dimensions.get('window');
const S = SCREEN_W / 375;
const px = n => Math.round(n * S);

// 默认展示价（服务端拉取失败时回退）；真实扣款仍以服务端为准。
// 名称统一写成「连续包X」：这是自动续期订阅，审核要求页面上写清楚。
const DEFAULT_PLANS = [
  {id: 'yearly', name: '连续包年', price: '998', original: '¥1176.00', guangbi: 12000},
  {id: 'quarterly', name: '连续包季', price: '268', original: '¥294.00', guangbi: 3000},
  {id: 'monthly', name: '连续包月', price: '98', original: '¥118.00', guangbi: 1000},
];


const PLAN_CN = {
  yearly: {name: '连续包年', unit: '年', cycle: '每年'},
  quarterly: {name: '连续包季', unit: '季', cycle: '每 3 个月'},
  monthly: {name: '连续包月', unit: '月', cycle: '每月'},
};

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
    return {
      id: p.id,
      name: PLAN_CN[p.id]?.name || p.name || p.id,
      price,
      original,
      guangbi: Number(p.guangbi) || 0,
    };
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
  // iOS：价格以 App Store 返回的为准（按 Apple ID 所在地区显示币种）
  const [storePrices, setStorePrices] = useState({});
  const [busy, setBusy] = useState(false);

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
      if (IOS) {
        const got = await loadProducts();
        if (alive) setStorePrices(got);
      }
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
    // iOS 数字会员走 App Store 自动续期订阅
    if (IOS) {
      if (busy) return;
      setBusy(true);
      try {
        const r = await buyAppStore(selected);
        if (r.ok) {
          await refreshVip();
          Alert.alert('开通会员', '订阅成功，会员已开通');
        } else if (!r.cancelled) {
          Alert.alert('开通会员', r.message || '购买没有完成，请稍后重试');
        }
      } finally {
        setBusy(false);
      }
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

  const refreshVip = async () => {
    try {
      const m = await getMembership(getDeviceId());
      if (m && m.ok) setVip(m);
    } catch (e) {}
  };

  const onRestore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await restoreAppStore(true);
      if (r.ok) {
        await refreshVip();
        Alert.alert('恢复购买', '已恢复，会员已开通');
      } else {
        Alert.alert('恢复购买', r.message || '恢复购买没有完成，请稍后重试');
      }
    } finally {
      setBusy(false);
    }
  };

  const priceText = plan => {
    const sp = storePrices[plan.id];
    return sp && sp.displayPrice ? sp.displayPrice : `¥${plan.price}`;
  };

  const isVip = vip && vip.is_vip;
  const curPlan = plans.find(p => p.id === selected) || plans[0] || {};
  const curCycle = (PLAN_CN[selected] || {}).cycle || '每月';
  const curPrice = curPlan.price ? priceText(curPlan) : '';
  const curName = (PLAN_CN[selected] || {}).name || curPlan.name || '会员';

  const ink = dark ? '#FFFFFF' : '#261216';
  const accent = dark ? '#B595FF' : '#FF355F';

  return (
    <View style={styles.root}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor="transparent" translucent />
      <Image
        source={dark ? Images.subTopDark : Images.subTopLight}
        style={styles.topBg}
        resizeMode="stretch"
        pointerEvents="none"
      />
      <ScreenHeader
        title="会员订阅"
        variant="detect"
        onBack={() => navigation?.goBack?.()}
        right={
          IOS ? (
            <TouchableOpacity activeOpacity={0.7} onPress={onRestore}>
              <Text style={styles.restoreText}>恢复购买</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* VIP 卡 345×80 (16,111)：svip (31,130)；已开通 48×20 r4 (83,127)；有效期 (31,157)；钻石 64 (279,111) */}
        <View style={styles.vipCard}>
          <Image source={dark ? Images.subVipDark : Images.subVipLight} style={styles.vipCardBg} resizeMode="stretch" />
          <Image source={dark ? Images.subDiamondDark : Images.subDiamondLight} style={styles.vipDiamond} resizeMode="contain" />
          <Image source={dark ? Images.subSvipDark : Images.subSvipLight} style={styles.vipSvip} resizeMode="contain" />
          <View style={styles.vipBadge}>
            <Text style={styles.vipBadgeText}>{isVip ? '已开通' : '未开通'}</Text>
          </View>
          <Text style={[styles.vipDate, {color: ink}]}>
            {isVip
              ? vip.guangbi != null
                ? `当前光币 ${vip.guangbi}`
                : `会员有效期至${vip.expire_text}`
              : '开通后获得光币，用于解锁 AI 角色'}
          </Text>
        </View>

        <View style={styles.sectionRow}>
          <Text style={[styles.sectionTitle, {color: ink}]}>会员权益</Text>
          <Image source={dark ? Images.subStarDark : Images.subStarLight} style={styles.sectionStar} resizeMode="contain" />
        </View>

        <View style={styles.benefitCard}>
          <Image source={dark ? Images.subAiDark : Images.subAiLight} style={styles.benefitIcon} resizeMode="contain" />
          <View>
            <Text style={[styles.benefitTitle, {color: ink}]}>解锁智能AI训练</Text>
            <Text style={styles.benefitSub}>多种AI模型选择</Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, styles.plansTitle, {color: ink}]}>选择套餐</Text>
        <View style={styles.plansRow}>
          {plans.map(plan => {
            const on = selected === plan.id;
            const cn = PLAN_CN[plan.id] || {};
            const priceColor = on ? accent : dark ? '#A6A6A6' : '#261216';
            const card = (
              <>
                <Text style={[styles.planName, {color: ink}]}>{cn.name || plan.name}</Text>
                {IOS ? (
                  <Text style={styles.planSub} numberOfLines={1}>
                    {plan.guangbi ? `到账 ${plan.guangbi} 光币` : `${cn.cycle || '每月'}自动续费`}
                  </Text>
                ) : (
                  <Text style={[styles.planSub, styles.planStrike]}>{plan.original}</Text>
                )}
                {IOS ? (
                  <Text
                    style={[styles.priceStore, {color: priceColor}]}
                    numberOfLines={1}
                    adjustsFontSizeToFit>
                    {priceText(plan)}
                  </Text>
                ) : (
                  <View style={styles.priceRow}>
                    <Text style={[styles.priceCurrency, {color: priceColor}]}>¥</Text>
                    <Text style={[styles.priceValue, {color: priceColor}]}>{plan.price}</Text>
                  </View>
                )}
              </>
            );
            return (
              <TouchableOpacity
                key={plan.id}
                style={styles.planHit}
                activeOpacity={0.88}
                onPress={() => setSelected(plan.id)}>
                {on ? (
                  <LinearGradient
                    colors={dark ? ['#B595FF', '#7F47FE'] : ['#FF7A9A', '#FF355F']}
                    start={{x: 0.5, y: 0}}
                    end={{x: 0.5, y: 1}}
                    style={styles.planBorderGrad}>
                    <View style={[styles.planInner, styles.planInnerOn]}>{card}</View>
                  </LinearGradient>
                ) : (
                  <View style={[styles.planInner, styles.planOff]}>{card}</View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.agreementRow} activeOpacity={0.85} onPress={() => setAgreed(a => !a)}>
          <View style={[styles.checkbox, agreed && {backgroundColor: accent, borderColor: accent}]}>
            {agreed ? <Text style={styles.checkboxMark}>✓</Text> : null}
          </View>
          <Text style={[styles.agreementText, {color: dark ? '#FFFFFF' : '#222222'}]}>
            已阅读并同意
            <Text style={{color: accent}} onPress={() => navigation?.navigate?.('Legal')}>
              《会员购买协议》
            </Text>
            {IOS ? (
              <>
                、
                <Text style={{color: accent}} onPress={() => navigation?.navigate?.('Legal')}>
                  《隐私政策》
                </Text>
                与
                <Text
                  style={{color: accent}}
                  onPress={() => {
                    try {
                      Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/');
                    } catch (e) {}
                  }}>
                  《Terms of Use (EULA)》
                </Text>
              </>
            ) : null}
          </Text>
        </TouchableOpacity>

        {/* 审核要求：订阅页必须写清楚这是自动续期订阅、续费价格与取消方式 */}
        <Text style={styles.renewText}>
          本会员为连续订阅（自动续费），按所选周期（{curCycle}）自动续费 {curPrice}，
          {IOS ? '由 Apple ID 账户扣款' : '由所选支付方式扣款'}；当前订阅期结束前 24 小时内自动续订，如需取消请在到期前 24 小时以上
          {IOS ? '于「设置 → Apple ID → 订阅」中关闭自动续订' : '在「我的 → 会员订阅」中关闭自动续订'}
          。取消后本订阅期内权益仍可使用，到期不再扣费。
        </Text>
      </ScrollView>

      <LanhuCTA
        title={busy ? '请稍候…' : IOS ? `开通${curName} ${curPrice}/${(PLAN_CN[selected] || {}).unit || '月'}` : '立即开通'}
        loading={busy}
        onPress={onPurchase}
      />
    </View>
  );
};

const makeStyles = (colors, dark) =>
  StyleSheet.create({
    root: {flex: 1, backgroundColor: dark ? '#020014' : '#FFFFFF'},
    topBg: {position: 'absolute', top: 0, left: 0, width: SCREEN_W, height: px(220)},
    restoreText: {fontSize: px(14), color: dark ? '#B595FF' : '#FF355F', paddingHorizontal: px(10)},
    scroll: {flex: 1},
    scrollContent: {paddingTop: px(23), paddingBottom: px(24)},
    vipCard: {marginLeft: px(16), width: px(345), height: px(80)},
    vipCardBg: {position: 'absolute', top: 0, left: 0, width: px(345), height: px(80)},
    vipDiamond: {position: 'absolute', left: px(263), top: 0, width: px(64), height: px(64)},
    vipSvip: {position: 'absolute', left: px(15), top: px(19), width: px(47), height: px(13)},
    vipBadge: {
      position: 'absolute',
      left: px(67),
      top: px(16),
      height: px(20),
      paddingHorizontal: px(7),
      borderRadius: px(4),
      backgroundColor: '#FFFFFF',
      justifyContent: 'center',
    },
    vipBadgeText: {fontSize: px(11), lineHeight: px(17), color: '#261216'},
    vipDate: {position: 'absolute', left: px(15), top: px(46), fontSize: px(12), lineHeight: px(17)},
    sectionRow: {flexDirection: 'row', alignItems: 'center', marginTop: px(49), marginLeft: px(15), height: px(18)},
    sectionTitle: {fontSize: px(16), lineHeight: px(17), fontWeight: '600'},
    sectionStar: {width: px(18), height: px(18), marginLeft: px(3)},
    benefitCard: {
      marginTop: px(15),
      marginLeft: px(13),
      width: px(345),
      height: px(70),
      borderRadius: px(10),
      backgroundColor: dark ? '#131444' : '#FFF5F7',
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingLeft: px(15),
      paddingTop: px(13),
    },
    benefitIcon: {width: px(44), height: px(44), marginRight: px(11)},
    benefitTitle: {fontSize: px(14), lineHeight: px(24), fontWeight: '500', marginTop: -px(2)},
    benefitSub: {
      fontSize: px(11),
      lineHeight: px(24),
      color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(38,18,22,0.6)',
      marginTop: -px(2),
    },
    plansTitle: {marginTop: px(20), marginLeft: px(15)},
    plansRow: {flexDirection: 'row', marginTop: px(15), marginLeft: px(15)},
    planHit: {width: px(105), height: px(100), marginRight: px(15)},
    planBorderGrad: {flex: 1, borderRadius: px(8), padding: 2},
    planInner: {flex: 1, borderRadius: px(8), paddingLeft: px(10) - 2, paddingTop: px(10) - 2},
    planInnerOn: {borderRadius: px(6), backgroundColor: dark ? '#131444' : '#FFF5F7'},
    planOff: {
      borderWidth: 2,
      borderColor: dark ? 'rgba(255,255,255,0.1)' : '#F7F7F7',
      backgroundColor: dark ? '#040428' : '#FFFFFF',
    },
    planName: {fontSize: px(14), lineHeight: px(20), fontWeight: '500'},
    planSub: {fontSize: px(12), lineHeight: px(17), color: '#A6A6A6', marginTop: px(2)},
    planStrike: {textDecorationLine: 'line-through'},
    priceRow: {flexDirection: 'row', alignItems: 'flex-end', marginTop: px(8)},
    priceCurrency: {fontSize: px(16), lineHeight: px(22), fontWeight: '600', marginBottom: px(3), marginRight: px(2)},
    priceValue: {fontSize: px(24), lineHeight: px(34), fontWeight: '600'},
    priceStore: {fontSize: px(22), lineHeight: px(34), fontWeight: '600', marginTop: px(8), marginRight: px(8)},
    agreementRow: {flexDirection: 'row', alignItems: 'flex-start', marginTop: px(15), marginHorizontal: px(15)},
    checkbox: {
      width: px(16),
      height: px(16),
      borderRadius: px(3),
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.1)',
      backgroundColor: '#FFFFFF',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: px(4),
      marginRight: px(5),
    },
    checkboxMark: {color: '#FFFFFF', fontSize: px(11), fontWeight: '800'},
    agreementText: {flex: 1, fontSize: px(12), lineHeight: px(24)},
    renewText: {
      marginTop: px(10),
      marginHorizontal: px(15),
      fontSize: px(11),
      lineHeight: px(17),
      color: '#979797',
    },
  });

export default SubscriptionScreen;
