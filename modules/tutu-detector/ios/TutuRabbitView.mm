#import "TutuRabbitView.h"
#import <ImageIO/ImageIO.h>

@implementation TutuRabbitView {
  CALayer *_imgLayer;      // 承载当前帧的图层（aspect-fit + 居中）
  NSInteger _gen;          // 动作代数，切换动作时自增以停止上一段动画
  NSString *_curAction;    // 正在播放的动作，避免重复重启
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
  }
  return self;
}

- (void)layoutSubviews {
  [super layoutSubviews];
  _imgLayer.frame = self.bounds;
}

- (NSURL *)urlForAction:(NSString *)action {
  NSString *name = [NSString stringWithFormat:@"rabbit-%@", action ?: @"stand"];
  NSString *path = [[NSBundle mainBundle] pathForResource:name ofType:@"apng"];
  if (!path) return nil;
  return [NSURL fileURLWithPath:path];
}

- (void)setAction:(NSString *)action {
  if (!action || action.length == 0) action = @"stand";
  if ([action isEqualToString:_curAction]) return; // 同动作不重启，保持连续
  _curAction = [action copy];
  _action = [action copy];
  [self playAction:action];
}

- (void)playAction:(NSString *)action {
  NSURL *url = [self urlForAction:action];
  if (!url) {
    // 找不到该动作则回退到待机
    url = [self urlForAction:@"stand"];
    if (!url) return;
  }

  _gen += 1;
  NSInteger myGen = _gen;
  __weak TutuRabbitView *weakSelf = self;

  // options: 无覆盖，遵循 APNG 文件自身的帧延时与循环次数(plays=0 无限循环)
  CGAnimateImageAtURLWithBlock((__bridge CFURLRef)url, NULL,
    ^(size_t index, CGImageRef image, bool *stop) {
      TutuRabbitView *strongSelf = weakSelf;
      if (!strongSelf || strongSelf->_gen != myGen) {
        // 视图已释放或动作已切换 —— 停止本段动画
        *stop = true;
        return;
      }
      // 无动画地直接替换帧内容，避免隐式动画造成的交叉淡化/闪烁
      [CATransaction begin];
      [CATransaction setDisableActions:YES];
      strongSelf->_imgLayer.contents = (__bridge id)image;
      [CATransaction commit];
    });
}

- (void)dealloc {
  _gen += 1; // 使运行中的动画回调在下一帧自行停止
}

@end
