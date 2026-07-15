// #4 曲目解读 + 教案（老师端）。输入曲目名 + 作曲家，AI 生成专业解读与可上课的教案。
// 可选「关联已设重点」：把陪练里为该曲目设置的重点粘贴进来，教案会据此调整、呼应。
import React, {useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {Colors} from '../utils/colors';
import ScreenHeader from '../components/ScreenHeader';
import {generateLessonPlan} from '../services/companionChat';

export default function LessonPlanScreen({navigation}) {
  const [piece, setPiece] = useState('');
  const [composer, setComposer] = useState('');
  const [focus, setFocus] = useState('');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState('');
  const scrollRef = useRef(null);

  const onGenerate = async () => {
    const p = piece.trim();
    if (!p) {
      Alert.alert('提示', '请先填写曲目名称');
      return;
    }
    setLoading(true);
    setPlan('');
    try {
      const r = await generateLessonPlan(p, composer.trim(), focus.trim());
      if (r && r.ok && r.text) {
        setPlan(r.text);
        setTimeout(() => scrollRef.current?.scrollToEnd?.({animated: true}), 300);
      } else {
        Alert.alert('生成失败', '请稍后重试（生成较慢，请保持网络畅通）。');
      }
    } catch (e) {
      Alert.alert('生成失败', '网络异常，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const onCopy = () => {
    if (!plan) return;
    Clipboard.setString(plan);
    Alert.alert('已复制', '教案已复制，可粘贴到「陪练提示设置」或备课笔记里。');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.pinkBg} />
      <ScreenHeader title="曲目解读 · 教案" onBack={() => navigation?.goBack?.()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>曲目名称</Text>
            <TextInput
              style={styles.input}
              value={piece}
              onChangeText={setPiece}
              placeholder="如：致爱丽丝 / 车尔尼599 No.1"
              placeholderTextColor={Colors.textSecondary}
            />
            <Text style={[styles.fieldLabel, {marginTop: 12}]}>作曲家（可选）</Text>
            <TextInput
              style={styles.input}
              value={composer}
              onChangeText={setComposer}
              placeholder="如：贝多芬"
              placeholderTextColor={Colors.textSecondary}
            />
            <Text style={[styles.fieldLabel, {marginTop: 12}]}>
              关联已设重点（可选）
            </Text>
            <Text style={styles.fieldHint}>
              把陪练里为这首曲子设置的重点粘贴进来，教案会围绕这些重点做调整、呼应。
            </Text>
            <TextInput
              style={styles.multiline}
              value={focus}
              onChangeText={setFocus}
              placeholder={'如：左手分解和弦要轻\n右手主旋律突出\n注意第 9 小节渐强'}
              placeholderTextColor={Colors.textSecondary}
              multiline
            />
            <TouchableOpacity
              style={styles.genBtn}
              onPress={onGenerate}
              activeOpacity={0.88}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.genBtnText}>生成解读 + 教案</Text>
              )}
            </TouchableOpacity>
            {loading ? (
              <Text style={styles.loadingHint}>
                AI 正在备课，约需 1 分钟，请保持网络畅通、不要离开本页…
              </Text>
            ) : null}
          </View>

          {plan ? (
            <View style={styles.card}>
              <View style={styles.resultHead}>
                <Text style={styles.resultTitle}>解读 + 教案</Text>
                <TouchableOpacity onPress={onCopy} activeOpacity={0.7}>
                  <Text style={styles.copyBtn}>复制全文</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.planText} selectable>
                {plan}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.pinkBg},
  flex: {flex: 1},
  scroll: {padding: 16, paddingBottom: 40},
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  fieldLabel: {fontSize: 13, fontWeight: '700', color: Colors.textPrimary},
  fieldHint: {fontSize: 11.5, color: Colors.pinkDark, marginTop: 4, lineHeight: 17},
  input: {
    marginTop: 6,
    height: 42,
    borderRadius: 10,
    backgroundColor: Colors.pinkBg,
    paddingHorizontal: 12,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  multiline: {
    marginTop: 8,
    minHeight: 90,
    borderRadius: 10,
    backgroundColor: Colors.pinkBg,
    padding: 12,
    fontSize: 14,
    color: Colors.textPrimary,
    textAlignVertical: 'top',
  },
  genBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.pinkPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  loadingHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 18,
  },
  resultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  resultTitle: {fontSize: 15, fontWeight: '800', color: Colors.textPrimary},
  copyBtn: {fontSize: 13.5, fontWeight: '700', color: Colors.pinkPrimary},
  planText: {fontSize: 14.5, lineHeight: 24, color: Colors.textPrimary},
});
