// 光币钱包 / 角色解锁 / 老师兑现。
import {getJson, postJson} from './api';
import {getDeviceId} from './device';

/** 从钱包响应取出本月免费解锁次数；没有则返回 null。 */
export function freeUsesFromWallet(w) {
  const f = w && (w.freeUses || w.free_uses);
  if (!f || typeof f !== 'object') return null;
  const granted = Number(f.granted) || 0;
  const used = Number(f.used) || 0;
  const remaining =
    f.remaining != null ? Math.max(0, Number(f.remaining) || 0) : Math.max(0, granted - used);
  return {
    month: f.month || '',
    granted,
    used,
    remaining,
  };
}

export function fetchWallet(userId) {
  return getJson('/api/guangbi/wallet', {user_id: userId || getDeviceId()});
}

export function syncPracticeGuangbi(userId, practicePoints) {
  return postJson('/api/guangbi/sync_practice', {
    user_id: userId || getDeviceId(),
    practice_points: practicePoints || 0,
  });
}

export function unlockCoach(coachId, userId) {
  return postJson('/api/guangbi/unlock', {
    user_id: userId || getDeviceId(),
    coach_id: coachId,
  });
}

export function fetchTeacherGuangbi(teacherId) {
  return getJson('/api/guangbi/teacher', {teacher_id: teacherId || getDeviceId()});
}

export function requestCashout(amount, teacherId) {
  return postJson('/api/guangbi/cashout', {
    teacher_id: teacherId || getDeviceId(),
    amount,
  });
}
