import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Image,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import {Images} from '../assets/images';
import ScreenHeader from '../components/ScreenHeader';
import {useTheme} from '../theme/ThemeContext';
import {
  listAllCoaches,
  deleteCoach,
  absAvatarUrl,
  isAdminRole,
} from '../services/coachAdmin';
import {getDeviceId} from '../services/device';

const {width: SCREEN_W} = Dimensions.get('window');
const S = SCREEN_W / 375;
const px = n => Math.round(n * S);

/**
 * 蓝湖「AI设置 / AI分身列表」：卡片列表 + 底部「新建」。
 * 编辑 → AISettings（表单页）；与 Android AISettingsActivity 对齐。
 */
const AIListScreen = ({navigation}) => {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const [coaches, setCoaches] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const admin = await isAdminRole();
    const r = await listAllCoaches();
    if (r && r.ok && Array.isArray(r.coaches)) {
      const list = admin
        ? r.coaches
        : r.coaches.filter(c => c.ownerId && c.ownerId === getDeviceId());
      setCoaches(list);
    } else {
      setCoaches([]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  const openEdit = coachId => {
    navigation.navigate('AISettings', coachId ? {coachId} : {});
  };

  const onDelete = c => {
    Alert.alert('删除分身', `确定删除「${c.name}」吗？此操作不可恢复。`, [
      {text: '取消', style: 'cancel'},
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          const r = await deleteCoach(c.id);
          if (r && r.ok) {
            load();
          } else if (r && r.error === 'cannot_delete_builtin') {
            Alert.alert('无法删除', '内置/系统分身不可删除。');
          } else {
            Alert.alert('删除失败', (r && r.error) || '请稍后重试');
          }
        },
      },
    ]);
  };

  const statusLabel = c => {
    if (c.status === 'pending') return '审核中';
    if (c.status === 'rejected') return '已驳回';
    return '';
  };

  const editIcon = dark ? Images.ailistEditDark : Images.ailistEditLight;
  const deleteIcon = dark ? Images.ailistDeleteDark : Images.ailistDeleteLight;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor="transparent" translucent />
      <Image
        source={dark ? Images.ailistTopDark : Images.ailistTopLight}
        style={styles.topBg}
        resizeMode="cover"
        pointerEvents="none"
      />
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="AI分身列表" onBack={() => navigation?.goBack?.()} />

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            <ScrollView
              contentContainerStyle={styles.scroll}
              showsVerticalScrollIndicator={false}>
              {coaches.length === 0 ? (
                <Text style={styles.empty}>
                  你还没有创建 AI 分身{'\n'}点下方「新建」，给 TA 起个名字，
                  {'\n'}再设置头像、专属音色和人设
                </Text>
              ) : (
                coaches.map(c => {
                  const badge = statusLabel(c);
                  const avatarSrc = c.avatarUrl
                    ? {uri: absAvatarUrl(c.avatarUrl)}
                    : Images.avatarRabbit;
                  return (
                    <View key={c.id} style={styles.cardWrap}>
                      <View style={styles.card}>
                        <TouchableOpacity
                          style={styles.rowHeader}
                          activeOpacity={0.85}
                          onPress={() => openEdit(c.id)}>
                          <Image
                            source={avatarSrc}
                            style={styles.avatar}
                            resizeMode="cover"
                          />
                          <View style={styles.info}>
                            <Text style={styles.name} numberOfLines={1}>
                              {c.name || '未命名'}
                            </Text>
                            <Text style={styles.sub}>点击查看详情</Text>
                          </View>
                          {badge ? (
                            <View
                              style={[
                                styles.badge,
                                c.status === 'pending' && styles.badgePending,
                              ]}>
                              <Text style={styles.badgeText}>{badge}</Text>
                            </View>
                          ) : null}
                        </TouchableOpacity>

                        <View style={styles.divider} />

                        <View style={styles.actions}>
                          <TouchableOpacity
                            style={styles.actionBtn}
                            activeOpacity={0.8}
                            onPress={() => openEdit(c.id)}>
                            <Image source={editIcon} style={styles.actionImg} />
                            <Text style={styles.actionText}>编辑</Text>
                          </TouchableOpacity>
                          <View style={styles.vDivider} />
                          <TouchableOpacity
                            style={styles.actionBtn}
                            activeOpacity={0.8}
                            onPress={() => onDelete(c)}>
                            <Image source={deleteIcon} style={styles.actionImg} />
                            <Text style={styles.actionText}>删除</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {c.status === 'rejected' ? (
                        <View style={styles.warn}>
                          <Text style={styles.warnText}>
                            请修改后重新保存提交
                            {c.reviewNote ? `：${c.reviewNote}` : ''}
                          </Text>
                        </View>
                      ) : null}
                      {c.status === 'pending' ? (
                        <View style={styles.warnPending}>
                          <Text style={styles.warnPendingText}>
                            审核中：通过后学生端才会看到本次改动
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => openEdit(null)}
              style={styles.createOuter}>
              <LinearGradient
                colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
                start={{x: 0.5, y: 0}}
                end={{x: 0.5, y: 1}}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.createText}>新建</Text>
            </TouchableOpacity>
          </>
        )}
      </SafeAreaView>
    </View>
  );
};

const makeStyles = (colors, dark) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg},
    safe: {flex: 1},
    topBg: {position: 'absolute', top: 0, left: 0, right: 0, height: px(220)},
    center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
    scroll: {paddingHorizontal: px(15), paddingBottom: 16, paddingTop: 4},
    empty: {
      marginTop: 80,
      textAlign: 'center',
      fontSize: 14,
      lineHeight: 22,
      color: colors.textMuted,
    },
    cardWrap: {marginTop: px(15)},
    // 蓝湖卡片 345×130
    card: {
      height: px(130),
      backgroundColor: colors.card,
      borderRadius: 16,
      paddingHorizontal: px(15),
      paddingTop: px(18),
      borderWidth: dark ? 1 : 0,
      borderColor: colors.cardBorder,
    },
    rowHeader: {flexDirection: 'row', alignItems: 'center'},
    avatar: {
      width: px(48),
      height: px(48),
      borderRadius: px(24),
      backgroundColor: colors.cardAlt,
    },
    info: {flex: 1, marginLeft: px(10)},
    name: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    sub: {
      marginTop: 4,
      fontSize: 12,
      color: colors.textMuted,
    },
    badge: {
      backgroundColor: '#F5A623',
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    badgePending: {backgroundColor: '#8A6D3B'},
    badgeText: {color: '#fff', fontSize: 11, fontWeight: '600'},
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.divider,
      marginTop: px(14),
    },
    actions: {flexDirection: 'row', flex: 1, alignItems: 'center'},
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: px(12),
    },
    actionImg: {width: px(20), height: px(20), marginRight: 6},
    actionText: {fontSize: 14, color: colors.textPrimary, fontWeight: '600'},
    vDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: colors.divider,
      alignSelf: 'center',
      height: 20,
    },
    // 蓝湖驳回提示条独立 345×75，贴在卡片下方
    warn: {
      marginTop: px(8),
      height: px(48),
      justifyContent: 'center',
      backgroundColor: 'rgba(247,164,0,0.18)',
      borderRadius: 12,
      paddingHorizontal: 12,
    },
    warnText: {fontSize: 11, color: '#F7A400', lineHeight: 16},
    warnPending: {
      marginTop: px(8),
      backgroundColor: 'rgba(245,166,35,0.12)',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    warnPendingText: {fontSize: 11, color: '#C9A227', lineHeight: 16},
    createOuter: {
      marginHorizontal: px(16),
      marginBottom: 24,
      height: px(44),
      borderRadius: px(22),
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    createText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  });

export default AIListScreen;
