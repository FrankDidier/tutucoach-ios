// 轻量 HTTP 封装（fetch），iOS / Android 共用。
import {BASE_URL} from './config';

const TIMEOUT_MS = 15000;
// 文件上传（头像 / 声音复刻）更慢：声音复刻服务端还要调百度，给足 120s。
const UPLOAD_TIMEOUT_MS = 120000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

export async function postJson(path, body, headers) {
  const res = await withTimeout(
    fetch(BASE_URL + path, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...(headers || {})},
      body: JSON.stringify(body || {}),
    }),
    TIMEOUT_MS,
  );
  return res.json();
}

export async function getJson(path, params, headers) {
  const qs = params
    ? '?' +
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    : '';
  const res = await withTimeout(
    fetch(BASE_URL + path + qs, headers ? {headers} : undefined),
    TIMEOUT_MS,
  );
  return res.json();
}

// 上传 multipart/form-data（不要手动设置 Content-Type，交给 fetch 自动带 boundary）。
export async function postForm(path, formData, headers) {
  const res = await withTimeout(
    fetch(BASE_URL + path, {
      method: 'POST',
      headers: {...(headers || {})},
      body: formData,
    }),
    UPLOAD_TIMEOUT_MS,
  );
  return res.json();
}
