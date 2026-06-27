// 教师端口令登录弹窗 —— 对应安卓 TeacherGate。
// 进入教师端前调用：已存口令有效则直接放行；否则弹出输入框校验。
import {Alert, Platform} from 'react-native';
import {hasValidToken, verifyAndSaveToken} from './coachAdmin';

function promptOnce() {
  return new Promise(resolve => {
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
    } else {
      // 非 iOS 暂无系统输入弹窗，提示前往设置（教师端目前以 iOS 为主）。
      Alert.alert('教师登录', '请在 iOS 设备上输入教师管理口令。');
      resolve(null);
    }
  });
}

/**
 * 确保教师身份已解锁。返回 true=可进入；false/null=未通过（调用方应返回上一页）。
 * 口令错误会循环重试，直到成功或用户取消。
 */
export async function ensureTeacherUnlocked() {
  if (await hasValidToken()) return true;
  // 最多尝试 3 次，避免无限弹窗。
  for (let i = 0; i < 3; i++) {
    const r = await promptOnce();
    if (r === null) return false; // 用户取消
    if (r === true) return true;
    Alert.alert('口令不正确', '请重新输入教师管理口令。');
  }
  return false;
}

export default {ensureTeacherUnlocked};
