// 蓝湖「收入明细」
import {SafeAreaView as EdgeSafeArea} from 'react-native-safe-area-context';
import React, {useCallback, useMemo, useState} from 'react';
import {
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
import WalletRecordRow, {fmtTime} from '../components/WalletRecordRow';

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
    <EdgeSafeArea edges={['bottom', 'left', 'right']} style={styles.root}>
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
          ListEmptyComponent={
            <Text style={styles.empty}>还没有收入明细。</Text>
          }
          renderItem={({item}) => (
            <WalletRecordRow
              dark={dark}
              title={
                item.title && item.title !== '课时费'
                  ? item.title
                  : '课时费入账'
              }
              time={fmtTime(item.createdAt)}
              amount={`+${item.delta}光币`}
            />
          )}
        />
      )}
    </EdgeSafeArea>
  );
}

function makeStyles(colors, dark) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: dark ? '#020014' : '#FAFAFA'},
    list: {paddingHorizontal: 15, paddingTop: 10, paddingBottom: 40},
    empty: {textAlign: 'center', color: colors.textSecondary, marginTop: 40},
  });
}
