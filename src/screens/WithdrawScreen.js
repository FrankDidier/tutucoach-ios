// 蓝湖「提现 / 光币提现」
import {SafeAreaView as EdgeSafeArea} from 'react-native-safe-area-context';
import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useFocusEffect} from '@react-navigation/native';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {getDeviceId} from '../services/device';
import {fetchTeacherGuangbi, requestCashout} from '../services/guangbi';

const FEE_RATE = 0.05; // 设计稿示意 5%；实际打款规则仍以服务端为准

export default function WithdrawScreen({navigation}) {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const [balance, setBalance] = useState(0);
  const [yuan, setYuan] = useState(0);
  const [amt, setAmt] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetchTeacherGuangbi(getDeviceId());
      if (r && r.ok) {
        setBalance(Number(r.balance) || 0);
        setYuan(Number(r.yuan) || 0);
      }
    } catch (e) {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const n = parseInt(amt, 10) || 0;
  const fee = Math.round(n * FEE_RATE);
  const net = Math.max(0, n - fee);

  const onAll = () => setAmt(String(balance || 0));

  const onSubmit = async () => {
    if (busy) return;
    if (n < 100) {
      Alert.alert('数量太少', '至少 100 光币才能申请兑现。');
      return;
    }
    setBusy(true);
    try {
      const r = await requestCashout(n, getDeviceId());
      if (r && r.ok) {
        setBalance(Number(r.balance) || 0);
        setAmt('');
        Alert.alert('已提交', '兑现申请已记下，我们会把对应现金打给你。', [
          {text: '查看记录', onPress: () => navigation.navigate('WithdrawHistory')},
          {text: '好的'},
        ]);
        load();
      } else {
        Alert.alert(
          '无法兑现',
          r && r.error === 'insufficient'
            ? '光币不够。'
            : r && r.error === 'too_small'
              ? '至少 100 光币。'
              : '请稍后重试',
        );
      }
    } catch (e) {
      Alert.alert('无法兑现', '网络异常，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <EdgeSafeArea edges={['bottom', 'left', 'right']} style={styles.root}>
      <ScreenHeader title="光币提现" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <View style={styles.topRow}>
            <Text style={styles.label}>提现光币</Text>
            <Text style={styles.balHint}>当前光币余额：{balance}</Text>
          </View>
          <View style={styles.amtRow}>
            <TextInput
              style={styles.amtInput}
              value={amt}
              onChangeText={t => setAmt(t.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
            />
            <TouchableOpacity onPress={onAll}>
              <Text style={styles.all}>全部提现</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />
          <View style={styles.meta}>
            <Text style={styles.metaL}>提现总额</Text>
            <Text style={styles.metaR}>{n || 0}</Text>
          </View>
          <View style={styles.meta}>
            <Text style={styles.metaL}>手续费</Text>
            <Text style={styles.metaR}>5%</Text>
          </View>
          <View style={styles.meta}>
            <Text style={styles.metaL}>实际到账</Text>
            <Text style={styles.metaR}>{net}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.ruleTitle}>兑换规则</Text>
          <Text style={styles.rule}>
            兑现规则：100 光币=7元人民币。当前约合¥{yuan}。100光币起兑，我们会线下打款。
          </Text>
        </View>

        <View style={styles.links}>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => navigation.navigate('IncomeDetail')}>
            <Text style={styles.linkText}>收入明细</Text>
            <Text style={styles.chev}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => navigation.navigate('WithdrawHistory')}>
            <Text style={styles.linkText}>提现记录</Text>
            <Text style={styles.chev}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity activeOpacity={0.9} disabled={busy} onPress={onSubmit}>
          <LinearGradient
            colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
            start={{x: 0, y: 0}}
            end={{x: 1, y: 0}}
            style={styles.cta}>
            <Text style={styles.ctaText}>立即提现</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </EdgeSafeArea>
  );
}

function makeStyles(colors, dark) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    body: {padding: 15, paddingBottom: 120},
    card: {
      backgroundColor: dark ? '#040428' : colors.card,
      borderRadius: 14,
      padding: 15,
      marginBottom: 15,
    },
    topRow: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8},
    label: {color: colors.textPrimary, fontSize: 14, fontWeight: '600'},
    balHint: {color: colors.textSecondary, fontSize: 12},
    amtRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
    amtInput: {
      flex: 1,
      fontSize: 28,
      fontWeight: '800',
      color: colors.textPrimary,
      paddingVertical: 4,
    },
    all: {color: colors.textPrimary, fontSize: 13, fontWeight: '600'},
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.divider,
      marginVertical: 12,
    },
    meta: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8},
    metaL: {color: colors.textSecondary, fontSize: 13},
    metaR: {color: colors.textPrimary, fontSize: 13, fontWeight: '600'},
    ruleTitle: {color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 8},
    rule: {color: colors.textSecondary, fontSize: 13, lineHeight: 20},
    links: {
      backgroundColor: dark ? '#040428' : colors.card,
      borderRadius: 14,
      overflow: 'hidden',
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 15,
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    linkText: {color: colors.textPrimary, fontSize: 15, fontWeight: '600'},
    chev: {color: colors.textMuted, fontSize: 22},
    footer: {position: 'absolute', left: 16, right: 16, bottom: 28},
    cta: {
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  });
}
