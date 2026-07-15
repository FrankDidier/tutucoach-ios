#import <UIKit/UIKit.h>
#import <React/RCTComponent.h>

// 实时手型检测相机视图：相机预览 + MediaPipe 实时流 + 共享引擎分析。
// 与安卓 MainActivity 的相机管线一致：后置摄像头、3:4 竖屏、0.3 置信度、双手。
@interface TutuDetectorView : UIView

// 由 JS 控制：YES 开始检测，NO 停止。
@property(nonatomic, assign) BOOL active;

// 由 JS 控制：YES 用前置摄像头（画面镜像，像照镜子），NO 用后置（默认）。
// 切换前置时预览与送入 MediaPipe 的画面都做水平镜像，保证「左手/右手」判断正确。
@property(nonatomic, assign) BOOL useFrontCamera;

// 每帧分析结果回调：{ handDetected, hasMatch, pass, matchRate(0..100), errors:[String] }
@property(nonatomic, copy) RCTBubblingEventBlock onResult;

@end
