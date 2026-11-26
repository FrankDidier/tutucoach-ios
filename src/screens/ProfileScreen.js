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
  Modal,
  TextInput,
} from 'react-native';

const {width: SCREEN_W} = Dimensions.get('window');
const px = n => Math.round((n * SCREEN_W) / 375);
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Images} from '../assets/images';
import {pickFromGallery} from '../services/imagePicker';
import {
  getDisplayName,
  setDisplayName,
  getAvatarUri,
  setAvatarUri,
  DEFAULT_DISPLAY_NAME,
} from '../services/profilePrefs';
import {getPoints} from '../services/companion';
import {fetchWallet, syncPracticeGuangbi} from '../services/guangbi';
import {adoptUserId, getDeviceId, getPreviousUserId, resetLocalIdentity} from '../services/device';
import {registerAccount, getMembership, deleteAccount, requestSmsCode, loginWithSms} from '../services/account';
import {isWeChatInstalled, loginWithWeChat} from '../services/wechat';
import {isAppleSignInReady, loginWithApple} from '../services/appleAuth';
import {useTheme} from '../theme/ThemeContext';
import {
  currentInstrument,
  loadInstrument,
  setInstrument,
} from '../services/instrument';
import InstrumentPickerModal from '../components/InstrumentPickerModal';
import InstrumentCard from '../components/InstrumentCard';
import TextPromptModal from '../components/TextPromptModal';

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
  const insets = useSafeAreaInsets();

  const [userId, setUserId] = useState('');
  const [vip, setVip] = useState(null);
  const [displayName, setName] = useState('钢琴小达人');
  const [avatarUri, setAvatar] = useState(null);
  const [points, setPoints] = useState(0);
  const [instrument, setInst] = useState(currentInstrument());
  const [instPicker, setInstPicker] = useState(false);
  // 没装微信就不显示微信登录；iOS 另给「通过 Apple 登录」
  const [hasWeChat, setHasWeChat] = useState(Platform.OS !== 'ios');
  const appleReady = isAppleSignInReady();

  useEffect(() => {
    isWeChatInstalled().then(ok => setHasWeChat(ok || Platform.OS !== 'ios'));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const id = getDeviceId();
        if (alive) setUserId(id);
        loadInstrument().then(v => alive && setInst(v));
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
      (async () => {
        // 总光币必须以服务端钱包为准，绝不能用本机练琴积分冒充，
        // 否则管理员清零后 App 仍会短暂/持续显示旧本地积分（如 7820）。
        const p = await getPoints();
        try {
          const w = await syncPracticeGuangbi(getDeviceId(), p);
          if (alive && w && w.ok && w.balance != null) {
            setPoints(Number(w.balance) || 0);
            return;
          }
        } catch (e) {}
        try {
          const w = await fetchWallet(getDeviceId());
          if (alive && w && w.ok && w.balance != null) {
            setPoints(Number(w.balance) || 0);
            return;
          }
        } catch (e) {}
        // 网络失败时保持上次服务端值，不回落到本机练琴积分
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const onChangeAvatar = async () => {
    // 存 data URI：App 更新后沙盒目录会换名字，存 file:// 路径的话头像就丢了
    const r = await pickFromGallery({
      base64: true,
      maxWidth: 256,
      maxHeight: 256,
      quality: 0.8,
    });
    const keep = r.dataUri || r.uri;
    if (keep) {
      setAvatar(keep);
      await setAvatarUri(keep);
      Alert.alert('头像已更新');
    } else if (r.error === 'no_module') {
      Alert.alert('提示', '图片选择模块未集成（需重新编译）');
    }
  };

  // 老版本存的是 file:// 路径，更新后指向的目录已经不在了：显示失败就回到默认头像
  const onAvatarBroken = () => {
    setAvatar(null);
    setAvatarUri('');
  };

  const onEditName = () => setNamePromptOpen(true);

  const saveDisplayName = async value => {
    const v = (value || '').trim() || DEFAULT_DISPLAY_NAME || '钢琴小达人';
    setName(v);
    await setDisplayName(v);
    setNamePromptOpen(false);
  };

  const onCopyId = async () => {
    const full = userId || getDeviceId() || '';
    if (!full) {
      Alert.alert('提示', 'ID 尚未就绪，请稍等两秒再复制');
      return;
    }
    // 复制前再静默注册一次，避免「本机有 ID、服务端还没有」导致老师入班失败。
    try {
      await registerAccount(full, 'student');
    } catch (e) {}
    if (Clipboard) {
      Clipboard.setString(full);
      Alert.alert('已复制', '完整 ID 已复制到剪贴板，发给老师即可加入班级');
    } else {
      Alert.alert('提示', '剪贴板模块未集成（需重新编译）');
    }
  };

  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [smsBusy, setSmsBusy] = useState(false);

  const refreshAfterLogin = async () => {
    const id = getDeviceId();
    setUserId(id);
    try {
      const m = await getMembership(id);
      if (m && m.ok) setVip(m);
    } catch (e) {}
  };

  const onPhoneLogin = () => {
    Alert.alert('手机号登录', '登录即表示你已阅读并同意《用户协议》和《隐私政策》。', [
      {text: '查看协议', onPress: () => navigation.navigate('Legal')},
      {text: '取消', style: 'cancel'},
      {text: '同意并登录', onPress: () => setPhoneOpen(true)},
    ]);
  };

  const sendSms = async () => {
    if (smsBusy) return;
    setSmsBusy(true);
    try {
      const r = await requestSmsCode(phone.trim());
      Alert.alert('手机号登录', (r && r.message) || (r && r.ok ? '验证码已发送' : '验证码暂时发不出去'));
    } catch (e) {
      Alert.alert('手机号登录', '网络异常，请重试');
    } finally {
      setSmsBusy(false);
    }
  };

  const submitSms = async () => {
    if (smsBusy) return;
    setSmsBusy(true);
    try {
      const prefer = (await getPreviousUserId()) || getDeviceId() || '';
      const r = await loginWithSms(phone.trim(), smsCode.trim(), getDeviceId(), prefer);
      if (r && r.ok && r.user && r.user.user_id) {
        await adoptUserId(r.user.user_id);
        await refreshAfterLogin();
        setPhoneOpen(false);
        setSmsCode('');
      }
      Alert.alert('手机号登录', (r && r.message) || '登录没有完成，请重试');
    } catch (e) {
      Alert.alert('手机号登录', '网络异常，请重试');
    } finally {
      setSmsBusy(false);
    }
  };

  const doWeChatLogin = async () => {
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

  // 登录前须明确同意协议：点「微信登录」先弹窗确认，不在页面上额外加勾选行（保持蓝湖行布局）。
  const onWeChatLogin = () => {
    Alert.alert('微信登录', '登录即表示你已阅读并同意《用户协议》和《隐私政策》。', [
      {text: '查看协议', onPress: () => navigation.navigate('Legal')},
      {text: '取消', style: 'cancel'},
      {text: '同意并登录', onPress: doWeChatLogin},
    ]);
  };

  const onAppleLogin = async () => {
    try {
      const r = await loginWithApple();
      if (r.cancelled) return;
      if (r.ok) {
        const id = getDeviceId();
        setUserId(id);
        try {
          const m = await getMembership(id);
          if (m && m.ok) setVip(m);
        } catch (e) {}
      }
      Alert.alert('通过 Apple 登录', r.ok ? '登录成功，数据已同步' : r.message || '登录没有完成，请重试');
    } catch (e) {
      Alert.alert('通过 Apple 登录', '网络异常，请重试');
    }
  };

  const onDeleteAccount = () => {
    Alert.alert(
      '删除账号',
      '将永久删除你的账号、练习记录、会员状态与登录绑定。此操作不可恢复，不是暂时停用。',
      [
        {text: '取消', style: 'cancel'},
        {
          text: '继续',
          style: 'destructive',
          onPress: () => {
            Alert.alert('确认删除账号？', '删除后本机将生成新的访客身份，旧数据无法找回。', [
              {text: '取消', style: 'cancel'},
              {
                text: '永久删除',
                style: 'destructive',
                onPress: async () => {
                  const id = getDeviceId();
                  try {
                    const r = await deleteAccount(id);
                    if (!r?.ok) {
                      Alert.alert('删除失败', '请检查网络后重试。');
                      return;
                    }
                    await setDisplayName(DEFAULT_DISPLAY_NAME);
                    await setAvatarUri('');
                    const fresh = await resetLocalIdentity();
                    try {
                      await registerAccount(fresh);
                    } catch (e) {}
                    setUserId(fresh);
                    setVip(null);
                    setName(DEFAULT_DISPLAY_NAME);
                    setAvatar(null);
                    setPoints(0);
                    Alert.alert('账号已删除', '已清除本机身份。如需继续使用，可重新登录或直接练习。');
                  } catch (e) {
                    Alert.alert('删除失败', '网络异常，请稍后重试。');
                  }
                },
              },
            ]);
          },
        },
      ],
    );
  };

  // 蓝湖展示「ID:…」；列表只展示尾号，点复制仍复制完整 ID（老师入班必须用完整 ID）。
  const idText = userId ? `ID:${userId.slice(-8)}` : 'ID:----';

  const rowArrow = dark ? Images.icRowArrowDark : Images.icRowArrowLight;
  const MenuRow = ({icon, glyph, glyphBg, label, onPress}) => (
    <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={onPress}>
      {icon ? (
        <Image source={icon} style={styles.menuIcon} />
      ) : (
        <Text style={[styles.menuIcon, styles.menuGlyph, glyphBg ? {backgroundColor: glyphBg} : null]}>{glyph}</Text>
      )}
      <Text style={styles.menuLabel}>{label}</Text>
      <Image source={rowArrow} style={styles.menuArrow} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
      <View style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.scroll, {paddingTop: insets.top}]}
        showsVerticalScrollIndicator={false}>
        {/* 背景：蓝湖导出（暗色 375×1050 / 浅色顶部 375×400），随内容滚动，坐标与稿面一致 */}
        <Image
          source={dark ? Images.profileBgDark : Images.profileBgLight}
          style={[
            dark ? styles.bgDark : styles.bgLight,
            {height: (dark ? px(1050) : px(400)) + insets.top - px(44)},
          ]}
          resizeMode="stretch"
          pointerEvents="none"
        />
        <Text style={styles.screenTitle}>我的</Text>

        <View style={styles.profileBlock}>
          <TouchableOpacity activeOpacity={0.85} onPress={onChangeAvatar}>
            <Image
              source={avatarUri ? {uri: avatarUri} : Images.pfAvatar}
              onError={avatarUri ? onAvatarBroken : undefined}
              style={styles.avatar}
              resizeMode="cover"
            />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={onEditName}>
            <Text style={styles.userName}>{displayName}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={onCopyId} style={styles.idRow}>
            <Text style={styles.userId}>{idText}</Text>
            <Image source={Images.pfCopy} style={styles.copyIcon} />
          </TouchableOpacity>
        </View>

        {/* 积分卡 (15,260) 345×80：蓝湖切图 + 总积分/眼睛/数值/立即充值 */}
        <View style={styles.pointsCard}>
          <Image
            source={dark ? Images.pointsCardDark : Images.pointsCardLight}
            style={styles.pointsCardImg}
            resizeMode="stretch"
            pointerEvents="none"
          />
          <Text style={styles.pointsLabel}>总积分</Text>
          <Image source={Images.pfEye} style={styles.eyeIcon} />
          <Text style={styles.pointsValue}>{points}</Text>
          <TouchableOpacity
            style={styles.rechargeBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Recharge')}>
            <Text style={styles.rechargeText}>立即充值</Text>
          </TouchableOpacity>
        </View>

        {/* 乐器选择 (15,355) 345×110 */}
        <InstrumentCard
          instrument={instrument}
          onPick={() => setInstPicker(true)}
          style={styles.instCard}
        />

        <View style={styles.menuSection}>
          <MenuRow
            icon={Images.pfSub}
            label="会员订阅"
            onPress={() => navigation.navigate('Subscription')}
          />
          <MenuRow
            icon={Images.pfCheckin}
            label="打卡统计"
            onPress={() => navigation.navigate('CheckinStats')}
          />
          {hasWeChat ? (
            <MenuRow icon={Images.pfWechat} label="微信登录" onPress={onWeChatLogin} />
          ) : null}
          {appleReady ? (
            <MenuRow glyph={'\uF8FF'} label="通过 Apple 登录" onPress={onAppleLogin} />
          ) : null}
          <MenuRow glyph={'\u260E'} glyphBg="#07C160" label="手机号登录" onPress={onPhoneLogin} />
        </View>

        <View style={styles.menuSection}>
          <MenuRow
            icon={Images.pfTeacher}
            label="教师端"
            onPress={() => navigation.navigate('TeacherProfile')}
          />
          <MenuRow
            icon={Images.pfHelp}
            label="使用帮助"
            onPress={() => navigation.navigate('Guide', {forceShow: true})}
          />
          <MenuRow icon={Images.pfTheme} label="切换主题" onPress={toggle} />
        </View>

        <View style={styles.menuSection}>
          <MenuRow
            icon={Images.pfPrivacy}
            label="隐私与用户协议"
            onPress={() => navigation.navigate('Legal')}
          />
          <MenuRow icon={Images.pfDelete} label="删除账号" onPress={onDeleteAccount} />
        </View>

        {/* 工信部要求：APP 内需展示 ICP 备案号，并链接至工信部备案系统。 */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => Linking.openURL('https://beian.miit.gov.cn')}>
          <Text style={styles.icpBeian}>ICP备案号：桂ICP备2026011230号-2A</Text>
        </TouchableOpacity>
      </ScrollView>
      </View>
      <InstrumentPickerModal
        visible={instPicker}
        currentId={instrument}
        onClose={() => setInstPicker(false)}
        onSelect={id => {
          setInst(id);
          setInstrument(id);
        }}
      />
      <Modal visible={phoneOpen} transparent animationType="fade" onRequestClose={() => setPhoneOpen(false)}>
        <View style={styles.phoneMask}>
          <View style={styles.phoneCard}>
            <Text style={styles.phoneTitle}>手机号登录</Text>
            <TextInput
              style={styles.phoneInput}
              value={phone}
              onChangeText={setPhone}
              placeholder="手机号"
              placeholderTextColor="#979797"
              keyboardType="phone-pad"
              maxLength={11}
            />
            <TextInput
              style={styles.phoneInput}
              value={smsCode}
              onChangeText={setSmsCode}
              placeholder="验证码"
              placeholderTextColor="#979797"
              keyboardType="number-pad"
              maxLength={6}
            />
            <View style={styles.phoneActions}>
              <TouchableOpacity onPress={() => setPhoneOpen(false)}>
                <Text style={styles.phoneAction}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={sendSms} disabled={smsBusy}>
                <Text style={styles.phoneAction}>获取验证码</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitSms} disabled={smsBusy}>
                <Text style={styles.phoneAction}>登录</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <TextPromptModal
        visible={namePromptOpen}
        title="修改昵称"
        message="请输入新的昵称"
        placeholder="昵称"
        initialValue={displayName}
        confirmLabel="保存"
        onCancel={() => setNamePromptOpen(false)}
        onSubmit={saveDisplayName}
      />
    </View>
  );
};

// 坐标均取自蓝湖 我的学生端（状态栏下 y−44），按屏宽 px() 等比。
const makeStyles = (colors, dark) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg},
    safe: {flex: 1},
    scroll: {paddingBottom: px(30), paddingHorizontal: px(15)},
    bgDark: {position: 'absolute', top: 0, left: 0, width: SCREEN_W, height: px(1050)},
    bgLight: {position: 'absolute', top: 0, left: 0, width: SCREEN_W, height: px(400)},
    screenTitle: {
      marginTop: px(10),
      fontSize: px(18),
      lineHeight: px(25),
      fontWeight: '600',
      color: colors.textPrimary,
      alignSelf: 'flex-start',
    },
    icpBeian: {
      textAlign: 'center',
      color: colors.textMuted,
      fontSize: 12,
      marginTop: px(24),
    },
    profileBlock: {alignItems: 'center', marginTop: px(25)},
    avatar: {
      width: px(80),
      height: px(80),
      borderRadius: px(40),
      backgroundColor: colors.cardAlt,
    },
    userName: {
      marginTop: px(9),
      fontSize: px(18),
      lineHeight: px(25),
      fontWeight: '600',
      color: colors.textPrimary,
    },
    idRow: {flexDirection: 'row', alignItems: 'center', marginTop: px(5)},
    userId: {fontSize: px(12), lineHeight: px(17), color: '#979797'},
    copyIcon: {width: px(14), height: px(14), marginLeft: px(5)},
    pointsCard: {marginTop: px(20), width: px(345), height: px(80)},
    pointsCardImg: {position: 'absolute', top: 0, left: 0, width: px(345), height: px(80)},
    pointsLabel: {
      position: 'absolute',
      left: px(19),
      top: px(15),
      fontSize: px(13),
      lineHeight: px(14),
      color: '#FFFFFF',
    },
    eyeIcon: {position: 'absolute', left: px(63), top: px(14), width: px(16), height: px(16)},
    pointsValue: {
      position: 'absolute',
      left: px(19),
      top: px(34),
      fontSize: px(24),
      lineHeight: px(34),
      fontWeight: '600',
      color: '#FFFFFF',
    },
    rechargeBtn: {
      position: 'absolute',
      left: px(250),
      top: px(26),
      width: px(80),
      height: px(28),
      borderRadius: px(14),
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    rechargeText: {fontSize: px(11), lineHeight: px(15), color: dark ? '#7F47FE' : '#FF355F'},
    instCard: {
      marginTop: px(15),
    },
    menuSection: {
      marginTop: px(15),
      backgroundColor: dark ? '#040428' : '#FFFFFF',
      borderRadius: px(10),
      overflow: 'hidden',
    },
    menuItem: {height: px(55)},
    menuIcon: {position: 'absolute', left: px(15), top: px(14), width: px(28), height: px(28)},
    menuGlyph: {
      fontSize: px(19),
      lineHeight: px(28),
      textAlign: 'center',
      color: '#FFFFFF',
      backgroundColor: '#000000',
      borderRadius: px(8),
      overflow: 'hidden',
    },
    menuLabel: {
      position: 'absolute',
      left: px(53),
      top: px(18),
      fontSize: px(14),
      lineHeight: px(20),
      fontWeight: '600',
      color: dark ? '#FFFFFF' : '#222222',
    },
    menuArrow: {position: 'absolute', left: px(314), top: px(20), width: px(16), height: px(16)},
    phoneMask: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: px(28)},
    phoneCard: {backgroundColor: dark ? '#16143A' : '#FFFFFF', borderRadius: px(14), padding: px(18)},
    phoneTitle: {fontSize: px(17), fontWeight: '700', color: dark ? '#FFFFFF' : '#222222', marginBottom: px(12)},
    phoneInput: {
      borderWidth: 1,
      borderColor: dark ? '#3A3868' : '#E6E6E6',
      borderRadius: px(8),
      paddingHorizontal: px(12),
      height: px(42),
      marginBottom: px(10),
      color: dark ? '#FFFFFF' : '#222222',
      fontSize: px(15),
    },
    phoneActions: {flexDirection: 'row', justifyContent: 'space-between', marginTop: px(6)},
    phoneAction: {color: '#07C160', fontSize: px(15), fontWeight: '600'},
  });

export default ProfileScreen;
