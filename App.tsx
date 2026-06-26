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
import GuideScreen from './src/screens/GuideScreen';
import CheckinStatsScreen from './src/screens/CheckinStatsScreen';
import StudentEntryScreen from './src/screens/StudentEntryScreen';

import {Colors} from './src/utils/colors';
import {Images} from './src/assets/images';
import {getItem} from './src/services/storage';

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

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarIcon: ({focused, color}) => (
          <TabIcon label={route.name} focused={focused} color={color} />
        ),
        tabBarActiveTintColor: Colors.pinkPrimary,
        tabBarInactiveTintColor: Colors.greyMedium,
        tabBarStyle: {
          height: Platform.OS === 'ios' ? 85 : 60,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 6,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0.5,
          borderTopColor: Colors.greyDivider,
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: {width: 0, height: -2},
        },
        tabBarLabelStyle: {fontSize: 11, fontWeight: '600'},
      })}>
      <Tab.Screen name="首页" component={WelcomeScreen} />
      <Tab.Screen name="练琴" component={PracticeScreen} />
      <Tab.Screen name="我的" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function App(): React.JSX.Element {
  // 首次启动显示引导页（对应安卓 GuideActivity 为 LAUNCHER）。
  const [initialRoute, setInitialRoute] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const shown = await getItem('guide_shown');
      setInitialRoute(shown === '1' ? 'MainTabs' : 'Guide');
    })();
  }, []);

  if (!initialRoute) {
    return <View style={{flex: 1, backgroundColor: Colors.pinkBg}} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{headerShown: false}}>
        <Stack.Screen name="Guide" component={GuideScreen} />
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="Teacher" component={TeacherScreen} />
        <Stack.Screen name="TeacherProfile" component={TeacherProfileScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Subscription" component={SubscriptionScreen} />
        <Stack.Screen name="Detection" component={DetectionScreen} />
        <Stack.Screen name="ClassManage" component={ClassManageScreen} />
        <Stack.Screen name="AISelect" component={AISelectScreen} />
        <Stack.Screen name="AISettings" component={AISettingsScreen} />
        <Stack.Screen name="CheckinStats" component={CheckinStatsScreen} />
        <Stack.Screen name="StudentEntry" component={StudentEntryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default App;
