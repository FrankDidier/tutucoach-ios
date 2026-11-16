// 蓝湖「提现记录」1:1：顶部分类 tab + 列表
import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {getDeviceId} from '../services/device';
import {fetchTeacherGuangbi} from '../services/guangbi';

const TABS = [
  {id: 'all', label: '全部'},
  {id: 'review', label: '审核中'},
  {id: 'pending', label: '处理中'},
  {id: 'paid', label: '已到账'},
];

function statusLabel(s) {
  if (s === 'paid' || s === 'done') return '已到账';
  if (s === 'rejected') return '已拒绝';
  if (s === 'review' || s === 'reviewing') return '审核中';
  return '处理中';
}

function statusBucket(s) {
  if (s === 'paid' || s === 'done') return 'paid';
  if (s === 'review' || s === 'reviewing') return 'review';
  if (s === 'rejected') return 'review';
  return 'pending';
}

function fmt(ts) {
  if (!ts) return '';
  const d = new Date(ts * (ts > 1e12 ? 1 : 1000));
  const p = n => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

export default function WithdrawHistoryScreen({navigation}) {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetchTeacherGuangbi(getDeviceId());
      setItems((r && r.cashouts) || []);
    } catch (e) {
      setItems([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    if (!items) return [];
    if (tab === 'all') return items;
    return items.filter(it => statusBucket(it.status) === tab);
  }, [items, tab]);

  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader title="提现记录" onBack={() => navigation.goBack()} />
      <View style={styles.tabs}>
        {TABS.map(t => {
          const on = tab === t.id;
          return (
            <TouchableOpacity key={t.id} style={styles.tabHit} onPress={() => setTab(t.id)}>
              <Text style={[styles.tabText, on && styles.tabOn]}>{t.label}</Text>
              {on ? <View style={styles.tabUnderline} /> : <View style={styles.tabUnderlineOff} />}
            </TouchableOpacity>
          );
        })}
      </View>
      {items == null ? (
        <ActivityIndicator color={colors.primary} style={{marginTop: 40}} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it, i) => String(it.id ?? i)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ListEmptyComponent={<Text style={styles.empty}>还没有提现记录。</Text>}
          renderItem={({item}) => {
            const label = statusLabel(item.status);
            const paid = label === '已到账';
            return (
              <View style={styles.row}>
                <View style={styles.mid}>
                  <Text style={styles.name}>提现{Number(item.amount || 0).toLocaleString()}光币</Text>
                  <Text style={styles.time}>{fmt(item.createdAt)}</Text>
                </View>
                <Text style={[styles.status, paid && styles.statusPaid]}>{label}</Text>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors, dark) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    tabs: {
      flexDirection: 'row',
      paddingHorizontal: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    tabHit: {flex: 1, alignItems: 'center', paddingTop: 12, paddingBottom: 8},
    tabText: {color: colors.textSecondary, fontSize: 14, fontWeight: '500'},
    tabOn: {color: colors.primary, fontWeight: '700'},
    tabUnderline: {
      marginTop: 8,
      height: 3,
      width: 28,
      borderRadius: 2,
      backgroundColor: colors.primary,
    },
    tabUnderlineOff: {marginTop: 8, height: 3, width: 28},
    list: {paddingHorizontal: 15, paddingTop: 14, paddingBottom: 40},
    empty: {textAlign: 'center', color: colors.textSecondary, marginTop: 40},
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: dark ? '#040428' : colors.card,
      borderRadius: 12,
      padding: 15,
      marginBottom: 12,
      minHeight: 70,
    },
    mid: {flex: 1},
    name: {color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 4},
    time: {color: colors.textMuted, fontSize: 12},
    status: {color: colors.primary, fontSize: 14, fontWeight: '600'},
    statusPaid: {color: colors.textSecondary},
  });
}
