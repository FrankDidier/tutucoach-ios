#import <React/RCTBridgeModule.h>
// WechatOpenSDK-XCFramework 2.0.4 头文件是扁平目录（2.0.5 才支持 <WechatOpenSDK/WXApi.h> 模块化形式），
// 这里用引号形式，依赖 Pod 暴露的 Headers 搜索路径。
#import "WXApi.h"

// 微信能力桥接：登录(SendAuthReq) / 支付(PayReq) / 分享(SendMessageToWXReq)。
// 回调通过 AppDelegate 转发的通知进入 WXApi handleOpenURL/handleOpenUniversalLink。
@interface RNWeChat : NSObject <RCTBridgeModule, WXApiDelegate>
@end
