// 蓝湖「提现记录」1:1：顶部分类 tab + 列表
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
  TouchableOpacity,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {Dimensions} from 'react-native';

const px = n => Math.round((n * Dimensions.get('window').width) / 375);
import {getDeviceId} from '../services/device';
import {fetchTeacherGuangbi} from '../services/guangbi';
import {Images} from '../assets/images';
import WalletRecordRow, {fmtTime} from '../components/WalletRecordRow';

const TABS = [
  {id: 'all', label: '全部'},
  {id: 'review', label: '审核中'},
  {id: 'pending', label: '处理中'},
  {id: 'paid', label: '已到账'},
];

function yuanOf(it) {
  const y =
    it.yuan != null ? Number(it.yuan) : ((Number(it.amount) || 0) * 7) / 100;
  return y.toFixed(2);
}

function statusLabel(s) {
  if (s === 'paid' || s === 'done') return '已到账';
  if (s === 'rejected') return '已驳回';
  if (s === 'review' || s === 'reviewing') return '审核中';
  return '处理中';
}

function statusBucket(s) {
  if (s === 'paid' || s === 'done') return 'paid';
  if (s === 'review' || s === 'reviewing') return 'review';
  if (s === 'rejected') return 'rejected';
  return 'pending';
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
    <EdgeSafeArea edges={['bottom', 'left', 'right']} style={styles.root}>
      <ScreenHeader title="提现记录" onBack={() => navigation.goBack()} />
      <View style={styles.tabs}>
        {TABS.map(t => {
          const on = tab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.pill, on && styles.pillOn]}
              activeOpacity={0.85}
              onPress={() => setTab(t.id)}>
              <Text style={[styles.tabText, on && styles.tabOn]}>
                {t.label}
              </Text>
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
          ListEmptyComponent={
            <Text style={styles.empty}>还没有提现记录。</Text>
          }
          renderItem={({item}) => (
            <WalletRecordRow
              dark={dark}
              icon={dark ? Images.recDiamondDark : Images.recDiamondLight}
              title={`提现课时费${Number(item.amount || 0).toLocaleString(
                'en-US',
              )}光币`}
              time={fmtTime(item.createdAt)}
              side={`¥${yuanOf(item)}`}
              badge={{
                kind: statusBucket(item.status),
                label: statusLabel(item.status),
              }}
            />
          )}
        />
      )}
    </EdgeSafeArea>
  );
}

// 蓝湖：分类条 345×44 r22 (15,98)；每项 80×36 r22，间距 5；选中 #8048FE/#FF355F 白字 14/500，未选 #A6A6A6 14/400
function makeStyles(colors, dark) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: dark ? '#020014' : '#FAFAFA'},
    tabs: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginHorizontal: 15,
      marginTop: px(10),
      height: px(44),
      borderRadius: px(22),
      paddingHorizontal: px(5),
      alignItems: 'center',
      backgroundColor: dark ? '#040428' : '#FFFFFF',
    },
    pill: {
      width: px(80),
      height: px(36),
      borderRadius: px(22),
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillOn: {backgroundColor: dark ? '#8048FE' : '#FF355F'},
    tabText: {color: '#A6A6A6', fontSize: px(14), lineHeight: px(20)},
    tabOn: {color: '#FFFFFF', fontWeight: '500'},
    list: {paddingHorizontal: 15, paddingTop: px(15), paddingBottom: 40},
    empty: {textAlign: 'center', color: colors.textSecondary, marginTop: 40},
  });
}
