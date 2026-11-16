// 蓝湖「收入明细」
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
import {fetchTeacherIncome} from '../services/guangbi';

function fmt(ts) {
  if (!ts) return '';
  const d = new Date(ts * (ts > 1e12 ? 1 : 1000));
  const p = n => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

export default function IncomeDetailScreen({navigation}) {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const [items, setItems] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetchTeacherIncome(getDeviceId());
      setItems((r && r.items) || []);
    } catch (e) {
      setItems([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader title="收入明细" onBack={() => navigation.goBack()} />
      {items == null ? (
        <ActivityIndicator color={colors.primary} style={{marginTop: 40}} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it, i) => `${it.coachId || ''}-${it.createdAt}-${i}`}
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
          ListEmptyComponent={<Text style={styles.empty}>还没有收入明细。</Text>}
          renderItem={({item}) => (
            <View style={styles.row}>
              <View style={styles.mid}>
                <Text style={styles.name}>{item.title || '课时费'}</Text>
                <Text style={styles.time}>{fmt(item.createdAt)}</Text>
              </View>
              <Text style={styles.amt}>+{item.delta}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors, dark) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    list: {paddingHorizontal: 15, paddingTop: 10, paddingBottom: 40},
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
    amt: {color: colors.textPrimary, fontSize: 16, fontWeight: '700'},
  });
}
