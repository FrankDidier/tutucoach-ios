import React, {useEffect, useRef, useState} from 'react';
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
} from 'react-native';
import {Colors} from '../utils/colors';
import {Images} from '../assets/images';
import ScreenHeader from '../components/ScreenHeader';
import {pickFromGallery} from '../services/imagePicker';
import {
  listAllCoaches,
  saveCoach,
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

const STYLE_OPTIONS = [
  {key: 'ENCOURAGING', label: '鼓励型'},
  {key: 'STRICT', label: '严格型'},
  {key: 'PLAYFUL', label: '活泼型'},
];

function linesToText(arr) {
  return Array.isArray(arr) ? arr.join('\n') : '';
}
function textToLines(t) {
  return (t || '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}

function emptyDraft() {
  return {
    id: '',
    name: '新分身',
    style: 'ENCOURAGING',
    systemPrompt: '',
    greeting: '你好，准备好练琴了吗？',
    encouragements: '',
    errorTemplates: '',
    noHandReminders: '',
    celebrations: '',
    voiceId: 0,
    avatarUrl: '',
  };
}

function coachToDraft(c) {
  return {
    id: c.id || '',
    name: c.name || '',
    style: c.style || 'ENCOURAGING',
    systemPrompt: c.systemPrompt || '',
    greeting: c.greeting || '你好，准备好练琴了吗？',
    encouragements: linesToText(c.encouragements),
    errorTemplates: linesToText(c.errorTemplates),
    noHandReminders: linesToText(c.noHandReminders),
    celebrations: linesToText(c.celebrations),
    voiceId: c.voiceId || 0,
    avatarUrl: c.avatarUrl || '',
  };
}

const AISettingsScreen = ({navigation}) => {
  const [coaches, setCoaches] = useState([]);
  const [draft, setDraft] = useState(emptyDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const recStartRef = useRef(0);

  const loadCoaches = async (selectId) => {
    const r = await listAllCoaches();
    if (r && r.ok && Array.isArray(r.coaches)) {
      setCoaches(r.coaches);
      const pick =
        (selectId && r.coaches.find(c => c.id === selectId)) ||
        r.coaches[0];
      if (pick) setDraft(coachToDraft(pick));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCoaches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k, v) => setDraft(prev => ({...prev, [k]: v}));

  const selectCoach = c => setDraft(coachToDraft(c));
  const newCoach = () => setDraft(emptyDraft());

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
        style: draft.style,
        systemPrompt: draft.systemPrompt.trim(),
        greeting: draft.greeting.trim(),
        encouragements: textToLines(draft.encouragements),
        errorTemplates: textToLines(draft.errorTemplates),
        noHandReminders: textToLines(draft.noHandReminders),
        celebrations: textToLines(draft.celebrations),
        voiceId: draft.voiceId || 0,
      };
      if (draft.id) payload.id = draft.id;
      const r = await saveCoach(payload);
      if (r && r.ok && r.coach) {
        Alert.alert('已保存', '分身设置已保存，学生端下次进入即生效。');
        await loadCoaches(r.coach.id);
      } else if (r && r.error === 'unauthorized') {
        Alert.alert('未授权', '教师口令已失效，请返回重新登录。');
      } else {
        Alert.alert('保存失败', (r && r.error) || '请稍后重试');
      }
    } catch (e) {
      Alert.alert('保存失败', '网络异常，请重试');
    } finally {
      setSaving(false);
    }
  };

  const requireSaved = () => {
    if (!draft.id) {
      Alert.alert('请先保存', '请先点「保存」创建分身，再上传头像或复刻声音。');
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
        loadCoaches(draft.id);
      } else {
        Alert.alert('上传失败', (up && up.error) || '请重试');
      }
    } catch (e) {
      Alert.alert('上传失败', '网络异常，请重试');
    } finally {
      setSaving(false);
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
    // 停止并复刻
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
    setVoiceBusy(true);
    try {
      const path = r.path.startsWith('file://') ? r.path : 'file://' + r.path;
      const cv = await cloneVoice(draft.id, path);
      if (cv && cv.ok) {
        set('voiceId', cv.voiceId || draft.voiceId);
        Alert.alert('音色已生成', '专属音色已应用到该分身 ✓');
        loadCoaches(draft.id);
      } else if (cv && cv.error === 'voice_no_permission') {
        Alert.alert(
          '声音复刻未开通',
          '百度「大模型声音复刻」未开通或已欠费，请在百度智能云控制台开通后重试（与录音无关）。',
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
      <StatusBar barStyle="dark-content" backgroundColor={Colors.pinkBg} />
      <ScreenHeader
        title="AI分身设置"
        onBack={() => navigation?.goBack?.()}
        right={
          <TouchableOpacity onPress={onSave} activeOpacity={0.7} disabled={saving}>
            <Text style={styles.saveHeaderText}>{saving ? '...' : '保存'}</Text>
          </TouchableOpacity>
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.pinkPrimary} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {/* 分身选择 */}
            <Text style={styles.sectionLabel}>选择分身</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}>
              {coaches.map(c => {
                const active = c.id === draft.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => selectCoach(c)}
                    activeOpacity={0.85}>
                    <Text
                      style={[styles.chipText, active && styles.chipTextActive]}
                      numberOfLines={1}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.chip, styles.chipNew]}
                onPress={newCoach}
                activeOpacity={0.85}>
                <Text style={styles.chipNewText}>＋ 新建</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* 头像 + 名称 */}
            <View style={styles.card}>
              <View style={styles.row}>
                <TouchableOpacity onPress={onChangeAvatar} activeOpacity={0.85}>
                  <Image source={avatarSrc} style={styles.avatar} resizeMode="cover" />
                  <View style={styles.avatarBadge}>
                    <Text style={styles.avatarBadgeText}>＋</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.nameCol}>
                  <Text style={styles.fieldLabel}>分身名称</Text>
                  <TextInput
                    style={styles.nameInput}
                    value={draft.name}
                    onChangeText={t => set('name', t)}
                    placeholder="如：兔兔老师"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
              </View>

              {/* 风格 */}
              <Text style={[styles.fieldLabel, {marginTop: 14}]}>说话风格</Text>
              <View style={styles.styleRow}>
                {STYLE_OPTIONS.map(s => {
                  const active = s.key === draft.style;
                  return (
                    <TouchableOpacity
                      key={s.key}
                      style={[styles.styleItem, active && styles.styleItemActive]}
                      onPress={() => set('style', s.key)}
                      activeOpacity={0.85}>
                      <Text
                        style={[
                          styles.styleText,
                          active && styles.styleTextActive,
                        ]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 声音复刻 */}
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>专属音色（声音复刻）</Text>
              <Text style={styles.hint}>
                {draft.voiceId
                  ? `已绑定音色 ID：${draft.voiceId}`
                  : '点击下方按钮，朗读 10-30 秒清晰语音，自动生成本人专属音色。'}
              </Text>
              <TouchableOpacity
                style={[styles.voiceBtn, recording && styles.voiceBtnRec]}
                onPress={onToggleRecord}
                activeOpacity={0.88}
                disabled={voiceBusy}>
                {voiceBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.voiceBtnText}>
                    {recording ? '停止并生成音色' : '开始录音'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* 语音生效说明 */}
            <View style={styles.noteCard}>
              <Text style={styles.noteText}>
                以下文案在学生使用「智能AI陪练（会员）」练习时由 AI 主动播报；
                免费版只有提示音。修改保存后，学生端下次进入练习即生效。
              </Text>
            </View>

            {/* 问候语 */}
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>问候语（开场白）</Text>
              <Text style={styles.fieldHint}>
                触发：学生点「启动」开始练习时，开场播报 1 次。
              </Text>
              <TextInput
                style={styles.multiline}
                value={draft.greeting}
                onChangeText={t => set('greeting', t)}
                placeholder={'同学你好，准备好开始今天的练习了吗？'}
                placeholderTextColor={Colors.textSecondary}
                multiline
              />
            </View>

            {/* 人设 / 说话逻辑 */}
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>分身人设（思考方式）</Text>
              <Text style={styles.fieldHint}>
                触发：仅用于练习「结束点评」——AI 按这个人设，把本次练习时长、
                匹配率、主要问题组织成一段个性化点评。不影响练习中的实时播报。
              </Text>
              <TextInput
                style={styles.multiline}
                value={draft.systemPrompt}
                onChangeText={t => set('systemPrompt', t)}
                placeholder="例如：你是一位温柔耐心的钢琴老师，先肯定再指出问题，多用鼓励的话。"
                placeholderTextColor={Colors.textSecondary}
                multiline
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>鼓励语（每行一句）</Text>
              <Text style={styles.fieldHint}>
                触发：练习中手型持续正确时，约每 25 秒随机播报一句（按上方
                「AI 播报频率」节流）。
              </Text>
              <TextInput
                style={styles.multiline}
                value={draft.encouragements}
                onChangeText={t => set('encouragements', t)}
                placeholder={'手型保持得不错，继续保持。\n这一段弹得很稳，很好。'}
                placeholderTextColor={Colors.textSecondary}
                multiline
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>纠错语（每行一句，用 %s 代表错误点）</Text>
              <Text style={styles.fieldHint}>
                触发：检测到手型错误（如塌掌、扁指、勾指）时播报，%s 会自动替换成
                具体错误名称。
              </Text>
              <TextInput
                style={styles.multiline}
                value={draft.errorTemplates}
                onChangeText={t => set('errorTemplates', t)}
                placeholder={'注意，%s需要纠正\n%s的问题出现较多，请注意'}
                placeholderTextColor={Colors.textSecondary}
                multiline
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>无手提醒（每行一句）</Text>
              <Text style={styles.fieldHint}>
                触发：练习中镜头里超过约 10 秒检测不到手时播报，提醒学生把手放回
                画面（避免空练）。
              </Text>
              <TextInput
                style={styles.multiline}
                value={draft.noHandReminders}
                onChangeText={t => set('noHandReminders', t)}
                placeholder={'手呢？快放回琴键上来～\n看不到你的手啦，对准镜头哦。'}
                placeholderTextColor={Colors.textSecondary}
                multiline
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>庆祝语（每行一句）</Text>
              <Text style={styles.fieldHint}>
                触发：一次练习结束且表现优秀（整体匹配率 ≥ 85%）时，作为结束点评的
                开头播报一句。
              </Text>
              <TextInput
                style={styles.multiline}
                value={draft.celebrations}
                onChangeText={t => set('celebrations', t)}
                placeholder={'太棒了，今天手型很标准！\n这次练得真好，给你点赞！'}
                placeholderTextColor={Colors.textSecondary}
                multiline
              />
            </View>

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={onSave}
              activeOpacity={0.88}
              disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? '保存中…' : '保存分身'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.pinkBg},
  flex: {flex: 1},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  scroll: {padding: 16, paddingBottom: 40},
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  chipRow: {gap: 8, paddingBottom: 6, paddingRight: 8},
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: Colors.white,
    marginRight: 8,
    maxWidth: 140,
  },
  chipActive: {backgroundColor: Colors.pinkPrimary},
  chipText: {fontSize: 13, color: Colors.textPrimary, fontWeight: '600'},
  chipTextActive: {color: '#fff'},
  chipNew: {backgroundColor: Colors.pinkLight},
  chipNewText: {fontSize: 13, color: Colors.pinkDark, fontWeight: '700'},
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginTop: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  row: {flexDirection: 'row', alignItems: 'center'},
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.pinkLight,
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.pinkPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarBadgeText: {color: '#fff', fontSize: 14, fontWeight: '700', marginTop: -1},
  nameCol: {flex: 1, marginLeft: 16},
  fieldLabel: {fontSize: 13, fontWeight: '700', color: Colors.textPrimary},
  fieldHint: {
    fontSize: 11.5,
    color: Colors.pinkDark,
    marginTop: 5,
    lineHeight: 17,
  },
  noteCard: {
    backgroundColor: Colors.pinkLight,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  noteText: {fontSize: 12, color: Colors.pinkDark, lineHeight: 18},
  hint: {fontSize: 12, color: Colors.textSecondary, marginTop: 6, lineHeight: 18},
  nameInput: {
    marginTop: 6,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.pinkBg,
    paddingHorizontal: 12,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  styleRow: {flexDirection: 'row', gap: 10, marginTop: 8},
  styleItem: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.pinkBg,
    alignItems: 'center',
  },
  styleItemActive: {backgroundColor: Colors.pinkPrimary},
  styleText: {fontSize: 13, color: Colors.textPrimary, fontWeight: '600'},
  styleTextActive: {color: '#fff'},
  voiceBtn: {
    marginTop: 12,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.pinkPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceBtnRec: {backgroundColor: '#E5484D'},
  voiceBtnText: {color: '#fff', fontSize: 15, fontWeight: '700'},
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
  saveBtn: {
    marginTop: 20,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.pinkPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  saveHeaderText: {fontSize: 15, fontWeight: '700', color: Colors.pinkPrimary},
});

export default AISettingsScreen;
