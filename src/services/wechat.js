// 微信能力（登录/支付/分享）原生桥接占位（A1/A2/A3）。
//
// iOS / Android 的微信能力依赖原生 SDK（WechatOpenSDK），需通过 React Native 原生模块暴露。
// 待集成原生模块（命名 RNWeChat）后，本文件直接调用；未集成时给出明确提示，不崩溃。
//
// iOS 接入清单（待材料到位后执行）：
//   1) CocoaPods 加 `pod 'WechatOpenSDK-XCFramework'`；
//   2) 在开放平台登记 iOS Bundle ID + Universal Link（见 config.WECHAT_UNIVERSAL_LINK）；
//   3) Info.plist 配 LSApplicationQueriesSchemes(weixin/weixinULAPI) 与 URL Scheme(APP_ID)；
//   4) AppDelegate 处理 openURL / continueUserActivity 回调；
//   5) 写一个 RNWeChat 原生模块导出 registerApp / sendAuthReq / sendPayReq / shareWebpage。
import {NativeModules, Platform} from 'react-native';
import {WECHAT_APP_ID} from './config';
import {wechatLogin} from './account';
import {postJson} from './api';

const RNWeChat = NativeModules.RNWeChat || null;

export function isWeChatBridgeReady() {
  return !!RNWeChat;
}

export async function registerWeChat() {
  if (!RNWeChat) return false;
  return RNWeChat.registerApp(WECHAT_APP_ID);
}

/** 登录：唤起授权 → 拿 code → 交后端换 OpenID。返回后端账号结果。 */
export async function loginWithWeChat(deviceId) {
  if (!RNWeChat) {
    return {ok: false, error: 'wechat_bridge_missing', message: '微信原生模块未集成'};
  }
  const {code} = await RNWeChat.sendAuthReq('snsapi_userinfo', 'tutu_login');
  if (!code) return {ok: false, error: 'auth_cancelled', message: '已取消授权'};
  return wechatLogin(code, deviceId);
}

/** 微信支付：后端统一下单(/api/pay/wechat/create_order) → 唤起微信。plan=yearly/monthly。 */
export async function payWithWeChat(plan, userId) {
  const order = await postJson('/api/pay/wechat/create_order', {plan, user_id: userId});
  if (!order || !order.ok) {
    if (order && order.error === 'wechat_pay_not_configured') {
      return {ok: false, message: '微信支付暂未开通（待配置 APIv3 密钥）'};
    }
    return {ok: false, message: '下单失败，请重试'};
  }
  if (!RNWeChat) {
    return {ok: false, error: 'wechat_bridge_missing', message: '微信原生模块未集成'};
  }
  const res = await RNWeChat.sendPayReq({
    appId: order.appid,
    partnerId: order.partnerid,
    prepayId: order.prepayid,
    packageValue: order.package,
    nonceStr: order.noncestr,
    timeStamp: order.timestamp,
    sign: order.sign,
  });
  return {ok: !!(res && res.ok), message: res && res.message, outTradeNo: order.out_trade_no};
}

/** 分享网页（无需密钥即可用）。toTimeline=true 发朋友圈。 */
export async function shareWebPage(url, title, desc, toTimeline = false) {
  if (!RNWeChat) {
    return {ok: false, error: 'wechat_bridge_missing'};
  }
  return RNWeChat.shareWebpage({url, title, desc, scene: toTimeline ? 1 : 0});
}

export const platformLabel = Platform.OS;
