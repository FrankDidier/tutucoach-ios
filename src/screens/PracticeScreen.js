import React, {useMemo, useState, useCallback} from 'react';
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
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Images} from '../assets/images';
import RabbitMascot from '../components/RabbitMascot';
import {useTheme} from '../theme/ThemeContext';
import {CommonActions, useFocusEffect} from '@react-navigation/native';
import {getDeviceId} from '../services/device';
import {fetchLessonRecap} from '../services/companionChat';

function openLessonHistory(navigation) {
  const jump = nav => {
    if (!nav || typeof nav.dispatch !== 'function') return false;
    nav.dispatch(CommonActions.navigate({name: 'LessonHistory'}));
    return true;
  };
  if (jump(navigation)) return;
  const parent = navigation?.getParent?.();
  if (jump(parent)) return;
  jump(parent?.getParent?.());
}

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
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  // 蓝湖 练琴_t1 矩形965：rgba(181,149,255,0.1)；t2 为浅紫→白渐变（见下方 LinearGradient）
  const companionRowBg = dark ? 'rgba(181,149,255,0.1)' : 'transparent';
  const [recap, setRecap] = useState('');
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fetchLessonRecap(getDeviceId())
        .then(t => {
          if (alive) setRecap(t || '');
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, []),
  );

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
            // 蓝湖背景 375×812 含 44 状态栏；与内容同一坐标系：top = 安全区顶 − 44
            style={{position: 'absolute', top: insets.top - px(44), left: 0, width: '100%', height: px(812)}}
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
        {recap ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => openLessonHistory(navigation)}
            style={{
              marginHorizontal: px(15),
              marginTop: 8,
              padding: 12,
              borderRadius: 12,
              backgroundColor: dark ? 'rgba(181,149,255,0.18)' : 'rgba(255,95,131,0.12)',
            }}>
            <Text style={{color: colors.textPrimary, fontWeight: '700', marginBottom: 4}}>
              老师刚下课，给你记下了重点
            </Text>
            <Text style={{color: colors.textSecondary, fontSize: 13}} numberOfLines={4}>
              {recap}
            </Text>
          </TouchableOpacity>
        ) : null}
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
          <RabbitMascot loopAction="stand" style={styles.mascot} pointerEvents="none" />

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
              <Text style={styles.tileTitle}>AI手型陪练</Text>
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

          {/* 蓝湖 练琴：主卡下方 课程重点 / 上课录音 两个磁贴 (15,588)/(195,588) 165×70 r10 */}
          <View style={styles.lessonRow}>
            <TouchableOpacity
              style={styles.lessonTile}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="课程重点"
              onPress={() => openLessonHistory(navigation)}>
              <Text style={[styles.lessonTileTitle, {top: px(12)}]}>课程重点</Text>
              <Text style={[styles.lessonTileSub, {top: px(38)}]}>点击查看</Text>
              <Image
                source={dark ? Images.pracLessonKeyDark : Images.pracLessonKeyLight}
                style={styles.lessonIcon}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.lessonTile}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="上课录音"
              onPress={() => navigation.navigate('LessonCapture')}>
              <Text style={[styles.lessonTileTitle, {top: px(11)}, !dark && {color: '#3D3D3D'}]}>上课录音</Text>
              <Text style={[styles.lessonTileSub, {top: px(37)}]}>点击使用</Text>
              <Image
                source={dark ? Images.pracLessonRecDark : Images.pracLessonRecLight}
                style={styles.lessonIcon}
              />
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
      marginTop: px(10),
      marginLeft: px(15),
      lineHeight: px(25),
    },
    // 蓝湖坐标均为「状态栏下 y−44」：标题 10，HI~ 97，卡顶 224。
    hero: {
      position: 'relative',
      height: px(189),
      paddingLeft: px(24),
      // 兔子在卡片之后（对齐安卓：imgPracticeRabbit 画在主卡之前、无 elevation）。
      // 卡顶右侧有缺口，兔子上半身从缺口/卡顶之上露出，下半身（裙摆/脚）被主卡盖住，1:1 蓝湖。
      zIndex: 0,
    },
    heroCopy: {marginTop: px(62), maxWidth: px(200)},
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
    // 兔子：rabbit-stand 帧 480×552，内容 y107–549 / x82–398。盒 228×262（与帧同比例），
    // 使耳尖/身宽落在蓝湖 image(159,89) 的可见范围：耳尖 y89.5、x210–325。
    mascot: {
      position: 'absolute',
      // 相对卡顶(268)：38.7 − 268；zIndex 1 → MUSIC(0) < 兔子 < 主卡(2)
      top: px(-229),
      left: px(154),
      width: px(228),
      height: px(262),
      zIndex: 1,
    },
    lessonRow: {
      width: px(345),
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: px(15),
      zIndex: 2,
    },
    lessonTile: {
      width: px(165),
      height: px(70),
      borderRadius: px(10),
      backgroundColor: dark ? '#040428' : '#FFFFFF',
    },
    lessonTileTitle: {
      position: 'absolute',
      left: px(11),
      fontSize: px(15),
      fontWeight: '600',
      lineHeight: px(21),
      color: colors.textPrimary,
    },
    lessonTileSub: {
      position: 'absolute',
      left: px(11),
      fontSize: px(12),
      lineHeight: px(17),
      color: dark ? '#A1A1B4' : '#A6A6A6',
    },
    lessonIcon: {position: 'absolute', left: px(106), top: px(13), width: px(44), height: px(44)},
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
