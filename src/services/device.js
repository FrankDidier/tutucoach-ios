// 稳定设备/用户标识。
// iOS: identifierForVendor；Android: Android ID。RN 端可用 react-native-device-info 取得，
// 这里提供纯 JS 兜底：首次生成后持久化到本地存储，保证「同一台设备 = 同一个 user_id」，
// 否则每次启动都换 ID，会导致会员/练习记录/入班绑定全部对不上。
import {getItem, setItem} from './storage';

const K_DEVICE_ID = 'device_id';
let cachedId = null;

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 注入由原生层（identifierForVendor / Android ID）取得的真实 ID。 */
export function setDeviceId(id) {
  if (id) cachedId = id;
  return cachedId;
}

/**
 * 启动时调用一次：从本地读取已持久化的设备 ID；没有则生成并保存。
 * 之后 getDeviceId() 同步返回这个稳定值。
 */
export async function initDeviceId() {
  if (cachedId) return cachedId;
  try {
    let id = await getItem(K_DEVICE_ID);
    if (!id) {
      id = uuidv4();
      await setItem(K_DEVICE_ID, id);
    }
    cachedId = id;
  } catch (e) {
    if (!cachedId) cachedId = uuidv4();
  }
  return cachedId;
}

/** 取当前设备 ID；若 init 尚未完成，用一次性 UUID 兜底（应尽量在 init 之后调用）。 */
export function getDeviceId() {
  if (!cachedId) cachedId = uuidv4();
  return cachedId;
}
