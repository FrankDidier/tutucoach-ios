import React, {useEffect, useMemo, useState} from 'react';
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
} from 'react-native';
import {Colors} from '../utils/colors';
import {Images} from '../assets/images';
import ScreenHeader from '../components/ScreenHeader';
import {getDeviceId} from '../services/device';
import {getMembership} from '../services/account';
import {payWithWeChat} from '../services/wechat';

// 价格与服务端 PLANS 一致（年 599 / 月 66）；服务端是定价权威，App 只传 plan 标识。
const plans = [
  {id: 'yearly', name: '年卡', price: '599', original: '¥792.00'},
  {id: 'monthly', name: '月卡', price: '66', original: '¥99.00'},
];

const BANNER_STEPS = 32;
const BTN_STEPS = 28;

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function lerpChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function lerpRgb(from, to, t) {
  return `rgb(${lerpChannel(from.r, to.r, t)},${lerpChannel(
    from.g,
    to.g,
    t,
  )},${lerpChannel(from.b, to.b, t)})`;
}

const SubscriptionScreen = ({navigation}) => {
  const [selected, setSelected] = useState('yearly');
  const [agreed, setAgreed] = useState(false);
  const [vip, setVip] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = await getMembership(getDeviceId());
        if (alive && m && m.ok) setVip(m);
      } catch (e) {}
    })();
    return () => {
      alive = false;
    };
  }, []);

  const bannerStripes = useMemo(() => {
    const from = hexToRgb(Colors.pinkGradientStart);
    const to = hexToRgb(Colors.pinkGradientEnd);
    return Array.from({length: BANNER_STEPS}, (_, i) =>
      lerpRgb(from, to, i / (BANNER_STEPS - 1)),
    );
  }, []);

  const btnStripes = useMemo(() => {
    const from = hexToRgb(Colors.pinkButtonStart);
    const to = hexToRgb(Colors.pinkButtonEnd);
    return Array.from({length: BTN_STEPS}, (_, i) =>
      lerpRgb(from, to, i / (BTN_STEPS - 1)),
    );
  }, []);

  const onPurchase = async () => {
    if (!agreed) {
      Alert.alert('提示', '请先阅读并同意《会员购买协议》');
      return;
    }
    try {
      const r = await payWithWeChat(selected, getDeviceId());
      if (r.ok) {
        // 支付成功后刷新会员状态，立即更新顶部横幅（对应安卓 refreshMembership）。
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

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.pinkBg} />

      <ScreenHeader title="会员订阅" onBack={() => navigation?.goBack?.()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.bannerOuter}>
          <View style={styles.bannerGradient} pointerEvents="none">
            {bannerStripes.map((color, i) => (
              <View
                key={`b-${i}`}
                style={[styles.bannerStripe, {backgroundColor: color}]}
              />
            ))}
          </View>
          <View style={styles.bannerContent}>
            <View style={styles.bannerTextCol}>
              <View style={styles.vipBadge}>
                <Text style={styles.vipBadgeText}>
                  {vip && vip.is_vip ? 'VIP 已开通' : '未开通会员'}
                </Text>
              </View>
              <Text style={styles.bannerDate}>
                {vip && vip.is_vip
                  ? `会员有效期至 ${vip.expire_text}`
                  : '开通后解锁全部 AI 训练功能'}
              </Text>
            </View>
            <Image
              source={Images.diamondLarge}
              style={styles.bannerDiamond}
              resizeMode="contain"
            />
          </View>
        </View>

        <Text style={styles.sectionPink}>会员权益 ✨</Text>
        <View style={styles.benefitCard}>
          <Image
            source={Images.menuAiTraining}
            style={styles.benefitIcon}
            resizeMode="contain"
          />
          <View style={styles.benefitTextCol}>
            <Text style={styles.benefitLine}>解锁智能AI训练</Text>
            <Text style={styles.benefitLine}>多种AI模型选择</Text>
          </View>
        </View>

        <Text style={styles.sectionPlans}>选择套餐</Text>
        <View style={styles.plansRow}>
          {plans.map(plan => (
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.planCard,
                selected === plan.id && styles.planCardSelected,
              ]}
              activeOpacity={0.88}
              onPress={() => setSelected(plan.id)}>
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.originalPrice}>{plan.original}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.priceCurrency}>¥</Text>
                <Text style={styles.priceValue}>{plan.price}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.agreementRow}
          activeOpacity={0.85}
          onPress={() => setAgreed(a => !a)}>
          <View
            style={[styles.checkbox, agreed && styles.checkboxChecked]}
            accessibilityState={{checked: agreed}}>
            {agreed ? (
              <Text style={styles.checkboxMark}>✓</Text>
            ) : null}
          </View>
          <Text style={styles.agreementText}>
            已阅读并同意《会员购买协议》
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.purchaseOuter}
          activeOpacity={0.88}
          onPress={onPurchase}>
          <View style={styles.btnGradientRow} pointerEvents="none">
            {btnStripes.map((color, i) => (
              <View
                key={`p-${i}`}
                style={[styles.btnStripe, {backgroundColor: color}]}
              />
            ))}
          </View>
          <View style={styles.purchaseLabelWrap} pointerEvents="none">
            <Text style={styles.purchaseBtnText}>立即开通</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.pinkBg,
  },
  headerWrap: {
    position: 'relative',
    height: 48,
    overflow: 'hidden',
  },
  headerGradient: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  headerStripe: {
    flex: 1,
  },
  headerBar: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  backHit: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backChevron: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.white,
    marginTop: -2,
  },
  headerTitleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.white,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  bannerOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 100,
    marginBottom: 20,
  },
  bannerGradient: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  bannerStripe: {
    flex: 1,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingVertical: 18,
  },
  bannerTextCol: {
    flex: 1,
  },
  bannerDiamond: {
    width: 80,
    height: 80,
    marginLeft: 8,
  },
  vipBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  vipBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.pinkPrimary,
  },
  bannerDate: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
  sectionPink: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.pinkPrimary,
    marginBottom: 10,
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  benefitIcon: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  benefitTextCol: {
    flex: 1,
    gap: 4,
  },
  benefitLine: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  sectionPlans: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 20,
    marginBottom: 12,
  },
  plansRow: {
    flexDirection: 'row',
    gap: 10,
  },
  planCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 1,
  },
  planCardSelected: {
    borderColor: Colors.pinkPrimary,
  },
  planName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  originalPrice: {
    fontSize: 11,
    color: Colors.textSecondary,
    textDecorationLine: 'line-through',
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  priceCurrency: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.pinkPrimary,
    marginBottom: 3,
    marginRight: 1,
  },
  priceValue: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.pinkPrimary,
  },
  agreementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    gap: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.pinkPrimary,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.pinkPrimary,
    borderColor: Colors.pinkPrimary,
  },
  checkboxMark: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  agreementText: {
    flex: 1,
    fontSize: 12,
    color: Colors.pinkPrimary,
    lineHeight: 18,
  },
  purchaseOuter: {
    marginTop: 18,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  btnGradientRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  btnStripe: {
    flex: 1,
    height: '100%',
  },
  purchaseLabelWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  purchaseBtnText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
});

export default SubscriptionScreen;
