#import <UIKit/UIKit.h>

// 原生兔子动画视图：用 ImageIO(CGAnimateImageAtURLWithBlock) 逐帧硬件播放打包进 App 的
// APNG（rabbit-<action>.apng），与安卓端 WebP 动画同分辨率(480x552)、同帧率(20fps)，
// 保证顺滑无卡顿、清晰不模糊。JS 只负责决定当前动作(action)，切换由本视图接管。
@interface TutuRabbitView : UIView

// 当前动作：stand / talk / happy / celebrate / think
@property (nonatomic, copy) NSString *action;

@end
