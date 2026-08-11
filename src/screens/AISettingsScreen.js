import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Image,
  Alert,
  ActivityIndicator,
  ActionSheetIOS,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {Images} from '../assets/images';
import ScreenHeader from '../components/ScreenHeader';
import {useTheme} from '../theme/ThemeContext';
import {pickFromGallery} from '../services/imagePicker';
import {
  listAllCoaches,
  saveCoach,
  deleteCoach,
  uploadAvatar,
  cloneVoice,
  absAvatarUrl,
} from '../services/coachAdmin';
import {
  isRecorderAvailable,
  startRecording,
  stopRecording,
  cancelRecording,
} from '../services/recorder';

// 人设「懒人框架」示例：一键填入，老师照着改即可。
const PERSONA_EXAMPLE =
  '身份：教龄15年的钢琴老师\n' +
  '性格：温柔耐心，但对手型要求严格\n' +
  '语言：中文\n' +
  '说话风格：轻声细语、爱用鼓励的话\n' +
  '口头禅：我们慢慢来\n' +
  '对学生的态度：先肯定再纠正，从不凶';

const SPEAK_LANG_OPTIONS = [
  {key: 'zh', label: '中文', line: '中文'},
  {key: 'en', label: '英语', line: '英语'},
  {key: 'ja', label: '日语', line: '日语'},
  {key: 'ko', label: '韩语', line: '韩语'},
];

function parseSpeakLang(persona) {
  const m = String(persona || '').match(/(?:^|\n)\s*语言\s*[：:]\s*([^\n；;，,。]+)/);
  if (!m) return 'zh';
  const v = m[1].trim().toLowerCase();
  if (/英|en/.test(v)) return 'en';
  if (/日|ja|jp/.test(v)) return 'ja';
  if (/韩|ko|kr/.test(v)) return 'ko';
  return 'zh';
}

function upsertSpeakLangLine(persona, langKey) {
  const opt = SPEAK_LANG_OPTIONS.find(o => o.key === langKey) || SPEAK_LANG_OPTIONS[0];
  const line = `语言：${opt.line}`;
  const text = String(persona || '');
  if (/(?:^|\n)\s*语言\s*[：:]/.test(text)) {
    return text.replace(/(?:^|\n)(\s*语言\s*[：:]\s*)([^\n]*)/, `\n${line}`).replace(/^\n/, '');
  }
  // 插在「说话风格」前；没有则放开头
  if (/说话风格\s*[：:]/.test(text)) {
    return text.replace(/(说话风格\s*[：:])/, `${line}\n$1`);
  }
  return text ? `${line}\n${text}` : line;
}

function emptyDraft() {
  return {
    id: '',
    name: '',
    systemPrompt: '',
    greeting: '',
    voiceId: 0,
    mmVoice: '',
    avatarUrl: '',
    // 蓝湖新建态展示「未设置」；落库时再默认 private
    visibility: '',
    status: '',
    reviewNote: '',
    ownerId: '',
  };
}

function coachToDraft(c) {
  const p = c.pending || null;
  const pick = (snake, camel, dft) =>
    p && p[snake] != null ? p[snake] : c[camel] != null ? c[camel] : dft;
  return {
    id: c.id || '',
    name: pick('name', 'name', ''),
    systemPrompt: pick('system_prompt', 'systemPrompt', ''),
    greeting: pick('greeting', 'greeting', ''),
    voiceId: pick('voice_id', 'voiceId', 0),
    mmVoice: pick('mm_voice', 'mmVoice', ''),
    avatarUrl: pick('avatar_url', 'avatarUrl', ''),
    visibility: pick('visibility', 'visibility', 'private') || 'private',
    status: c.status || 'approved',
    reviewNote: c.reviewNote || '',
    ownerId: c.ownerId || '',
  };
}

function visibilityLabel(v) {
  if (v === 'public') return '公开';
  if (v === 'private') return '私有';
  return '未设置';
}

