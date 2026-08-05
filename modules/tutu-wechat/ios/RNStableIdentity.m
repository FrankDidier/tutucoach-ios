#import "RNStableIdentity.h"
#import <Security/Security.h>

static NSString *const kService = @"com.impit.tutucoach.stable_id";

@implementation RNStableIdentity

RCT_EXPORT_MODULE(RNStableIdentity);

+ (BOOL)requiresMainQueueSetup { return NO; }

static NSMutableDictionary *query(NSString *key) {
  return [@{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: kService,
    (__bridge id)kSecAttrAccount: key ?: @"",
  } mutableCopy];
}

RCT_EXPORT_METHOD(getPersistedId:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (key.length == 0) {
    resolve([NSNull null]);
    return;
  }
  NSMutableDictionary *q = query(key);
  q[(__bridge id)kSecReturnData] = @YES;
  q[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
  CFTypeRef result = NULL;
  OSStatus st = SecItemCopyMatching((__bridge CFDictionaryRef)q, &result);
  if (st == errSecSuccess && result) {
    NSData *data = (__bridge_transfer NSData *)result;
    NSString *val = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    resolve(val ?: [NSNull null]);
    return;
  }
  resolve([NSNull null]);
}

RCT_EXPORT_METHOD(setPersistedId:(NSString *)key
                  value:(NSString *)value
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (key.length == 0 || value.length == 0) {
    resolve(@NO);
    return;
  }
  NSData *data = [value dataUsingEncoding:NSUTF8StringEncoding];
  NSMutableDictionary *q = query(key);
  // 先删后写，保证幂等覆盖。
  SecItemDelete((__bridge CFDictionaryRef)q);
  q[(__bridge id)kSecValueData] = data;
  // 解锁后本机可访问；卸载 App 后 Keychain 项仍保留（系统默认行为）。
  q[(__bridge id)kSecAttrAccessible] = (__bridge id)kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly;
  OSStatus st = SecItemAdd((__bridge CFDictionaryRef)q, NULL);
  resolve(@(st == errSecSuccess || st == errSecDuplicateItem));
}

@end
