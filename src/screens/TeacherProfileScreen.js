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
  Platform,
} from 'react-native';
import {Images} from '../assets/images';
import {pickFromGallery} from '../services/imagePicker';
import {
  getTeacherAvatarUri,
  setTeacherAvatarUri,
} from '../services/profilePrefs';
import {ensureTeacherUnlocked} from '../services/teacherAuth';
import {useTheme} from '../theme/ThemeContext';

const TeacherProfileScreen = ({navigation}) => {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);

  const [avatarUri, setAvatar] = useState(null);
  const [unlocked, setUnlocked] = useState(false);

  const MenuRow = ({icon, label, onPress, divider}) => (
    <TouchableOpacity
      style={styles.menuRow}
      activeOpacity={0.7}
      onPress={onPress}>
      <Image source={icon} style={styles.menuIcon} resizeMode="contain" />
      <Text style={styles.menuLabel}>{label}</Text>
      <Text style={styles.menuArrow}>›</Text>
      {divider ? <View style={styles.menuDivider} /> : null}
    </TouchableOpacity>
  );

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
    })();
    return () => {
      alive = false;
    };
  }, [navigation]);

  const onChangeAvatar = async () => {
    const r = await pickFromGallery();
    if (r.uri) {
      setAvatar(r.uri);
      await setTeacherAvatarUri(r.uri);
      Alert.alert('头像已更新');
    } else if (r.error === 'no_module') {
      Alert.alert('提示', '图片选择模块未集成（需重新编译）');
    }
  };

  if (!unlocked) {
    // 口令校验中 / 未通过：先显示空白底，避免泄露教师功能入口。
    return <SafeAreaView style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
      {/* 背景：与「我的（学生端）」一致（暗色整屏 / 浅色顶部渐变） */}
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
      <View style={styles.topBar}>
        <Text style={styles.pageTitle}>我的</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.profileBlock}>
          <TouchableOpacity activeOpacity={0.85} onPress={onChangeAvatar}>
            <Image
              source={avatarUri ? {uri: avatarUri} : Images.teacherAvatar}
              style={styles.avatar}
              resizeMode="cover"
            />
          </TouchableOpacity>
          <Text style={styles.loginText}>登录/注册</Text>
          <Text style={styles.hintText}>立即注册体验完整功能</Text>
        </View>

        <View style={styles.cardGroup}>
          <MenuRow
            icon={Images.tAi}
            label="AI分身｜陪练设置"
            onPress={() => navigation.navigate('AIList')}
            divider
          />
          <MenuRow
            icon={Images.tLesson}
            label="曲目解读｜生成教案"
            onPress={() => navigation.navigate('LessonPlan')}
          />
        </View>

        <View style={styles.cardGroup}>
          <MenuRow
            icon={Images.tStudent}
            label="学生信息录入"
            onPress={() => navigation.navigate('StudentEntry')}
            divider
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
      </SafeAreaView>
    </View>
  );
};

const makeStyles = (colors, dark) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg},
    safe: {flex: 1},
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 15,
      paddingTop: 10,
    },
    // 标题「我的」18/600（蓝湖教师端无返回箭头，与学生端「我的」一致）
    pageTitle: {fontSize: 18, fontWeight: '600', color: colors.textPrimary},
    scroll: {paddingBottom: 40, paddingHorizontal: 15},
    profileBlock: {alignItems: 'center', paddingTop: 20, paddingBottom: 8},
    avatar: {width: 80, height: 80, borderRadius: 40, marginBottom: 12},
    loginText: {fontSize: 18, fontWeight: '600', color: colors.textPrimary},
    hintText: {fontSize: 12, color: '#979797', marginTop: 6},
    cardGroup: {
      backgroundColor: colors.card,
      borderRadius: 16,
      marginTop: 16,
      paddingVertical: 4,
      overflow: 'hidden',
      borderWidth: dark ? 1 : 0,
      borderColor: colors.cardBorder,
      shadowColor: '#000',
      shadowOpacity: dark ? 0.25 : 0.05,
      shadowRadius: 10,
      shadowOffset: {width: 0, height: 2},
      elevation: 1,
    },
    menuRow: {flexDirection: 'row', alignItems: 'center', height: 55, paddingHorizontal: 15},
    menuIcon: {width: 28, height: 28, marginRight: 10},
    menuLabel: {flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary},
    menuArrow: {fontSize: 20, color: colors.textMuted, marginTop: -2},
    menuDivider: {
      position: 'absolute',
      left: 53,
      right: 0,
      bottom: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.divider,
    },
    tabBar: {
      flexDirection: 'row',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.divider,
      backgroundColor: colors.tabBarBg,
      paddingTop: 6,
      paddingBottom: Platform.OS === 'ios' ? 8 : 8,
      minHeight: 64,
    },
    tabItem: {flex: 1, alignItems: 'center', justifyContent: 'center'},
    tabIcon: {width: 24, height: 24},
    tabLabel: {fontSize: 11, fontWeight: '600', marginTop: 2},
  });

export default TeacherProfileScreen;
