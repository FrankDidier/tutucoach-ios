// 蓝湖「我的学生端 / 曲目解读_教案」乐器选择卡 345×110（两页同款）
import React, {useMemo} from 'react';
import {View, Text, Image, TouchableOpacity, StyleSheet, Dimensions} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {Images} from '../assets/images';
import {instrumentName} from '../services/instrument';
import {instrumentIcon} from './InstrumentPickerModal';

const {width: SCREEN_W} = Dimensions.get('window');
const px = n => Math.round((n * SCREEN_W) / 375);

export default function InstrumentCard({instrument, onPick, style}) {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  return (
    <View style={[styles.card, style]}>
      <Image source={dark ? Images.icMusicAiDark : Images.icMusicAiLight} style={styles.icon} />
      <Text style={styles.title}>乐器选择</Text>
      <TouchableOpacity style={styles.pick} activeOpacity={0.8} onPress={onPick}>
        <Text style={styles.pickText}>选择</Text>
        <Image
          source={dark ? Images.icPillArrowDark : Images.icPillArrowLight}
          style={styles.pickArrow}
        />
      </TouchableOpacity>
      <View style={styles.tile}>
        <Image source={instrumentIcon(instrument, dark)} style={styles.tileImg} />
      </View>
      <Text style={styles.current}>当前乐器：{instrumentName(instrument)}</Text>
      <Text style={styles.hint}>切换后，曲目推荐和教案会按选择乐器出曲目</Text>
    </View>
  );
}

const makeStyles = (colors, dark) =>
  StyleSheet.create({
    card: {
      height: px(110),
      borderRadius: px(10),
      backgroundColor: dark ? '#040428' : '#FFFFFF',
    },
    icon: {position: 'absolute', left: px(10), top: px(12), width: px(16), height: px(16)},
    title: {
      position: 'absolute',
      left: px(31),
      top: px(10),
      fontSize: px(14),
      lineHeight: px(20),
      fontWeight: '600',
      color: dark ? '#FFFFFF' : '#261216',
    },
    pick: {
      position: 'absolute',
      left: px(277),
      top: px(10),
      width: px(58),
      height: px(24),
      borderRadius: px(4),
      backgroundColor: dark ? 'rgba(181,149,255,0.1)' : 'rgba(255,53,95,0.1)',
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: px(10),
    },
    pickText: {fontSize: px(12), lineHeight: px(17), color: dark ? '#B595FF' : '#FF355F'},
    pickArrow: {width: px(16), height: px(16), marginLeft: px(2)},
    tile: {
      position: 'absolute',
      left: px(10),
      top: px(40),
      width: px(60),
      height: px(60),
      borderRadius: px(8),
      backgroundColor: dark ? '#272153' : '#FFF5F7',
      overflow: 'hidden',
    },
    tileImg: {width: px(60), height: px(60)},
    current: {
      position: 'absolute',
      left: px(80),
      top: px(48),
      fontSize: px(14),
      lineHeight: px(20),
      fontWeight: '600',
      color: dark ? '#FFFFFF' : '#261216',
    },
    hint: {
      position: 'absolute',
      left: px(80),
      top: px(75),
      fontSize: px(12),
      lineHeight: px(17),
      color: dark ? '#A1A1B4' : '#A6A6A6',
    },
  });
