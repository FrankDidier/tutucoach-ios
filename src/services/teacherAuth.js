// 教师端口令登录弹窗 —— 对应安卓 TeacherGate。
// 进入教师端前调用：已存口令有效则直接放行；否则弹出输入框校验。
import {Alert, Platform} from 'react-native';
import {hasValidToken, verifyAndSaveToken} from './coachAdmin';

let androidPromptImpl = null;

/** RN root can register a modal-based prompt for Android. */
export function registerAndroidTeacherPrompt(fn) {
  androidPromptImpl = typeof fn === 'function' ? fn : null;
}

function promptOnce() {
  return new Promise(resolve => {
    // iOS + Android share TeacherPassModal for 1:1 (Alert.prompt differs visually).
    if (androidPromptImpl) {
      androidPromptImpl({
        onCancel: () => resolve(null),
        onSubmit: async token => {
          const t = (token || '').trim();
          if (!t) {
            resolve(false);
            return;
          }
          const ok = await verifyAndSaveToken(t);
          resolve(ok);
        },
      });
      return;
    }
    if (Platform.OS === 'ios' && Alert.prompt) {
      Alert.prompt(
        '教师登录',
        '请输入教师管理口令',
        [
          {text: '取消', style: 'cancel', onPress: () => resolve(null)},
          {
            text: '登录',
            onPress: async value => {
              const token = (value || '').trim();
              if (!token) {
                resolve(false);
                return;
              }
              const ok = await verifyAndSaveToken(token);
              resolve(ok);
            },
          },
        ],
        'secure-text',
      );
      return;
    }
    Alert.alert('教师登录', '请输入教师管理口令后重试。');
    resolve(null);
  });
}

/**
 * 确保教师身份已解锁。返回 true=可进入；false/null=未通过（调用方应返回上一页）。
 */
export async function ensureTeacherUnlocked() {
  if (await hasValidToken()) return true;
  for (let i = 0; i < 3; i++) {
    const r = await promptOnce();
    if (r === null) return false;
    if (r === true) return true;
    Alert.alert('口令不正确', '请重新输入教师管理口令。');
  }
  return false;
}

export default {ensureTeacherUnlocked, registerAndroidTeacherPrompt};
