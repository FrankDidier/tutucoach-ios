import React, {useMemo} from 'react';
import {View, Text, Image, TouchableOpacity, StyleSheet} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {Images} from '../assets/images';

// 与安卓二级页头部 1:1：浅粉渐变底（bg_card_header_gradient）+ 深色返回箭头 + 居中深色标题。
const ScreenHeader = ({title, onBack, right}) => {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      {colors.mode === 'light' && (
        <Image
          source={Images.cardHeaderGradient}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}
      <View style={styles.bar}>
        <TouchableOpacity
          style={styles.side}
          onPress={onBack}
          hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
          accessibilityRole="button"
          accessibilityLabel="返回">
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.side}>{right}</View>
      </View>
    </View>
  );
};

const makeStyles = colors =>
  StyleSheet.create({
    wrap: {
      overflow: 'hidden',
      // 暗色下用深紫头部底（覆盖浅色粉色位图）；浅色下透明让位图透出。
      backgroundColor: colors.mode === 'dark' ? colors.bgGradientTop : 'transparent',
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
    title: {
      flex: 1,
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
  });

export default ScreenHeader;
