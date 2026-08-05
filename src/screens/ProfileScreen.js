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
  Dimensions,
} from 'react-native';

const {width: SCREEN_W} = Dimensions.get('window');
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

const ProfileScreen = ({navigation}) => {
  const {colors, mode, toggle} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);

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
      if (r.ok) {
        // 身份已切换为主账号：刷新 ID 与会员状态，练习/入班数据也随之找回。
        const id = getDeviceId();
        setUserId(id);
        try {
          const m = await getMembership(id);
          if (m && m.ok) setVip(m);
        } catch (e) {}
      }
      Alert.alert('微信登录', r.ok ? '登录成功，数据已同步' : r.message || '暂未开通');
    } catch (e) {
      Alert.alert('微信登录', '网络异常，请重试');
    }
  };

  // 列表只展示尾号；点复制会复制完整 ID（老师入班必须用完整 ID）。
  const idText = userId ? `尾号:${userId.slice(-8)}` : 'ID:----';

  const MenuRow = ({icon, label, onPress, last}) => (
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
      <Text style={styles.menuArrow}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
      {/* 背景：蓝湖导出（暗色整屏 / 浅色顶部渐变） */}
      <Image
        source={dark ? Images.profileBgDark : Images.profileBgLight}
        style={
          dark
            ? StyleSheet.absoluteFill
            : {position: 'absolute', top: 0, left: 0, right: 0, height: 400}
        }
        resizeMode="cover"
        pointerEvents="none"
      />
      <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.screenTitle}>我的</Text>

        <View style={styles.profileBlock}>
          <TouchableOpacity activeOpacity={0.85} onPress={onChangeAvatar}>
            <Image
              source={avatarUri ? {uri: avatarUri} : Images.pfAvatar}
              style={styles.avatar}
              resizeMode="cover"
            />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={onEditName}>
            <Text style={styles.userName}>{displayName}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={onCopyId} style={styles.idRow}>
            <Text style={styles.userId}>{idText}</Text>
            <Image source={Images.pfCopy} style={styles.copyIcon} resizeMode="contain" />
          </TouchableOpacity>
        </View>

        <View style={styles.pointsCardOuter}>
          <Image
            source={dark ? Images.pointsCardDark : Images.pointsCardLight}
            style={styles.pointsCardImg}
            resizeMode="stretch"
            pointerEvents="none"
          />
          <View style={styles.pointsCardInner}>
            <View style={styles.pointsLabelRow}>
              <Text style={styles.pointsLabel}>总积分</Text>
              <Image source={Images.pfEye} style={styles.eyeIcon} resizeMode="contain" />
            </View>
            <Text style={styles.pointsValue}>{points}</Text>
          </View>
        </View>

        <View style={styles.menuSection}>
          <MenuRow
            icon={Images.pfSub}
            label="会员订阅"
            onPress={() => navigation.navigate('Subscription')}
          />
          <View style={styles.menuDivider} />
          <MenuRow
            icon={Images.pfCheckin}
            label="打卡统计"
            onPress={() => navigation.navigate('CheckinStats')}
          />
          <View style={styles.menuDivider} />
          <MenuRow
            icon={Images.pfWechat}
            label="微信登录"
            onPress={onWeChatLogin}
            last
          />
        </View>

        <View style={styles.menuSection}>
          <MenuRow
            icon={Images.pfTeacher}
            label="教师端"
            onPress={() => navigation.navigate('TeacherProfile')}
          />
          <View style={styles.menuDivider} />
          <MenuRow
            icon={Images.pfHelp}
            label="使用帮助"
            onPress={() => navigation.navigate('Guide', {forceShow: true})}
          />
          <View style={styles.menuDivider} />
          <MenuRow
            icon={Images.pfTheme}
            label="切换主题"
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
    </View>
  );
};

const makeStyles = (colors, dark) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg},
    safe: {flex: 1},
    scroll: {
      paddingBottom: 40,
      paddingHorizontal: 15,
      paddingTop: 8,
    },
    // 标题 我的 18/600，左边距 30（页边距 15 + 15）
    screenTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
      alignSelf: 'flex-start',
      marginLeft: 15,
      marginBottom: 16,
    },
    icpBeian: {
      textAlign: 'center',
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 24,
      marginBottom: 8,
    },
    profileBlock: {alignItems: 'center', marginBottom: 20},
    // 头像 80x80 圆形，暗色白圈
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      marginBottom: 12,
      backgroundColor: colors.cardAlt,
      borderWidth: dark ? 2 : 0,
      borderColor: 'rgba(255,255,255,0.9)',
    },
    userName: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 6,
    },
    idRow: {flexDirection: 'row', alignItems: 'center'},
    userId: {fontSize: 12, color: '#979797'},
    copyIcon: {width: 14, height: 14, marginLeft: 4, tintColor: '#979797'},
    // 积分卡 345x80（贴图含渐变 + 钻石），叠加文字
    pointsCardOuter: {
      height: 80,
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 20,
      justifyContent: 'center',
    },
    pointsCardImg: {position: 'absolute', top: 0, left: 0, width: SCREEN_W - 30, height: 80},
    pointsCardInner: {paddingHorizontal: 19},
    pointsLabelRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 2},
    pointsLabel: {fontSize: 13, fontWeight: '400', color: '#FFFFFF'},
    eyeIcon: {width: 16, height: 16, marginLeft: 6, tintColor: '#FFFFFF'},
    pointsValue: {fontSize: 24, fontWeight: '600', color: '#FFFFFF'},
    menuSection: {
      backgroundColor: colors.card,
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 16,
      borderWidth: dark ? 1 : 0,
      borderColor: colors.cardBorder,
      shadowColor: '#000',
      shadowOpacity: dark ? 0.25 : 0.05,
      shadowRadius: 12,
      shadowOffset: {width: 0, height: 4},
      elevation: 2,
    },
    // 行高 55（设计稿行距），图标 28x28，左边距 15
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 55,
      paddingHorizontal: 15,
    },
    menuItemLast: {},
    menuIcon: {width: 28, height: 28, marginRight: 10},
    menuLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    menuArrow: {fontSize: 20, color: colors.textMuted, marginTop: -2},
    menuDivider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 53,
      backgroundColor: colors.divider,
    },
  });

export default ProfileScreen;
