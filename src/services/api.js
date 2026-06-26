// 轻量 HTTP 封装（fetch），iOS / Android 共用。
import {BASE_URL} from './config';

const TIMEOUT_MS = 15000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

export async function postJson(path, body) {
  const res = await withTimeout(
    fetch(BASE_URL + path, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body || {}),
    }),
    TIMEOUT_MS,
  );
  return res.json();
}

export async function getJson(path, params) {
  const qs = params
    ? '?' +
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    : '';
  const res = await withTimeout(fetch(BASE_URL + path + qs), TIMEOUT_MS);
  return res.json();
}
