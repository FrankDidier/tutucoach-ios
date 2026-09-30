// 已选 AI 教练的本地存储 —— 对应安卓 ParameterPrefs/coach_profile_id。
import {getItem, setItem} from './storage';
import {builtInProfiles, getDefaultProfile} from '../utils/coachProfiles';

const K_COACH = 'coach_profile_id';
const K_VOICE_ENABLED = 'ai_voice_enabled';
const K_AVATAR_CACHE_PREFIX = 'companion_avatar_uri:';
const K_AVATAR_THUMB_PREFIX = 'companion_avatar_thumb:';
const K_PROFILE_CACHE_PREFIX = 'companion_profile:';

// 进陪练页的第一帧就能用，不用再等 AsyncStorage。
const memPhoto = {coachId: null, uri: null, thumb: null};

export function peekCompanionPhoto() {
  return memPhoto;
}

export function rememberCompanionPhoto(coachId, uri, thumb) {
  if (coachId) memPhoto.coachId = coachId;
  if (uri) memPhoto.uri = String(uri);
  if (thumb && String(thumb).startsWith('data:image')) memPhoto.thumb = thumb;
}

/** 进门先用的小图。同一张照片，体积大约是清楚图的十分之一。 */
export function previewAvatarUrl(uri) {
  if (!uri || !String(uri).startsWith('http')) return null;
  const s = String(uri);
  if (/[?&]p=1(&|$)/.test(s)) return s;
  return s + (s.includes('?') ? '&' : '?') + 'p=1';
}

export async function getSelectedCoachId() {
  return (await getItem(K_COACH)) || 'coach_pro';
}

export async function setSelectedCoachId(id) {
  if (id) await setItem(K_COACH, id);
}

/** 上次成功加载的分身全屏/头像 URL，进陪练可瞬时铺上，避免等网络。 */
export async function getCachedCoachAvatarUri(coachId) {
  if (!coachId) return null;
  return (await getItem(K_AVATAR_CACHE_PREFIX + coachId)) || null;
}

export async function setCachedCoachAvatarUri(coachId, uri) {
  if (!coachId || !uri) return;
  await setItem(K_AVATAR_CACHE_PREFIX + coachId, String(uri));
}

/** 上次已经看过的小图，下次进陪练不用等网络。 */
export async function getCachedCoachAvatarThumb(coachId) {
  if (!coachId) return null;
  const v = await getItem(K_AVATAR_THUMB_PREFIX + coachId);
  return v && String(v).startsWith('data:image') ? v : null;
}

export async function rememberCoachAvatarThumb(coachId, uri) {
  if (!coachId || !uri) return;
  try {
    const preview = previewAvatarUrl(uri);
    if (!preview) return;
    const res = await fetch(preview);
    if (!res.ok) return;
    const blob = await res.blob();
    if (!blob || blob.size < 400 || blob.size > 180000) return;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('thumb'));
      reader.readAsDataURL(blob);
    });
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image') && dataUrl.length < 250000) {
      await setItem(K_AVATAR_THUMB_PREFIX + coachId, dataUrl);
      rememberCompanionPhoto(coachId, uri, dataUrl);
    }
  } catch (e) {}
}

/**
 * 上次成功加载的分身核心资料（开场问候语 / 说话语言 / 名称 / 语速音高 / 音色）。
 * 自定义分身(刁王/海马濑人)不在内置列表里，进陪练若只靠内置兜底会说 coach_pro 的默认开场白。
 * 缓存后：第二次起进陪练可瞬时拿到正确的开场白与语言，即使服务器慢/断网也不回退成默认。
 */
export async function getCachedCoachProfile(coachId) {
  if (!coachId) return null;
  try {
    const raw = await getItem(K_PROFILE_CACHE_PREFIX + coachId);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export async function setCachedCoachProfile(coachId, profile) {
  if (!coachId || !profile) return;
  try {
    await setItem(
      K_PROFILE_CACHE_PREFIX + coachId,
      JSON.stringify({
        displayName: profile.displayName,
        greeting: profile.greeting,
        speakLang: profile.speakLang,
        systemPrompt: profile.systemPrompt,
        speechRate: profile.speechRate,
        pitch: profile.pitch,
        voiceId: profile.voiceId,
      }),
    );
  } catch (e) {}
}

// 返回内置角色的语音配置（语速/音高），找不到则用默认。
export function profileById(id) {
  return builtInProfiles.find(p => p.id === id) || getDefaultProfile();
}

// AI 语音播报开关（铃声弹窗顶部「AI语音播报」），默认开启。
export async function isVoiceEnabled() {
  const v = await getItem(K_VOICE_ENABLED);
  return v == null ? true : v === '1';
}

export async function setVoiceEnabled(on) {
  await setItem(K_VOICE_ENABLED, on ? '1' : '0');
}

export default {
  getSelectedCoachId,
  setSelectedCoachId,
  getCachedCoachAvatarUri,
  setCachedCoachAvatarUri,
  getCachedCoachProfile,
  setCachedCoachProfile,
  profileById,
  isVoiceEnabled,
  setVoiceEnabled,
};
