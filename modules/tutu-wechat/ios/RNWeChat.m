#import "RNWeChat.h"

// 与 AppDelegate 解耦：AppDelegate 收到 openURL / Universal Link 时只发通知，
// 本模块监听后再交给 WXApi 解析，避免 AppDelegate 直接依赖微信头文件。
static NSString *const kRNWeChatOpenURL = @"RNWeChatHandleOpenURL";
static NSString *const kRNWeChatUniversalLink = @"RNWeChatHandleUniversalLink";

@interface RNWeChat ()
@property(nonatomic, copy) RCTPromiseResolveBlock authResolve;
@property(nonatomic, copy) RCTPromiseRejectBlock authReject;
@property(nonatomic, copy) RCTPromiseResolveBlock payResolve;
@property(nonatomic, copy) RCTPromiseRejectBlock payReject;
@property(nonatomic, copy) RCTPromiseResolveBlock shareResolve;
@property(nonatomic, copy) RCTPromiseRejectBlock shareReject;
@end

@implementation RNWeChat

RCT_EXPORT_MODULE(RNWeChat);

+ (BOOL)requiresMainQueueSetup { return YES; }

- (instancetype)init {
  if (self = [super init]) {
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleOpenURLNote:)
                                                 name:kRNWeChatOpenURL
                                               object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleUniversalLinkNote:)
                                                 name:kRNWeChatUniversalLink
                                               object:nil];
  }
  return self;
}

- (void)dealloc {
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)handleOpenURLNote:(NSNotification *)note {
  NSURL *url = note.object;
  if ([url isKindOfClass:[NSURL class]]) {
    [WXApi handleOpenURL:url delegate:self];
  }
}

- (void)handleUniversalLinkNote:(NSNotification *)note {
  NSUserActivity *activity = note.object;
  if ([activity isKindOfClass:[NSUserActivity class]]) {
    [WXApi handleOpenUniversalLink:activity delegate:self];
  }
}

#pragma mark - Exported

RCT_EXPORT_METHOD(registerApp:(NSString *)appId
                  universalLink:(NSString *)universalLink
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  BOOL ok = [WXApi registerApp:appId universalLink:universalLink];
  resolve(@(ok));
}

RCT_EXPORT_METHOD(isWXAppInstalled:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@([WXApi isWXAppInstalled]));
}

RCT_EXPORT_METHOD(sendAuthReq:(NSString *)scope
                  state:(NSString *)state
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (![WXApi isWXAppInstalled]) {
    reject(@"no_wechat", @"未安装微信", nil);
    return;
  }
  self.authResolve = resolve;
  self.authReject = reject;
  SendAuthReq *req = [[SendAuthReq alloc] init];
  req.scope = scope.length ? scope : @"snsapi_userinfo";
  req.state = state.length ? state : @"tutu_login";
  [WXApi sendReq:req completion:nil];
}

RCT_EXPORT_METHOD(sendPayReq:(NSDictionary *)params
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  self.payResolve = resolve;
  self.payReject = reject;
  PayReq *req = [[PayReq alloc] init];
  req.partnerId = params[@"partnerId"];
  req.prepayId = params[@"prepayId"];
  req.nonceStr = params[@"nonceStr"];
  req.timeStamp = (UInt32)[[NSString stringWithFormat:@"%@", params[@"timeStamp"]] longLongValue];
  req.package = params[@"packageValue"];
  req.sign = params[@"sign"];
  [WXApi sendReq:req completion:nil];
}

RCT_EXPORT_METHOD(shareWebpage:(NSDictionary *)params
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  self.shareResolve = resolve;
  self.shareReject = reject;
  WXWebpageObject *webpage = [WXWebpageObject object];
  webpage.webpageUrl = params[@"url"];
  WXMediaMessage *message = [WXMediaMessage message];
  message.title = params[@"title"];
  message.description = params[@"desc"];
  message.mediaObject = webpage;
  SendMessageToWXReq *req = [[SendMessageToWXReq alloc] init];
  req.bText = NO;
  req.message = message;
  req.scene = (int)[params[@"scene"] integerValue];
  [WXApi sendReq:req completion:nil];
}

#pragma mark - WXApiDelegate

- (void)onReq:(BaseReq *)req {}

- (void)onResp:(BaseResp *)resp {
  if ([resp isKindOfClass:[SendAuthResp class]]) {
    SendAuthResp *r = (SendAuthResp *)resp;
    RCTPromiseResolveBlock resolve = self.authResolve;
    RCTPromiseRejectBlock reject = self.authReject;
    self.authResolve = nil;
    self.authReject = nil;
    if (r.errCode == WXSuccess && r.code.length > 0) {
      if (resolve) resolve(@{@"code": r.code, @"state": r.state ?: @""});
    } else if (resolve) {
      // 取消/失败也用 resolve 返回空 code，JS 侧据此提示，避免未捕获 reject。
      resolve(@{@"code": @"", @"errCode": @(r.errCode)});
    }
  } else if ([resp isKindOfClass:[PayResp class]]) {
    PayResp *r = (PayResp *)resp;
    RCTPromiseResolveBlock resolve = self.payResolve;
    self.payResolve = nil;
    self.payReject = nil;
    if (resolve) resolve(@{@"ok": @(r.errCode == WXSuccess), @"errCode": @(r.errCode)});
  } else if ([resp isKindOfClass:[SendMessageToWXResp class]]) {
    RCTPromiseResolveBlock resolve = self.shareResolve;
    self.shareResolve = nil;
    self.shareReject = nil;
    if (resolve) resolve(@{@"ok": @(resp.errCode == WXSuccess), @"errCode": @(resp.errCode)});
  }
}

@end
