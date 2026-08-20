import React, {useMemo, useRef, useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Images} from '../assets/images';
import {speak} from '../services/voice';
import {talkDurationMs} from '../utils/rabbitMessages';
import {onAppOpen, onTap} from '../services/companion';
import RabbitMascot from '../components/RabbitMascot';
import {useTheme} from '../theme/ThemeContext';

// 蓝湖设计稿基准宽 375pt；按屏宽等比缩放，保证与设计稿 1:1 的尺寸/间距。
const {width: SCREEN_W, height: SCREEN_H} = Dimensions.get('window');
const S = SCREEN_W / 375;
const px = n => Math.round(n * S);
// 粉洗背景至少铺满可视高度，避免长屏底部露出错误纯色
const BG_H = Math.max(SCREEN_H, Math.round((SCREEN_W * 812) / 375));

const WelcomeScreen = ({navigation}) => {
  const {colors, mode} = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => makeStyles(colors, mode, insets.top),
    [colors, mode, insets.top],
  );

  const bounce = useRef(new Animated.Value(1)).current;
  const bubbleOpacity = useRef(new Animated.Value(0)).current;

  const talkTimerRef = useRef(null);
  const hideBubbleTimerRef = useRef(null);
  const greetedRef = useRef(false);

  const [talking, setTalking] = useState(false);
  const [bubble, setBubble] = useState('');

  const showSpeechBubble = useCallback(
    message => {
      setBubble(message);
      Animated.timing(bubbleOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
      if (hideBubbleTimerRef.current) {
        clearTimeout(hideBubbleTimerRef.current);
      }
      hideBubbleTimerRef.current = setTimeout(() => {
        Animated.timing(bubbleOpacity, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }).start();
      }, 4200);
    },
    [bubbleOpacity],
  );

  const talk = useCallback(
    (message, {rate = 1.0, pitch = 1.0} = {}) => {
      if (!message) return;
      showSpeechBubble(message);
      speak(message, {rate, pitch, coachId: 'home_rabbit'});
      setTalking(true);
      if (talkTimerRef.current) {
        clearTimeout(talkTimerRef.current);
      }
      talkTimerRef.current = setTimeout(() => {
        setTalking(false);
      }, talkDurationMs(message));
    },
    [showSpeechBubble],
  );

  const talkSequence = useCallback(
    messages => {
      if (!messages || !messages.length) return;
      talk(messages[0]);
      if (messages.length > 1) {
        setTimeout(() => talk(messages[1]), talkDurationMs(messages[0]) + 300);
      }
    },
    [talk],
  );

  const handleTap = useCallback(() => {
    bounce.setValue(1);
    Animated.sequence([
      Animated.timing(bounce, {
        toValue: 1.12,
        duration: 120,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(bounce, {
        toValue: 1,
        friction: 4,
        tension: 90,
        useNativeDriver: true,
      }),
    ]).start();

    onTap().then(talkSequence);
  }, [bounce, talkSequence]);

  useEffect(() => {
    if (global.__tutuSkipHomeGreet) {
      global.__tutuSkipHomeGreet = false;
      greetedRef.current = true;
      return () => {
        if (talkTimerRef.current) clearTimeout(talkTimerRef.current);
        if (hideBubbleTimerRef.current) clearTimeout(hideBubbleTimerRef.current);
      };
    }
    if (!greetedRef.current) {
      greetedRef.current = true;
      setTimeout(() => onAppOpen().then(talkSequence), 500);
    }
    return () => {
      if (talkTimerRef.current) clearTimeout(talkTimerRef.current);
      if (hideBubbleTimerRef.current) clearTimeout(hideBubbleTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
      {/* 浅色背景严格按蓝湖 首页_t2（不含 MUSIC）：
          ① 02_背景 粉洗：自屏幕顶绝对铺满（与状态栏无关）
          ② soft / 阴影 / 星光：与兔子同一套「safeTop + (蓝湖y−44)」内容坐标，
             避免大刘海机上脚底与阴影错位。 */}
      {mode === 'dark' ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: px(360),
            overflow: 'hidden',
          }}
          pointerEvents="none">
          <Image
            source={Images.homeBgDark}
            style={{width: '100%', height: px(812)}}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['transparent', colors.bg, colors.bg]}
            locations={[0, 0.92, 1]}
            start={{x: 0.5, y: 0}}
            end={{x: 0.5, y: 1}}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: px(200),
            }}
            pointerEvents="none"
          />
        </View>
      ) : (
        <View style={styles.lightBgStack} pointerEvents="none">
          <Image
            source={Images.homeBgLight}
            style={styles.lightBgBase}
            resizeMode="stretch"
          />
          <Image
            source={Images.homeSoftBottom}
            style={styles.bgSoft}
            resizeMode="stretch"
          />
          <Image
            source={Images.homeRabbitShadow}
            style={styles.bgRabbitShadow}
            resizeMode="stretch"
          />
          <Image
            source={Images.homeSparkleLight}
            style={styles.bgSparkle}
            resizeMode="contain"
          />
        </View>
      )}

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.pageTitle}>首页</Text>
        </View>

        <View style={styles.mascotBlock}>
          <Image
            source={mode === 'dark' ? Images.wmMusicDark : Images.wmMusicLight}
            style={styles.musicWatermark}
            resizeMode="contain"
            pointerEvents="none"
          />

          <Animated.View
            pointerEvents="none"
            style={[styles.bubbleWrap, {opacity: bubbleOpacity}]}>
            <View style={styles.bubble}>
              <Text style={styles.bubbleText}>{bubble}</Text>
            </View>
            <View style={styles.bubbleTail} />
          </Animated.View>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleTap}
            style={styles.rabbitTouch}>
            <Animated.View
              style={[styles.rabbitAnimWrap, {transform: [{scale: bounce}]}]}>
              <RabbitMascot talking={talking} style={styles.rabbitImg} />
            </Animated.View>
          </TouchableOpacity>
        </View>

        <Text
          style={[
            styles.welcomeCaption,
            {fontWeight: mode === 'dark' ? '600' : '500'},
          ]}>
          欢迎使用全球第一款智能手型检测软件
        </Text>

        <View style={styles.footer}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => navigation.navigate('练琴')}
            style={styles.ctaOuter}>
            <LinearGradient
              colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
              start={{x: 0.5, y: 0}}
              end={{x: 0.5, y: 1}}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.ctaLabelWrap} pointerEvents="none">
              <Text style={styles.ctaLabel}>立即体验</Text>
            </View>
          </TouchableOpacity>
        </View>

        {mode === 'dark' && (
          <Image
            source={Images.homeSparkleDark}
            style={styles.lanhuBardDark}
            resizeMode="contain"
            pointerEvents="none"
          />
        )}
      </View>
    </View>
  );
};

