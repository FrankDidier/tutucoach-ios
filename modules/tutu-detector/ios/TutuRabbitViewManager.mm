#import <React/RCTViewManager.h>
#import "TutuRabbitView.h"

// 暴露 TutuRabbitView 给 React Native（旧式 ViewManager，新架构经互操作层可用）。
@interface TutuRabbitViewManager : RCTViewManager
@end

@implementation TutuRabbitViewManager

RCT_EXPORT_MODULE(TutuRabbitView);

- (UIView *)view {
  return [[TutuRabbitView alloc] init];
}

RCT_EXPORT_VIEW_PROPERTY(action, NSString)

@end
