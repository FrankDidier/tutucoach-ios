// 蓝湖「充值记录」/「消费记录」
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
import {fetchLedger} from '../services/guangbi';
import {Images} from '../assets/images';
import WalletRecordRow, {fmtTime} from '../components/WalletRecordRow';

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
            return (
              <WalletRecordRow
                dark={dark}
                icon={
                  kind === 'spend'
                    ? null
                    : dark
                    ? Images.recAlipayDark
                    : Images.recAlipayLight
                }
                title={item.title || (delta > 0 ? '充值' : '课时费')}
                time={fmtTime(item.createdAt)}
                timeColor="#A6A6A6"
                amount={`${delta > 0 ? '+' : ''}${delta}`}
              />
            );
          }}
        />
      )}
    </EdgeSafeArea>
  );
}

function makeStyles(colors, dark) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: dark ? '#020014' : '#FAFAFA'},
    list: {paddingHorizontal: 15, paddingTop: 10, paddingBottom: 40},
    empty: {
      textAlign: 'center',
      color: colors.textSecondary,
      marginTop: 40,
      fontSize: 14,
    },
  });
}
