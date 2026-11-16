// 蓝湖「充值成功」
import React, {useMemo} from 'react';
import {View, Text, StyleSheet, SafeAreaView, TouchableOpacity} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
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
      <ScreenHeader title="充值成功" onBack={() => navigation.goBack()} />
      <View style={styles.body}>
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

      <View style={styles.footer}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => navigation.navigate('Recharge')}>
          <LinearGradient
            colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
            start={{x: 0, y: 0}}
            end={{x: 1, y: 0}}
            style={styles.cta}>
            <Text style={styles.ctaText}>确认</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors, dark) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    body: {paddingHorizontal: 15, paddingTop: 40, alignItems: 'center'},
    ok: {fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 8},
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
    footer: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 28,
    },
    cta: {
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  });
}
