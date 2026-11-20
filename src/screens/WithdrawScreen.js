// 蓝湖「提现 / 光币提现」
import {SafeAreaView as EdgeSafeArea} from 'react-native-safe-area-context';
import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';

const {width: SCREEN_W} = Dimensions.get('window');
const px = n => Math.round((n * SCREEN_W) / 375);
import LanhuCTA from '../components/LanhuCTA';
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
    <EdgeSafeArea edges={['left', 'right']} style={styles.root}>
      <ScreenHeader title="光币提现" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* (15,98) 345×180 */}
        <View style={[styles.card, styles.amountCard]}>
          <Text style={styles.label}>提现光币</Text>
          <Text style={styles.balHint}>当前光币余额：{balance}</Text>
          <TextInput
            style={styles.amtInput}
            value={amt}
            onChangeText={t => setAmt(t.replace(/[^\d]/g, ''))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={dark ? '#A1A1B4' : '#A6A6A6'}
          />
          <TouchableOpacity style={styles.allHit} onPress={onAll} hitSlop={8}>
            <Text style={styles.all}>全部提现</Text>
          </TouchableOpacity>
          <Text style={[styles.metaL, {top: px(91)}]}>提现总额</Text>
          <Text style={[styles.metaR, {top: px(91)}]}>{n || 0}</Text>
          <Text style={[styles.metaL, {top: px(118)}]}>手续费</Text>
          <Text style={[styles.metaR, {top: px(118)}]}>5%</Text>
          <Text style={[styles.metaL, {top: px(145)}]}>实际到账</Text>
          <Text style={[styles.metaR, {top: px(144)}]}>{net}</Text>
        </View>

        {/* (15,293) 345×90 */}
        <View style={[styles.card, styles.ruleCard]}>
          <Text style={styles.ruleTitle}>兑换规则</Text>
          <Text style={styles.rule}>
            兑现规则:100 光币=7元人民币。当前约合¥{yuan}。100光币起兑，我们会线下打款。
          </Text>
        </View>
      </ScrollView>

      <LanhuCTA title="立即提现" onPress={onSubmit} disabled={busy} />
    </EdgeSafeArea>
  );
}

// 坐标取自蓝湖 提现_t1/t4（导航栏下 y−88）。
function makeStyles(colors, dark) {
  const text = dark ? '#FFFFFF' : '#261216';
  const sub = dark ? '#A1A1B4' : '#A6A6A6';
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: dark ? '#020014' : '#FAFAFA'},
    body: {paddingHorizontal: px(15), paddingTop: px(10), paddingBottom: px(30)},
    card: {backgroundColor: dark ? '#040428' : '#FFFFFF', borderRadius: px(10)},
    amountCard: {height: px(180)},
    ruleCard: {marginTop: px(15), minHeight: px(90), paddingHorizontal: px(15), paddingTop: px(10), paddingBottom: px(15)},
    label: {position: 'absolute', left: px(15), top: px(15), fontSize: px(14), lineHeight: px(20), fontWeight: '600', color: text},
    balHint: {position: 'absolute', right: px(16), top: px(17), fontSize: px(12), lineHeight: px(17), color: sub},
    amtInput: {
      position: 'absolute',
      left: px(15),
      top: px(41),
      width: px(220),
      height: px(34),
      padding: 0,
      fontSize: px(24),
      fontWeight: '600',
      color: text,
    },
    allHit: {position: 'absolute', right: px(16), top: px(48)},
    all: {fontSize: px(13), lineHeight: px(18), color: text},
    metaL: {position: 'absolute', left: px(15), fontSize: px(12), lineHeight: px(17), color: sub},
    metaR: {position: 'absolute', right: px(15), fontSize: px(12), lineHeight: px(17), fontWeight: '500', color: text},
    ruleTitle: {fontSize: px(14), lineHeight: px(20), fontWeight: '600', color: dark ? '#FFFFFF' : '#222222'},
    rule: {marginTop: px(5), fontSize: px(12), lineHeight: px(20), color: sub},
  });
}
