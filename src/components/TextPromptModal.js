// Cross-platform text prompt (Android has no Alert.prompt).
import React, {useEffect, useMemo, useState} from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import {useTheme} from '../theme/ThemeContext';

export default function TextPromptModal({
  visible,
  title,
  message,
  placeholder,
  initialValue,
  confirmLabel = '保存',
  cancelLabel = '取消',
  secure,
  onCancel,
  onSubmit,
}) {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const [value, setValue] = useState(initialValue || '');

  useEffect(() => {
    if (visible) setValue(initialValue || '');
  }, [visible, initialValue]);

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.mask} onPress={onCancel}>
        <Pressable style={styles.card} onPress={e => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.sub}>{message}</Text> : null}
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            secureTextEntry={!!secure}
            autoFocus
            placeholder={placeholder || ''}
            placeholderTextColor={colors.textMuted}
          />
          <View style={styles.row}>
            <TouchableOpacity style={styles.btnGhost} onPress={onCancel}>
              <Text style={styles.ghostText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => onSubmit?.(value)}>
              <Text style={styles.btnText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
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
      paddingHorizontal: 28,
    },
    card: {
      backgroundColor: dark ? '#040428' : '#fff',
      borderRadius: 14,
      padding: 18,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6,
    },
    sub: {fontSize: 13, color: colors.textSecondary, marginBottom: 12},
    input: {
      borderWidth: 1,
      borderColor: colors.divider,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      marginBottom: 14,
    },
    row: {flexDirection: 'row', justifyContent: 'flex-end', gap: 12},
    btnGhost: {paddingHorizontal: 14, paddingVertical: 10},
    ghostText: {color: colors.textSecondary, fontSize: 15, fontWeight: '600'},
    btn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    btnText: {color: '#fff', fontSize: 15, fontWeight: '700'},
  });
}
