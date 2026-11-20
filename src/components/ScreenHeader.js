import React, {useMemo} from 'react';
import {View, Text, Image, TouchableOpacity, StyleSheet, Dimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../theme/ThemeContext';
import {Images} from '../assets/images';

const {width: SCREEN_W} = Dimensions.get('window');
const px = n => Math.round((n * SCREEN_W) / 375);

// 蓝湖二级页头部 1:1：375×220 柔光底自屏顶铺开（压在内容卡片之下）+ 返回 9×18 (17,57) + 标题 18/600 (y54)。
const ScreenHeader = ({title, onBack, right, onTitleLongPress, variant}) => {
  const {colors, mode} = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const detect = variant === 'detect';
  const headerBg = detect
    ? null
    : mode === 'light'
      ? Images.lanhuPageHeaderLight
      : Images.lanhuPageHeaderDark;

  return (
    <View style={[styles.wrap, {paddingTop: insets.top}]}>
      {headerBg ? (
        <Image
          source={headerBg}
          style={[styles.bg, {height: px(220) + Math.max(0, insets.top - px(44))}]}
          resizeMode="stretch"
          pointerEvents="none"
        />
      ) : null}
      <View style={styles.bar}>
        <TouchableOpacity
          style={styles.titleHit}
          activeOpacity={onTitleLongPress ? 0.7 : 1}
          onLongPress={onTitleLongPress}
          disabled={!onTitleLongPress}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.back}
          onPress={onBack}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          accessibilityRole="button"
          accessibilityLabel="返回">
          <Image source={Images.navBack} style={styles.backIcon} />
        </TouchableOpacity>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
};

const makeStyles = colors =>
  StyleSheet.create({
    wrap: {backgroundColor: 'transparent', zIndex: 0},
    bg: {position: 'absolute', left: 0, top: 0, width: SCREEN_W},
    bar: {height: px(44)},
    back: {position: 'absolute', left: 0, top: 0, width: px(44), height: px(44)},
    backIcon: {
      position: 'absolute',
      left: px(17),
      top: px(13),
      width: px(9),
      height: px(18),
      tintColor: colors.textPrimary,
    },
    titleHit: {position: 'absolute', left: px(60), right: px(60), top: px(10)},
    title: {
      textAlign: 'center',
      fontSize: px(18),
      lineHeight: px(25),
      fontWeight: '600',
      color: colors.textPrimary,
    },
    right: {
      position: 'absolute',
      right: px(5),
      top: 0,
      height: px(44),
      minWidth: px(40),
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

export default ScreenHeader;
