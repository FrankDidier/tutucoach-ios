// 本地持久化封装 —— 对应安卓 SharedPreferences。
// 懒加载 AsyncStorage，未安装时退化为内存存储（保证 JS 不崩）。
let AsyncStorage = null;
const mem = {};
try {
  // eslint-disable-next-line global-require
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (e) {
  AsyncStorage = null;
}

export async function getItem(key) {
  if (AsyncStorage) {
    try {
      return await AsyncStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  return key in mem ? mem[key] : null;
}

export async function setItem(key, value) {
  if (AsyncStorage) {
    try {
      await AsyncStorage.setItem(key, String(value));
    } catch (e) {}
    return;
  }
  mem[key] = String(value);
}

export async function getJson(key, fallback = null) {
  const raw = await getItem(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

export async function setJson(key, value) {
  await setItem(key, JSON.stringify(value));
}

export async function getNumber(key, fallback = 0) {
  const raw = await getItem(key);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isNaN(n) ? fallback : n;
}

export default {getItem, setItem, getJson, setJson, getNumber};
