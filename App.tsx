import React, {useEffect, useState} from 'react';
import {View, Image, Platform} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';

import WelcomeScreen from './src/screens/WelcomeScreen';
import PracticeScreen from './src/screens/PracticeScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import TeacherProfileScreen from './src/screens/TeacherProfileScreen';
import TeacherScreen from './src/screens/TeacherScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SubscriptionScreen from './src/screens/SubscriptionScreen';
import DetectionScreen from './src/screens/DetectionScreen';
import ClassManageScreen from './src/screens/ClassManageScreen';
import AISelectScreen from './src/screens/AISelectScreen';
import AISettingsScreen from './src/screens/AISettingsScreen';
import AIListScreen from './src/screens/AIListScreen';
import GuideScreen from './src/screens/GuideScreen';
import CheckinStatsScreen from './src/screens/CheckinStatsScreen';
import StudentEntryScreen from './src/screens/StudentEntryScreen';
import CompanionScreen from './src/screens/CompanionScreen';
import StudentReminderScreen from './src/screens/StudentReminderScreen';
import LessonPlanScreen from './src/screens/LessonPlanScreen';
import LegalScreen from './src/screens/LegalScreen';

import {Images} from './src/assets/images';
import {getItem, setItem} from './src/services/storage';
import {initDeviceId, getDeviceId} from './src/services/device';
import {registerAccount} from './src/services/account';
import {registerWeChat} from './src/services/wechat';
import {ThemeProvider, useTheme} from './src/theme/ThemeContext';
import {SafeAreaProvider} from 'react-native-safe-area-context';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS: Record<string, any> = {
  首页: Images.tabHome,
  练琴: Images.tabPractice,
  我的: Images.tabProfile,
};

function TabIcon({label, color}: {label: string; focused: boolean; color: string}) {
  return (
    <View style={{alignItems: 'center', justifyContent: 'center', width: 28, height: 28}}>
      <Image
        source={TAB_ICONS[label]}
        style={{width: 24, height: 24, tintColor: color}}
        resizeMode="contain"
      />
    </View>
  );
}

function MainTabs({route}: {route?: {params?: {screen?: string}}}) {
  const {colors} = useTheme();
  const startTab = route?.params?.screen;
  return (
    <Tab.Navigator
      initialRouteName={
        startTab === '练琴' || startTab === '我的' || startTab === '首页'
          ? startTab
          : '首页'
      }
      screenOptions={({route: r}) => ({
        headerShown: false,
        tabBarIcon: ({focused, color}) => (
          <TabIcon label={r.name} focused={focused} color={color} />
        ),
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          height: Platform.OS === 'ios' ? 85 : 60,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 6,
          backgroundColor: colors.tabBarBg,
          borderTopWidth: 0.5,
          borderTopColor: colors.tabBarBorder || colors.divider,
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: colors.mode === 'dark' ? 0.3 : 0.06,
          shadowRadius: 8,
          shadowOffset: {width: 0, height: -2},
        },
        tabBarLabelStyle: {fontSize: 10, fontWeight: '400'},
      })}>
      <Tab.Screen name="首页" component={WelcomeScreen} />
      <Tab.Screen name="练琴" component={PracticeScreen} />
      <Tab.Screen name="我的" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AppInner(): React.JSX.Element {
  const {colors} = useTheme();
  // 首次启动显示引导页（对应安卓 GuideActivity 为 LAUNCHER）。
  const [initialRoute, setInitialRoute] = useState<string | null>(null);
  // Lanhu audit: AsyncStorage verify_boot_route → stack/tab name for cold start.
  const [bootParams, setBootParams] = useState<Record<string, unknown> | undefined>();

  useEffect(() => {
    (async () => {
      // 先固化稳定设备 ID（账号/会员/练习/入班绑定都依赖它），再决定首屏。
      await initDeviceId();
      // 冷启动即静默注册到服务端，避免学生没进过「我的」导致老师入班找不到 ID。
      try {
        await registerAccount(getDeviceId(), 'student');
      } catch (e) {
        // 网络失败下次启动再试，不阻塞首屏
      }
      // 注册微信（已集成原生模块且配好 Universal Link 后生效；未集成时安全跳过）。
      registerWeChat();
      // Lanhu emulator audit: seed via AsyncStorage keys set before launch
      // (audit_skip_guide=1, audit_theme=dark|light, verify_boot_route).
      const auditSkip = await getItem('audit_skip_guide');
      const auditTheme = await getItem('audit_theme');
      if (auditTheme === 'light' || auditTheme === 'dark') {
        await setItem('theme_mode', auditTheme);
      }
      if (auditSkip === '1') {
        await setItem('guide_shown', '1');
      }
      const boot = (await getItem('verify_boot_route')) || '';
      // one-shot: clear so next natural launch is unaffected
      if (boot) {
        await setItem('verify_boot_route', '');
      }
      const shown = await getItem('guide_shown');
      const tabNames = ['首页', '练琴', '我的'];
      if (boot === 'Detection' || boot === 'DetectionPremium') {
        setBootParams({premium: boot === 'DetectionPremium'});
        setInitialRoute('Detection');
      } else if (
        boot &&
        [
          'TeacherProfile',
          'AIList',
          'AISettings',
          'AISelect',
          'Subscription',
          'ClassManage',
          'Companion',
          'LessonPlan',
          'Detection',
          'MainTabs',
          'StudentReminder',
          'StudentEntry',
        ].includes(boot)
      ) {
        setInitialRoute(boot);
      } else if (tabNames.includes(boot)) {
        setBootParams({screen: boot});
        setInitialRoute('MainTabs');
      } else {
        setInitialRoute(shown === '1' ? 'MainTabs' : 'Guide');
      }
    })();
  }, []);

  if (!initialRoute) {
    return <View style={{flex: 1, backgroundColor: colors.bg}} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{headerShown: false}}>
        <Stack.Screen name="Guide" component={GuideScreen} />
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          initialParams={
            initialRoute === 'MainTabs' ? bootParams : undefined
          }
        />
        <Stack.Screen name="Teacher" component={TeacherScreen} />
        <Stack.Screen name="TeacherProfile" component={TeacherProfileScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Subscription" component={SubscriptionScreen} />
        <Stack.Screen
          name="Detection"
          component={DetectionScreen}
          initialParams={
            initialRoute === 'Detection' ? bootParams : undefined
          }
        />
        <Stack.Screen
          name="Companion"
          component={CompanionScreen}
          options={{
            // 进陪练立刻盖住上一页，避免粉兔水印/练琴页透出约 1s
            animation: 'fade',
            animationDuration: 150,
            contentStyle: {backgroundColor: '#222'},
          }}
        />
        <Stack.Screen name="ClassManage" component={ClassManageScreen} />
        <Stack.Screen name="AISelect" component={AISelectScreen} />
        <Stack.Screen name="AIList" component={AIListScreen} />
        <Stack.Screen name="AISettings" component={AISettingsScreen} />
        <Stack.Screen name="StudentReminder" component={StudentReminderScreen} />
        <Stack.Screen name="LessonPlan" component={LessonPlanScreen} />
        <Stack.Screen name="Legal" component={LegalScreen} />
        <Stack.Screen name="CheckinStats" component={CheckinStatsScreen} />
        <Stack.Screen name="StudentEntry" component={StudentEntryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default App;
