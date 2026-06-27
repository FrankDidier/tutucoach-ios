import {NativeModules} from 'react-native';

// 微信原生模块（iOS: WechatOpenSDK）。
// 方法：registerApp(appId, universalLink) / isWXAppInstalled() /
//       sendAuthReq(scope, state) -> {code,state} / sendPayReq(params) / shareWebpage(params)。
export default NativeModules.RNWeChat;
