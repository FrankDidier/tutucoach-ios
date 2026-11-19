// 蓝湖「充值记录」/「消费记录」
import {SafeAreaView as EdgeSafeArea} from 'react-native-safe-area-context';
import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {getDeviceId} from '../services/device';
import {fetchLedger} from '../services/guangbi';

function fmt(ts) {
  if (!ts) return '';
  const d = new Date(ts * (ts > 1e12 ? 1 : 1000));
  const p = n => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

export default function LedgerHistoryScreen({navigation, route}) {
  const kind = route?.params?.kind === 'spend' ? 'spend' : 'recharge';
  const title = kind === 'spend' ? '消费明细' : '充值记录';
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const [items, setItems] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetchLedger(getDeviceId(), kind);
      if (r && r.ok === false && !Array.isArray(r.items)) {
        setItems([]);
        return;
      }
      setItems((r && r.items) || []);
    } catch (e) {
      setItems([]);
    }
  }, [kind]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <EdgeSafeArea edges={['bottom', 'left', 'right']} style={styles.root}>
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />
      {items == null ? (
        <ActivityIndicator color={colors.primary} style={{marginTop: 40}} />
      ) : (
        <FlatList
          data={items}
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
          ListEmptyComponent={
            <Text style={styles.empty}>
              {kind === 'spend' ? '还没有消费记录。' : '还没有充值记录。'}
            </Text>
          }
          renderItem={({item}) => {
            const delta = Number(item.delta) || 0;
            const plus = delta > 0;
            return (
              <View style={styles.row}>
                <View style={styles.icon}>
                  <Text style={styles.iconText}>{kind === 'spend' ? '消' : '充'}</Text>
                </View>
                <View style={styles.mid}>
                  <Text style={styles.name}>{item.title || (plus ? '充值' : '消费')}</Text>
                  <Text style={styles.time}>{fmt(item.createdAt)}</Text>
                </View>
                <Text style={[styles.amt, plus ? styles.plus : styles.minus]}>
                  {plus ? '+' : ''}
                  {delta}
                </Text>
              </View>
            );
          }}
        />
      )}
    </EdgeSafeArea>
  );
}

function makeStyles(colors, dark) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    list: {paddingHorizontal: 15, paddingTop: 10, paddingBottom: 40},
    empty: {textAlign: 'center', color: colors.textSecondary, marginTop: 40, fontSize: 14},
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: dark ? '#040428' : colors.card,
      borderRadius: 12,
      paddingHorizontal: 15,
      paddingVertical: 14,
      marginBottom: 15,
      minHeight: 70,
    },
    icon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: dark ? 'rgba(181,149,255,0.18)' : 'rgba(255,53,95,0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    iconText: {color: colors.primary, fontWeight: '700', fontSize: 14},
    mid: {flex: 1},
    name: {color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 4},
    time: {color: colors.textMuted, fontSize: 12},
    amt: {fontSize: 16, fontWeight: '700'},
    plus: {color: colors.textPrimary},
    minus: {color: colors.danger || '#FF5A7F'},
  });
}
