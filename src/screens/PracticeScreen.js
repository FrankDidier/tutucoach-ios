import React, {useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  StatusBar,
  Image,
  Dimensions,
} from 'react-native';
import {Images} from '../assets/images';
import RabbitMascot from '../components/RabbitMascot';
import {useTheme} from '../theme/ThemeContext';

// 蓝湖设计稿基准宽度 375pt；按屏宽等比缩放，保证与设计稿 1:1 的相对尺寸/间距。
const {width: SCREEN_W} = Dimensions.get('window');
const S = SCREEN_W / 375;
const px = n => Math.round(n * S);

// 卡片（含缺口）设计尺寸 345x305，内部元素按「卡片内相对坐标」绝对定位，做到 1:1。
const CARD_W = 345;
const CARD_H = 305;

const PracticeScreen = ({navigation}) => {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  // MUSIC / CHAT 大字水印现为 Arial Black 精确渐变贴图（wm_music_*/wm_chat），不再用文本着色。
  // 磁贴内 VIP/FREE 水印已烘焙进贴图。
  const innerRow = dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,120,150,0.08)';

  return (
    <View style={styles.root}>
      <StatusBar barStyle={colors.statusBarStyle} />
      {/* 背景：暗色整屏渐变；浅色为顶部渐变 + 页面浅粉底 */}
      <Image
        source={dark ? Images.practiceBgDark : Images.practiceBgLight}
        style={
          dark
            ? StyleSheet.absoluteFill
            : {position: 'absolute', top: 0, left: 0, right: 0, height: px(400)}
        }
        resizeMode="cover"
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safe}>
        {/* 导航标题 练琴：18/600，左边距 30 */}
        <Text style={styles.screenTitle}>练琴</Text>

        {/* 顶部问候区：左文案 + 右上角兔子（216x217，压住卡片顶部缺口） */}
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <View style={styles.heroLine1Row}>
              {/* HI~ 双色（1:1 蓝湖）：H 为强调色（暗紫/亮粉），I~ 为主文本色 */}
              <Text style={styles.heroLine1}>
                <Text style={{color: dark ? '#7F47FE' : '#FF5F83'}}>H</Text>
                I~
              </Text>
              <Image source={dark ? Images.sparkleDark : Images.sparkle} style={styles.heroSparkle} resizeMode="contain" />
            </View>
            <Text style={styles.heroLine2}>我是你的兔兔教练</Text>
          </View>
          <RabbitMascot loopAction="celebrate" style={styles.mascot} />
        </View>

        {/* MUSIC 大字水印（衔接处，压在卡片之后只露上沿）——1:1 蓝湖：Arial Black 空心/渐变贴图 */}
        <View style={styles.cardOuter}>
          <Image
            source={dark ? Images.wmMusicDark : Images.wmMusicLight}
            style={styles.musicWatermark}
            resizeMode="contain"
            pointerEvents="none"
          />

          {/* 主卡片：带缺口的容器贴图 + 内部绝对定位 */}
          <View style={styles.card}>
            <Image
              source={dark ? Images.practiceCardDark : Images.practiceCardLight}
              style={StyleSheet.absoluteFill}
              resizeMode="stretch"
              pointerEvents="none"
            />

            {/* 选择您的模型进行练习 (56,278) → 卡内 (41,10)；图标为紫色小兔子(tuzi)，非闪光 */}
            <View style={styles.selLabelRow}>
              <Image source={Images.modelRabbit} style={styles.selIcon} resizeMode="contain" />
              <Text style={styles.selLabel}>选择您的模型进行练习</Text>
            </View>

            {/* VIP 磁贴 (30,316)150x125 → 卡内 (15,48) */}
            <TouchableOpacity
              style={[styles.tile, {left: px(15)}]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Detection', {premium: true})}>
              <Image source={dark ? Images.practiceTileVipDark : Images.practiceTileVipLight} style={styles.tileImg} resizeMode="stretch" />
              <Text style={styles.tileTitle}>智能AI陪练</Text>
              <Text style={styles.tileSub}>会员专属</Text>
            </TouchableOpacity>

            {/* 免费磁贴 (195,316) → 卡内 (180,48) */}
            <TouchableOpacity
              style={[styles.tile, {left: px(180)}]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Detection', {premium: false})}>
              <Image source={dark ? Images.practiceTileFreeDark : Images.practiceTileFreeLight} style={styles.tileImg} resizeMode="stretch" />
              <Text style={styles.tileTitle}>智能手型检测</Text>
              <Text style={styles.tileSub}>免费检测</Text>
            </TouchableOpacity>

            {/* AI陪练模式 行 (卡内下部) */}
            <TouchableOpacity
              style={[styles.companionRow, {backgroundColor: innerRow}]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Companion')}>
              <Image
                source={Images.wmChat}
                style={styles.chatWatermark}
                resizeMode="contain"
                pointerEvents="none"
              />
              <Image source={Images.companionHeart} style={styles.chatHeart} resizeMode="contain" />
              <Text style={styles.companionTitle}>AI陪练模式</Text>
              <Text style={styles.companionSub}>AI分身语音陪伴 + 对话 · 会员专属</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const makeStyles = (colors, dark) =>
  StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    safe: {flex: 1},
    screenTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
      marginTop: 8,
      marginLeft: 30,
      marginBottom: 4,
    },
    // 兔子 216x217 在 (159,89)；hero 高度容纳兔子并让文案居左。
    hero: {
      position: 'relative',
      height: px(200),
      paddingLeft: 24,
    },
    heroCopy: {marginTop: px(52), maxWidth: px(200)},
    heroLine1Row: {flexDirection: 'row', alignItems: 'center'},
    heroLine1: {fontSize: 24, fontWeight: '600', color: colors.textPrimary},
    heroSparkle: {width: 22, height: 22, marginLeft: 8},
    heroLine2: {fontSize: 20, fontWeight: '600', color: colors.textPrimary, marginTop: 6},
    mascot: {
      position: 'absolute',
      top: px(-8),
      right: 0,
      width: px(216),
      height: px(217),
    },
    cardOuter: {position: 'relative', alignItems: 'center'},
    // MUSIC 贴图：蓝湖 x16 y245（相对 cardOuter，卡片顶在 y268 → 仅露上沿）。
    // 母图 1x=362x81（含描边留白），glyph 宽≈352；left 微调到 px(12) 让字身对齐 x16。
    musicWatermark: {
      position: 'absolute',
      top: px(-38),
      left: px(12),
      width: px(362),
      height: px(81),
      zIndex: 0,
    },
    card: {
      width: px(CARD_W),
      height: px(CARD_H),
      zIndex: 1,
    },
    selLabelRow: {
      position: 'absolute',
      left: px(26),
      top: px(8),
      flexDirection: 'row',
      alignItems: 'center',
    },
    selIcon: {width: px(18), height: px(18), marginRight: px(6)},
    selLabel: {fontSize: 14, fontWeight: '500', color: colors.textPrimary},
    tile: {
      position: 'absolute',
      top: px(48),
      width: px(150),
      height: px(125),
    },
    tileImg: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: px(150),
      height: px(125),
    },
    tileTitle: {
      position: 'absolute',
      left: px(12),
      top: px(10),
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    tileSub: {
      position: 'absolute',
      left: px(12),
      top: px(36),
      fontSize: 12,
      fontWeight: '400',
      color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(38,18,22,0.4)',
    },
    // AI陪练模式 内行：卡内 (12,187)~(333,300)
    companionRow: {
      position: 'absolute',
      left: px(12),
      right: px(12),
      top: px(187),
      height: px(103),
      borderRadius: px(16),
      overflow: 'hidden',
    },
    companionTitle: {
      position: 'absolute',
      left: px(15),
      top: px(15),
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    companionSub: {
      position: 'absolute',
      left: px(15),
      top: px(41),
      fontSize: 12,
      fontWeight: '400',
      color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(38,18,22,0.4)',
    },
    // CHAT 贴图：蓝湖 x42 y507（卡内），母图 1x=156x45（含留白），glyph 宽≈147。
    // companionRow 内坐标（行左内边距 15 起）：left 微调让字身对齐设计。
    chatWatermark: {
      position: 'absolute',
      left: px(12),
      top: px(48),
      width: px(156),
      height: px(45),
    },
    // 右下角玻璃爱心（Iconly/Glass/Heart，1:1 蓝湖）：贴右下角、按 85x63 比例放大，
    // 圆角溢出裁切（与蓝湖一致：浅紫副心被卡片右下圆角裁掉一角）。
    chatHeart: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: px(104),
      height: px(72),
    },
  });

export default PracticeScreen;
