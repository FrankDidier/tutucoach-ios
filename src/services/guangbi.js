// 光币钱包 / 角色解锁 / 老师兑现。
import {getJson, postJson} from './api';
import {getDeviceId} from './device';

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
