#import <React/RCTBridgeModule.h>

/**
 * 跨卸载持久化设备/账号 ID（iOS Keychain）。
 * AsyncStorage 随 App 删除清空；Keychain 项默认在卸载后仍保留，
 * 重装后可读回同一 ID，配合微信 openid 找回练习/会员/入班数据。
 */
@interface RNStableIdentity : NSObject <RCTBridgeModule>
@end
