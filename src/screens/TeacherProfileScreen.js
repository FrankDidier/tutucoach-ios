import React, {useEffect, useMemo, useState} from 'react';
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
  Dimensions,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Images} from '../assets/images';
import {pickFromGallery} from '../services/imagePicker';
import {
  getTeacherAvatarUri,
  setTeacherAvatarUri,
} from '../services/profilePrefs';
import {ensureTeacherUnlocked} from '../services/teacherAuth';
import {useTheme} from '../theme/ThemeContext';
import {getDeviceId} from '../services/device';
import {fetchTeacherGuangbi} from '../services/guangbi';
import {
  currentInstrument,
  loadInstrument,
  setInstrument,
} from '../services/instrument';
import InstrumentPickerModal from '../components/InstrumentPickerModal';
import InstrumentCard from '../components/InstrumentCard';

const {width: SCREEN_W} = Dimensions.get('window');
const px = n => Math.round((n * SCREEN_W) / 375);

const TeacherProfileScreen = ({navigation}) => {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const insets = useSafeAreaInsets();

  const [avatarUri, setAvatar] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  const [gb, setGb] = useState(0);
  const [instrument, setInst] = useState(currentInstrument());
  const [instPicker, setInstPicker] = useState(false);

  // 进入教师端先做口令校验（对应安卓 TeacherGate）。未通过则退回上一页。
  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = await ensureTeacherUnlocked();
      if (!alive) return;
      if (!ok) {
        navigation?.goBack?.();
        return;
      }
      setUnlocked(true);
      getTeacherAvatarUri().then(u => alive && setAvatar(u));
      loadInstrument().then(id => alive && setInst(id));
      fetchTeacherGuangbi(getDeviceId())
        .then(r => {
          if (alive && r && r.ok) {
            setGb(Number(r.balance) || 0);
          }
        })
        .catch(() => {});
    })();
    return () => {
      alive = false;
    };
  }, [navigation]);

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
      await setTeacherAvatarUri(keep);
      Alert.alert('头像已更新');
    } else if (r.error === 'no_module') {
      Alert.alert('提示', '图片选择模块未集成（需重新编译）');
    }
  };

  // 老版本存的是 file:// 路径，更新后已经失效：显示失败就回到默认头像
  const onAvatarBroken = () => {
    setAvatar(null);
    setTeacherAvatarUri('');
  };

  if (!unlocked) {
    // 口令校验中 / 未通过：先显示空白底，避免泄露教师功能入口。
    return <SafeAreaView style={styles.container} />;
  }

  const rowArrow = dark ? Images.icRowArrowDark : Images.icRowArrowLight;
  const MenuRow = ({icon, label, onPress}) => (
    <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={onPress}>
      <Image source={icon} style={styles.menuIcon} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Image source={rowArrow} style={styles.menuArrow} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
      <View style={[styles.safe, {paddingBottom: insets.bottom}]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, {paddingTop: insets.top}]}
        showsVerticalScrollIndicator={false}>
        {/* 背景：蓝湖「我的教师端」切图（暗 375×812 / 浅 375×400），随内容滚动 */}
        <Image
          source={dark ? Images.teacherBgDark : Images.profileBgLight}
          style={[
            dark ? styles.bgDark : styles.bgLight,
            {height: (dark ? px(812) : px(400)) + insets.top - px(44)},
          ]}
          resizeMode="stretch"
          pointerEvents="none"
        />
        <Text style={styles.pageTitle}>我的</Text>

        <View style={styles.profileBlock}>
          <TouchableOpacity activeOpacity={0.85} onPress={onChangeAvatar}>
            <Image
              source={
                avatarUri
                  ? {uri: avatarUri}
                  : dark
                  ? Images.teacherAvatarDark
                  : Images.teacherAvatar
              }
              onError={avatarUri ? onAvatarBroken : undefined}
              style={styles.avatar}
              resizeMode="cover"
            />
          </TouchableOpacity>
          <Text style={styles.loginText}>登录/注册</Text>
          <Text style={styles.hintText}>立即注册体验完整功能</Text>
        </View>

        {/* 光币卡 (15,260) 345×80：暗「总积分 / 立即提现」，浅「总光币 / 立即查看」（按稿） */}
        <TouchableOpacity
          style={styles.pointsCard}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('MyGuangbi')}>
          <Image
            source={dark ? Images.pointsCardDark : Images.pointsCardLight}
            style={styles.pointsCardImg}
            resizeMode="stretch"
          />
          <Text style={styles.pointsLabel}>{dark ? '总积分' : '总光币'}</Text>
          <Image source={Images.pfEye} style={styles.eyeIcon} />
          <Text style={styles.pointsValue}>{gb}</Text>
          <View style={styles.cardBtn}>
            <Text style={styles.cardBtnText}>{dark ? '立即提现' : '立即查看'}</Text>
          </View>
        </TouchableOpacity>

        <InstrumentCard
          instrument={instrument}
          onPick={() => setInstPicker(true)}
          style={styles.instCard}
        />

        <View style={[styles.menuSection, styles.menuFirst]}>
          <MenuRow
            icon={Images.tAi}
            label="AI分身｜陪练设置"
            onPress={() => navigation.navigate('AIList')}
          />
          <MenuRow
            icon={Images.tLesson}
            label="曲目解读｜生成教案"
            onPress={() => navigation.navigate('LessonPlan')}
          />
        </View>

        <View style={styles.menuSection}>
          <MenuRow
            icon={Images.tStudent}
            label="学生信息录入"
            onPress={() => navigation.navigate('StudentEntry')}
          />
          <MenuRow
            icon={Images.tClass}
            label="班级管理"
            onPress={() => navigation.navigate('ClassManage')}
          />
        </View>
      </ScrollView>
      {/* 蓝湖「我的教师端」含底栏；跳回 MainTabs 对应 Tab */}
      <View style={styles.tabBar}>
        {[
          {key: '首页', icon: Images.tabHome},
          {key: '练琴', icon: Images.tabPractice},
          {key: '我的', icon: Images.tabProfile},
        ].map(tab => {
          const active = tab.key === '我的';
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              activeOpacity={0.85}
              onPress={() => {
                if (tab.key === '我的') return;
                navigation.navigate('MainTabs', {screen: tab.key});
              }}>
              <Image
                source={tab.icon}
                style={[
                  styles.tabIcon,
                  {tintColor: active ? colors.tabActive : colors.tabInactive},
                ]}
                resizeMode="contain"
              />
              <Text
                style={[
                  styles.tabLabel,
                  {color: active ? colors.tabActive : colors.tabInactive},
                ]}>
                {tab.key}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
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
    </View>
  );
};

// 坐标均取自蓝湖 我的教师端（状态栏下 y−44），按屏宽 px() 等比；与学生端「我的」同一套栅格。
const makeStyles = (colors, dark) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg},
    safe: {flex: 1},
    scroll: {paddingBottom: px(30), paddingHorizontal: px(15)},
    bgDark: {position: 'absolute', top: 0, left: 0, width: SCREEN_W, height: px(812)},
    bgLight: {position: 'absolute', top: 0, left: 0, width: SCREEN_W, height: px(400)},
    pageTitle: {
      marginTop: px(10),
      fontSize: px(18),
      lineHeight: px(25),
      fontWeight: '600',
      color: colors.textPrimary,
      alignSelf: 'flex-start',
    },
    profileBlock: {alignItems: 'center', marginTop: px(25)},
    avatar: {width: px(80), height: px(80), borderRadius: px(40)},
    loginText: {
      marginTop: px(9),
      fontSize: px(18),
      lineHeight: px(25),
      fontWeight: '600',
      color: colors.textPrimary,
    },
    hintText: {marginTop: px(5), fontSize: px(12), lineHeight: px(17), color: '#979797'},
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
    cardBtn: {
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
    cardBtnText: {fontSize: px(11), lineHeight: px(15), color: dark ? '#7F47FE' : '#FF355F'},
    instCard: {marginTop: px(15)},
    menuSection: {
      marginTop: px(15),
      backgroundColor: dark ? '#040428' : '#FFFFFF',
      borderRadius: px(10),
      overflow: 'hidden',
    },
    menuFirst: {marginTop: px(14)},
    menuItem: {height: px(55)},
    menuIcon: {position: 'absolute', left: px(15), top: px(14), width: px(28), height: px(28)},
    menuLabel: {
      position: 'absolute',
      left: px(53),
      top: px(18),
      fontSize: px(14),
      lineHeight: px(20),
      fontWeight: '600',
      color: dark ? '#FFFFFF' : '#261216',
    },
    menuArrow: {position: 'absolute', left: px(314), top: px(20), width: px(16), height: px(16)},
    tabBar: {
      flexDirection: 'row',
      borderTopWidth: 0.5,
      borderTopColor: colors.tabBarBorder || colors.divider,
      backgroundColor: colors.tabBarBg,
      paddingTop: 6,
      height: 57,
    },
    tabItem: {flex: 1, alignItems: 'center'},
    tabIcon: {width: 24, height: 24},
    tabLabel: {fontSize: 10, fontWeight: '400', marginTop: 3},
  });

export default TeacherProfileScreen;
