// 蓝湖「选择乐器弹窗」— 底部弹层：钢琴 / 小提琴 / 古筝 / 二胡（坐标取自稿面，sheet 顶 y472）
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
import {SheetBackdrop} from './LanhuSheet';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../theme/ThemeContext';
import {Images} from '../assets/images';
import {INSTRUMENTS} from '../services/instrument';

const {width: SCREEN_W} = Dimensions.get('window');
const px = n => Math.round((n * SCREEN_W) / 375);

export const instrumentIcon = (id, dark) =>
  Images[`inst_${id}_${dark ? 'dark' : 'light'}`] ||
  Images[`inst_piano_${dark ? 'dark' : 'light'}`];

export default function InstrumentPickerModal({visible, onClose, onSelect}) {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {paddingBottom: Math.max(insets.bottom, px(34))},
          ]}
          onPress={e => e.stopPropagation()}>
          <SheetBackdrop dark={dark} border washEnd={0.22} />
          <Text style={styles.title}>乐器选择</Text>
          <View style={styles.grid}>
            {INSTRUMENTS.map(it => (
              <TouchableOpacity
                key={it.id}
                style={styles.cell}
                activeOpacity={0.85}
                onPress={() => {
                  onSelect?.(it.id);
                  onClose?.();
                }}>
                <View style={styles.iconTile}>
                  <Image
                    source={instrumentIcon(it.id, dark)}
                    style={styles.icon}
                  />
                </View>
                <Text style={styles.cellName}>{it.name}</Text>
                <Text style={styles.cellSub}>点击选择</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={styles.cancel}
            onPress={onClose}
            activeOpacity={0.7}>
            <Text style={styles.cancelText}>取消</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors, dark) =>
  StyleSheet.create({
    mask: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
      backgroundColor: dark ? '#040428' : '#FFFFFF',
      borderTopLeftRadius: px(20),
      borderTopRightRadius: px(20),
      overflow: 'hidden',
      paddingTop: px(20),
    },
    title: {
      marginLeft: px(20),
      fontSize: px(18),
      lineHeight: px(20),
      fontWeight: '600',
      color: dark ? '#FFFFFF' : '#212122',
    },
    grid: {
      marginTop: px(20),
      paddingHorizontal: px(20),
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: px(15),
    },
    cell: {
      width: px(160),
      height: px(80),
      borderRadius: px(10),
      backgroundColor: dark ? '#272153' : '#FFF5F7',
    },
    iconTile: {
      position: 'absolute',
      left: px(10),
      top: px(10),
      width: px(60),
      height: px(60),
    },
    icon: {width: px(60), height: px(60)},
    cellName: {
      position: 'absolute',
      left: px(80),
      top: px(18),
      fontSize: px(14),
      lineHeight: px(20),
      fontWeight: '600',
      color: dark ? '#FFFFFF' : '#261216',
    },
    cellSub: {
      position: 'absolute',
      left: px(80),
      top: px(45),
      fontSize: px(12),
      lineHeight: px(17),
      color: dark ? '#A1A1B4' : '#A6A6A6',
    },
    cancel: {
      marginTop: px(29),
      height: px(24),
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: {
      fontSize: px(16),
      lineHeight: px(24),
      fontWeight: '600',
      color: '#FF355F',
    },
  });
