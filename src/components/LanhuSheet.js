// 蓝湖底部弹窗骨架（班级名册 / 选择上传方式 / 选择乐器）：375 宽、顶圆角 20，
// 底色 #040428/#FFF 上叠 23% 高的 #7F47FE/#FF355F@0.2 渐隐；标题 18/600 (20,30)，副标题 13 (20,56)；
// 底部 60 高「取消」16/600 #F45454。
import React, {useMemo} from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../theme/ThemeContext';

const {width: SCREEN_W} = Dimensions.get('window');
const px = n => Math.round((n * SCREEN_W) / 375);

// 弹窗底：底色 + 顶部主题色 20% 渐隐；border 时再加 2px 内描边渐变（暗 #B595FF@0.2→0，亮 #FFF→0，选择上传方式/选择乐器）。
export function SheetBackdrop({dark, border, washHeight, washEnd}) {
  const card = dark ? '#040428' : '#FFFFFF';
  const wash = dark
    ? ['rgba(127,71,254,0.2)', 'rgba(127,71,254,0)']
    : ['rgba(255,53,95,0.2)', 'rgba(255,53,95,0)'];
  const inset = border ? 2 : 0;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {border ? (
        <LinearGradient
          colors={
            dark
              ? ['rgba(181,149,255,0.2)', 'rgba(181,149,255,0)']
              : ['rgba(255,255,255,1)', 'rgba(255,255,255,0)']
          }
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View
        style={{
          position: 'absolute',
          top: inset,
          left: inset,
          right: inset,
          bottom: 0,
          backgroundColor: card,
          borderTopLeftRadius: px(20) - inset,
          borderTopRightRadius: px(20) - inset,
          overflow: 'hidden',
        }}>
        <LinearGradient
          colors={wash}
          start={{x: 0.5, y: 0}}
          end={{x: 0.5, y: washEnd || 1}}
          style={
            washHeight
              ? {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  height: washHeight,
                }
              : StyleSheet.absoluteFill
          }
        />
      </View>
    </View>
  );
}

export default function LanhuSheet({
  visible,
  onClose,
  title,
  subtitle,
  subtitleStrong,
  headGap = 24,
  cornerImage,
  border,
  children,
}) {
  const {mode} = useTheme();
  const dark = mode === 'dark';
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(dark), [dark]);

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable style={styles.wrap} onPress={e => e.stopPropagation()}>
          <View style={styles.sheet}>
            <SheetBackdrop dark={dark} border={border} washHeight={px(114)} />
            <View style={{marginBottom: px(headGap)}}>
              {title ? <Text style={styles.title}>{title}</Text> : null}
              {subtitle ? (
                <Text style={[styles.sub, subtitleStrong && styles.subStrong]}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {children}
            <TouchableOpacity
              style={[styles.cancel, {marginBottom: insets.bottom}]}
              activeOpacity={0.85}
              onPress={onClose}>
              <Text style={styles.cancelText}>取消</Text>
            </TouchableOpacity>
          </View>
          {cornerImage ? (
            <Image source={cornerImage} style={styles.corner} />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(dark) {
  return StyleSheet.create({
    mask: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    wrap: {},
    // 相机等装饰图 80×80，距弹窗顶 10、右 20（蓝湖 275,432；弹窗顶 422）
    corner: {
      position: 'absolute',
      top: px(10),
      right: px(20),
      width: px(80),
      height: px(80),
    },
    sheet: {
      backgroundColor: dark ? '#040428' : '#FFFFFF',
      borderTopLeftRadius: px(20),
      borderTopRightRadius: px(20),
      overflow: 'hidden',
      paddingHorizontal: px(20),
      paddingTop: px(30),
    },
    title: {
      fontSize: px(18),
      lineHeight: px(20),
      fontWeight: '600',
      color: dark ? '#FFFFFF' : '#212122',
    },
    sub: {
      fontSize: px(13),
      lineHeight: px(20),
      marginTop: px(6),
      color: dark ? '#A1A1B4' : '#A6A6A6',
    },
    subStrong: {fontSize: px(14), color: dark ? '#FFFFFF' : '#212122'},
    cancel: {height: px(60), alignItems: 'center', justifyContent: 'center'},
    cancelText: {
      fontSize: px(16),
      lineHeight: px(24),
      fontWeight: '600',
      color: '#F45454',
    },
  });
}
