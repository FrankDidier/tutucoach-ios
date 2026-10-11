// AI 功能的数据授权（Guideline 5.1.1(i) / 5.1.2(i)）：
// 先告诉用户哪些数据会发给哪几家第三方 AI 服务，用户同意后才使用 AI 功能。
import {getItem, setItem} from './storage';
import {postJson} from './api';
import {getDeviceId} from './device';

const KEY = 'ai_consent_v1';
let cached = null;
let host = null;
let waiting = [];

export async function getAiConsent() {
  if (cached === null) cached = (await getItem(KEY)) || '';
  return cached;
}

export async function setAiConsent(value) {
  cached = value ? 'yes' : 'no';
  await setItem(KEY, cached);
  postJson('/api/account/ai_consent', {
    user_id: getDeviceId(),
    consent: cached === 'yes',
    version: 1,
  }).catch(() => {});
}

/** AiConsentHost 挂在 App 根上，负责弹出说明。 */
export function registerConsentHost(show) {
  host = show;
  return () => {
    if (host === show) host = null;
  };
}

/** 弹出说明，用户选完后回调（同意 true / 不同意 false）。 */
export function askAiConsent() {
  return new Promise(resolve => {
    waiting.push(resolve);
    if (waiting.length === 1 && host) host(true);
    else if (!host) answerAiConsent(null);
  });
}

export async function answerAiConsent(agreed) {
  if (agreed !== null) await setAiConsent(agreed);
  const list = waiting;
  waiting = [];
  if (host) host(false);
  list.forEach(r => r(agreed === true));
}

/** 进入 AI 功能前调用：已同意直接放行，否则弹说明。 */
export async function ensureAiConsent() {
  if ((await getAiConsent()) === 'yes') return true;
  return askAiConsent();
}
