// 已选 AI 教练的本地存储 —— 对应安卓 ParameterPrefs/coach_profile_id。
import {getItem, setItem} from './storage';
import {builtInProfiles, getDefaultProfile} from '../utils/coachProfiles';

const K_COACH = 'coach_profile_id';
const K_VOICE_ENABLED = 'ai_voice_enabled';
const K_AVATAR_CACHE_PREFIX = 'companion_avatar_uri:';

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
  profileById,
  isVoiceEnabled,
  setVoiceEnabled,
};
