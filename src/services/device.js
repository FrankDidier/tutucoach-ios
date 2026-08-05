// 稳定设备/用户标识。
//
// 优先级（高→低）：
//   1) 微信登录固化的主账号 ID（account_id）
//   2) 本机设备 ID（device_id）
//
// 存储双写：
//   - AsyncStorage：同一次安装内快速读写
//   - iOS Keychain（RNStableIdentity）：卸载重装后仍可读回
//     （AsyncStorage 会随 App 删除清空；仅靠 UUID 会导致「重装后 ID/数据全变」）
//
// 微信登录成功后 adoptUserId() 会把服务端主账号写入上述两处，
// 之后 getDeviceId() 返回主账号，会员/练习/入班全部对齐找回。
import {NativeModules, Platform} from 'react-native';
import {getItem, setItem} from './storage';

const K_DEVICE_ID = 'device_id';
const K_ACCOUNT_ID = 'account_id';
let cachedId = null;

const NativeId = NativeModules.RNStableIdentity || null;

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function nativeGet(key) {
  if (!NativeId || typeof NativeId.getPersistedId !== 'function') return null;
  try {
    const v = await NativeId.getPersistedId(key);
    return v && typeof v === 'string' && v.length > 0 ? v : null;
  } catch (e) {
    return null;
  }
}

async function nativeSet(key, value) {
  if (!NativeId || typeof NativeId.setPersistedId !== 'function' || !value) return;
  try {
    await NativeId.setPersistedId(key, value);
  } catch (e) {}
}

/** 注入由原生层取得的真实 ID（测试/外部注入用）。 */
export function setDeviceId(id) {
  if (id) cachedId = id;
  return cachedId;
}

/**
 * 微信登录成功后调用：把服务端返回的主账号 user_id 固化为本机当前身份。
 * 之后 getDeviceId() 立即返回它，会员/练习/入班全部对齐到该主账号。
 */
export async function adoptUserId(id) {
  if (!id) return cachedId;
  cachedId = id;
  try {
    await setItem(K_ACCOUNT_ID, id);
    await setItem(K_DEVICE_ID, id);
  } catch (e) {}
  // Keychain 双写：重装后即使 AsyncStorage 清空，也能读回主账号，再配合微信 openid 合并。
  await nativeSet(K_ACCOUNT_ID, id);
  await nativeSet(K_DEVICE_ID, id);
  return cachedId;
}

/**
 * 启动时调用一次：
 * AsyncStorage → Keychain（跨卸载）→ 新生成。
 * 之后 getDeviceId() 同步返回这个稳定值。
 */
export async function initDeviceId() {
  if (cachedId) return cachedId;
  try {
    // 1) 本次安装内：微信主账号优先
    let id = await getItem(K_ACCOUNT_ID);
    // 2) 跨卸载：Keychain 主账号（曾微信登录过）
    if (!id) id = await nativeGet(K_ACCOUNT_ID);
    // 3) 本次安装内：本机设备 ID
    if (!id) id = await getItem(K_DEVICE_ID);
    // 4) 跨卸载：Keychain 设备 ID（即便从未微信登录，重装也保持同一访客身份）
    if (!id) id = await nativeGet(K_DEVICE_ID);

    if (!id) {
      id = uuidv4();
    }

    cachedId = id;
    // 回写两端，保证下次冷启动/重装都能命中。
    try {
      await setItem(K_DEVICE_ID, id);
      // 若来自 Keychain 的主账号，同步回 AsyncStorage account_id
      const acct = (await getItem(K_ACCOUNT_ID)) || (await nativeGet(K_ACCOUNT_ID));
      if (acct) await setItem(K_ACCOUNT_ID, acct);
    } catch (e) {}
    await nativeSet(K_DEVICE_ID, id);
    if (Platform.OS === 'ios') {
      // account_id 有则再确认写入 Keychain
      const acct = await getItem(K_ACCOUNT_ID);
      if (acct) await nativeSet(K_ACCOUNT_ID, acct);
    }
  } catch (e) {
    if (!cachedId) cachedId = uuidv4();
  }
  return cachedId;
}

/**
 * 取当前设备/账号 ID。
 * 若 init 尚未完成被迫生成兜底值，立刻异步持久化（含 Keychain），
 * 避免「复制出去的 ID」和下次启动不一致。
 */
export function getDeviceId() {
  if (!cachedId) {
    cachedId = uuidv4();
    setItem(K_DEVICE_ID, cachedId).catch(() => {});
    nativeSet(K_DEVICE_ID, cachedId);
  }
  return cachedId;
}
