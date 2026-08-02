import React, {useMemo} from 'react';
import {View, Text, Image, TouchableOpacity, StyleSheet} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {Images} from '../assets/images';

// 与安卓二级页头部 1:1：蓝湖 375×220 柔光底 + 返回 + 居中标题。
const ScreenHeader = ({title, onBack, right, onTitleLongPress, variant}) => {
  const {colors, mode} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const detect = variant === 'detect';
  // detect 页由 DetectionScreen 铺满 375×220 柔光底，此处不再叠一层裁切图
  const headerBg = detect
    ? null
    : mode === 'light'
      ? Images.cardHeaderGradient
      : null;
  return (
    <View style={[styles.wrap, detect && styles.wrapDetect]}>
      {headerBg ? (
        <Image
          source={headerBg}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : null}
      <View style={styles.bar}>
        <TouchableOpacity
          style={styles.side}
          onPress={onBack}
          hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
          accessibilityRole="button"
          accessibilityLabel="返回">
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.titleHit}
          activeOpacity={onTitleLongPress ? 0.7 : 1}
          onLongPress={onTitleLongPress}
          disabled={!onTitleLongPress}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </TouchableOpacity>
        <View style={styles.side}>{right}</View>
      </View>
    </View>
  );
};

const makeStyles = colors =>
  StyleSheet.create({
    wrap: {
      overflow: 'hidden',
      backgroundColor: colors.mode === 'dark' ? colors.bgGradientTop : 'transparent',
    },
    wrapDetect: {
      minHeight: 56,
      backgroundColor: 'transparent',
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    side: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    backText: {
      fontSize: 30,
      color: colors.textPrimary,
      fontWeight: '400',
      marginTop: -4,
    },
    titleHit: {flex: 1, justifyContent: 'center'},
    title: {
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
    },
  });

export default ScreenHeader;
