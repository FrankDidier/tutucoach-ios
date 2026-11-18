// 蓝湖「充值成功」
import React, {useMemo} from 'react';
import {View, Text, StyleSheet, SafeAreaView} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';

function fmt(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = n => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

export default function RechargeSuccessScreen({navigation, route}) {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const amount = route?.params?.amount || '0';
  const guangbi = route?.params?.guangbi || 0;
  const method = route?.params?.method || '微信';
  const at = route?.params?.at || Date.now();

  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader title="" onBack={() => navigation.goBack()} />
      <View style={styles.body}>
        <View style={styles.checkCircle}>
          <Text style={styles.checkMark}>✓</Text>
        </View>
        <Text style={styles.ok}>充值成功</Text>
        <Text style={styles.money}>¥{Number(amount).toFixed(2)}</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>充值方式</Text>
            <Text style={styles.val}>{method}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>充值时间</Text>
            <Text style={styles.val}>{fmt(at)}</Text>
          </View>
          <View style={[styles.row, {marginBottom: 0}]}>
            <Text style={styles.label}>到账光币</Text>
            <Text style={styles.val}>{guangbi}</Text>
          </View>
        </View>
      </View>

    </SafeAreaView>
  );
}

function makeStyles(colors, dark) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    body: {paddingHorizontal: 15, paddingTop: 40, alignItems: 'center'},
    checkCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: dark ? '#A98BF5' : colors.primary,
      marginBottom: 10,
    },
    checkMark: {color: '#FFFFFF', fontSize: 26, fontWeight: '700', lineHeight: 30},
    ok: {fontSize: 13, fontWeight: '600', color: dark ? '#B7A0F8' : colors.primary, marginBottom: 10},
    money: {fontSize: 32, fontWeight: '800', color: colors.textPrimary, marginBottom: 28},
    card: {
      width: '100%',
      backgroundColor: dark ? '#040428' : colors.card,
      borderRadius: 14,
      padding: 18,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    label: {color: colors.textSecondary, fontSize: 14},
    val: {color: colors.textPrimary, fontSize: 14, fontWeight: '600'},
  });
}
