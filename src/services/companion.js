// 兔兔伙伴状态机（持久化）—— 与安卓 RabbitCompanion.java 1:1。
// 负责：连续天数、累计分钟、打卡日期、积分、成就装扮、点击计数。
import {getItem, setItem} from './storage';
import {
  GREETING_MORNING,
  GREETING_AFTERNOON,
  GREETING_EVENING,
  TAP_RESPONSES,
  STREAK_MILESTONES,
  pick,
} from '../utils/rabbitMessages';

const K = {
  mood: 'rc_mood_level',
  streak: 'rc_practice_streak',
  minutes: 'rc_total_practice_minutes',
  lastDay: 'rc_last_practice_day',
  accessories: 'rc_unlocked_accessories',
  taps: 'rc_total_taps',
  days: 'rc_practice_days',
};

const CELEBRATION_PHRASES = [
  '太棒啦！撒花撒花！',
  '哇！今天练得超级好！',
  '你简直是小钢琴家！',
  '为你的表现鼓掌！啪啪啪！',
  '这次真的进步好大！',
];

let state = {
  mood: 70,
  streak: 0,
  minutes: 0,
  lastDay: 0,
  taps: 0,
  days: [],
  accessories: '',
};
let loaded = false;
let sessionErrorCount = 0;

function currentDayNumber() {
  return Math.floor(Date.now() / (24 * 60 * 60 * 1000));
}

async function load() {
  const num = async (key, dflt) => {
    const v = await getItem(key);
    if (v == null) return dflt;
    const n = Number(v);
    return Number.isNaN(n) ? dflt : n;
  };
  state.mood = await num(K.mood, 70);
  state.streak = await num(K.streak, 0);
  state.minutes = await num(K.minutes, 0);
  state.lastDay = await num(K.lastDay, 0);
  state.taps = await num(K.taps, 0);
  state.accessories = (await getItem(K.accessories)) || '';
  const rawDays = (await getItem(K.days)) || '';
  state.days = rawDays
    ? rawDays
        .split(',')
        .map(s => Number(s.trim()))
        .filter(n => !Number.isNaN(n))
    : [];
  // checkStreakContinuity
  const today = currentDayNumber();
  if (today - state.lastDay > 1) {
    state.streak = 0;
    state.mood = Math.max(30, state.mood - 10);
  }
  loaded = true;
}

async function ensureLoaded() {
  if (!loaded) await load();
}

async function persistCore() {
  await setItem(K.mood, state.mood);
  await setItem(K.streak, state.streak);
  await setItem(K.minutes, state.minutes);
  await setItem(K.taps, state.taps);
  await setItem(K.lastDay, currentDayNumber());
}

// App 打开问候：返回需要播报的消息序列。
export async function onAppOpen() {
  await ensureLoaded();
  const hour = new Date().getHours();
  let greeting;
  if (hour < 12) greeting = pick(GREETING_MORNING);
  else if (hour < 18) greeting = pick(GREETING_AFTERNOON);
  else greeting = pick(GREETING_EVENING);

  const messages = [greeting];
  if (state.streak > 0 && state.streak % 3 === 0) {
    messages.push(
      pick(STREAK_MILESTONES).replace('%d', String(state.streak)),
    );
  }
  return messages;
}

// 点击兔兔：返回消息序列（每 20 次附加友谊消息）。
export async function onTap() {
  await ensureLoaded();
  state.taps += 1;
  const messages = [pick(TAP_RESPONSES)];
  if (state.taps % 20 === 0) {
    messages.push(`你已经戳我${state.taps}次了！我们是好朋友吧？`);
  }
  await setItem(K.taps, state.taps);
  return messages;
}

function recordPracticeDay(day) {
  if (!state.days.includes(day)) {
    state.days.push(day);
    setItem(K.days, state.days.join(','));
  }
}

function checkAndUnlockAchievements(matchRate, messages) {
  const has = id => state.accessories.includes(id);
  const add = (id, msg) => {
    state.accessories += (state.accessories ? ',' : '') + id;
    messages.push(msg);
  };
  if (state.streak >= 3 && !has('ribbon'))
    add('ribbon', '解锁新装扮：蝴蝶结！连续练琴3天的奖励！');
  if (state.streak >= 7 && !has('crown'))
    add('crown', '解锁新装扮：皇冠！连续练琴7天，你是小王子/小公主！');
  if (state.streak >= 14 && !has('wings'))
    add('wings', '解锁新装扮：翅膀！连续14天！你可以飞啦！');
  if (state.minutes >= 30 && !has('scarf'))
    add('scarf', '解锁新装扮：围巾！累计练琴30分钟！');
  if (state.minutes >= 60 && !has('hat'))
    add('hat', '解锁新装扮：礼帽！累计练琴60分钟！好厉害！');
  if (sessionErrorCount === 0 && !has('star_badge'))
    add('star_badge', '解锁新装扮：星星徽章！零错误完成练习！');
  if (matchRate > 90 && !has('music_note'))
    add('music_note', '解锁新装扮：音符光环！匹配率超过90%！');
  setItem(K.accessories, state.accessories);
}

export function onPracticeError(hasError) {
  if (hasError) sessionErrorCount += 1;
}

export function resetSession() {
  sessionErrorCount = 0;
}

// 结束练琴：更新连续天数/分钟/打卡/成就。返回庆祝+成就消息。
export async function onPracticeEnd(matchRate, durationMinutes) {
  await ensureLoaded();
  state.minutes += durationMinutes;
  const today = currentDayNumber();
  if (today !== state.lastDay) {
    if (today - state.lastDay <= 1) state.streak += 1;
    else state.streak = 1;
  }
  recordPracticeDay(today);
  state.mood = Math.min(100, state.mood + Math.floor(matchRate / 10));

  const messages = [pick(CELEBRATION_PHRASES)];
  checkAndUnlockAchievements(matchRate, messages);
  await persistCore();
  return messages;
}

function unlockedAccessoryCount() {
  if (!state.accessories) return 0;
  return state.accessories.split(',').filter(s => s.trim()).length;
}

// 积分公式：每分钟10 + 每连续天50 + 每装扮100（与安卓一致）。
export async function getPoints() {
  await ensureLoaded();
  return state.minutes * 10 + state.streak * 50 + unlockedAccessoryCount() * 100;
}

export async function getStats() {
  await ensureLoaded();
  return {
    streak: state.streak,
    totalDays: state.days.length,
    totalMinutes: state.minutes,
    points:
      state.minutes * 10 +
      state.streak * 50 +
      unlockedAccessoryCount() * 100,
    days: [...state.days],
    today: currentDayNumber(),
  };
}

export default {
  onAppOpen,
  onTap,
  onPracticeEnd,
  onPracticeError,
  resetSession,
  getPoints,
  getStats,
};
