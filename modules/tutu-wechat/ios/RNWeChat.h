#import <React/RCTBridgeModule.h>
#import <WechatOpenSDK/WXApi.h>

// 微信能力桥接：登录(SendAuthReq) / 支付(PayReq) / 分享(SendMessageToWXReq)。
// 回调通过 AppDelegate 转发的通知进入 WXApi handleOpenURL/handleOpenUniversalLink。
@interface RNWeChat : NSObject <RCTBridgeModule, WXApiDelegate>
@end
