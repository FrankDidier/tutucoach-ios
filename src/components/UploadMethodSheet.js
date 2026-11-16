// 蓝湖「选择上传方式弹窗」— 半屏底栏：拍照拍谱 / 本地相册 / 上传PDF
import React, {useMemo} from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import {useTheme} from '../theme/ThemeContext';

export default function UploadMethodSheet({visible, onClose, onCamera, onGallery, onPdf}) {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);

  const pick = fn => {
    onClose?.();
    // let modal dismiss before launching picker
    setTimeout(() => fn?.(), 80);
  };

  return (
    <Modal visible={!!visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
          <Text style={styles.title}>添加乐谱</Text>
          <Text style={styles.sub}>请选择上传方式</Text>

          <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={() => pick(onCamera)}>
            <Text style={styles.rowText}>拍照拍谱</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={() => pick(onGallery)}>
            <Text style={styles.rowText}>本地相册</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={() => pick(onPdf)}>
            <Text style={styles.rowText}>上传PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancel} activeOpacity={0.85} onPress={onClose}>
            <Text style={styles.cancelText}>取消</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors, dark) {
  return StyleSheet.create({
    mask: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: dark ? '#040428' : '#FFFFFF',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 30,
      paddingBottom: 34,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6,
    },
    sub: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 20,
    },
    row: {
      height: 50,
      borderRadius: 12,
      backgroundColor: dark ? 'rgba(19,20,68,1)' : '#F7F7F7',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 15,
    },
    rowText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    cancel: {
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    cancelText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#F45454',
    },
  });
}
