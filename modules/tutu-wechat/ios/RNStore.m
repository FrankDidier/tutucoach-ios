#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// TutuStoreKit 是 Swift 写的（StoreKit 2 只有 Swift 接口），这里按 ObjC 运行时名字调用。
@protocol TutuStoreKitAPI <NSObject>
+ (void)startObserving:(void (^)(NSDictionary *))onTransaction;
+ (void)products:(NSArray<NSString *> *)ids completion:(void (^)(NSArray *, NSString *))completion;
+ (void)purchase:(NSString *)productId
    accountToken:(NSString *)token
      completion:(void (^)(NSDictionary *, NSString *))completion;
+ (void)restore:(BOOL)sync completion:(void (^)(NSArray *, NSString *))completion;
@end

@interface RNStore : RCTEventEmitter <RCTBridgeModule>
@end

@implementation RNStore {
  BOOL _listening;
}

RCT_EXPORT_MODULE(RNStore);

+ (BOOL)requiresMainQueueSetup { return NO; }

- (NSArray<NSString *> *)supportedEvents { return @[@"storeTransaction"]; }

- (void)startObserving { _listening = YES; }
- (void)stopObserving { _listening = NO; }

static Class<TutuStoreKitAPI> Kit(void) {
  return (Class<TutuStoreKitAPI>)NSClassFromString(@"TutuStoreKit");
}

RCT_EXPORT_METHOD(listen:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  Class<TutuStoreKitAPI> kit = Kit();
  if (!kit) {
    reject(@"no_storekit", @"StoreKit 不可用", nil);
    return;
  }
  __weak RNStore *weakSelf = self;
  [kit startObserving:^(NSDictionary *tx) {
    RNStore *me = weakSelf;
    if (me && me->_listening) [me sendEventWithName:@"storeTransaction" body:tx];
  }];
  resolve(@(YES));
}

RCT_EXPORT_METHOD(products:(NSArray<NSString *> *)ids
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  Class<TutuStoreKitAPI> kit = Kit();
  if (!kit) {
    reject(@"no_storekit", @"StoreKit 不可用", nil);
    return;
  }
  [kit products:ids completion:^(NSArray *list, NSString *err) {
    if (list) resolve(list);
    else reject(@"products_failed", err ?: @"无法获取商品", nil);
  }];
}

RCT_EXPORT_METHOD(purchase:(NSString *)productId
                  accountToken:(NSString *)token
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  Class<TutuStoreKitAPI> kit = Kit();
  if (!kit) {
    reject(@"no_storekit", @"StoreKit 不可用", nil);
    return;
  }
  [kit purchase:productId accountToken:token completion:^(NSDictionary *tx, NSString *err) {
    if (tx) resolve(tx);
    else reject(err ?: @"failed", err ?: @"购买失败", nil);
  }];
}

RCT_EXPORT_METHOD(restore:(BOOL)sync
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  Class<TutuStoreKitAPI> kit = Kit();
  if (!kit) {
    reject(@"no_storekit", @"StoreKit 不可用", nil);
    return;
  }
  [kit restore:sync completion:^(NSArray *list, NSString *err) {
    resolve(@{@"transactions": list ?: @[], @"error": err ?: @""});
  }];
}

@end
