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
} from 'react-native';
import {Colors} from '../utils/colors';
import {Images} from '../assets/images';
import {speak} from '../services/voice';
import {talkDurationMs} from '../utils/rabbitMessages';
import {onAppOpen, onTap} from '../services/companion';

const BG_TOP = {r: 255, g: 232, b: 238};
const BG_BOTTOM = {r: 255, g: 245, b: 247};
const BTN_START = {r: 255, g: 90, b: 127};
const BTN_END = {r: 255, g: 138, b: 171};

const BG_STEPS = 48;
const BTN_STEPS = 28;

function lerpChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function lerpRgb(from, to, t) {
  return `rgb(${lerpChannel(from.r, to.r, t)},${lerpChannel(
    from.g,
    to.g,
    t,
  )},${lerpChannel(from.b, to.b, t)})`;
}

const WelcomeScreen = ({navigation}) => {
  const bgStripes = useMemo(
    () =>
      Array.from({length: BG_STEPS}, (_, i) =>
        lerpRgb(BG_TOP, BG_BOTTOM, i / (BG_STEPS - 1)),
      ),
    [],
  );

  const btnStripes = useMemo(
    () =>
      Array.from({length: BTN_STEPS}, (_, i) =>
        lerpRgb(BTN_START, BTN_END, i / (BTN_STEPS - 1)),
      ),
    [],
  );

  // ===== 动效（与安卓 WelcomeFragment 的 ObjectAnimator 参数 1:1） =====
  const idleWave = useRef(new Animated.Value(0)).current; // 呼吸/摆动（2200ms）
  const talkWave = useRef(new Animated.Value(0)).current; // 说话（420ms，更活泼）
  const bounce = useRef(new Animated.Value(1)).current; // 点击弹跳（Overshoot）
  const bubbleOpacity = useRef(new Animated.Value(0)).current;

  const idleLoopRef = useRef(null);
  const talkLoopRef = useRef(null);
  const talkTimerRef = useRef(null);
  const hideBubbleTimerRef = useRef(null);
  const greetedRef = useRef(false);

  const [talking, setTalking] = useState(false);
  const [bubble, setBubble] = useState('');

  const startIdleBreathing = useCallback(() => {
    if (talkLoopRef.current) {
      talkLoopRef.current.stop();
      talkLoopRef.current = null;
    }
    talkWave.setValue(0);
    if (idleLoopRef.current) return;
    idleWave.setValue(0);
    idleLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(idleWave, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(idleWave, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    idleLoopRef.current.start();
  }, [idleWave, talkWave]);

  const startTalkingMotion = useCallback(() => {
    if (idleLoopRef.current) {
      idleLoopRef.current.stop();
      idleLoopRef.current = null;
    }
    idleWave.setValue(0);
    if (talkLoopRef.current) return;
    talkWave.setValue(0);
    talkLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(talkWave, {
          toValue: 1,
          duration: 420,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(talkWave, {
          toValue: 0,
          duration: 420,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    talkLoopRef.current.start();
  }, [idleWave, talkWave]);

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
      speak(message, {rate, pitch});
      setTalking(true);
      startTalkingMotion();
      if (talkTimerRef.current) {
        clearTimeout(talkTimerRef.current);
      }
      talkTimerRef.current = setTimeout(() => {
        setTalking(false);
        startIdleBreathing();
      }, talkDurationMs(message));
    },
    [showSpeechBubble, startTalkingMotion, startIdleBreathing],
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
    startIdleBreathing();
    // 进入首页问候（每次进入一次），对应 RabbitCompanion.onAppOpen
    if (!greetedRef.current) {
      greetedRef.current = true;
      setTimeout(() => onAppOpen().then(talkSequence), 500);
    }
    return () => {
      if (idleLoopRef.current) idleLoopRef.current.stop();
      if (talkLoopRef.current) talkLoopRef.current.stop();
      if (talkTimerRef.current) clearTimeout(talkTimerRef.current);
      if (hideBubbleTimerRef.current) clearTimeout(hideBubbleTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeWave = talking ? talkWave : idleWave;
  const scaleBase = activeWave.interpolate({
    inputRange: [0, 1],
    outputRange: talking ? [1, 1.03] : [1, 1.02],
  });
  const translateY = activeWave.interpolate({
    inputRange: [0, 1],
    outputRange: talking ? [0, -7] : [0, -4],
  });
  const rotate = activeWave.interpolate({
    inputRange: [0, 1],
    outputRange: talking ? ['-2deg', '2deg'] : ['-1.1deg', '1.1deg'],
  });
  const scale = Animated.multiply(scaleBase, bounce);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.pinkBg} />
      <View style={styles.gradientLayer} pointerEvents="none">
        {bgStripes.map((color, i) => (
          <View
            key={`bg-${i}`}
            style={[styles.bgStripe, {backgroundColor: color}]}
          />
        ))}
      </View>

      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.pageTitle}>首页</Text>
          <Image
            source={Images.sparkle}
            style={styles.sparkle}
            resizeMode="contain"
          />
        </View>

        <View style={styles.center}>
          <View style={styles.mascotBlock}>
            <Text style={styles.musicWatermark}>Music</Text>

            <Animated.View
              pointerEvents="none"
              style={[styles.bubbleWrap, {opacity: bubbleOpacity}]}>
              <View style={styles.bubble}>
                <Text style={styles.bubbleText}>{bubble}</Text>
              </View>
              <View style={styles.bubbleTail} />
            </Animated.View>

            <TouchableOpacity activeOpacity={0.9} onPress={handleTap}>
              <Animated.Image
                source={Images.rabbitIdle}
                style={[
                  styles.rabbitImg,
                  {transform: [{translateY}, {rotate}, {scale}]},
                ]}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>
          <Text style={styles.welcomeCaption}>
            欢迎使用全球第一款智能手型检测软件
          </Text>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => navigation.navigate('练琴')}
            style={styles.ctaOuter}>
            <View style={styles.ctaGradientRow}>
              {btnStripes.map((color, i) => (
                <View
                  key={`btn-${i}`}
                  style={[styles.btnStripe, {backgroundColor: color}]}
                />
              ))}
            </View>
            <View style={styles.ctaLabelWrap} pointerEvents="none">
              <Text style={styles.ctaLabel}>立即体验</Text>
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.pinkBg,
  },
  gradientLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  bgStripe: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sparkle: {
    width: 36,
    height: 36,
    marginTop: 2,
    marginRight: 4,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  mascotBlock: {
    width: '100%',
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  musicWatermark: {
    position: 'absolute',
    fontSize: 96,
    fontWeight: '700',
    color: Colors.pinkPrimary,
    opacity: 0.07,
    letterSpacing: 2,
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
    color: Colors.textPrimary,
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
  rabbitImg: {
    width: 240,
    height: 300,
    zIndex: 1,
  },
  welcomeCaption: {
    marginTop: 28,
    fontSize: 18,
    lineHeight: 26,
    textAlign: 'center',
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    paddingTop: 8,
  },
  ctaOuter: {
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  ctaGradientRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  btnStripe: {
    flex: 1,
    height: '100%',
  },
  ctaLabelWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
});

export default WelcomeScreen;
