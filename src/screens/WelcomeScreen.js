import React, {useMemo, useRef, useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  StatusBar,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {Images} from '../assets/images';
import {speak} from '../services/voice';
import {talkDurationMs} from '../utils/rabbitMessages';
import {onAppOpen, onTap} from '../services/companion';
import RabbitMascot from '../components/RabbitMascot';
import {useTheme} from '../theme/ThemeContext';

// 蓝湖设计稿基准宽 375pt；按屏宽等比缩放，保证与设计稿 1:1 的尺寸/间距。
const {width: SCREEN_W} = Dimensions.get('window');
const S = SCREEN_W / 375;
const px = n => Math.round(n * S);

const WelcomeScreen = ({navigation}) => {
  const {colors, mode} = useTheme();
  const styles = useMemo(() => makeStyles(colors, mode), [colors, mode]);

  // ===== 动效 =====
  // 兔子本体的呼吸/说话/随机动作全部由 RabbitMascot 逐帧播放（见组件）；
  // 这里只保留点击弹跳与气泡淡入。
  const bounce = useRef(new Animated.Value(1)).current; // 点击弹跳（Overshoot）
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
      setTalking(true); // → RabbitMascot 播「说话」动作，声音结束后回待机
      if (talkTimerRef.current) {
        clearTimeout(talkTimerRef.current);
      }
      talkTimerRef.current = setTimeout(() => {
        setTalking(false);
      }, talkDurationMs(message));
    },
    [showSpeechBubble],
  );

  // 顺序播报多条消息（第 2 条在第 1 条说完后开始）。
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
    // 点击弹跳：scale 1→1.12→1，OvershootInterpolator（约 360ms）
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
    // 进入首页问候（每次进入一次），对应 RabbitCompanion.onAppOpen
    // 主题切换后跳过，避免再播 TTS（安卓同款杂音问题）。
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
      {/* 首页背景：
          · 暗色——不铺整屏位图。iOS 对这张 1500×3248 大图做缩放会把它「洗淡」并把顶部中央
            的斜光束搬到右侧、压低对比，无法可靠还原安卓那条「顶部中央斜向光束」。改为
            底色 #020014（root 提供）+ 顶部一张烘焙好的柔和径向光晕小图（原生可靠、逐点对齐
            安卓采样：顶中(54,38,106)→y0.14(18,9,53)→y0.20 近黑）。MUSIC/星光/兔子都是独立层。
          · 浅色——保持原整屏位图。 */}
      {mode === 'dark' ? (
        <>
          {/* 顶部竖向光晕：#3C2A74 顶亮 → 0.26 处渐隐到底色 #020014（逐点对齐安卓采样
              顶中(54,38,106)、y0.14(18,9,53)、y0.20 近黑）。原生绘制，不被 iOS 位图洗淡。 */}
          <LinearGradient
            colors={['#463184', '#170B3C', '#020014', '#020014']}
            locations={[0, 0.13, 0.27, 1]}
            start={{x: 0.5, y: 0}}
            end={{x: 0.5, y: 1}}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {/* 横向压暗两侧，把光晕收束到中央并略偏右（右 0.78 < 左 0.92，还原安卓斜向光束的
              右倾：far-R 54 > far-L 42）。 */}
          <LinearGradient
            colors={[
              'rgba(2,0,20,0.92)',
              'rgba(2,0,20,0)',
              'rgba(2,0,20,0)',
              'rgba(2,0,20,0.82)',
            ]}
            locations={[0, 0.33, 0.68, 1]}
            start={{x: 0, y: 0.5}}
            end={{x: 1, y: 0.5}}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </>
      ) : (
        <Image
          source={Images.homeBgLight}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          pointerEvents="none"
        />
      )}
      <SafeAreaView style={styles.safe}>
        {/* 蓝湖 首页_t1：标题 y=54 → 兔 y=163/342×343 → 文案 y=537 → 按钮 y=601/210×44 */}
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

        <Text style={styles.welcomeCaption}>
          欢迎使用全球第一款智能手型检测软件
        </Text>

        <View style={styles.footer}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => navigation.navigate('练琴')}
            style={styles.ctaOuter}>
            {/* 100% 对齐安卓 btn_pill：竖向两段渐变 #B595FF(顶)→#7F47FE(底)，angle 270。 */}
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
      </SafeAreaView>
      {/* 蓝湖 bard-fill @ (290,108) 35×35：必须叠在兔子之上，否则兔耳会盖住 */}
      <Image
        source={mode === 'dark' ? Images.homeSparkleDark : Images.homeSparkleLight}
        style={styles.lanhuBard}
        resizeMode="contain"
        pointerEvents="none"
      />
    </View>
  );
};

const makeStyles = (colors, mode) =>
  StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  safe: {
    flex: 1,
  },
  header: {
    // 蓝湖：标题 x=15 y=54（相对状态栏下）
    paddingHorizontal: px(15),
    paddingTop: px(10),
    paddingBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  // 蓝湖 首页_* ：bard-fill rect (290,108,35,35)，相对 375 宽设计稿
  lanhuBard: {
    position: 'absolute',
    left: px(290),
    top: px(108),
    width: px(35),
    height: px(35),
    zIndex: 2,
  },
  mascotBlock: {
    // 标题底≈79 → 兔顶 163 ⇒ 间距 84；兔 342×343
    marginTop: px(84),
    width: px(342),
    height: px(343),
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // MUSIC：蓝湖 y=247，相对兔顶 +84；贴图 352×79
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
  // 100% 对齐安卓 heroMascotArea：兔视图填满 342×343 画框、居中、无位移。
  // 实测 iOS APNG 与安卓 webp 逐帧「填充比例一致」（同盒渲染同大小），故与安卓同尺寸即 1:1。
  rabbitImg: {
    width: px(342),
    height: px(343),
    zIndex: 1,
    alignSelf: 'center',
    // iOS APNG 帧底部留白比安卓 webp 多，同盒会偏低 ~0.03 屏高；上移 24 使兔身竖向中心与安卓齐平。
    transform: [{translateY: px(-24)}],
  },
  welcomeCaption: {
    // 兔底 506 → 文案 537 ⇒ 31
    marginTop: px(31),
    paddingHorizontal: px(35),
    // 100% 对齐安卓 tvWelcomeTagline：18sp 随屏宽等比放大(px)、textStyle=bold、行距+4。
    fontSize: px(18),
    lineHeight: px(28),
    textAlign: 'center',
    color: colors.textPrimary,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    // 文案底≈575 → 按钮 601 ⇒ 26；按钮底到 Tab≈90
    marginTop: px(26),
    marginBottom: px(24),
  },
  ctaOuter: {
    width: px(210),
    height: px(44),
    borderRadius: px(22),
    overflow: 'hidden',
    justifyContent: 'center',
    shadowColor: '#4B28AA',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
    elevation: 6,
  },
  ctaLabelWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    // 100% 对齐安卓 btnStartExperience：14sp 随屏宽等比、bold、白字。
    color: colors.onPrimary,
    fontSize: px(14),
    fontWeight: '700',
  },
  });

export default WelcomeScreen;
