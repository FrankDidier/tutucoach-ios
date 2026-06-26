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
} from 'react-native';
import {Colors} from '../utils/colors';
import {Images} from '../assets/images';
import ScreenHeader from '../components/ScreenHeader';
import {getItem, setItem} from '../services/storage';

const VOICE_DIMENSION_ITEMS = [
  '音色与音质：明亮/温暖/浑厚等整体听感，以及吐字是否清晰。',
  '语速与节奏：快慢变化、停顿与连读，是否符合对话场景。',
  '音高与语调：基频起伏、句末升降调、强调重音的位置。',
  '情感表达：开心、严肃、鼓励等情绪层次是否自然可信。',
  '发声习惯：用气方式、鼻音、音量动态与麦克风距离感。',
];

const LOGIC_PREVIEW_ITEMS = [
  '回答结构：先结论后理由，或分点说明，保持条理清楚。',
  '论证方式：举例、对比、递进等逻辑链条是否一致。',
  '思维偏好：偏保守建议或偏启发引导，需与产品设定对齐。',
  '边界处理：遇到不确定问题时如何拒答或转人工。',
  '个性化：口头禅、称呼方式与学员互动节奏。',
];

const AISettingsScreen = ({navigation}) => {
  const [inputText, setInputText] = useState('');
  const [tab, setTab] = useState('library');
  const [messages, setMessages] = useState([
    {from: 'ai', text: '你好呀，有什么想问的'},
    {from: 'user', text: '没事干呀，你在哪呢'},
  ]);
  const personaRef = useRef('');
  const scrollRef = useRef(null);

  useEffect(() => {
    getItem('coach_persona').then(p => {
      if (p) personaRef.current = p;
    });
  }, []);

  // 对应安卓 btnSend：把用户输入并入分身资料库，AI 气泡确认。
  const onSend = () => {
    const text = inputText.trim();
    if (!text) return;
    personaRef.current += (personaRef.current ? '\n' : '') + text;
    setMessages(prev => [
      ...prev,
      {from: 'user', text},
      {from: 'ai', text: '已记录到分身资料，你可以继续补充～'},
    ]);
    setInputText('');
    setTimeout(() => scrollRef.current?.scrollToEnd?.({animated: true}), 80);
  };

  // 对应安卓 btnSavePersona / 右上角保存。
  const onSavePersona = async () => {
    await setItem('coach_persona', personaRef.current);
    Alert.alert('已保存', '分身资料已保存到本地');
  };

  const listItems =
    tab === 'library' ? VOICE_DIMENSION_ITEMS : LOGIC_PREVIEW_ITEMS;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.pinkBg} />

      <ScreenHeader
        title="AI设置"
        onBack={() => navigation?.goBack?.()}
        right={
          <TouchableOpacity onPress={onSavePersona} activeOpacity={0.7}>
            <Text style={styles.saveHeaderText}>保存</Text>
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, tab === 'library' && styles.tabActive]}
            onPress={() => setTab('library')}
            activeOpacity={0.85}>
            <Text
              style={[
                styles.tabText,
                tab === 'library' && styles.tabTextActive,
              ]}>
              分身说话资料库
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'logic' && styles.tabActive]}
            onPress={() => setTab('logic')}
            activeOpacity={0.85}>
            <Text style={[styles.tabText, tab === 'logic' && styles.tabTextActive]}>
              分身逻辑
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.whiteCard}>
            {listItems.map((line, idx) => (
              <View key={idx} style={styles.listRow}>
                <Text style={styles.listNumber}>{idx + 1}.</Text>
                <Text style={styles.listBody}>{line}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.chatSectionTitle}>对话预览</Text>
          <View style={styles.chatSection}>
            {messages.map((msg, i) => (
              <View
                key={i}
                style={[
                  styles.bubbleRow,
                  msg.from === 'user' ? styles.bubbleRowUser : styles.bubbleRowAi,
                ]}>
                {msg.from === 'ai' && (
                  <View style={styles.aiAvatarWrap}>
                    <Image
                      source={Images.avatarRabbit}
                      style={styles.aiAvatar}
                      resizeMode="contain"
                    />
                  </View>
                )}
                <View
                  style={[
                    styles.bubble,
                    msg.from === 'user' ? styles.bubbleUser : styles.bubbleAi,
                  ]}>
                  <Text
                    style={[
                      styles.bubbleText,
                      msg.from === 'user' && styles.bubbleTextUser,
                    ]}>
                    {msg.text}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder="请输入文字"
            placeholderTextColor={Colors.textSecondary}
            value={inputText}
            onChangeText={setInputText}
          />
          <TouchableOpacity
            style={styles.sendBtn}
            activeOpacity={0.88}
            onPress={onSend}>
            <Text style={styles.sendBtnText}>发送</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.pinkBg,
  },
  flex: {
    flex: 1,
  },
  headerWrap: {
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerGradient: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  headerStripe: {
    flex: 1,
    height: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  backHit: {
    width: 40,
    justifyContent: 'center',
  },
  backText: {
    fontSize: 22,
    color: Colors.white,
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.white,
  },
  headerSpacer: {
    width: 40,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: Colors.pinkLight,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.pinkDark,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  whiteCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  listNumber: {
    width: 22,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.pinkPrimary,
    lineHeight: 22,
  },
  listBody: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  chatSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  chatSection: {
    gap: 12,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
  },
  bubbleRowAi: {
    justifyContent: 'flex-start',
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  aiAvatarWrap: {
    marginRight: 8,
  },
  aiAvatar: {
    width: 36,
    height: 36,
  },
  bubble: {
    maxWidth: '76%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  bubbleAi: {
    backgroundColor: Colors.white,
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  bubbleUser: {
    backgroundColor: Colors.pinkPrimary,
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: Colors.white,
  },
  inputBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: Colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.greyDivider,
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.pinkBg,
    paddingHorizontal: 16,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  sendBtn: {
    height: 42,
    paddingHorizontal: 20,
    backgroundColor: Colors.pinkPrimary,
    borderRadius: 21,
    justifyContent: 'center',
  },
  sendBtnText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  saveHeaderText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.pinkPrimary,
  },
});

export default AISettingsScreen;
