// 稳定设备/用户标识。
// iOS: identifierForVendor；Android: Android ID。RN 端可用 react-native-device-info 取得，
// 这里提供纯 JS 兜底（生成并应持久化到本地存储），保证服务层可独立测试。
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

/** 取当前设备 ID；若原生层尚未注入，则用一次性 UUID 兜底（需持久化）。 */
export function getDeviceId() {
  if (!cachedId) cachedId = uuidv4();
  return cachedId;
}
