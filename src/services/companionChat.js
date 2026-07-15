// 陪练模式网络客户端 —— 对应安卓 CompanionChatClient。
// - chat(): 学生与 AI 分身多轮对话 / AI 主动陪聊（POST /api/coach/chat）
// - fetchReminders(): 拉取老师为该学生设置的重点（含按曲目分组）（GET /api/coach/reminders）
import {postJson, getJson} from './api';

/**
 * 多轮对话 / 主动陪聊。
 * @param {string} coachId 角色 id
 * @param {string} studentName 学生昵称
 * @param {Array<{role:string,content:string}>} history 已发生的对话
 * @param {'chat'|'proactive'} mode chat=学生对话（回复可含括号旁白，不朗读）；proactive=AI 主动说一句（会朗读，服务端已去括号）
 * @param {string} [topic] proactive 时可围绕的重点（某条重要提示语 / 曲目重点）
 * @returns {Promise<{ok:boolean,text:string}>}
 */
export async function chat(
  coachId,
  studentName,
  history,
  mode = 'chat',
  topic = '',
  situation = '',
) {
  try {
    const body = {
      coach_id: coachId || '',
      student_name: studentName || '',
      messages: Array.isArray(history) ? history : [],
    };
    if (mode) body.mode = mode;
    if (topic) body.topic = topic;
    if (situation) body.situation = situation;
    const resp = await postJson('/api/coach/chat', body);
    const text = (resp && resp.text) || '';
    return {ok: !!text, text};
  } catch (e) {
    return {ok: false, text: ''};
  }
}

/**
 * 拉取重点提示（含按曲目分组）。teacherId 可为空（取该生最新的一组）。
 * @returns {Promise<{reminders:string[], pieces:Array<{name:string,lines:string[]}>, freqSec:number}>}
 */
export async function fetchReminders(studentId, teacherId) {
  const out = {reminders: [], pieces: [], freqSec: 45};
  try {
    const params = {student_id: studentId || ''};
    if (teacherId) params.teacher_id = teacherId;
    const resp = await getJson('/api/coach/reminders', params);
    if (resp) {
      if (typeof resp.freqSec === 'number') out.freqSec = Math.max(10, resp.freqSec);
      if (Array.isArray(resp.reminders)) {
        out.reminders = resp.reminders
          .map(s => String(s || '').trim())
          .filter(Boolean);
      }
      if (Array.isArray(resp.pieces)) {
        out.pieces = resp.pieces
          .filter(p => p && p.name)
          .map(p => ({
            name: String(p.name).trim(),
            lines: (Array.isArray(p.lines) ? p.lines : [])
              .map(s => String(s || '').trim())
              .filter(Boolean),
          }))
          .filter(p => p.name);
      }
    }
  } catch (e) {}
  return out;
}

/**
 * #4 曲目解读 + 教案：输入曲目名 + 作曲家，AI 生成解读与教案（约需 1 分钟）。
 * @param {string} piece 曲目名
 * @param {string} composer 作曲家（可空）
 * @param {string} [existingFocus] 该曲目已设置的陪练重点（可空；带上则教案会据此调整呼应）
 * @returns {Promise<{ok:boolean,text:string}>}
 */
export async function generateLessonPlan(piece, composer, existingFocus = '') {
  try {
    const body = {piece: piece || '', composer: composer || ''};
    if (existingFocus) body.existing_focus = existingFocus;
    // 服务端用大模型生成较长内容，最长约 100s；给 115s 客户端超时。
    const resp = await postJson('/api/coach/lesson_plan', body, null, 115000);
    return {ok: !!(resp && resp.ok && resp.text), text: (resp && resp.text) || ''};
  } catch (e) {
    return {ok: false, text: ''};
  }
}

/** 老师端保存某学生的「按曲目分组」重点 + 播报频率。 */
export async function savePieces(teacherId, studentId, studentName, pieces, freqSec) {
  try {
    const cleanPieces = (Array.isArray(pieces) ? pieces : [])
      .filter(p => p && p.name && p.name.trim())
      .map(p => ({
        name: p.name.trim(),
        lines: (Array.isArray(p.lines) ? p.lines : [])
          .map(s => String(s || '').trim())
          .filter(Boolean),
      }));
    const resp = await postJson('/api/coach/reminders/save', {
      teacher_id: teacherId || '',
      student_id: studentId || '',
      student_name: studentName || '',
      pieces: cleanPieces,
      freq_sec: Math.max(10, Math.min(600, freqSec || 45)),
    });
    return !!(resp && resp.ok);
  } catch (e) {
    return false;
  }
}

export default {chat, fetchReminders, savePieces};
