import React, {useEffect, useMemo, useState, useCallback} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {Images} from '../assets/images';
import {pickFromGallery} from '../services/imagePicker';
import {
  getDisplayName,
  setDisplayName,
  getAvatarUri,
  setAvatarUri,
} from '../services/profilePrefs';
import {getPoints} from '../services/companion';
import {getDeviceId} from '../services/device';
import {registerAccount, getMembership} from '../services/account';
import {loginWithWeChat} from '../services/wechat';
import {useTheme} from '../theme/ThemeContext';

let Clipboard = null;
try {
  // eslint-disable-next-line global-require
  Clipboard = require('@react-native-clipboard/clipboard').default;
} catch (e) {
  Clipboard = null;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}
function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}
function gradientStripes(from, to, n) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return Array.from(
    {length: n},
    (_, i) =>
      `rgb(${lerp(a.r, b.r, i / (n - 1))},${lerp(a.g, b.g, i / (n - 1))},${lerp(
        a.b,
        b.b,
        i / (n - 1),
      )})`,
  );
}

const ProfileScreen = ({navigation}) => {
  const {colors, mode, toggle} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const pointsStripes = useMemo(
    () => gradientStripes(colors.primaryGradientStart, colors.primaryGradientEnd, 24),
    [colors],
  );

  const [userId, setUserId] = useState('');
  const [vip, setVip] = useState(null);
  const [displayName, setName] = useState('钢琴小达人');
  const [avatarUri, setAvatar] = useState(null);
  const [points, setPoints] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const id = getDeviceId();
        if (alive) setUserId(id);
        await registerAccount(id);
        const m = await getMembership(id);
        if (alive && m && m.ok) setVip(m);
      } catch (e) {}
      const [n, a] = await Promise.all([getDisplayName(), getAvatarUri()]);
      if (alive) {
        setName(n);
        setAvatar(a);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getPoints().then(p => alive && setPoints(p));
      return () => {
        alive = false;
      };
    }, []),
  );

  const onChangeAvatar = async () => {
    const r = await pickFromGallery();
    if (r.uri) {
      setAvatar(r.uri);
      await setAvatarUri(r.uri);
      Alert.alert('头像已更新');
    } else if (r.error === 'no_module') {
      Alert.alert('提示', '图片选择模块未集成（需重新编译）');
    }
  };

  const onEditName = () => {
    if (Platform.OS === 'ios' && Alert.prompt) {
      Alert.prompt(
        '修改昵称',
        '请输入新的昵称',
        [
          {text: '取消', style: 'cancel'},
          {
            text: '保存',
            onPress: async value => {
              const v = (value || '').trim() || '钢琴小达人';
              setName(v);
              await setDisplayName(v);
            },
          },
        ],
        'plain-text',
        displayName,
      );
    } else {
      Alert.alert('修改昵称', '请在 iOS 上编辑昵称');
    }
  };

  const onCopyId = () => {
    const full = userId || '';
    if (Clipboard && full) {
      Clipboard.setString(full);
      Alert.alert('已复制', '完整 ID 已复制到剪贴板');
    } else if (!full) {
      Alert.alert('提示', 'ID 尚未就绪');
    } else {
      Alert.alert('提示', '剪贴板模块未集成（需重新编译）');
    }
  };

  const onWeChatLogin = async () => {
    try {
      const r = await loginWithWeChat(getDeviceId());
      Alert.alert('微信登录', r.ok ? '登录成功' : r.message || '暂未开通');
    } catch (e) {
      Alert.alert('微信登录', '网络异常，请重试');
    }
  };

  const idText = userId ? `ID:${userId.slice(-8)}` : 'ID:----';
  const vipText = vip
    ? vip.is_vip
      ? `VIP 有效期至 ${vip.expire_text}`
      : '未开通会员'
    : '';

  const MenuRow = ({icon, label, subtitle, onPress, right, last}) => (
    <TouchableOpacity
      style={[styles.menuItem, last && styles.menuItemLast]}
      activeOpacity={0.7}
      onPress={onPress}>
      {icon ? (
        <Image source={icon} style={styles.menuIcon} resizeMode="contain" />
      ) : (
        <View style={styles.menuIcon} />
      )}
      <Text style={styles.menuLabel}>{label}</Text>
      <Text style={subtitle || right ? styles.menuSubtitle : styles.menuArrow}>
        {subtitle ? `${subtitle} ›` : right ? `${right} ›` : '›'}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
      {mode === 'light' ? (
        <Image
          source={Images.pageGradient}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : null}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.screenTitle}>我的</Text>

        <View style={styles.profileBlock}>
          <TouchableOpacity activeOpacity={0.85} onPress={onChangeAvatar}>
            <Image
              source={avatarUri ? {uri: avatarUri} : Images.avatarUser}
              style={styles.avatar}
              resizeMode="cover"
            />
            <View style={styles.avatarEditBadge}>
              <Text style={styles.avatarEditText}>＋</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={onEditName}>
            <Text style={styles.userName}>{displayName} ✎</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={onCopyId}>
            <Text style={styles.userId}>{idText} 复制</Text>
          </TouchableOpacity>
          {vipText ? <Text style={styles.vipText}>{vipText}</Text> : null}
        </View>

        <View style={styles.pointsCardOuter}>
          <View style={styles.pointsGradientRow} pointerEvents="none">
            {pointsStripes.map((c, i) => (
              <View key={`p-${i}`} style={[styles.pointsStripe, {backgroundColor: c}]} />
            ))}
          </View>
          <View style={styles.pointsDiamond} pointerEvents="none" />
          <View style={styles.pointsCardInner}>
            <View style={styles.pointsLabelRow}>
              <Text style={styles.pointsLabel}>总积分</Text>
              <Image source={Images.eyeFill} style={styles.eyeIcon} resizeMode="contain" />
            </View>
            <Text style={styles.pointsValue}>{points}</Text>
          </View>
        </View>

        <View style={styles.menuSection}>
          <MenuRow
            icon={Images.menuSubscription}
            label="会员订阅"
            onPress={() => navigation.navigate('Subscription')}
          />
          <View style={styles.menuDivider} />
          <MenuRow
            icon={Images.menuCheckin}
            label="打卡统计"
            onPress={() => navigation.navigate('CheckinStats')}
          />
          <View style={styles.menuDivider} />
          <MenuRow
            icon={Images.menuClassManage}
            label="微信登录"
            subtitle="绑定账号·跨设备同步"
            onPress={onWeChatLogin}
            last
          />
        </View>

        <View style={styles.menuSection}>
          <MenuRow
            icon={Images.menuClassManage}
            label="教师端"
            subtitle="学生录入·班级管理"
            onPress={() => navigation.navigate('TeacherProfile')}
          />
          <View style={styles.menuDivider} />
          <MenuRow
            icon={Images.sparkle}
            label="使用帮助"
            onPress={() => navigation.navigate('Guide', {forceShow: true})}
          />
          <View style={styles.menuDivider} />
          <MenuRow
            icon={Images.sparkle}
            label="切换主题"
            right={mode === 'dark' ? '暗色' : '浅色'}
            onPress={toggle}
            last
          />
        </View>

        {/* 工信部要求：APP 内需展示 ICP 备案号，并链接至工信部备案系统。 */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => Linking.openURL('https://beian.miit.gov.cn')}>
          <Text style={styles.icpBeian}>ICP备案号：桂ICP备2026011230号-2A</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const makeStyles = colors =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    scroll: {
      paddingBottom: 40,
      paddingHorizontal: 20,
      paddingTop: 8,
    },
    screenTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.textPrimary,
      alignSelf: 'flex-start',
      marginBottom: 20,
    },
    icpBeian: {
      textAlign: 'center',
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 24,
      marginBottom: 8,
    },
    profileBlock: {
      alignItems: 'center',
      marginBottom: 24,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      marginBottom: 12,
      backgroundColor: colors.cardAlt,
      borderWidth: colors.mode === 'dark' ? 2 : 0,
      borderColor: 'rgba(255,255,255,0.9)',
    },
    avatarEditBadge: {
      position: 'absolute',
      right: 0,
      bottom: 12,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.bg,
    },
    avatarEditText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
      marginTop: -1,
    },
    userName: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    userId: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    vipText: {
      fontSize: 12,
      color: colors.accent,
      fontWeight: '600',
      marginTop: 4,
    },
    pointsCardOuter: {
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 16,
      height: 100,
      justifyContent: 'center',
    },
    pointsGradientRow: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: 'row',
    },
    pointsStripe: {
      flex: 1,
      height: '100%',
    },
    pointsDiamond: {
      position: 'absolute',
      right: 24,
      width: 54,
      height: 54,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.28)',
      transform: [{rotate: '45deg'}],
    },
    pointsCardInner: {
      paddingHorizontal: 20,
    },
    pointsLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    pointsLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: '#FFFFFF',
      opacity: 0.95,
    },
    eyeIcon: {
      width: 16,
      height: 16,
      marginLeft: 4,
      tintColor: '#FFFFFF',
    },
    pointsValue: {
      fontSize: 32,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.5,
    },
    menuSection: {
      backgroundColor: colors.card,
      borderRadius: 16,
      overflow: 'hidden',
      paddingVertical: 4,
      marginBottom: 16,
      borderWidth: colors.mode === 'dark' ? 1 : 0,
      borderColor: colors.cardBorder,
      shadowColor: '#000',
      shadowOpacity: colors.mode === 'dark' ? 0.25 : 0.06,
      shadowRadius: 12,
      shadowOffset: {width: 0, height: 4},
      elevation: 2,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 56,
      paddingHorizontal: 16,
    },
    menuItemLast: {},
    menuIcon: {
      width: 36,
      height: 36,
      marginRight: 12,
    },
    menuLabel: {
      flex: 1,
      fontSize: 15,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    menuArrow: {
      fontSize: 22,
      color: colors.textMuted,
      marginTop: -2,
    },
    menuSubtitle: {
      fontSize: 12,
      color: colors.textMuted,
    },
    menuDivider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 64,
      backgroundColor: colors.divider,
    },
  });

export default ProfileScreen;
