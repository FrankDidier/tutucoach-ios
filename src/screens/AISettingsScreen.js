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
} from 'react-native';
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
  isAdminRole,
} from '../services/coachAdmin';
import {getDeviceId} from '../services/device';
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
  '说话风格：轻声细语、爱用鼓励的话\n' +
  '口头禅：我们慢慢来\n' +
  '对学生的态度：先肯定再纠正，从不凶';

function emptyDraft() {
  return {
    id: '',
    name: '新分身',
    systemPrompt: '',
    greeting: '你好，准备好练琴了吗？',
    voiceId: 0,
    mmVoice: '',
    avatarUrl: '',
    visibility: 'private',
    status: '',
    reviewNote: '',
    ownerId: '',
  };
}

// 把后台返回的角色转成草稿；若有「待审核修改草稿」(pending) 则优先显示草稿内容，
// 让老师看到自己提交的是什么（学生端仍是上一版已通过的）。
function coachToDraft(c) {
  const p = c.pending || null; // snake_case 草稿
  const pick = (snake, camel, dft) =>
    p && p[snake] != null
      ? p[snake]
      : c[camel] != null
      ? c[camel]
      : dft;
  return {
    id: c.id || '',
    name: pick('name', 'name', ''),
    systemPrompt: pick('system_prompt', 'systemPrompt', ''),
    greeting: pick('greeting', 'greeting', '你好，准备好练琴了吗？'),
    voiceId: pick('voice_id', 'voiceId', 0),
    mmVoice: pick('mm_voice', 'mmVoice', ''),
    avatarUrl: pick('avatar_url', 'avatarUrl', ''),
    visibility: pick('visibility', 'visibility', 'private'),
    status: c.status || 'approved',
    reviewNote: c.reviewNote || '',
    ownerId: c.ownerId || '',
  };
}

