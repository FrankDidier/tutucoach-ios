// 教师端学生统计（C），对应 Android 的 TeacherStatsClient.fetchStats。
import {getJson} from './api';

/**
 * 拉取本班学生 + 每周练琴时长 / 平均正确率 / VIP 有效期。
 * 返回 {ok, students: [{user_id, nickname, week_minutes, avg_match_rate, sessions, ...membership}]}。
 */
export function fetchStudents(teacherId) {
  return getJson('/api/teacher/students', {teacher_id: teacherId});
}
