#import "TutuRabbitView.h"
#import <ImageIO/ImageIO.h>
#import <ImageIO/CGImageAnimation.h>

// 兔子动画视图：用 Apple 官方动画器 CGAnimateImageDataWithBlock 播放打包进 App 的 APNG
// （rabbit-<action>.apng，480x552 / 20fps，与安卓端一致）。
// 关键点：把 APNG 文件读进内存一次（按动作缓存），交给系统级动画器逐帧回调；系统负责
// 高效解码与帧定时，播放最顺滑、CPU/GPU 开销最低。
// （曾试过「预解码所有帧 + CADisplayLink 手动逐帧」，反而更卡——每个刷新周期都重设一次
//  大位图纹理、且 UIImage 在显示时才真正解码——故回到系统动画器，仅把数据源改为内存。）
@implementation TutuRabbitView {
  CALayer *_imgLayer;      // 承载当前帧（aspect-fit + 居中）
  NSInteger _gen;          // 动作代数：切换/释放时自增，作废上一段动画回调
  NSString *_curAction;    // 正在播放的动作，避免重复重启
  NSMutableDictionary<NSString *, NSData *> *_dataCache; // 动作 -> APNG 内存数据
}

- (instancetype)init {
  if (self = [super init]) {
    self.backgroundColor = [UIColor clearColor];
    self.userInteractionEnabled = NO; // 点击由 JS 层的 TouchableOpacity 处理
    _imgLayer = [CALayer layer];
    _imgLayer.contentsGravity = kCAGravityResizeAspect; // 等价 resizeMode: contain，自动居中
    _imgLayer.masksToBounds = YES;
    _imgLayer.contentsScale = [UIScreen mainScreen].scale;
    [self.layer addSublayer:_imgLayer];
    _gen = 0;
    _dataCache = [NSMutableDictionary dictionary];
  }
  return self;
}

- (void)layoutSubviews {
  [super layoutSubviews];
  _imgLayer.frame = self.bounds;
}

- (NSData *)dataForAction:(NSString *)action {
  if (!action) return nil;
  NSData *d = _dataCache[action];
  if (d) return d;
  NSString *name = [NSString stringWithFormat:@"rabbit-%@", action];
  NSString *path = [[NSBundle mainBundle] pathForResource:name ofType:@"apng"];
  if (!path) return nil;
  d = [NSData dataWithContentsOfFile:path];
  if (d) _dataCache[action] = d;
  return d;
}

- (void)setAction:(NSString *)action {
  if (!action || action.length == 0) action = @"stand";
  if ([action isEqualToString:_curAction]) return; // 同动作不重启，保持连续
  _curAction = [action copy];
  _action = [action copy];
  [self play:action];
}

- (void)play:(NSString *)action {
  NSData *data = [self dataForAction:action];
  if (!data) data = [self dataForAction:@"stand"]; // 找不到该动作则回退待机
  if (!data) return;

  _gen += 1;
  NSInteger myGen = _gen;
  __weak TutuRabbitView *weakSelf = self;

  // options 传 NULL：遵循 APNG 自身的帧延时与循环次数（我们的资源 plays=0 无限循环）。
  CGAnimateImageDataWithBlock((__bridge CFDataRef)data, NULL,
    ^(size_t index, CGImageRef image, bool *stop) {
      TutuRabbitView *strongSelf = weakSelf;
      if (!strongSelf || strongSelf->_gen != myGen) {
        *stop = true; // 视图已释放或动作已切换 —— 停止本段动画
        return;
      }
      // 无隐式动画地直接替换帧，避免交叉淡化/闪烁。
      [CATransaction begin];
      [CATransaction setDisableActions:YES];
      strongSelf->_imgLayer.contents = (__bridge id)image;
      [CATransaction commit];
    });
}

- (void)dealloc {
  _gen += 1; // 让运行中的动画回调在下一帧自行停止
}

@end
