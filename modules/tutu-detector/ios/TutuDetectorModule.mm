#import "TutuDetectorModule.h"
#import "TutuDetectorEngine.h"

// 兔兔教练 手型检测原生模块（iOS）。
// 薄封装：把 JS 调用转发到共享引擎 TutuDetectorEngine。
@implementation TutuDetectorModule

RCT_EXPORT_MODULE(TutuDetector);

+ (BOOL)requiresMainQueueSetup { return NO; }

// 设置角度阈值（默认 20，与安卓一致）。
RCT_EXPORT_METHOD(setAngleThreshold:(double)threshold) {
  [TutuDetectorEngine shared].angleThreshold = (float)threshold;
}

// 仅检测一张图片的 21 关键点（验证 MediaPipe 跑通）。
RCT_EXPORT_METHOD(analyzeImagePath:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSError *error = nil;
  NSDictionary *res = [[TutuDetectorEngine shared] analyzeImagePath:path error:&error];
  if (res == nil) {
    reject(@"detect_failed", error.localizedDescription ?: @"检测失败", error);
    return;
  }
  resolve(res);
}

// 用一张图片设置左右手模板（对应安卓 processTemplateResult）。
RCT_EXPORT_METHOD(setTemplateFromImage:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSError *error = nil;
  NSDictionary *res = [[TutuDetectorEngine shared] setTemplateFromImagePath:path error:&error];
  if (res == nil) {
    reject(@"template_failed", error.localizedDescription ?: @"模板检测失败", error);
    return;
  }
  resolve(res);
}

RCT_EXPORT_METHOD(hasTemplate:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  TutuDetectorEngine *e = [TutuDetectorEngine shared];
  resolve(@{@"hasLeft": @([e hasLeftTemplate]), @"hasRight": @([e hasRightTemplate])});
}

RCT_EXPORT_METHOD(clearTemplates) {
  [[TutuDetectorEngine shared] clearTemplates];
}

// 把当前实时画面定格为模版（手保持正确姿势时调用）。
RCT_EXPORT_METHOD(captureTemplateFromLive:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve([[TutuDetectorEngine shared] captureTemplateFromLastFrame]);
}

@end
