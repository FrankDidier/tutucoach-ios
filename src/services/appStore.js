// iOS 会员：App Store 自动续期订阅（StoreKit 2）。交易交给服务器校验后开通会员。
import {NativeEventEmitter, NativeModules, Platform} from 'react-native';
import {postJson} from './api';
import {getDeviceId} from './device';

const Native = Platform.OS === 'ios' ? NativeModules.RNStore || null : null;

export const APPLE_PRODUCTS = {
  yearly: 'com.tutucoach.member.yearly',
  quarterly: 'com.tutucoach.member.quarterly',
  monthly: 'com.tutucoach.member.monthly',
};

const PLAN_OF = Object.fromEntries(Object.entries(APPLE_PRODUCTS).map(([k, v]) => [v, k]));

export function isAppStoreReady() {
  return !!Native;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** {yearly: {displayPrice, price, ...}, ...}；拿不到时返回 {} */
export async function loadProducts() {
  if (!Native) return {};
  try {
    const list = await Native.products(Object.values(APPLE_PRODUCTS));
    const out = {};
    (list || []).forEach(p => {
      if (PLAN_OF[p.id]) out[PLAN_OF[p.id]] = p;
    });
    return out;
  } catch (e) {
    return {};
  }
}

async function verify(transactions) {
  const jws = (transactions || []).map(t => t && t.jws).filter(Boolean);
  if (!jws.length) return {ok: false, error: 'no_transactions'};
  for (let i = 0; i < 3; i++) {
    try {
      return await postJson('/api/pay/apple/verify', {user_id: getDeviceId(), transactions: jws});
    } catch (e) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return {ok: false, error: 'network'};
}

export async function buy(plan) {
  if (!Native) return {ok: false, message: '本机暂不支持 App Store 购买'};
  const productId = APPLE_PRODUCTS[plan];
  if (!productId) return {ok: false, message: '套餐不存在'};
  let tx = null;
  try {
    const id = getDeviceId();
    tx = await Native.purchase(productId, UUID_RE.test(id || '') ? id : null);
  } catch (e) {
    const code = String((e && e.code) || '');
    if (code === 'cancelled') return {ok: false, cancelled: true, message: '已取消购买'};
    if (code === 'pending') return {ok: false, pending: true, message: '购买等待确认（例如家长批准），确认后会自动开通'};
    if (code === 'not_found') return {ok: false, message: '暂时拿不到这个套餐，请稍后再试'};
    return {ok: false, message: '购买没有完成，请稍后重试'};
  }
  const r = await verify([tx]);
  if (r && r.ok) return {ok: true, membership: r};
  return {ok: false, paid: true, message: '已付款，会员开通稍慢。请稍后在本页点「恢复购买」。'};
}

/** 恢复购买：同步 App Store，把当前有效的订阅交给服务器。 */
export async function restore(sync = true) {
  if (!Native) return {ok: false, message: '本机暂不支持 App Store 购买'};
  let res = null;
  try {
    res = await Native.restore(!!sync);
  } catch (e) {
    return {ok: false, message: '恢复购买没有完成，请稍后重试'};
  }
  const list = (res && res.transactions) || [];
  if (!list.length) return {ok: false, none: true, message: '这个 Apple ID 下没有有效的会员订阅'};
  const r = await verify(list);
  if (r && r.ok) return {ok: true, membership: r};
  return {ok: false, message: '恢复购买没有完成，请稍后重试'};
}

let listening = false;

/** 启动时调用：续费、家长批准后到账的交易也交给服务器；顺便把已有订阅同步一次。 */
export function startStoreListener() {
  if (!Native || listening) return;
  listening = true;
  try {
    const emitter = new NativeEventEmitter(Native);
    emitter.addListener('storeTransaction', tx => {
      verify([tx]).catch(() => {});
    });
    Native.listen().catch(() => {});
    restore(false).catch(() => {});
  } catch (e) {}
}
