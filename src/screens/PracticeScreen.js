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
const {width: SCREEN_W, height: SCREEN_H} = Dimensions.get('window');
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
          // 容器原裁到 240（0.296屏高），使卡右侧/顶角的背景在 240px 处硬切为纯黑，而安卓那里
          // 仍有淡紫辉光延续到 ~0.40。源图 practice_bg_dark 的辉光自然延伸到 design-y≈380 才淡出到
          // 背景色 #020014，故容器高度 240→380：既补上安卓同款辉光、又因源图自然收尾而无接缝。
          style={{position: 'absolute', top: 0, left: 0, right: 0, height: px(380), overflow: 'hidden'}}
          pointerEvents="none">
          <Image
            source={Images.practiceBgDark}
            // 背景里烘焙的星星原落在屏幕 0.154，安卓同款星星在 0.135。整图上移 15(设计px≈0.019 屏高)，
            // 让 iOS 星星与安卓对齐到 0.135，从而「兔耳=星星」与安卓绝对位置同时成立。顶部被裁的是暗边，无碍。
            style={{position: 'absolute', top: -px(15), left: 0, width: '100%', height: px(812)}}
            resizeMode="cover"
          />
        </View>
      ) : (
        // 浅色：改为「整屏」背景（复用安卓 bg_practice），cover 铺满全屏。原先只铺顶部 400 设计px，
        // 把 粉→白 渐变压缩到上半屏，导致到「HI~/教练」处粉色已淡出发白；安卓是整屏铺开渐变，故上区更粉。
        // 现与安卓一致：整屏 cover → 上半区保持同款较深的粉。仅浅色，深色分支不变。
        <Image
          source={Images.practiceBgFullLight}
          style={{position: 'absolute', top: 0, left: 0, width: SCREEN_W, height: SCREEN_H}}
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
        </View>

        {/* MUSIC 大字水印（衔接处，压在卡片之后只露上沿）——1:1 蓝湖：Arial Black 空心/渐变贴图 */}
        <View style={styles.cardOuter}>
          <Image
            source={dark ? Images.wmMusicDark : Images.wmMusicLight}
            style={styles.musicWatermark}
            resizeMode="contain"
            pointerEvents="none"
          />

          {/* 兔子：夹在 MUSIC 水印(zIndex0) 与 主卡(zIndex2) 之间 → 兔子在 MUSIC 之前、主卡之后。
              位置与之前一致（原在 hero 内 top:-23；移入 cardOuter 后 top = -23 - hero高156 = -179）。 */}
          <RabbitMascot loopAction="stand" style={styles.mascot} />

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
                source={Images.wmChat}
                style={styles.chatWatermark}
                resizeMode="stretch"
                pointerEvents="none"
              />
              <Image
                source={dark ? Images.companionHeartDark : Images.companionHeartLight}
                style={styles.chatHeart}
                resizeMode={dark ? 'contain' : 'stretch'}
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
      // iOS 刘海安全区把整块内容下移，主卡「选择您的模型」原落在 0.36（安卓 0.315）。收紧 hero 高度
      // 把主卡上提到安卓同款 0.315（用户确认对齐安卓）。HI~/教练(heroCopy marginTop 60) 与兔子
      // (mascot 绝对 top) 均相对 hero 顶定位、不随高度变化，故只上移主卡。187→150（≈上提 37 设计px）。
      // 用户高亮：iOS 主卡比安卓略高（0.3162 vs 0.3217），需把卡下压 ~5px 到安卓同款高度，
      // 使「教练↔主卡」间距与安卓一致（略拉长）。150→156。
      height: px(156),
      paddingLeft: px(24),
      // 兔子在卡片之后（对齐安卓：imgPracticeRabbit 画在主卡之前、无 elevation）。
      // 卡顶右侧有缺口，兔子上半身从缺口/卡顶之上露出，下半身（裙摆/脚）被主卡盖住，1:1 蓝湖。
      zIndex: 0,
    },
    // 蓝湖 HI~ y=141。iOS 刘海把 HI~/教练 整体压低约 0.04 屏高，主卡已上提到安卓位；若不动文案，
    // 「教练↔主卡」间距会被压得过窄(实测 iOS 0.052 vs 安卓 0.092)。故把文案块上移 32（60→28），
    // 使该 padding 与安卓 1:1（用户高亮项）。兔子/主卡不动。
    heroCopy: {marginTop: px(28), maxWidth: px(200)},
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
    // 兔子盒与安卓 1:1：安卓 imgPracticeRabbit 为 216×217、top|end、scaleType=fitCenter，
    // 播放 rabbit-stand.webp(480×552)。iOS 原生 TutuRabbitView 用 kCAGravityResizeAspect
    // (=fitCenter)，且 APNG 与安卓 webp 逐帧完全一致(480×552、同留白)。故只要盒尺寸取安卓同款
    // 216×217，两端「等比内嵌」出的可见兔子尺寸/位置像素级一致（此前用 230×265 恰好等于帧比例，
    // 无 letterbox，兔子被整体放大、偏大）。
    // 定位（蓝湖 练琴_t1）：盒 (159,89)216×217，右缘齐屏右(right:0)；盒底(hero 内 8+217=225)压到
    // 卡顶(hero 内 187)之后 38，兔子裙摆/脚被主卡盖住、只露上半身与琴谱，1:1 蓝湖/安卓。
    mascot: {
      position: 'absolute',
      // 兔子移入 cardOuter：原在 hero 内 top:-23；cardOuter 顶=hero 底(hero 高 156)，
      // 故等价屏幕位置 top = -23 - 156 = -179。right:0 对齐屏右不变。
      // zIndex 1 → 位于 MUSIC 水印(0) 之上、主卡(2) 之下（用户要求：MUSIC < 兔子 < 卡片）。
      top: px(-179),
      right: px(0),
      width: px(216),
      height: px(217),
      zIndex: 1,
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
      // zIndex 2 → 主卡在兔子(1) 之上，兔子裙摆/脚被主卡盖住（用户要求：兔子在卡片之后）。
      zIndex: 2,
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
    // 统一用 wm_chat（与安卓同一贴图，峰值 alpha≈178）。浅色原先用 wm_chat_light（峰值 alpha≈61 太淡→CHAT 发虚），
    // 现改为与安卓一致：浅色 opacity 1.0（安卓 ImageView 无额外 alpha），深色沿用 0.88 不变。stretch 铺满，左对齐卡内 12。
    chatWatermark: {
      position: 'absolute',
      left: px(12),
      top: px(69),
      width: px(147),
      height: px(35),
      opacity: dark ? 0.88 : 1.0,
      zIndex: 0,
    },
    // 玻璃爱心「+紫色高光块」：对齐安卓最终版 118×82 且右/下各外溢 14（marginEnd/Bottom=-14），
    // 由 companionRow 的 overflow:hidden + 圆角裁掉外溢角，爱心整体更大、紧贴卡片右下角填满，1:1 蓝湖。
    // 玻璃爱心：蓝湖可见内容（爱心+右侧发光块+火花点）落在 AI卡内 x[233.5..314.5] y[40..99.5]，
    // 浅色：蓝湖贴图节点 frame=95×73，且右/下边缘与卡片(30,456,315,100)右下角(345,556)齐平，
    // 故盒 95×73、right/bottom=0（贴角）。用 stretch 铺满盒。之前 87×70 偏窄导致视觉变窄；
    // 深色保持原样（用户仅要求改浅色）。
    chatHeart: {
      position: 'absolute',
      ...(dark
        ? {right: px(-14), bottom: px(-14), width: px(118), height: px(82)}
        : {right: px(0), bottom: px(0), width: px(103), height: px(73)}),
    },
  });

export default PracticeScreen;
