import {SafeAreaView as EdgeSafeArea} from 'react-native-safe-area-context';
import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Image,
  ImageBackground,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {Images} from '../assets/images';
import ScreenHeader from '../components/ScreenHeader';
import LanhuCTA from '../components/LanhuCTA';
import {useTheme} from '../theme/ThemeContext';
import {
  listAllCoaches,
  deleteCoach,
  absAvatarUrl,
  isAdminRole,
} from '../services/coachAdmin';
import {getDeviceId, getPreviousUserId} from '../services/device';

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
      if (admin) {
        setCoaches(r.coaches);
      } else {
        const me = String(getDeviceId() || '').trim();
        const prev = String((await getPreviousUserId()) || '').trim();
        setCoaches(
          r.coaches.filter(c => {
            const o = String(c.ownerId || '').trim();
            return !!o && (o === me || (!!prev && o === prev));
          }),
        );
      }
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
      <EdgeSafeArea edges={['left', 'right']} style={styles.safe}>
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
                coaches.map((c, idx) => {
                  const badge = statusLabel(c);
                  const avatarSrc = c.avatarUrl
                    ? {uri: absAvatarUrl(c.avatarUrl)}
                    : dark
                      ? Images.ailistAvatarDark
                      : Images.ailistAvatarLight;
                  const warnText =
                    c.status === 'rejected'
                      ? `请修改后重新保存提交${c.reviewNote ? `：${c.reviewNote}` : ''}`
                      : c.status === 'pending'
                        ? '审核中：通过后学生端才会看到本次改动'
                        : '';
                  return (
                    <View
                      key={c.id}
                      style={[
                        styles.cardWrap,
                        idx === 0 && styles.cardWrapFirst,
                        warnText ? styles.cardWrapWarn : null,
                      ]}>
                      {warnText ? (
                        <View style={styles.warn}>
                          <Image source={Images.ailistWarn} style={styles.warnIcon} />
                          <Text style={styles.warnText} numberOfLines={1}>
                            {warnText}
                          </Text>
                        </View>
                      ) : null}
                      <View style={styles.card}>
                        <TouchableOpacity
                          style={styles.rowHeader}
                          activeOpacity={0.85}
                          onPress={() => openEdit(c.id)}>
                          <Image source={avatarSrc} style={styles.avatar} resizeMode="cover" />
                          <Text style={styles.name} numberOfLines={1}>
                            {c.name || '未命名'}
                          </Text>
                          <Text style={styles.sub}>点击查看详情</Text>
                          {badge ? (
                            <ImageBackground source={Images.ailistBadge} style={styles.badge}>
                              <Text style={styles.badgeText}>{badge}</Text>
                            </ImageBackground>
                          ) : null}
                        </TouchableOpacity>
                        <View style={styles.divider} />
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionEdit]}
                          activeOpacity={0.8}
                          onPress={() => openEdit(c.id)}>
                          <Image source={editIcon} style={styles.actionImg} />
                          <Text style={styles.actionText}>编辑</Text>
                        </TouchableOpacity>
                        <View style={styles.vDivider} />
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionDelete]}
                          activeOpacity={0.8}
                          onPress={() => onDelete(c)}>
                          <Image source={deleteIcon} style={styles.actionImg} />
                          <Text style={styles.actionText}>删除</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <LanhuCTA title="新建" fontSize={dark ? 15 : 16} onPress={() => openEdit(null)} />
          </>
        )}
      </EdgeSafeArea>
    </View>
  );
};

// 蓝湖「ai设置」：卡片 345×130 r10；驳回条 345×75 r10 压在卡片下方，露出 33。
const makeStyles = (colors, dark) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: dark ? '#020014' : '#FAFAFA'},
    safe: {flex: 1},
    center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
    scroll: {paddingHorizontal: px(15), paddingBottom: px(16)},
    empty: {
      marginTop: 80,
      textAlign: 'center',
      fontSize: 14,
      lineHeight: 22,
      color: colors.textMuted,
    },
    cardWrap: {marginTop: px(15), height: px(130)},
    cardWrapFirst: {marginTop: px(10)},
    cardWrapWarn: {height: px(163)},
    card: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: px(130),
      backgroundColor: dark ? '#040428' : '#FFFFFF',
      borderRadius: px(10),
    },
    rowHeader: {position: 'absolute', left: 0, right: 0, top: 0, height: px(78)},
    avatar: {
      position: 'absolute',
      left: px(15),
      top: px(16),
      width: px(48),
      height: px(48),
      borderRadius: px(24),
      backgroundColor: dark ? '#F3E6FA' : '#FFE1E8',
    },
    name: {
      position: 'absolute',
      left: px(73),
      top: px(18),
      right: px(90),
      fontSize: px(16),
      lineHeight: px(21),
      fontWeight: '600',
      color: dark ? '#FFFFFF' : '#261216',
    },
    sub: {
      position: 'absolute',
      left: px(73),
      top: px(43),
      fontSize: px(12),
      lineHeight: px(21),
      color: '#979797',
    },
    badge: {
      position: 'absolute',
      left: px(265),
      top: px(16),
      width: px(65),
      height: px(22),
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {color: '#FFFFFF', fontSize: px(11), lineHeight: px(15)},
    divider: {
      position: 'absolute',
      left: px(15),
      top: px(79),
      width: px(315),
      height: px(1),
      backgroundColor: dark ? '#232157' : '#FAFAFA',
    },
    actionBtn: {
      position: 'absolute',
      top: px(80),
      height: px(50),
      width: px(140),
      flexDirection: 'row',
      alignItems: 'center',
    },
    actionEdit: {left: px(55)},
    actionDelete: {left: px(233)},
    actionImg: {width: px(20), height: px(20), marginRight: px(10)},
    actionText: {
      fontSize: px(14),
      lineHeight: px(22),
      color: dark ? '#FFFFFF' : '#3D3D3D',
    },
    vDivider: {
      position: 'absolute',
      left: px(172),
      top: px(96),
      width: px(1),
      height: px(20),
      backgroundColor: dark ? '#232157' : '#E5E5E5',
    },
    warn: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: px(88),
      height: px(75),
      borderRadius: px(10),
      backgroundColor: dark ? 'rgba(247,164,0,0.1)' : '#FFF4DD',
    },
    warnIcon: {position: 'absolute', left: px(13), top: px(51), width: px(16), height: px(16)},
    warnText: {
      position: 'absolute',
      left: px(34),
      right: px(13),
      top: px(52),
      fontSize: px(11),
      lineHeight: px(15),
      fontWeight: '500',
      color: '#F7A400',
    },
  });

export default AIListScreen;