const AISettingsScreen = ({navigation}) => {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [coaches, setCoaches] = useState([]); // 可编辑的分身列表
  const [draft, setDraft] = useState(emptyDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false); // 管理员：可编辑全部角色（含内置/他人）
  const recStartRef = useRef(0);
  const deviceId = useRef(getDeviceId()).current;

  const loadCoaches = async selectId => {
    // 管理员：可编辑「全部」角色（含内置/他人/待审核）；老师：只看自己名下。
    // 之前这里对所有人都按 ownerId 过滤，导致「用管理员口令也看不到、改不了其它角色」。
    const admin = await isAdminRole();
    setIsAdmin(admin);
    const r = await listAllCoaches();
    if (r && r.ok && Array.isArray(r.coaches)) {
      const list = admin
        ? r.coaches
        : r.coaches.filter(c => c.ownerId && c.ownerId === deviceId);
      setCoaches(list);
      const pick = (selectId && list.find(c => c.id === selectId)) || list[0];
      if (pick) {
        setDraft(coachToDraft(pick));
      } else {
        setDraft(emptyDraft()); // 还没有可编辑分身：直接进入「新建」
      }
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
        await loadCoaches(r.coach.id);
      } else if (r && r.error === 'unauthorized') {
        Alert.alert('未授权', '教师口令已失效，请返回重新登录。');
      } else if (r && r.error === 'not_owner') {
        Alert.alert('无法编辑', '该分身不属于你，只能编辑自己创建的分身。');
      } else if (r && r.error === 'cannot_edit_builtin') {
        Alert.alert('无法编辑', '内置/系统分身不可编辑，请点「＋ 新建」创建你自己的分身。');
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
    if (!draft.id) return;
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
              Alert.alert('已删除');
              await loadCoaches();
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
    // 没读到音频（bytes=0）通常是麦克风被占用/权限问题，别再走上传（否则只会报「网络异常」）。
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
        loadCoaches(draft.id);
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

  const statusBadge = c => {
    if (c.status === 'pending') return '审核中';
    if (c.status === 'rejected') return '已驳回';
    return '';
  };

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
            {/* 分身列表：管理员可编辑全部角色（免审核直改）；老师只见自己名下、改动需审核。 */}
            <Text style={styles.sectionLabel}>
              {isAdmin ? '全部分身（管理员 · 可直接编辑任意角色）' : '我的分身'}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}>
              {coaches.map(c => {
                const active = c.id === draft.id;
                const badge = statusBadge(c);
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
                    {badge ? (
                      <Text
                        style={[
                          styles.chipBadge,
                          c.status === 'rejected' && styles.chipBadgeRejected,
                          active && styles.chipBadgeActive,
                        ]}>
                        {badge}
                      </Text>
                    ) : null}
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

            {/* 审核状态提示 */}
            {draft.id && draft.status === 'pending' ? (
              <View style={styles.statusCardPending}>
                <Text style={styles.statusText}>
                  审核中：管理员通过后学生端才会看到本次改动（1–3 个工作日）。审核期间学生使用上一版。
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

            {/* 陪练提示设置入口 */}
            <TouchableOpacity
              style={styles.reminderEntry}
              activeOpacity={0.9}
              onPress={() => navigation.navigate('StudentReminder')}>
              <View style={{flex: 1}}>
                <Text style={styles.reminderEntryTitle}>陪练提示设置</Text>
                <Text style={styles.reminderEntrySub}>
                  按学生 · 按曲目设置「AI 陪练模式」重点播报内容
                </Text>
              </View>
              <Text style={styles.reminderEntryArrow}>›</Text>
            </TouchableOpacity>

            {/* 头像（居中置顶 + 相机角标，对齐蓝湖「AI分身设置」） */}
            <View style={styles.avatarWrap}>
              <TouchableOpacity onPress={onChangeAvatar} activeOpacity={0.85}>
                <Image source={avatarSrc} style={styles.avatarTop} resizeMode="cover" />
                <View style={styles.avatarCam}>
                  <Text style={styles.avatarCamText}>📷</Text>
                </View>
              </TouchableOpacity>
            </View>
            <Text style={styles.avatarHint}>点头像上传照片；先保存分身，再上传头像/录音。</Text>

            {/* 分身名称（行样式：左标题 + 右输入） */}
            <View style={styles.card}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>分身名称</Text>
                <TextInput
                  style={styles.rowInput}
                  value={draft.name}
                  onChangeText={t => set('name', t)}
                  placeholder="请输入"
                  placeholderTextColor={colors.textSecondary}
                  textAlign="right"
                />
              </View>
            </View>

            {/* 声音复刻 */}
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>专属音色（声音复刻）</Text>
              <Text style={styles.hint}>
                {draft.mmVoice
                  ? '✓ 已绑定本人专属音色（支持中/英/日/韩）。如需更新可重新录制。'
                  : '点击下方按钮，用本人声音清晰朗读 10-30 秒中文，自动生成本人专属音色，可用中/英/日/韩朗读。'}
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

            {/* 可见范围（公开 / 私有） */}
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>可见范围</Text>
              <Text style={styles.fieldHint}>
                私有：仅你自己的学生能选到；公开：所有人可选。都需审核通过后生效。
              </Text>
              <View style={styles.styleRow}>
                {[
                  {key: 'private', label: '私有（仅我的学生）'},
                  {key: 'public', label: '公开（所有人）'},
                ].map(o => {
                  const active = draft.visibility === o.key;
                  return (
                    <TouchableOpacity
                      key={o.key}
                      style={[styles.styleItem, active && styles.styleItemActive]}
                      onPress={() => set('visibility', o.key)}
                      activeOpacity={0.85}>
                      <Text
                        style={[styles.styleText, active && styles.styleTextActive]}>
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 开场问候语 */}
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>开场问候语</Text>
              <Text style={styles.fieldHint}>
                进入「AI 陪练模式」时，AI 先用这句话跟学生打招呼。
              </Text>
              <TextInput
                style={styles.multiline}
                value={draft.greeting}
                onChangeText={t => set('greeting', t)}
                placeholder={'同学你好，准备好开始今天的练习了吗？'}
                placeholderTextColor={colors.textSecondary}
                multiline
              />
            </View>

            {/* 人设（重点：懒人框架引导） */}
            <View style={styles.card}>
              <View style={styles.personaHead}>
                <Text style={styles.fieldLabel}>分身人设（决定 AI 的性格与说话方式）</Text>
                <TouchableOpacity
                  onPress={() => set('systemPrompt', PERSONA_EXAMPLE)}
                  activeOpacity={0.7}>
                  <Text style={styles.fillExample}>填入示例</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.guideBox}>
                <Text style={styles.guideTitle}>照着填，越具体越像真人：</Text>
                <Text style={styles.guideLine}>· 身份：教龄15年的钢琴老师</Text>
                <Text style={styles.guideLine}>· 性格：温柔耐心，但对手型要求严格</Text>
                <Text style={styles.guideLine}>· 说话风格：轻声细语、爱用鼓励的话</Text>
                <Text style={styles.guideLine}>· 口头禅：我们慢慢来</Text>
                <Text style={styles.guideLine}>· 对学生的态度：先肯定再纠正，从不凶</Text>
              </View>
              <TextInput
                style={[styles.multiline, {minHeight: 130}]}
                value={draft.systemPrompt}
                onChangeText={t => set('systemPrompt', t)}
                placeholder={PERSONA_EXAMPLE}
                placeholderTextColor={colors.textSecondary}
                multiline
              />
            </View>

            <View style={styles.footerRow}>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={onDelete}
                activeOpacity={0.85}
                disabled={saving || !draft.id}>
                <Text style={styles.deleteBtnText}>删除</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={onSave}
                activeOpacity={0.88}
                disabled={saving}>
                <Text style={styles.saveBtnText}>
                  {saving ? '保存中…' : draft.id ? '保存提交' : '创建分身'}
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
    scroll: {padding: 16, paddingBottom: 40},
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    chipRow: {gap: 8, paddingBottom: 6, paddingRight: 8},
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 18,
      backgroundColor: colors.card,
      marginRight: 8,
      maxWidth: 160,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: colors.mode === 'dark' ? 1 : 0,
      borderColor: colors.cardBorder,
    },
    chipActive: {backgroundColor: colors.primary, borderColor: colors.primary},
    chipText: {fontSize: 13, color: colors.textPrimary, fontWeight: '600'},
    chipTextActive: {color: '#fff'},
    chipBadge: {
      fontSize: 10,
      color: '#fff',
      backgroundColor: '#F5A623',
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 1,
      marginLeft: 6,
      overflow: 'hidden',
    },
    chipBadgeRejected: {backgroundColor: '#E5484D'},
    chipBadgeActive: {opacity: 0.95},
    chipNew: {backgroundColor: colors.cardAlt, borderColor: colors.cardBorder},
    chipNewText: {fontSize: 13, color: colors.primaryDark, fontWeight: '700'},
    statusCardPending: {
      backgroundColor: '#FFF7E6',
      borderRadius: 12,
      padding: 12,
      marginTop: 4,
    },
    statusText: {fontSize: 12, color: '#8A6D3B', lineHeight: 18},
    statusCardRejected: {
      backgroundColor: '#FDECEA',
      borderRadius: 12,
      padding: 12,
      marginTop: 4,
    },
    statusTextRejected: {fontSize: 12, color: '#B4231C', lineHeight: 18},
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginTop: 14,
      borderWidth: colors.mode === 'dark' ? 1 : 0,
      borderColor: colors.cardBorder,
      shadowColor: '#000',
      shadowOpacity: colors.mode === 'dark' ? 0.25 : 0.05,
      shadowRadius: 8,
      shadowOffset: {width: 0, height: 2},
      elevation: 2,
    },
    row: {flexDirection: 'row', alignItems: 'center'},
    avatarWrap: {alignItems: 'center', marginTop: 8, marginBottom: 6},
    avatarTop: {
      width: 92,
      height: 92,
      borderRadius: 46,
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
    avatarHint: {
      fontSize: 11.5,
      color: colors.textSecondary,
      marginTop: 2,
      marginBottom: 4,
      textAlign: 'center',
    },
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowInput: {
      flex: 1,
      marginLeft: 12,
      height: 32,
      fontSize: 15,
      color: colors.textPrimary,
    },
    fieldLabel: {fontSize: 13, fontWeight: '700', color: colors.textPrimary},
    fieldHint: {
      fontSize: 11.5,
      color: colors.primaryDark,
      marginTop: 5,
      lineHeight: 17,
    },
    hint: {fontSize: 12, color: colors.textSecondary, marginTop: 6, lineHeight: 18},
    nameInput: {
      marginTop: 6,
      height: 40,
      borderRadius: 10,
      backgroundColor: colors.inputBg,
      paddingHorizontal: 12,
      fontSize: 15,
      color: colors.textPrimary,
    },
    styleRow: {flexDirection: 'row', gap: 10, marginTop: 10},
    styleItem: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.inputBg,
      alignItems: 'center',
    },
    styleItemActive: {backgroundColor: colors.primary},
    styleText: {fontSize: 12.5, color: colors.textPrimary, fontWeight: '600'},
    styleTextActive: {color: '#fff'},
    voiceBtn: {
      marginTop: 12,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    voiceBtnRec: {backgroundColor: '#E5484D'},
    voiceBtnText: {color: '#fff', fontSize: 15, fontWeight: '700'},
    personaHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    fillExample: {fontSize: 12.5, color: colors.accent, fontWeight: '700'},
    guideBox: {
      backgroundColor: colors.inputBg,
      borderRadius: 10,
      padding: 12,
      marginTop: 8,
    },
    guideTitle: {fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginBottom: 4},
    guideLine: {fontSize: 12, color: colors.textSecondary, lineHeight: 19},
    multiline: {
      marginTop: 8,
      minHeight: 90,
      borderRadius: 10,
      backgroundColor: colors.inputBg,
      padding: 12,
      fontSize: 14,
      color: colors.textPrimary,
      textAlignVertical: 'top',
    },
    footerRow: {flexDirection: 'row', gap: 12, marginTop: 22},
    deleteBtn: {
      width: 110,
      height: 50,
      borderRadius: 25,
      borderWidth: 1.5,
      borderColor: colors.cardBorder,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteBtnText: {color: colors.textPrimary, fontSize: 16, fontWeight: '600'},
    saveBtn: {
      flex: 1,
      height: 50,
      borderRadius: 25,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
    reminderEntry: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginTop: 14,
      marginBottom: 4,
    },
    reminderEntryTitle: {fontSize: 15, fontWeight: '700', color: '#fff'},
    reminderEntrySub: {
      fontSize: 11.5,
      color: 'rgba(255,255,255,0.9)',
      marginTop: 3,
    },
    reminderEntryArrow: {fontSize: 24, color: '#fff', marginLeft: 8},
  });

export default AISettingsScreen;
