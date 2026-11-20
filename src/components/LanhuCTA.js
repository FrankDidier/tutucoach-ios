// 蓝湖二级页底部主按钮：底栏 375×60（暗 #040428 / 浅 #FFFFFF，延伸到 Home 指示条）+ 按钮 343×44 (16,8)，竖向渐变。
import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../theme/ThemeContext';

const {width: SCREEN_W} = Dimensions.get('window');
const px = n => Math.round((n * SCREEN_W) / 375);

export default function LanhuCTA({title, onPress, disabled, loading, fontSize = 16}) {
  const {mode} = useTheme();
  const dark = mode === 'dark';
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        {backgroundColor: dark ? '#040428' : '#FFFFFF', paddingBottom: Math.max(insets.bottom, px(8))},
      ]}>
      <TouchableOpacity activeOpacity={0.9} disabled={disabled || loading} onPress={onPress}>
        <LinearGradient
          colors={dark ? ['#B595FF', '#7F47FE'] : ['#FF7A9A', '#FF355F']}
          start={{x: 0.5, y: 0}}
          end={{x: 0.5, y: 1}}
          style={[styles.btn, disabled && styles.btnOff]}>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={[styles.text, {fontSize: px(fontSize)}]}>{title}</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {paddingTop: px(8), paddingHorizontal: px(16)},
  btn: {height: px(44), borderRadius: px(22), alignItems: 'center', justifyContent: 'center'},
  btnOff: {opacity: 0.6},
  text: {color: '#FFFFFF', fontSize: px(16), lineHeight: px(24), fontWeight: '600'},
});
