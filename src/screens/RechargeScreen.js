// 蓝湖「充值光币」t1/t2 1:1
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {Images} from '../assets/images';
import {getDeviceId} from '../services/device';
import {fetchWallet} from '../services/guangbi';
import {getJson} from '../services/api';
import {payWithWeChat} from '../services/wechat';
import {buy as buyAppStore} from '../services/appStore';

const {width: SCREEN_W} = Dimensions.get('window');
const S = SCREEN_W / 375;
const px = n => Math.round(n * S);

const DEFAULT_PACKS = [
  {id: 'r30', name: '充值300光币', price: '30', guangbi: 300},
  {id: 'r100', name: '充值1000光币', price: '100', guangbi: 1000},
  {id: 'r300', name: '充值3300光币', price: '300', guangbi: 3300},
  {id: 'r500', name: '充值6000光币', price: '500', guangbi: 6000},
];

export default function RechargeScreen({navigation}) {
  const {colors, mode} = useTheme();
  const insets = useSafeAreaInsets();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const [balance, setBalance] = useState(0);
  const [packs, setPacks] = useState(DEFAULT_PACKS);
  const [selected, setSelected] = useState('r30');
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const w = await fetchWallet(getDeviceId());
      if (w && w.ok) setBalance(Number(w.balance) || 0);
    } catch (e) {}
    try {
      const j = await getJson('/api/pay/plans', {platform: Platform.OS, _t: Date.now()});
      if (j && Array.isArray(j.recharge) && j.recharge.length) {
        // Prefer design order / known ids; keep server amounts
        const mapped = j.recharge.map(p => ({
          id: p.id,
          name: p.name || `充值${p.guangbi}光币`,
          price: String(Math.round(parseFloat(p.amount || p.price || '0'))),
          guangbi: Number(p.guangbi) || 0,
        }));
        setPacks(mapped.length ? mapped : DEFAULT_PACKS);
      }
    } catch (e) {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (packs.length && !packs.find(p => p.id === selected)) {
      setSelected(packs[0].id);
    }
  }, [packs, selected]);

  const cur = packs.find(p => p.id === selected) || packs[0];
  const walletBg = dark ? Images.lanhuWalletCardDark : Images.lanhuWalletCardLight;

  const onConfirm = async () => {
    if (!cur || busy) return;
    if (!agreed) {
      Alert.alert('提示', '请先阅读并同意《兔兔教练充值服务协议》', [{text: '好的'}]);

      return;
    }
    setBusy(true);
    try {
      let r = null;
      if (Platform.OS === 'ios') {
        r = await buyAppStore(cur.id, getDeviceId());
      } else {
        r = await payWithWeChat(cur.id, getDeviceId());
      }
      if (r && r.ok) {
        await refresh();
        navigation.navigate('RechargeSuccess', {
          amount: cur.price,
          guangbi: cur.guangbi,
          method: Platform.OS === 'ios' ? 'App Store' : '微信',
          at: Date.now(),
        });
      } else {
        Alert.alert('充值', (r && r.message) || '支付未完成，请稍后重试。');
      }
    } catch (e) {
      Alert.alert('充值', '网络异常，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader title="充值光币" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.walletWrap}>
          <Image source={walletBg} style={styles.walletImg} resizeMode="cover" />
          <View style={styles.walletInner}>
            <View style={styles.walletTop}>
              <Text style={styles.walletLabel}>帐户光币</Text>
              <View style={styles.secureRow}>
                <Image source={Images.lanhuShield} style={styles.shield} resizeMode="contain" />
                <Text style={styles.secure}>安全保障中</Text>
              </View>
            </View>
            <Text style={styles.walletBal}>{balance}</Text>
            <View style={styles.walletLinks}>
              <TouchableOpacity
                style={styles.linkHit}
                onPress={() => navigation.navigate('LedgerHistory', {kind: 'recharge'})}>
                <Text style={styles.link}>充值记录</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkHit}
                onPress={() => navigation.navigate('LedgerHistory', {kind: 'spend'})}>
                <Text style={styles.link}>消费明细</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <Text style={styles.section}>充值额度</Text>
        <View style={styles.grid}>
          {packs.map(p => {
            const on = p.id === selected;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.pack, on && styles.packOn]}
                activeOpacity={0.88}
                onPress={() => setSelected(p.id)}>
                <Text style={[styles.packPrice, on && styles.packOnText]}>
                  <Text style={styles.yen}>¥</Text>
                  {p.price}
                </Text>
                <Text style={[styles.packSub, on && styles.packOnText]}>
                  {p.name || `充值${p.guangbi}光币`}
                </Text>
                {on ? (
                  <Image source={Images.lanhuCheck} style={styles.check} resizeMode="contain" />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, {paddingBottom: Math.max(insets.bottom, px(18))}]}>
        <TouchableOpacity
          style={styles.agreeRow}
          activeOpacity={0.85}
          onPress={() => setAgreed(v => !v)}>
          <View style={[styles.box, agreed && styles.boxOn]}>
            {agreed ? <Text style={styles.boxTick}>✓</Text> : null}
          </View>
          <Text style={styles.agreeText}>
            已阅读并同意
            <Text
              style={styles.agreeLink}
              onPress={() => navigation.navigate('Legal')}>
              《兔兔教练充值服务协议》
            </Text>
          </Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.9} disabled={busy} onPress={onConfirm}>
          <LinearGradient
            colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
            start={{x: 0, y: 0}}
            end={{x: 1, y: 0}}
            style={styles.cta}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>确认充值</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors, dark) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    body: {paddingHorizontal: px(15), paddingBottom: px(140)},
    walletWrap: {
      marginTop: px(8),
      borderRadius: px(14),
      overflow: 'hidden',
      height: px(150),
    },
    walletImg: {...StyleSheet.absoluteFillObject, width: '100%', height: '100%'},
    walletInner: {flex: 1, paddingHorizontal: px(15), paddingTop: px(14)},
    walletTop: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
    walletLabel: {color: '#fff', fontSize: px(14)},
    secureRow: {flexDirection: 'row', alignItems: 'center'},
    shield: {width: px(14), height: px(14), marginRight: 4, tintColor: '#fff'},
    secure: {color: 'rgba(255,255,255,0.92)', fontSize: px(12)},
    walletBal: {color: '#fff', fontSize: px(36), fontWeight: '800', marginTop: px(4)},
    walletLinks: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: px(50),
      flexDirection: 'row',
      backgroundColor: 'rgba(255,255,255,0.1)',
    },
    linkHit: {flex: 1, alignItems: 'center', justifyContent: 'center'},
    link: {color: '#fff', fontSize: px(14), fontWeight: '600'},
    section: {
      color: colors.textPrimary,
      fontSize: px(16),
      fontWeight: '700',
      marginTop: px(22),
      marginBottom: px(12),
    },
    grid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between'},
    pack: {
      width: '48%',
      height: px(90),
      borderRadius: px(12),
      backgroundColor: dark ? '#040428' : colors.card,
      borderWidth: 1.5,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: px(12),
      overflow: 'hidden',
    },
    packOn: {
      borderColor: colors.primary,
      backgroundColor: dark ? 'rgba(127,71,254,0.12)' : 'rgba(255,53,95,0.06)',
    },
    packPrice: {color: colors.textPrimary, fontSize: px(28), fontWeight: '800'},
    yen: {fontSize: px(14), fontWeight: '600'},
    packSub: {color: colors.textSecondary, fontSize: px(12), marginTop: px(4)},
    packOnText: {color: colors.primary},
    check: {
      position: 'absolute',
      right: px(8),
      bottom: px(8),
      width: px(16),
      height: px(16),
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: px(16),
      paddingBottom: px(18),
      paddingTop: px(10),
      backgroundColor: dark ? '#040428' : colors.card,
    },
    agreeRow: {flexDirection: 'row', alignItems: 'center', marginBottom: px(10)},
    box: {
      width: px(16),
      height: px(16),
      borderRadius: 3,
      borderWidth: 1,
      borderColor: colors.textMuted,
      marginRight: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxOn: {backgroundColor: colors.primary, borderColor: colors.primary},
    boxTick: {color: '#fff', fontSize: 11, fontWeight: '700', marginTop: -1},
    agreeText: {flex: 1, color: colors.textSecondary, fontSize: px(12), lineHeight: px(18)},
    agreeLink: {color: colors.primary},
    cta: {
      height: px(44),
      borderRadius: px(12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaText: {color: '#fff', fontSize: px(16), fontWeight: '700'},
  });
}
