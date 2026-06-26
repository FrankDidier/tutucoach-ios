#import <React/RCTViewManager.h>
#import "TutuDetectorView.h"

// 暴露 TutuDetectorView 给 React Native（旧式 ViewManager，新架构经互操作层可用）。
@interface TutuDetectorViewManager : RCTViewManager
@end

@implementation TutuDetectorViewManager

RCT_EXPORT_MODULE(TutuDetectorView);

- (UIView *)view {
  return [[TutuDetectorView alloc] init];
}

RCT_EXPORT_VIEW_PROPERTY(active, BOOL)
RCT_EXPORT_VIEW_PROPERTY(onResult, RCTBubblingEventBlock)

@end
