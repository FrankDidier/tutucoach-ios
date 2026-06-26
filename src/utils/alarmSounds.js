// 铃声列表 —— 与安卓 AlarmSoundManager.initAlarmList() 1:1。
// id / 名称 / 是否免费 完全对齐；file 为打包进 App 的音频资源（无 file 的为付费 ToneGenerator 音）。
export const ALARM_SOUNDS = [
  {id: 0, name: '默认提示音', free: true, file: 'alarm_default.wav'},
  {id: 1, name: '钢琴音符', free: true, file: 'alarm_piano.wav'},
  {id: 2, name: '温柔铃声', free: false, file: null},
  {id: 3, name: '紧急蜂鸣', free: false, file: null},
  {id: 4, name: '旋律提醒', free: false, file: null},
  {id: 10, name: '猫叫提醒 🐱', free: true, file: 'alarm_cat.wav'},
  {id: 11, name: '狗叫提醒 🐶', free: true, file: 'alarm_dog.wav'},
  {id: 12, name: '男声提醒 🗣', free: true, file: 'alarm_male_voice.wav'},
  {id: 13, name: '女声提醒 🗣', free: true, file: 'alarm_female_voice.wav'},
  {id: 14, name: '警笛提醒 🚨', free: true, file: 'alarm_siren.wav'},
  {id: 15, name: '救护车提醒 🚑', free: true, file: 'alarm_ambulance.wav'},
];

export function alarmById(id) {
  return ALARM_SOUNDS.find(s => s.id === id) || ALARM_SOUNDS[0];
}

export function alarmNameById(id) {
  return alarmById(id).name;
}

export function alarmFileById(id) {
  const a = alarmById(id);
  return a.file || 'alarm_default.wav';
}
