import React, {useEffect, useState} from 'react';
import {Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet} from 'react-native';
import {answerAiConsent, registerConsentHost} from '../services/aiConsent';
import {useTheme} from '../theme/ThemeContext';

// 用了哪些第三方 AI 服务、发什么数据，都要在用户同意前讲清楚。
const DATA = [
  '你在陪练里说的话（先由 Apple 语音识别转成文字）和打字聊天的内容',
  '你告诉陪练的称呼、性别、年龄、爱好，以及练琴时长等练习记录',
  '老师上传的乐谱上的文字、课堂录音转写的文字和老师写的练习重点',
  '陪练要朗读出来的回复文字；老师自愿录制的声音样本（用于复刻老师的声音）',
];

const PROVIDERS = [
  ['深度求索 DeepSeek', '理解你说的话、生成陪练的回复和课堂整理'],
  ['百度智能云 文心', 'DeepSeek 不可用时的备用对话服务'],
  ['稀宇科技 MiniMax', '把回复文字合成语音、复刻老师的声音'],
  ['Apple', '把你说的话转成文字（语音识别）'],
];

export default function AiConsentHost({navigationRef}) {
  const {colors} = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => registerConsentHost(setOpen), []);

  const openPrivacy = () => {
    answerAiConsent(null);
    try {
      navigationRef && navigationRef.current && navigationRef.current.navigate('Legal');
    } catch (e) {}
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => answerAiConsent(false)}>
      <View style={ui.mask}>
        <View style={[ui.card, {backgroundColor: colors.card || '#fff'}]}>
          <Text style={[ui.title, {color: colors.textPrimary}]}>使用 AI 功能前，请先看一下</Text>
          <ScrollView style={ui.body} contentContainerStyle={{paddingBottom: 6}}>
            <Text style={[ui.text, {color: colors.textPrimary}]}>
              AI 陪练、语音聊天、课堂整理和乐谱分析需要把下面这些信息发送给第三方 AI 服务处理：
            </Text>
            {DATA.map(t => (
              <Text key={t} style={[ui.item, {color: colors.textPrimary}]}>
                • {t}
              </Text>
            ))}
            <Text style={[ui.sub, {color: colors.textPrimary}]}>接收这些信息的服务方：</Text>
            {PROVIDERS.map(([who, why]) => (
              <Text key={who} style={[ui.item, {color: colors.textPrimary}]}>
                • <Text style={ui.strong}>{who}</Text>：{why}
              </Text>
            ))}
            <Text style={[ui.text, {color: colors.textSecondary}]}>
              这些服务只按兔兔教练的请求处理数据，不会用于其他目的。不满 14 周岁的孩子请在家长陪同下阅读并由家长决定。
              不同意也可以继续使用练琴计时、乐谱查看等不需要 AI 的功能；以后可以在「我的 → AI 数据授权」里更改。
            </Text>
            <Text style={[ui.link, {color: colors.primary}]} onPress={openPrivacy}>
              查看《隐私政策》
            </Text>
          </ScrollView>
          <View style={ui.row}>
            <TouchableOpacity
              style={[ui.btn, ui.btnGhost, {borderColor: colors.cardBorder || '#ddd'}]}
              onPress={() => answerAiConsent(false)}
              accessibilityLabel="不同意">
              <Text style={[ui.btnText, {color: colors.textPrimary}]}>不同意</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ui.btn, {backgroundColor: colors.primary}]}
              onPress={() => answerAiConsent(true)}
              accessibilityLabel="同意并继续">
              <Text style={[ui.btnText, {color: '#fff'}]}>同意并继续</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const ui = StyleSheet.create({
  mask: {flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 22},
  card: {borderRadius: 16, padding: 18, maxHeight: '86%'},
  title: {fontSize: 17, fontWeight: '700', marginBottom: 10},
  body: {flexGrow: 0},
  text: {fontSize: 13.5, lineHeight: 20, marginTop: 6},
  sub: {fontSize: 13.5, fontWeight: '700', marginTop: 10},
  item: {fontSize: 13, lineHeight: 19, marginTop: 4, paddingLeft: 2},
  strong: {fontWeight: '700'},
  link: {fontSize: 13.5, marginTop: 10, fontWeight: '600'},
  row: {flexDirection: 'row', gap: 12, marginTop: 14},
  btn: {flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center'},
  btnGhost: {borderWidth: 1},
  btnText: {fontSize: 15, fontWeight: '600'},
});
