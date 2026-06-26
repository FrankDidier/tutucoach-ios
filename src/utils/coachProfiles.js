/**
 * CoachProfile data — mirrors Android CoachProfile.java
 */
export const CoachStyles = {
  ENCOURAGING: 'ENCOURAGING',
  STRICT: 'STRICT',
  PLAYFUL: 'PLAYFUL',
};

export const builtInProfiles = [
  {
    id: 'coach_pro',
    displayName: '专业老师',
    style: CoachStyles.STRICT,
    speechRate: 1.0,
    pitch: 1.0,
    greeting: '同学你好，准备好开始今天的练习了吗？',
    encouragements: [
      '手型保持得不错，继续保持。',
      '这一段弹得很稳，很好。',
      '注意力很集中，这就对了。',
      '进步很明显，继续努力。',
    ],
    errorTemplates: [
      '注意，%s需要纠正',
      '%s的问题出现较多，请注意',
    ],
    celebrationPhrases: [
      '这次练习很好，手型标准。',
      '不错，今天的状态很好。',
    ],
  },
  {
    id: 'coach_elsa',
    displayName: '艾莎老师',
    style: CoachStyles.ENCOURAGING,
    speechRate: 0.95,
    pitch: 1.15,
    greeting: '小朋友你好呀～艾莎老师来陪你练琴啦！',
    encouragements: [
      '哇，你弹得好棒呀！',
      '真厉害，手型保持得真好！',
      '你是今天最棒的小钢琴家！',
    ],
    errorTemplates: [
      '小朋友，%s要注意哦～',
      '没关系没关系，%s改过来就好了',
    ],
    celebrationPhrases: [
      '太棒了！你今天弹得超级好！',
      '哇～老师为你骄傲！',
    ],
  },
  {
    id: 'coach_ultra',
    displayName: '奥特曼教练',
    style: CoachStyles.PLAYFUL,
    speechRate: 1.15,
    pitch: 0.95,
    greeting: '嘿！奥特曼教练来啦！准备好和我一起战斗了吗！',
    encouragements: [
      '干得漂亮！这手型简直帅呆了！',
      '太酷了！你的手指像超级战士一样！',
    ],
    errorTemplates: [
      '注意！%s要修正！准备变身！',
      '%s出现了小bug！修复它！',
    ],
    celebrationPhrases: [
      '任务完成！你是今天的MVP！',
      '太强了！给你颁发超级勋章！',
    ],
  },
];

export const getDefaultProfile = () => builtInProfiles[0];
