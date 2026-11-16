// 蓝湖「选择乐器弹窗」— 钢琴 / 小提琴 / 古筝 / 二胡
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
import {INSTRUMENTS, instrumentName} from '../services/instrument';

export default function InstrumentPickerModal({
  visible,
  currentId,
  onClose,
  onSelect,
}) {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const curName = instrumentName(currentId);

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable style={styles.card} onPress={e => e.stopPropagation()}>
          <View style={styles.head}>
            <Text style={styles.title}>乐器选择</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={styles.done}>选择</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.cur}>当前乐器：{curName}</Text>
          <Text style={styles.hint}>切换后，曲目推荐和教案会按选择乐器出曲目</Text>

          <View style={styles.grid}>
            {INSTRUMENTS.map(it => {
              const on = currentId === it.id;
              return (
                <TouchableOpacity
                  key={it.id}
                  style={[styles.cell, on && styles.cellOn]}
                  activeOpacity={0.85}
                  onPress={() => {
                    onSelect?.(it.id);
                    onClose?.();
                  }}>
                  <Text style={[styles.cellName, on && styles.cellNameOn]}>{it.name}</Text>
                  <Text style={[styles.cellSub, on && styles.cellNameOn]}>
                    {on ? '已选择' : '点击选择'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.cancel} onPress={onClose}>
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
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    card: {
      backgroundColor: dark ? '#040428' : '#FFFFFF',
      borderRadius: 16,
      padding: 18,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    title: {fontSize: 17, fontWeight: '700', color: colors.textPrimary},
    done: {fontSize: 15, fontWeight: '600', color: colors.primary},
    cur: {fontSize: 14, color: colors.textPrimary, marginBottom: 4},
    hint: {fontSize: 12, color: colors.textSecondary, marginBottom: 16, lineHeight: 18},
    grid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between'},
    cell: {
      width: '48%',
      borderRadius: 12,
      paddingVertical: 16,
      paddingHorizontal: 12,
      marginBottom: 12,
      backgroundColor: dark ? 'rgba(19,20,68,1)' : '#F7F7F7',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    cellOn: {
      borderColor: colors.primary,
      backgroundColor: dark ? 'rgba(127,71,254,0.18)' : 'rgba(255,53,95,0.08)',
    },
    cellName: {fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 4},
    cellNameOn: {color: colors.primary},
    cellSub: {fontSize: 12, color: colors.textSecondary},
    cancel: {alignItems: 'center', paddingVertical: 10, marginTop: 4},
    cancelText: {fontSize: 15, color: '#F45454', fontWeight: '600'},
  });
}
