// 蓝湖「选择上传方式弹窗」— 半屏底栏：拍照拍谱 / 本地相册 / 上传PDF
import React, {useMemo} from 'react';
import {Text, TouchableOpacity, StyleSheet, Dimensions} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {Images} from '../assets/images';
import LanhuSheet from './LanhuSheet';

const {width: SCREEN_W} = Dimensions.get('window');
const px = n => Math.round((n * SCREEN_W) / 375);

export default function UploadMethodSheet({
  visible,
  onClose,
  onCamera,
  onGallery,
  onPdf,
}) {
  const {mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(dark), [dark]);

  const pick = fn => {
    onClose?.();
    // let modal dismiss before launching picker
    setTimeout(() => fn?.(), 80);
  };

  const row = (label, fn) => (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.85}
      onPress={() => pick(fn)}>
      <Text style={styles.rowText}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <LanhuSheet
      visible={visible}
      onClose={onClose}
      title="添加乐谱"
      subtitle="请选择上传方式"
      subtitleStrong
      headGap={30}
      cornerImage={Images.uploadCamera}
      border>
      {row('拍照拍谱', onCamera)}
      {row('本地相册', onGallery)}
      {row('上传PDF', onPdf)}
    </LanhuSheet>
  );
}

// 蓝湖：行 335×50 r10，间距 15；文字 16/500 居中
function makeStyles(dark) {
  return StyleSheet.create({
    row: {
      height: px(50),
      borderRadius: px(10),
      backgroundColor: dark ? '#131444' : '#FAFAFA',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: px(15),
    },
    rowText: {
      fontSize: px(16),
      lineHeight: px(20),
      fontWeight: '500',
      color: dark ? '#FFFFFF' : '#212122',
    },
  });
}
