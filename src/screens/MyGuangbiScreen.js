// 蓝湖「提现」t2/t3 —— 我的光币（教师端光币总览）
import {SafeAreaView as EdgeSafeArea} from 'react-native-safe-area-context';
import React, {useCallback, useMemo, useState} from 'react';
import {View, Text, Image, StyleSheet, TouchableOpacity, ScrollView, Dimensions} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useTheme} from '../theme/ThemeContext';
import {Images} from '../assets/images';
import ScreenHeader from '../components/ScreenHeader';
import {getDeviceId} from '../services/device';
import {fetchTeacherGuangbi, fetchTeacherIncome} from '../services/guangbi';

const {width: SCREEN_W} = Dimensions.get('window');
const px = n => Math.round((n * SCREEN_W) / 375);

export default function MyGuangbiScreen({navigation}) {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const [balance, setBalance] = useState(0);
  const [income, setIncome] = useState(0);
  const [cashout, setCashout] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const id = getDeviceId();
      fetchTeacherGuangbi(id)
        .then(r => {
          if (!r || !r.ok) return;
          setBalance(Number(r.balance) || 0);
          const list = Array.isArray(r.cashouts) ? r.cashouts : [];
          setCashout(
            r.totalCashout != null
              ? Number(r.totalCashout) || 0
              : list.filter(c => c.status !== 'rejected').reduce((s, c) => s + (Number(c.amount) || 0), 0),
          );
        })
        .catch(() => {});
      fetchTeacherIncome(id)
        .then(r => {
          if (!r || !r.ok) return;
          const items = Array.isArray(r.items) ? r.items : [];
          setIncome(
            r.total != null
              ? Number(r.total) || 0
              : items.reduce((s, it) => s + (Number(it.delta) || 0), 0),
          );
        })
        .catch(() => {});
    }, []),
  );

  const arrow = dark ? Images.icRowArrowDark : Images.icRowArrowLight;

  return (
    <EdgeSafeArea edges={['bottom', 'left', 'right']} style={styles.root}>
      <ScreenHeader title="我的光币" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* (15,98) 345×180：切图含「立即提现」按钮 */}
        <View style={styles.card}>
          <Image
            source={dark ? Images.wdCardDark : Images.wdCardLight}
            style={styles.cardImg}
            resizeMode="stretch"
          />
          <Text style={styles.cardLabel}>当前帐户光币</Text>
          <Image source={dark ? Images.wdSafeDark : Images.wdSafeLight} style={styles.safeIcon} />
          <Text style={styles.safeText}>安全保障中</Text>
          <Text style={styles.balance}>{balance}</Text>
          <Text style={styles.cardHint}>可提现金额以平台审核后的有效收入为准</Text>
          <TouchableOpacity
            style={styles.cardBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Withdraw')}
            accessibilityRole="button"
            accessibilityLabel="立即提现"
          />
        </View>

        <View style={styles.tiles}>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>累计收入</Text>
            <Text style={styles.tileValue}>{income}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>累计提现</Text>
            <Text style={styles.tileValue}>{cashout}</Text>
          </View>
        </View>

        <View style={styles.menu}>
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('IncomeDetail')}>
            <Image source={dark ? Images.wdIncomeDark : Images.wdIncomeLight} style={styles.rowIcon} />
            <Text style={[styles.rowText, styles.rowTextMedium]}>收入明细</Text>
            <Image source={arrow} style={styles.rowArrow} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('WithdrawHistory')}>
            <Image source={dark ? Images.wdRecordsDark : Images.wdRecordsLight} style={styles.rowIcon} />
            <Text style={styles.rowText}>提现记录</Text>
            <Image source={arrow} style={styles.rowArrow} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </EdgeSafeArea>
  );
}

// 坐标取自蓝湖 提现_t2/t3（导航栏下 y−88）。
function makeStyles(colors, dark) {
  const text = dark ? '#FFFFFF' : '#261216';
  const panel = dark ? '#040428' : '#FFFFFF';
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: dark ? '#020014' : '#FAFAFA'},
    body: {paddingHorizontal: px(15), paddingTop: px(10), paddingBottom: px(30)},
    card: {width: px(345), height: px(180)},
    cardImg: {position: 'absolute', left: 0, top: 0, width: px(345), height: px(180)},
    cardLabel: {position: 'absolute', left: px(15), top: px(15), fontSize: px(14), lineHeight: px(20), color: text},
    safeIcon: {position: 'absolute', left: px(251), top: px(17), width: px(14), height: px(14)},
    safeText: {
      position: 'absolute',
      left: px(270),
      top: px(15),
      fontSize: px(12),
      lineHeight: px(17),
      color: dark ? '#B595FF' : '#FF355F',
    },
    balance: {
      position: 'absolute',
      left: px(15),
      top: px(40),
      fontSize: px(36),
      lineHeight: px(50),
      fontWeight: '700',
      color: text,
    },
    cardHint: {position: 'absolute', left: px(15), top: px(84), fontSize: px(12), lineHeight: px(20), color: '#979797'},
    cardBtn: {position: 'absolute', left: px(15), top: px(121), width: px(315), height: px(40), borderRadius: px(20)},
    tiles: {marginTop: px(15), flexDirection: 'row', justifyContent: 'space-between'},
    tile: {width: px(165), height: px(70), borderRadius: px(10), backgroundColor: panel},
    tileLabel: {
      position: 'absolute',
      left: px(15),
      top: px(10),
      fontSize: px(13),
      lineHeight: px(20),
      fontWeight: '500',
      color: text,
    },
    tileValue: {
      position: 'absolute',
      left: px(15),
      top: px(31),
      fontSize: px(24),
      lineHeight: px(34),
      fontWeight: '700',
      color: text,
    },
    menu: {marginTop: px(15), borderRadius: px(10), backgroundColor: panel, overflow: 'hidden'},
    row: {height: px(50)},
    rowIcon: {position: 'absolute', left: px(15), top: px(15), width: px(20), height: px(20)},
    rowText: {
      position: 'absolute',
      left: px(45),
      top: px(15),
      fontSize: px(14),
      lineHeight: px(20),
      fontWeight: '600',
      color: text,
    },
    rowTextMedium: {top: px(14), fontWeight: '500'},
    rowArrow: {position: 'absolute', left: px(314), top: px(17), width: px(16), height: px(16)},
  });
}
