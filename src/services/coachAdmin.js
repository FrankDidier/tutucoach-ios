// 教师端「AI 分身」管理 —— 对应安卓 CoachAdminClient。
// 写操作（保存人设 / 上传头像 / 声音复刻）都要带管理口令 X-Admin-Token。
// 口令由教师在「教师登录」弹窗输入，校验通过后存本地，后续自动附带。
import {BASE_URL} from './config';
import {getItem, setItem} from './storage';
import {getJson, postJson, postForm} from './api';

const K_TOKEN = 'admin_token';
let cachedToken = null;

export async function getAdminToken() {
  if (cachedToken != null) return cachedToken;
  cachedToken = (await getItem(K_TOKEN)) || '';
  return cachedToken;
}

export async function setAdminToken(token) {
  cachedToken = token || '';
  await setItem(K_TOKEN, cachedToken);
}

export async function clearAdminToken() {
  cachedToken = '';
  await setItem(K_TOKEN, '');
}

async function authHeader() {
  const t = await getAdminToken();
  return t ? {'X-Admin-Token': t} : {};
}

/** 用候选口令调用 admin_check；成功则记住口令。 */
export async function verifyAndSaveToken(token) {
  try {
    const r = await getJson('/api/coach/admin_check', null, {
      'X-Admin-Token': token,
    });
    if (r && r.ok) {
      await setAdminToken(token);
      return true;
    }
  } catch (e) {}
  return false;
}

/** 已存口令是否仍有效（进入教师端时校验）。 */
export async function hasValidToken() {
  const t = await getAdminToken();
  if (!t) return false;
  try {
    const r = await getJson('/api/coach/admin_check', null, {'X-Admin-Token': t});
    return !!(r && r.ok);
  } catch (e) {
    return false;
  }
}

/** 拉取全部角色（含未启用，用于教师端编辑）。 */
export async function listAllCoaches() {
  try {
    return await getJson('/api/coach/list', {all: 1});
  } catch (e) {
    return {ok: false};
  }
}

/** 新建/更新一个 AI 分身（说话逻辑 / 人设）。coach: {id?, name, systemPrompt, ...}。 */
export async function saveCoach(coach) {
  return postJson('/api/coach/save', coach, await authHeader());
}

/** 删除自定义分身（内置不可删）。 */
export async function deleteCoach(id) {
  return postJson('/api/coach/delete', {id}, await authHeader());
}

/** 把相对头像地址补全为可显示的绝对 URL。 */
export function absAvatarUrl(rel) {
  if (!rel) return null;
  return rel.startsWith('http') ? rel : BASE_URL + rel;
}

/** 给某个分身上传头像（本地图片 uri）。 */
export async function uploadAvatar(coachId, uri, mime = 'image/jpeg') {
  const fd = new FormData();
  fd.append('id', coachId);
  fd.append('file', {uri, type: mime, name: 'avatar.jpg'});
  return postForm('/api/coach/upload_avatar', fd, await authHeader());
}

/** 上传一段本人录音，后端自动「大模型声音复刻」生成专属音色并写回 voiceId。 */
export async function cloneVoice(coachId, uri, mime = 'audio/mp4') {
  const fd = new FormData();
  fd.append('id', coachId);
  fd.append('file', {uri, type: mime, name: 'voice.m4a'});
  return postForm('/api/coach/clone_voice', fd, await authHeader());
}

export default {
  getAdminToken,
  setAdminToken,
  clearAdminToken,
  verifyAndSaveToken,
  hasValidToken,
  listAllCoaches,
  saveCoach,
  deleteCoach,
  absAvatarUrl,
  uploadAvatar,
  cloneVoice,
};
