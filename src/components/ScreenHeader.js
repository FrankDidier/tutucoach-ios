import React from 'react';
import {View, Text, Image, TouchableOpacity, StyleSheet} from 'react-native';
import {Colors} from '../utils/colors';
import {Images} from '../assets/images';

// 与安卓二级页头部 1:1：浅粉渐变底（bg_card_header_gradient）+ 深色返回箭头 + 居中深色标题。
const ScreenHeader = ({title, onBack, right}) => (
  <View style={styles.wrap}>
    <Image
      source={Images.cardHeaderGradient}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
    />
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

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
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
    color: '#333333',
    fontWeight: '400',
    marginTop: -4,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});

export default ScreenHeader;
