// 通过 Apple 登录（Guideline 4.8）：和微信登录一样换成同一个兔兔账号，本机数据会合并过去。
import {NativeModules, Platform} from 'react-native';
import {postJson} from './api';
import {adoptUserId, getDeviceId, getPreviousUserId} from './device';

const Native = Platform.OS === 'ios' ? NativeModules.RNAppleAuth || null : null;

export function isAppleSignInReady() {
  return !!Native;
}

export async function loginWithApple() {
  if (!Native) return {ok: false, message: '本机暂不支持通过 Apple 登录'};
  let cred = null;
  try {
    cred = await Native.signIn();
  } catch (e) {
    if (e && e.code === 'cancelled') return {ok: false, cancelled: true, message: '已取消'};
    return {ok: false, message: '通过 Apple 登录没有完成，请重试'};
  }
  if (!cred || !cred.identityToken) return {ok: false, message: '没有拿到 Apple 登录凭证'};
  const prefer = (await getPreviousUserId()) || getDeviceId() || '';
  const res = await postJson('/api/account/apple_login', {
    identity_token: cred.identityToken,
    device_id: getDeviceId(),
    prefer_user_id: prefer,
    name: cred.fullName || '',
  });
  if (res && res.ok && res.user && res.user.user_id) {
    await adoptUserId(res.user.user_id);
    return res;
  }
  return {ok: false, message: (res && res.message) || '通过 Apple 登录没有完成，请重试'};
}
