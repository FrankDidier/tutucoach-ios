// 账号体系 / 练习同步 / 入班绑定（B/C），对应 Android 的 AccountManager + TeacherStatsClient。
import {getJson, postJson} from './api';

/** 查询会员状态（是否 VIP / 到期）。 */
export function getMembership(userId) {
  return getJson('/api/membership', {user_id: userId});
}

/** 静默注册/登录（幂等）。deviceId 在 iOS 上用 identifierForVendor，Android 用 Android ID。 */
export function registerAccount(deviceId, role = 'student', nickname = '') {
  return postJson('/api/account/register', {device_id: deviceId, role, nickname});
}

/** 上报一次练习记录（练习结束时）。 */
export function syncPractice(userId, minutes, matchRate, day) {
  return postJson('/api/practice/sync', {
    user_id: userId,
    minutes,
    match_rate: matchRate,
    day,
  });
}

/** 批量迁移本地历史练习记录（B4）。records: [{day, minutes, match_rate}]。 */
export function syncPracticeBatch(userId, records) {
  return postJson('/api/practice/sync', {user_id: userId, records});
}

/** 老师把学生绑到自己名下（B2）。 */
export function bindTeacher(teacherId, studentId) {
  return postJson('/api/account/bind_teacher', {
    teacher_id: teacherId,
    student_id: studentId,
  });
}

/** 微信登录：App 拿到 code 后交后端换 OpenID（AppSecret 配好后生效）。 */
export function wechatLogin(code, deviceId) {
  return postJson('/api/account/wechat_login', {code, device_id: deviceId});
}
