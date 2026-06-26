import React, {useEffect, useState, useCallback} from 'react';
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
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {Colors} from '../utils/colors';
import {Images} from '../assets/images';
import {pickFromGallery} from '../services/imagePicker';
import {
  getDisplayName,
  setDisplayName,
  getAvatarUri,
  setAvatarUri,
} from '../services/profilePrefs';
import {getPoints} from '../services/companion';

const MenuRow = ({icon, label, subtitle, onPress, last}) => (
  <TouchableOpacity
    style={[styles.menuItem, last && styles.menuItemLast]}
    activeOpacity={0.7}
    onPress={onPress}>
    <Image source={icon} style={styles.menuIcon} resizeMode="contain" />
    <Text style={styles.menuLabel}>{label}</Text>
    <Text style={subtitle ? styles.menuSubtitle : styles.menuArrow}>
      {subtitle ? `${subtitle} ›` : '›'}
    </Text>
  </TouchableOpacity>
);
import {getDeviceId} from '../services/device';
import {registerAccount, getMembership} from '../services/account';
import {loginWithWeChat} from '../services/wechat';

let Clipboard = null;
try {
  // eslint-disable-next-line global-require
  Clipboard = require('@react-native-clipboard/clipboard').default;
} catch (e) {
  Clipboard = null;
}

const ProfileScreen = ({navigation}) => {
  const [userId, setUserId] = useState('');
  const [vip, setVip] = useState(null); // {is_vip, expire_text}
  const [displayName, setName] = useState('钢琴小达人');
  const [avatarUri, setAvatar] = useState(null);
  const [points, setPoints] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const id = getDeviceId();
        if (alive) setUserId(id);
        await registerAccount(id); // 幂等静默注册
        const m = await getMembership(id);
        if (alive && m && m.ok) setVip(m);
      } catch (e) {
        // 离线时静默；UI 用占位
      }
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

  // 每次回到本页刷新积分（练琴后会变化）。
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
      // 安卓回退：简单提示（如需可换三方输入弹窗）
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={Colors.pinkBg}
      />
      <Image
        source={Images.pageGradient}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
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
          <Image
            source={Images.pointsCard}
            style={StyleSheet.absoluteFill}
            resizeMode="stretch"
          />
          <View style={styles.pointsCardInner}>
            <View style={styles.pointsTextCol}>
              <View style={styles.pointsLabelRow}>
                <Text style={styles.pointsLabel}>总积分</Text>
                <Image
                  source={Images.eyeFill}
                  style={styles.eyeIcon}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.pointsValue}>{points}</Text>
            </View>
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
          />
          <View style={styles.menuDivider} />
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
            last
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.pinkBg,
  },
  scroll: {
    paddingBottom: 40,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    alignSelf: 'flex-start',
    marginBottom: 20,
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
    backgroundColor: '#FFE0E8',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: 0,
    bottom: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.pinkPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
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
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  userId: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  vipText: {
    fontSize: 12,
    color: Colors.pinkPrimary,
    fontWeight: '600',
    marginTop: 4,
  },
  pointsCardOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    height: 100,
  },
  pointsCardInner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  pointsTextCol: {
    flex: 0,
  },
  pointsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  pointsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
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
    color: Colors.white,
    letterSpacing: 0.5,
  },
  menuSection: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
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
    color: Colors.textPrimary,
  },
  menuArrow: {
    fontSize: 22,
    color: Colors.greyMedium,
    marginTop: -2,
  },
  menuSubtitle: {
    fontSize: 12,
    color: Colors.greyMedium,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
    backgroundColor: Colors.greyDivider,
  },
});

export default ProfileScreen;
