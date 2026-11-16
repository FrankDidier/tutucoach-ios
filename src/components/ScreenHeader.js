import React, {useMemo} from 'react';
import {View, Text, Image, TouchableOpacity, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../theme/ThemeContext';
import {Images} from '../assets/images';

// 与蓝湖二级页头部 1:1：375×220 柔光底裁顶栏 + 返回 + 居中标题（t1/t2）。
const ScreenHeader = ({title, onBack, right, onTitleLongPress, variant}) => {
  const {colors, mode} = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const detect = variant === 'detect';
  const headerBg = detect
    ? null
    : mode === 'light'
      ? Images.lanhuPageHeaderLight || Images.cardHeaderGradient
      : Images.lanhuPageHeaderDark;

  return (
    <View style={[styles.wrap, detect && styles.wrapDetect, {paddingTop: Math.max(insets.top, 0)}]}>
      {headerBg ? (
        <Image
          source={headerBg}
          style={styles.bg}
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
      backgroundColor: 'transparent',
    },
    wrapDetect: {
      minHeight: 56,
      backgroundColor: 'transparent',
    },
    bg: {
      ...StyleSheet.absoluteFillObject,
      // 蓝湖 375×220 顶柔光：只露出导航带高度
      height: 220,
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 44,
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
