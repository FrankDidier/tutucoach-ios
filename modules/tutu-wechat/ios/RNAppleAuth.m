#import <React/RCTBridgeModule.h>
#import <AuthenticationServices/AuthenticationServices.h>
#import <UIKit/UIKit.h>

// 通过 Apple 登录：拿到 identityToken 交给服务器校验，换成同一个兔兔账号。
@interface RNAppleAuth : NSObject <RCTBridgeModule, ASAuthorizationControllerDelegate,
                                   ASAuthorizationControllerPresentationContextProviding>
@property(nonatomic, copy) RCTPromiseResolveBlock resolve;
@property(nonatomic, copy) RCTPromiseRejectBlock reject;
@property(nonatomic, strong) ASAuthorizationController *controller;
@end

@implementation RNAppleAuth

RCT_EXPORT_MODULE(RNAppleAuth);

+ (BOOL)requiresMainQueueSetup { return NO; }

- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }

RCT_EXPORT_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@(YES));
}

RCT_EXPORT_METHOD(signIn:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  if (self.resolve) {
    reject(@"busy", @"正在登录", nil);
    return;
  }
  self.resolve = resolve;
  self.reject = reject;
  ASAuthorizationAppleIDRequest *request = [[ASAuthorizationAppleIDProvider new] createRequest];
  request.requestedScopes = @[ASAuthorizationScopeFullName, ASAuthorizationScopeEmail];
  self.controller = [[ASAuthorizationController alloc] initWithAuthorizationRequests:@[request]];
  self.controller.delegate = self;
  self.controller.presentationContextProvider = self;
  [self.controller performRequests];
}

- (void)finishWith:(NSDictionary *)result error:(NSString *)code message:(NSString *)message {
  RCTPromiseResolveBlock resolve = self.resolve;
  RCTPromiseRejectBlock reject = self.reject;
  self.resolve = nil;
  self.reject = nil;
  self.controller = nil;
  if (result && resolve) resolve(result);
  else if (reject) reject(code ?: @"failed", message ?: @"登录失败", nil);
}

- (void)authorizationController:(ASAuthorizationController *)controller
    didCompleteWithAuthorization:(ASAuthorization *)authorization {
  ASAuthorizationAppleIDCredential *cred = (ASAuthorizationAppleIDCredential *)authorization.credential;
  if (![cred isKindOfClass:[ASAuthorizationAppleIDCredential class]] || !cred.identityToken) {
    [self finishWith:nil error:@"no_token" message:@"没有拿到 Apple 登录凭证"];
    return;
  }
  NSString *token = [[NSString alloc] initWithData:cred.identityToken encoding:NSUTF8StringEncoding] ?: @"";
  NSString *code = cred.authorizationCode
      ? ([[NSString alloc] initWithData:cred.authorizationCode encoding:NSUTF8StringEncoding] ?: @"")
      : @"";
  NSPersonNameComponents *n = cred.fullName;
  NSString *name = @"";
  if (n) {
    name = [NSString stringWithFormat:@"%@%@", n.familyName ?: @"", n.givenName ?: @""];
  }
  [self finishWith:@{
    @"identityToken": token,
    @"authorizationCode": code,
    @"user": cred.user ?: @"",
    @"email": cred.email ?: @"",
    @"fullName": name,
  } error:nil message:nil];
}

- (void)authorizationController:(ASAuthorizationController *)controller
           didCompleteWithError:(NSError *)error {
  BOOL cancelled = error.code == ASAuthorizationErrorCanceled;
  [self finishWith:nil
             error:cancelled ? @"cancelled" : @"failed"
           message:cancelled ? @"已取消" : (error.localizedDescription ?: @"登录失败")];
}

- (ASPresentationAnchor)presentationAnchorForAuthorizationController:(ASAuthorizationController *)controller {
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:[UIWindowScene class]]) continue;
    for (UIWindow *w in ((UIWindowScene *)scene).windows) {
      if (w.isKeyWindow) return w;
    }
  }
  return UIApplication.sharedApplication.windows.firstObject;
}

@end
