// 兔兔伙伴消息库 —— 与安卓 RabbitCompanion.java 的短语池 1:1。
export const GREETING_MORNING = [
  '早上好呀！今天也要加油练琴哦！',
  '新的一天，新的旋律！我们开始吧！',
  '早安～昨晚有没有梦到弹钢琴呀？',
];
export const GREETING_AFTERNOON = [
  '下午好！练琴时间到啦！',
  '吃饱了吗？补充完能量就来弹琴吧！',
  '下午茶时间？不不，是练琴时间！',
];
export const GREETING_EVENING = [
  '晚上好～来一段优美的曲子吧！',
  '忙了一天辛苦啦，弹首曲子放松一下？',
  '夜晚的钢琴声最好听了～',
];

export const TAP_RESPONSES = [
  '嘻嘻，别挠我痒痒！',
  '你找我呀？要不要弹一曲？',
  '戳戳戳～你的手指很灵活嘛！',
  '嗯？怎么啦？',
  '哎呀！吓我一跳！',
  '再戳我就要生气啦…才怪！嘻嘻',
  '你知道吗？钢琴有88个键哦！',
  '要不要和我玩个游戏？',
  '我的胡萝卜呢？被你藏起来了吗？',
  '今天你弹得比昨天好多了！真的！',
];

export const STREAK_MILESTONES = [
  '连续练琴%d天了！你太有毅力了！',
  '第%d天连续练琴！坚持就是胜利！',
  '%d天不间断！你是练琴小冠军！',
];

export function pick(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

// 与安卓 getTimeBasedGreeting 一致：<12 早上，<18 下午，否则晚上。
export function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return pick(GREETING_MORNING);
  if (hour < 18) return pick(GREETING_AFTERNOON);
  return pick(GREETING_EVENING);
}

// 说话动画时长：与安卓 max(1800, len*240) 一致。
export function talkDurationMs(message) {
  return Math.max(1800, (message ? message.length : 0) * 240);
}
