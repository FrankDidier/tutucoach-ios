// 已选 AI 教练的本地存储 —— 对应安卓 ParameterPrefs/coach_profile_id。
import {getItem, setItem} from './storage';
import {builtInProfiles, getDefaultProfile} from '../utils/coachProfiles';

const K_COACH = 'coach_profile_id';
const K_VOICE_ENABLED = 'ai_voice_enabled';

export async function getSelectedCoachId() {
  return (await getItem(K_COACH)) || 'coach_pro';
}

export async function setSelectedCoachId(id) {
  if (id) await setItem(K_COACH, id);
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
  profileById,
  isVoiceEnabled,
  setVoiceEnabled,
};
