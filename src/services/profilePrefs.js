// 个人资料本地存储 —— 对应安卓 ProfilePrefs（display_name / 头像文件）。
import {getItem, setItem} from './storage';

const K = {
  displayName: 'profile_display_name',
  avatarUri: 'profile_avatar_uri',
  teacherAvatarUri: 'teacher_avatar_uri',
};

export const DEFAULT_DISPLAY_NAME = '钢琴小达人'; // 与安卓默认一致

export async function getDisplayName() {
  return (await getItem(K.displayName)) || DEFAULT_DISPLAY_NAME;
}

export async function setDisplayName(name) {
  await setItem(K.displayName, name && name.trim() ? name.trim() : DEFAULT_DISPLAY_NAME);
}

export async function getAvatarUri() {
  return (await getItem(K.avatarUri)) || null;
}

export async function setAvatarUri(uri) {
  if (uri) await setItem(K.avatarUri, uri);
}

export async function getTeacherAvatarUri() {
  return (await getItem(K.teacherAvatarUri)) || null;
}

export async function setTeacherAvatarUri(uri) {
  if (uri) await setItem(K.teacherAvatarUri, uri);
}

export default {
  getDisplayName,
  setDisplayName,
  getAvatarUri,
  setAvatarUri,
  getTeacherAvatarUri,
  setTeacherAvatarUri,
  DEFAULT_DISPLAY_NAME,
};