const makeStyles = (colors, mode, safeTop) =>
  StyleSheet.create({
    root: {
      flex: 1,
      // 浅色用蓝湖洗色终点，避免长屏露出与粉洗不一致的色块
      backgroundColor: mode === 'light' ? '#FCF8FA' : colors.bg,
    },
    lightBgStack: {
      ...StyleSheet.absoluteFillObject,
      overflow: 'hidden',
    },
    lightBgBase: {
      position: 'absolute',
      left: 0,
      top: 0,
      width: SCREEN_W,
      height: BG_H,
    },
    bgSoft: {
      position: 'absolute',
      left: px(14),
      // 蓝湖 soft realRect y489 − 状态栏44 → 445
      top: safeTop + px(445),
      width: px(342),
      height: px(235),
    },
    bgRabbitShadow: {
      position: 'absolute',
      left: px(120),
      // 脚底随 translateY -12 下移后，阴影同步下移 13（蓝湖 477−44+13=446）
      top: safeTop + px(446),
      width: px(132),
      height: px(34),
    },
    bgSparkle: {
      position: 'absolute',
      left: px(290),
      // 蓝湖 bard-fill y108 − 44 → 64
      top: safeTop + px(64),
      width: px(35),
      height: px(35),
      zIndex: 2,
    },
    content: {
      flex: 1,
      paddingTop: safeTop,
    },
    header: {
      paddingHorizontal: px(15),
      paddingTop: px(10),
      paddingBottom: 0,
      height: px(10) + px(25),
      flexDirection: 'row',
      alignItems: 'center',
    },
    pageTitle: {
      fontSize: 18,
      lineHeight: px(25),
      fontWeight: '600',
      color: colors.textPrimary,
    },
    lanhuBardDark: {
      position: 'absolute',
      left: px(290),
      top: safeTop + px(64),
      width: px(35),
      height: px(35),
      zIndex: 2,
    },
    mascotBlock: {
      marginTop: px(84),
      width: px(342),
      height: px(343),
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
    },
    musicWatermark: {
      position: 'absolute',
      top: px(84),
      alignSelf: 'center',
      width: px(352),
      height: px(79),
      zIndex: 0,
    },
    bubbleWrap: {
      position: 'absolute',
      top: 0,
      alignItems: 'center',
      zIndex: 3,
    },
    bubble: {
      backgroundColor: '#fff',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 16,
      maxWidth: 260,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: {width: 0, height: 2},
      elevation: 3,
    },
    bubbleText: {
      fontSize: 14,
      lineHeight: 20,
      color: '#191919',
      textAlign: 'center',
    },
    bubbleTail: {
      width: 0,
      height: 0,
      borderLeftWidth: 8,
      borderRightWidth: 8,
      borderTopWidth: 10,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderTopColor: '#fff',
      marginTop: -1,
    },
    rabbitTouch: {
      alignSelf: 'center',
      zIndex: 1,
    },
    rabbitAnimWrap: {
      alignItems: 'center',
      alignSelf: 'center',
    },
    rabbitImg: {
      width: px(342),
      height: px(343),
      zIndex: 1,
      alignSelf: 'center',
      // 蓝湖框 342×343；APNG/待机图偏瘦高。scale 拉近稿面宽度；
      // translateY 使脚底落在阴影（y≈489）上，并贴近文案间距。
      transform: [{translateY: px(-12)}, {scale: 1.117}],
    },
    welcomeCaption: {
      // 蓝湖文案 y537 − 兔框底 506 = 31；脚底因 scale 略探出框，收 5 贴近稿面观感
      marginTop: px(26),
      paddingHorizontal: px(36),
      height: px(38),
      fontSize: px(18),
      lineHeight: px(38),
      textAlign: 'center',
      color: colors.textPrimary,
      fontWeight: '500',
    },
    footer: {
      alignItems: 'center',
      marginTop: px(26),
      marginBottom: px(24),
    },
    ctaOuter: {
      width: px(210),
      height: px(44),
      borderRadius: px(22),
      overflow: 'hidden',
      justifyContent: 'center',
      shadowColor: mode === 'dark' ? '#4B28AA' : '#FF3761',
      shadowOpacity: mode === 'dark' ? 0.45 : 0.28,
      shadowRadius: mode === 'dark' ? 12 : 10,
      shadowOffset: {width: 0, height: 6},
      elevation: 6,
    },
    ctaLabelWrap: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaLabel: {
      color: colors.onPrimary,
      fontSize: px(14),
      fontWeight: '600',
    },
  });

export default WelcomeScreen;
