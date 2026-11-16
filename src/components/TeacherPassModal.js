// Android-friendly teacher passcode prompt (iOS uses Alert.prompt).
import React, {useMemo, useState} from 'react';
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

export default function TeacherPassModal({visible, onCancel, onSubmit}) {
  const {colors, mode} = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const [value, setValue] = useState('');

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.mask} onPress={onCancel}>
        <Pressable style={styles.card} onPress={e => e.stopPropagation()}>
          <Text style={styles.title}>教师登录</Text>
          <Text style={styles.sub}>请输入教师管理口令</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            secureTextEntry
            autoFocus
            placeholder="口令"
            placeholderTextColor={colors.textMuted}
          />
          <View style={styles.row}>
            <TouchableOpacity style={styles.btnGhost} onPress={onCancel}>
              <Text style={styles.ghostText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => {
                const token = (value || '').trim();
                setValue('');
                onSubmit?.(token);
              }}>
              <Text style={styles.btnText}>登录</Text>
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
    title: {fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 6},
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
    ghostText: {color: colors.textSecondary, fontWeight: '600'},
    btn: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    btnText: {color: '#fff', fontWeight: '700'},
  });
}
