#import <React/RCTBridgeModule.h>

// 兔兔教练 手型检测原生模块（iOS）。
// 负责：MediaPipe HandLandmarker（21 关键点）+ 共享 C++「黄金核心」分析。
// 第一阶段：静态图片分析（可在模拟器验证 MediaPipe + 核心打通）。
@interface TutuDetectorModule : NSObject <RCTBridgeModule>
@end
