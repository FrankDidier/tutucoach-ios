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
import LinearGradient from 'react-native-linear-gradient';
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
  // 蓝湖 练琴_t1 矩形965：rgba(181,149,255,0.1)；t2 为浅紫→白渐变（见下方 LinearGradient）
  const companionRowBg = dark ? 'rgba(181,149,255,0.1)' : 'transparent';

  return (
    <View style={styles.root}>
      <StatusBar barStyle={colors.statusBarStyle} />
      {/* 背景：暗色整屏渐变；浅色为顶部渐变 + 页面浅粉底 */}
      {dark ? (
        // 暗色：紫色光晕只落在顶部，其余用根底色 #020014（正是贴图渐隐到的黑），与安卓一致。
        // 定高裁剪容器承载「按原始比例、顶部对齐」的整图，只露顶部光晕。
        // 关键：裁剪高度必须落在贴图「已渐隐到 #020014」的暗区（约原图 30% 处），否则会切到贴图
        // 左右边缘约 37% 处的残余侧光晕，在左右两侧留下一条亮→黑的硬接缝。故 300→240。
        <View
          style={{position: 'absolute', top: 0, left: 0, right: 0, height: px(240), overflow: 'hidden'}}
          pointerEvents="none">
          <Image
            source={Images.practiceBgDark}
            style={{width: '100%', height: px(812)}}
            resizeMode="cover"
          />
        </View>
      ) : (
        <Image
          source={Images.practiceBgLight}
          style={{position: 'absolute', top: 0, left: 0, right: 0, height: px(400)}}
          resizeMode="cover"
          pointerEvents="none"
        />
      )}

      <SafeAreaView style={styles.safe}>
        {/* 导航标题 练琴：18/600，蓝湖 x=15 */}
        <Text style={styles.screenTitle}>练琴</Text>

        {/* 顶部问候区：左文案 + 右上角兔子（216x217，压住卡片顶部缺口） */}
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <View style={styles.heroLine1Row}>
              {/* HI~ 双色（1:1 蓝湖）：HI 主文本色，~ 强调色（t1 #7F47FE / t2 #FF5F83） */}
              <Text style={styles.heroLine1}>
                <Text style={{color: colors.textPrimary}}>HI</Text>
                <Text style={{color: dark ? '#7F47FE' : '#FF5F83'}}>~</Text>
              </Text>
              <Image source={dark ? Images.sparkleDark : Images.sparkle} style={styles.heroSparkle} resizeMode="contain" />
            </View>
            <Text style={styles.heroLine2}>我是你的兔兔教练</Text>
          </View>
          <RabbitMascot loopAction="stand" style={styles.mascot} />
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
              style={styles.cardBg}
              resizeMode="stretch"
              pointerEvents="none"
            />

            {/* 选择您的模型进行练习 (56,278) → 卡内 (41,10)；图标为紫色小兔子(tuzi)，非闪光 */}
            <View style={styles.selLabelRow}>
              <Image source={dark ? Images.modelRabbit : Images.modelRabbitLight} style={styles.selIcon} resizeMode="contain" />
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
              <Text style={[styles.tileTitle, styles.tileTitleFree]}>智能手型检测</Text>
              <Text style={[styles.tileSub, styles.tileSubFree]}>免费检测</Text>
            </TouchableOpacity>

            {/* AI陪练模式 行：蓝湖 (30,456) 315×100 → 卡内 (15,188) */}
            <TouchableOpacity
              style={[styles.companionRow, dark && {backgroundColor: companionRowBg}]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Companion')}>
              {!dark && (
                <LinearGradient
                  colors={['#F9EFFF', '#FFFFFF']}
                  start={{x: 0, y: 0}}
                  end={{x: 1, y: 1}}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
              )}
              <Image
                source={dark ? Images.wmChat : Images.wmChatLight}
                style={styles.chatWatermark}
                resizeMode="stretch"
                pointerEvents="none"
              />
              <Image
                source={dark ? Images.companionHeartDark : Images.companionHeartLight}
                style={styles.chatHeart}
                resizeMode="contain"
              />
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
      marginTop: px(8),
      marginLeft: px(15),
      marginBottom: px(4),
      lineHeight: px(25),
    },
    // 兔子 216x217 在 (159,89)；hero 高度决定其后卡片的起点。蓝湖卡顶 y=268（状态栏下 224），
    // 原 height=200 让卡顶落在 237（偏低 13），与兔子(压顶)间出现空档；改 187 让卡顶回到 224，
    // 兔子下沿(262)与卡顶重叠 38，1:1 蓝湖。
    hero: {
      position: 'relative',
      height: px(187),
      paddingLeft: px(24),
      // 兔子在卡片之后（对齐安卓：imgPracticeRabbit 画在主卡之前、无 elevation）。
      // 卡顶右侧有缺口，兔子上半身从缺口/卡顶之上露出，下半身（裙摆/脚）被主卡盖住，1:1 蓝湖。
      zIndex: 0,
    },
    // 蓝湖 HI~ y=141（状态栏下 97）→ marginTop 60（hero 顶 37 + 60）。
    heroCopy: {marginTop: px(60), maxWidth: px(200)},
    heroLine1Row: {flexDirection: 'row', alignItems: 'center'},
    heroLine1: {
      fontSize: 24,
      fontWeight: '600',
      lineHeight: px(38),
      color: colors.textPrimary,
    },
    heroSparkle: {width: px(24), height: px(24), marginLeft: px(8)},
    heroLine2: {
      fontSize: 20,
      fontWeight: '600',
      lineHeight: px(38),
      color: colors.textPrimary,
      marginTop: 0,
    },
    // 蓝湖兔子盒 (159,89) 216×217，右对齐(right 边=375)。iOS APNG(480×552) 与蓝湖切图在
    // 「脸宽/盒宽」比例上一致(≈0.483)，故盒宽=蓝湖设计 214 时，脸宽自然=蓝湖封面实测 103。
    // aspectFit 无 letterbox 需盒比≈0.866(=480/552)，故 214×246。APNG 上留白19% → 用 top 上移把
    // 耳顶顶到蓝湖 y≈90、脸中线 y≈218、中心 x≈268(右对齐)。目标全部取自 design-data 封面实测。
    mascot: {
      position: 'absolute',
      top: px(-35),
      right: px(0),
      width: px(214),
      height: px(246),
    },
    cardOuter: {position: 'relative', alignItems: 'center', zIndex: 1},
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
      // 卡片贴图必须严格约束在 345×305 内，防止 stretch 时溢出到卡底之下把页底铺成卡色。
      overflow: 'hidden',
    },
    // 容器贴图：显式给定与卡片一致的尺寸（此前用 absoluteFill 在本机被拉伸到 ~411×531 溢出卡底）。
    cardBg: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: px(CARD_W),
      height: px(CARD_H),
    },
    // 蓝湖 tuzi (31,281)→卡内 (16,13)；图标 20×20
    selLabelRow: {
      position: 'absolute',
      left: px(16),
      top: px(13),
      flexDirection: 'row',
      alignItems: 'center',
    },
    selIcon: {width: px(20), height: px(20), marginRight: px(5)},
    // 蓝湖「选择您的模型进行练习」加粗（对齐安卓 textStyle=bold）。
    selLabel: {
      fontSize: 14,
      fontWeight: '700',
      lineHeight: px(26),
      color: colors.textPrimary,
    },
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
      lineHeight: px(24),
      color: colors.textPrimary,
    },
    // 免费磁贴标题：蓝湖卡内 x=190 → tile(180)+10
    tileTitleFree: {left: px(10)},
    tileSub: {
      position: 'absolute',
      left: px(12),
      top: px(36),
      fontSize: 12,
      fontWeight: '400',
      lineHeight: px(17),
      color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(38,18,22,0.4)',
    },
    tileSubFree: {left: px(10)},
    // AI陪练模式：蓝湖 (30,456) 315×100 → 卡内 (15,188)
    companionRow: {
      position: 'absolute',
      left: px(15),
      width: px(315),
      top: px(188),
      height: px(100),
      borderRadius: px(16),
      overflow: 'hidden',
    },
    companionTitle: {
      position: 'absolute',
      left: px(12),
      top: px(14),
      fontSize: 15,
      fontWeight: '600',
      lineHeight: px(24),
      color: colors.textPrimary,
      zIndex: 2,
    },
    companionSub: {
      position: 'absolute',
      left: px(12),
      top: px(40),
      fontSize: 12,
      fontWeight: '400',
      lineHeight: px(17),
      color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(38,18,22,0.4)',
      zIndex: 2,
    },
    // 蓝湖 练琴_t1 Chat：实测封面字形 卡内 x[12-154] y[69-100]（宽≈142、高≈30、底与卡底齐平）。
    // 贴图字形占竖向上 88%（底部 12% 透明），故盒高 35 → 字形≈31，底 +4 溢出被卡片圆角裁掉，字形底贴卡底(≈100)。
    // 贴图已按安卓最终版（渐变 129→82 + 1px 亮描边）生成；opacity 0.88 对齐安卓淡水印观感。stretch 铺满，字形左对齐卡内 12。
    chatWatermark: {
      position: 'absolute',
      left: px(12),
      top: px(69),
      width: px(147),
      height: px(35),
      opacity: 0.88,
      zIndex: 0,
    },
    // 玻璃爱心「+紫色高光块」：对齐安卓最终版 118×82 且右/下各外溢 14（marginEnd/Bottom=-14），
    // 由 companionRow 的 overflow:hidden + 圆角裁掉外溢角，爱心整体更大、紧贴卡片右下角填满，1:1 蓝湖。
    chatHeart: {
      position: 'absolute',
      right: px(-14),
      bottom: px(-14),
      width: px(118),
      height: px(82),
    },
  });

export default PracticeScreen;