/**
 * 蓝湖「AI分身设置」编辑/新建表单。
 * 字段顺序：头像 → 名称 → 陪练提示 → 音色 → 可见范围 → 问候 → 人设 → 删除/保存提交
 */
const AISettingsScreen = ({navigation, route}) => {
  const {colors, mode} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const coachId = route?.params?.coachId || '';
  const [draft, setDraft] = useState(emptyDraft());
  const [loading, setLoading] = useState(!!coachId);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const recStartRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!coachId) {
        setDraft(emptyDraft());
        setLoading(false);
        return;
      }
      const r = await listAllCoaches();
      if (cancelled) return;
      if (r && r.ok && Array.isArray(r.coaches)) {
        const pick = r.coaches.find(c => c.id === coachId);
        if (pick) setDraft(coachToDraft(pick));
        else {
          Alert.alert('提示', '找不到该分身', [
            {text: '返回', onPress: () => navigation.goBack()},
          ]);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [coachId, navigation]);

  const set = (k, v) => setDraft(prev => ({...prev, [k]: v}));

  const onSave = async () => {
    const name = draft.name.trim();
    if (!name) {
      Alert.alert('提示', '请填写分身名称');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        systemPrompt: draft.systemPrompt.trim(),
        greeting: draft.greeting.trim(),
        visibility: draft.visibility || 'private',
        voiceId: draft.voiceId || 0,
      };
      if (draft.id) payload.id = draft.id;
      const r = await saveCoach(payload);
      if (r && r.ok && r.coach) {
        const pending = r.coach.status === 'pending';
        Alert.alert(
          pending ? '已提交审核' : '已保存',
          pending
            ? '分身已提交，管理员审核通过后学生端才会看到（1–3 个工作日）。审核期间学生使用上一版已通过的分身。'
            : '分身设置已保存。',
        );
        setDraft(coachToDraft(r.coach));
      } else if (r && r.error === 'unauthorized') {
        Alert.alert('未授权', '教师口令已失效，请返回重新登录。');
      } else if (r && r.error === 'not_owner') {
        Alert.alert('无法编辑', '该分身不属于你，只能编辑自己创建的分身。');
      } else if (r && r.error === 'cannot_edit_builtin') {
        Alert.alert('无法编辑', '内置/系统分身不可编辑，请返回列表新建。');
      } else {
        Alert.alert('保存失败', (r && r.error) || '请稍后重试');
      }
    } catch (e) {
      Alert.alert('保存失败', '网络异常，请重试');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!draft.id) {
      navigation.goBack();
      return;
    }
    Alert.alert('删除分身', `确定删除「${draft.name}」吗？此操作不可恢复。`, [
      {text: '取消', style: 'cancel'},
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            const r = await deleteCoach(draft.id);
            if (r && r.ok) {
              navigation.goBack();
            } else if (r && r.error === 'cannot_delete_builtin') {
              Alert.alert('无法删除', '内置/系统分身不可删除。');
            } else {
              Alert.alert('删除失败', (r && r.error) || '请稍后重试');
            }
          } catch (e) {
            Alert.alert('删除失败', '网络异常，请重试');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const requireSaved = () => {
    if (!draft.id) {
      Alert.alert('请先保存', '请先点「保存提交」创建分身，再上传头像或复刻声音。');
      return false;
    }
    return true;
  };

  const onChangeAvatar = async () => {
    if (!requireSaved()) return;
    const r = await pickFromGallery({maxWidth: 1024, maxHeight: 1024, quality: 0.9});
    if (r.cancelled) return;
    if (r.error) {
      Alert.alert('选择失败', r.error === 'no_module' ? '图片组件未就绪' : String(r.error));
      return;
    }
    setSaving(true);
    try {
      const up = await uploadAvatar(draft.id, r.uri);
      if (up && up.ok) {
        set('avatarUrl', up.avatarUrl || draft.avatarUrl);
        Alert.alert('头像已更新');
      } else {
        Alert.alert('上传失败', (up && up.error) || '请重试');
      }
    } catch (e) {
      Alert.alert('上传失败', '网络异常，请重试');
    } finally {
      setSaving(false);
    }
  };

  const pickVisibility = () => {
    const apply = key => set('visibility', key);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['取消', '私有（仅我的学生）', '公开（所有人）'],
          cancelButtonIndex: 0,
          title: '这个分身的可见范围',
        },
        idx => {
          if (idx === 1) apply('private');
          if (idx === 2) apply('public');
        },
      );
    } else {
      Alert.alert('这个分身的可见范围', undefined, [
        {text: '私有（仅我的学生）', onPress: () => apply('private')},
        {text: '公开（所有人）', onPress: () => apply('public')},
        {text: '取消', style: 'cancel'},
      ]);
    }
  };

  const onToggleRecord = async () => {
    if (!requireSaved()) return;
    if (!isRecorderAvailable()) {
      Alert.alert('录音功能', '当前版本暂未内置录音，将在下个版本提供。');
      return;
    }
    if (!recording) {
      const r = await startRecording();
      if (r.error) {
        Alert.alert(
          '无法录音',
          r.error === 'no_module' ? '录音模块未就绪' : '请在设置中允许使用麦克风',
        );
        return;
      }
      recStartRef.current = Date.now();
      setRecording(true);
      return;
    }
    setRecording(false);
    const dur = Date.now() - recStartRef.current;
    const r = await stopRecording();
    if (r.error || !r.path) {
      Alert.alert('录音失败', '请重试');
      return;
    }
    if (dur < 3000) {
      Alert.alert('录音太短', '请连续清晰朗读 10 秒以上再生成音色。');
      return;
    }
    if (r.base64 && r.bytes === 0) {
      Alert.alert('没录到声音', '请确认允许了麦克风权限、周围安静，再重录一次。');
      return;
    }
    setVoiceBusy(true);
    try {
      const path = r.path.startsWith('file://') ? r.path : 'file://' + r.path;
      const cv = await cloneVoice(draft.id, path, 'audio/mp4', r.base64);
      if (cv && cv.ok) {
        set('mmVoice', cv.mmVoice || cv.voiceId || draft.mmVoice);
        Alert.alert('音色已生成', '本人专属音色已应用，支持中/英/日/韩四语言 ✓');
      } else if (cv && cv.error === 'voice_no_permission') {
        Alert.alert(
          '声音复刻未开通',
          '语音服务的「声音复刻」尚未开通或余额不足，请联系管理员处理后重试（与录音无关）。',
        );
      } else if (cv && cv.error === 'speech_not_configured') {
        Alert.alert('暂未配置', '服务器尚未配置语音密钥，请联系管理员。');
      } else {
        Alert.alert('生成失败', (cv && cv.detail) || (cv && cv.error) || '请重试');
      }
    } catch (e) {
      Alert.alert('生成失败', '网络异常，请重试');
    } finally {
      setVoiceBusy(false);
    }
  };

  useEffect(() => {
    return () => {
      if (recording) cancelRecording();
    };
  }, [recording]);

  const avatarSrc = draft.avatarUrl
    ? {uri: absAvatarUrl(draft.avatarUrl)}
    : Images.avatarRabbit;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
      <ScreenHeader title="AI分身设置" onBack={() => navigation?.goBack?.()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {draft.id && draft.status === 'pending' ? (
              <View style={styles.statusCardPending}>
                <Text style={styles.statusText}>
                  审核中：管理员通过后学生端才会看到本次改动（1–3 个工作日）。
                </Text>
              </View>
            ) : null}
            {draft.id && draft.status === 'rejected' ? (
              <View style={styles.statusCardRejected}>
                <Text style={styles.statusTextRejected}>
                  已驳回{draft.reviewNote ? '：' + draft.reviewNote : ''}
                  {'\n'}请修改后重新保存提交。
                </Text>
              </View>
            ) : null}

            {/* 1. 头像 */}
            <View style={styles.avatarWrap}>
              <TouchableOpacity onPress={onChangeAvatar} activeOpacity={0.85}>
                <Image source={avatarSrc} style={styles.avatarTop} resizeMode="cover" />
                <View style={styles.avatarCam}>
                  <Text style={styles.avatarCamText}>📷</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* 2. 分身名称 */}
            <View style={styles.card}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>分身名称</Text>
                <TextInput
                  style={styles.rowInput}
                  value={draft.name}
                  onChangeText={t => set('name', t)}
                  placeholder="请输入"
                  placeholderTextColor={colors.textMuted}
                  textAlign="right"
                />
              </View>
            </View>

            {/* 3. 陪练提示设置（行卡片，非紫色横幅） */}
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('StudentReminder')}>
              <View style={styles.fieldRow}>
                <View style={{flex: 1, paddingRight: 8}}>
                  <Text style={styles.fieldLabel}>陪练提示设置</Text>
                  <Text style={styles.hintMuted}>
                    按学生·按曲目设置「AI陪伴模式」重点播报内容
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
            </TouchableOpacity>

            {/* 4. 专属音色 */}
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>专属音色（声音复刻）</Text>
              <Text style={styles.hintMuted}>
                {draft.mmVoice
                  ? '✓ 已绑定本人专属音色（支持中/英/日/韩）。如需更新可重新录制。'
                  : '点击下方按钮，朗读10-30秒清晰语音，自动生成本人专属音色。'}
              </Text>
              <TouchableOpacity
                style={[styles.voiceBtnOuter, recording && styles.voiceBtnRec]}
                onPress={onToggleRecord}
                activeOpacity={0.88}
                disabled={voiceBusy}>
                {!recording ? (
                  <LinearGradient
                    colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
                    start={{x: 0, y: 0.5}}
                    end={{x: 1, y: 0.5}}
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
                {voiceBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.voiceBtnText}>
                    {recording ? '停止并生成音色' : '开始录音'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* 5. 可见范围（行 + 未设置 ›） */}
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={pickVisibility}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>可见范围</Text>
                <View style={styles.valueRow}>
                  <Text style={styles.valueMuted}>
                    {visibilityLabel(draft.visibility)}
                  </Text>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* 6. 开场问候语 */}
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>开场问候语</Text>
              <TextInput
                style={styles.multiline}
                value={draft.greeting}
                onChangeText={t => set('greeting', t)}
                placeholder="请输入问候语"
                placeholderTextColor={colors.textMuted}
                multiline
              />
            </View>

            {/* 6.5 陪伴语言 */}
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>陪伴语言</Text>
              <Text style={styles.hintMuted}>
                AI 全程用所选语言说话（也会写入人设「语言：」一行）
              </Text>
              <View style={styles.langRow}>
                {SPEAK_LANG_OPTIONS.map(o => {
                  const on = parseSpeakLang(draft.systemPrompt) === o.key;
                  return (
                    <TouchableOpacity
                      key={o.key}
                      style={[styles.langChip, on && styles.langChipOn]}
                      activeOpacity={0.8}
                      onPress={() =>
                        set('systemPrompt', upsertSpeakLangLine(draft.systemPrompt, o.key))
                      }>
                      <Text style={[styles.langChipText, on && styles.langChipTextOn]}>
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 7. 分身人设 */}
            <View style={styles.card}>
              <View style={styles.personaHead}>
                <Text style={styles.fieldLabel}>分身人设</Text>
                <TouchableOpacity
                  onPress={() => set('systemPrompt', PERSONA_EXAMPLE)}
                  activeOpacity={0.7}>
                  <Text style={styles.fillExample}>填入示例</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.hintMuted}>
                决定AI的性格与说话方式，越具体越像真人。也可在文中写「语言：英语」
              </Text>
              <TextInput
                style={[styles.multiline, {minHeight: 130}]}
                value={draft.systemPrompt}
                onChangeText={t => set('systemPrompt', t)}
                placeholder="不知道怎么写，点击填入示例"
                placeholderTextColor={colors.textMuted}
                multiline
              />
            </View>

            <View style={styles.footerRow}>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={onDelete}
                activeOpacity={0.85}
                disabled={saving}>
                <Text style={styles.deleteBtnText}>删除</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtnOuter}
                onPress={onSave}
                activeOpacity={0.88}
                disabled={saving}>
                <LinearGradient
                  colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
                  start={{x: 0, y: 0.5}}
                  end={{x: 1, y: 0.5}}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.saveBtnText}>
                  {saving ? '保存中…' : '保存提交'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
};

const makeStyles = colors =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg},
    flex: {flex: 1},
    center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
    scroll: {paddingHorizontal: 16, paddingBottom: 40, paddingTop: 4},
    statusCardPending: {
      backgroundColor: 'rgba(245,166,35,0.15)',
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
    },
    statusText: {fontSize: 12, color: '#C9A227', lineHeight: 18},
    statusCardRejected: {
      backgroundColor: 'rgba(247,164,0,0.18)',
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
    },
    statusTextRejected: {fontSize: 12, color: '#F7A400', lineHeight: 18},
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginTop: 14,
      borderWidth: colors.mode === 'dark' ? 1 : 0,
      borderColor: colors.cardBorder,
    },
    avatarWrap: {alignItems: 'center', marginTop: 16, marginBottom: 4},
    avatarTop: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.cardAlt,
    },
    avatarCam: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.bg,
    },
    avatarCamText: {fontSize: 13},
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowInput: {
      flex: 1,
      marginLeft: 12,
      height: 32,
      fontSize: 14,
      color: colors.textPrimary,
    },
    fieldLabel: {fontSize: 14, fontWeight: '600', color: colors.textPrimary},
    hintMuted: {
      fontSize: 12,
      color: '#979797',
      marginTop: 6,
      lineHeight: 18,
    },
    chevron: {
      fontSize: 22,
      color: colors.textMuted,
      marginLeft: 4,
      lineHeight: 24,
    },
    valueRow: {flexDirection: 'row', alignItems: 'center'},
    valueMuted: {fontSize: 14, color: '#A6A6A6'},
    voiceBtnOuter: {
      marginTop: 12,
      height: 44,
      borderRadius: 22,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    voiceBtnRec: {backgroundColor: '#E5484D'},
    voiceBtnText: {color: '#fff', fontSize: 14, fontWeight: '700'},
    personaHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    langRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    langChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 18,
      backgroundColor: colors.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#F2F2F5',
    },
    langChipOn: {
      backgroundColor: colors.primary || '#E85A7A',
    },
    langChipText: {
      fontSize: 13,
      color: colors.textSecondary || '#888',
      fontWeight: '600',
    },
    langChipTextOn: {color: '#fff'},
    fillExample: {fontSize: 14, color: colors.accent, fontWeight: '600'},
    multiline: {
      marginTop: 10,
      minHeight: 90,
      borderRadius: 10,
      backgroundColor: colors.inputBg,
      padding: 12,
      fontSize: 14,
      color: colors.textPrimary,
      textAlignVertical: 'top',
    },
    footerRow: {flexDirection: 'row', gap: 15, marginTop: 22},
    // 蓝湖双钮各 165×44
    deleteBtn: {
      flex: 1,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.cardAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteBtnText: {color: colors.textPrimary, fontSize: 14, fontWeight: '600'},
    saveBtnOuter: {
      flex: 1,
      height: 44,
      borderRadius: 22,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnText: {color: '#fff', fontSize: 14, fontWeight: '600'},
  });

export default AISettingsScreen;
