#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

// 兔兔教练 手型检测「引擎」(共享单例)。
// 封装共享 C++ 黄金核心 + 手型归属 + 稳态器 + 模板状态 + 本次会话统计。
// 静态图片模块(TutuDetectorModule)与实时相机视图(TutuDetectorView)共用同一引擎，
// 保证模板与统计状态一致，且检测逻辑与安卓完全相同。
@interface TutuDetectorEngine : NSObject

+ (instancetype)shared;

// 角度阈值（默认 20°，与安卓 DEFAULT_ANGLE_THRESHOLD 一致）。
@property(nonatomic, assign) float angleThreshold;

// —— 模板 ——
// 用一张图片检测并设置左右手模板。返回 {hasLeft, hasRight, handCount}。
- (NSDictionary *)setTemplateFromImagePath:(NSString *)path error:(NSError **)error;
- (BOOL)hasLeftTemplate;
- (BOOL)hasRightTemplate;
- (void)clearTemplates;

// —— 静态分析（验证用）——
// 仅检测 21 关键点，返回 {hands:[{label,score,landmarks:[{x,y}]}]}。
- (NSDictionary *)analyzeImagePath:(NSString *)path error:(NSError **)error;

// —— 实时会话 ——
- (void)startSession;   // 重置统计 + 稳态器 + 当前帧
- (void)stopSession;

// 把「最近一帧」检测到的手设为左右手模板（等价安卓用照片设模版，这里用实时定格）。
// 返回 {hasLeft, hasRight, handCount}；无可用帧返回 handCount=0。
- (NSDictionary *)captureTemplateFromLastFrame;

// 处理一帧（已由相机层转成的手数组）。
// hands: NSArray of @{ @"label": @"Left"/@"Right", @"score": NSNumber,
//                      @"landmarks": NSArray of @{@"x":..,@"y":..} (21 个) }
// 返回 @{ @"handDetected":Bool, @"hasMatch":Bool, @"pass":Bool,
//         @"matchRate":Double(0..100), @"errors":NSArray<NSString*> }
- (NSDictionary *)processLiveHands:(NSArray *)hands;

@end
