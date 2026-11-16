import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'privacy_agreed_v1';

let cached = null;

export async function privacyAgreed() {
  if (cached != null) return cached;
  try {
    const v = await AsyncStorage.getItem(KEY);
    cached = v === '1';
  } catch (_) {
    cached = false;
  }
  return cached;
}

export async function setPrivacyAgreed(yes) {
  cached = !!yes;
  try {
    await AsyncStorage.setItem(KEY, yes ? '1' : '0');
  } catch (_) {}
}

export function privacyAgreedSync() {
  return !!cached;
}
