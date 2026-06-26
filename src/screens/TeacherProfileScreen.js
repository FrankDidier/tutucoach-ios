import React, {useEffect, useState} from 'react';
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
} from 'react-native';
import {Colors} from '../utils/colors';
import {Images} from '../assets/images';
import {pickFromGallery} from '../services/imagePicker';
import {
  getTeacherAvatarUri,
  setTeacherAvatarUri,
} from '../services/profilePrefs';

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

const TeacherProfileScreen = ({navigation}) => {
  const [avatarUri, setAvatar] = useState(null);

  useEffect(() => {
    let alive = true;
    getTeacherAvatarUri().then(u => alive && setAvatar(u));
    return () => {
      alive = false;
    };
  }, []);

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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.pinkBg} />
      <Image
        source={Images.pageGradient}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backHit}
          onPress={() => navigation?.goBack?.()}
          hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
          accessibilityRole="button"
          accessibilityLabel="返回">
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>我的</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.profileBlock}>
          <TouchableOpacity activeOpacity={0.85} onPress={onChangeAvatar}>
            <View style={styles.avatarCircle}>
              <Image
                source={avatarUri ? {uri: avatarUri} : Images.avatarRabbit}
                style={styles.avatarImg}
                resizeMode={avatarUri ? 'cover' : 'contain'}
              />
            </View>
            <View style={styles.avatarEditBadge}>
              <Text style={styles.avatarEditText}>＋</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.loginText}>登录/注册</Text>
          <Text style={styles.hintText}>立即注册体验完整功能</Text>
        </View>

        <View style={styles.cardSingle}>
          <MenuRow
            icon={Images.menuAiSettings}
            label="AI分身｜陪练设置"
            onPress={() => navigation.navigate('AISettings')}
          />
        </View>

        <View style={styles.cardGroup}>
          <MenuRow
            icon={Images.menuStudentEntry}
            label="学生信息录入"
            onPress={() => navigation.navigate('StudentEntry')}
            divider
          />
          <MenuRow
            icon={Images.menuClassManage}
            label="班级管理"
            onPress={() => navigation.navigate('ClassManage')}
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  backHit: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    fontSize: 30,
    color: '#333333',
    marginTop: -4,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginLeft: 4,
  },
  scroll: {
    paddingBottom: 40,
  },
  profileBlock: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 8,
  },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.pinkLight,
    padding: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: 4,
    bottom: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.pinkPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarEditText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginTop: -1,
  },
  loginText: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  hintText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  cardSingle: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  cardGroup: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    paddingHorizontal: 16,
  },
  menuIcon: {
    width: 36,
    height: 36,
    marginRight: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  menuArrow: {
    fontSize: 22,
    color: Colors.greyMedium,
    marginTop: -2,
  },
  menuDivider: {
    position: 'absolute',
    left: 64,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.greyDivider,
  },
});

export default TeacherProfileScreen;
