#import "TutuRabbitView.h"
#import <ImageIO/ImageIO.h>

// 兔子动画视图：为了与安卓端一样顺滑，采用「一次性预解码所有帧 → CADisplayLink 逐帧切换」的方式。
// 关键点：播放过程中【零解码、零磁盘 IO】，只是把已解码好的位图交给图层，因此不会卡顿。
// （旧实现用 CGAnimateImageAtURLWithBlock，会在每帧从文件 URL 读取并即时解码，是卡顿的根源。）
@implementation TutuRabbitView {
  CALayer *_imgLayer;        // 承载当前帧（aspect-fit + 居中）
  NSInteger _gen;            // 动作代数，切换/释放时自增，作废旧的异步解码
  NSString *_curAction;      // 正在播放的动作，避免重复重启
  NSArray<UIImage *> *_frames; // 当前动作预解码好的所有帧
  NSInteger _frameCount;
  NSTimeInterval _frameDur;  // 每帧时长（20fps → 0.05s）
  CADisplayLink *_link;
  CFTimeInterval _startTime;
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
    _frameDur = 1.0 / 20.0; // 资源统一为 20fps
    [[NSNotificationCenter defaultCenter]
        addObserver:self
           selector:@selector(onMemoryWarning)
               name:UIApplicationDidReceiveMemoryWarningNotification
             object:nil];
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
  [self loadAndPlay:action];
}

// 后台线程一次性解码全部帧；完成后回主线程用 CADisplayLink 顺滑播放。
- (void)loadAndPlay:(NSString *)action {
  _gen += 1;
  NSInteger myGen = _gen;
  [self stopLink];
  // 先释放上一个动作的帧，避免解码新动作时两份位图同时占用内存。
  _frames = nil;
  _frameCount = 0;
  NSURL *url = [self urlForAction:action];
  if (!url) url = [self urlForAction:@"stand"];
  if (!url) return;

  __weak TutuRabbitView *weakSelf = self;
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSData *data = [NSData dataWithContentsOfURL:url];
    if (!data) return;
    CGImageSourceRef src = CGImageSourceCreateWithData((__bridge CFDataRef)data, NULL);
    if (!src) return;
    size_t n = CGImageSourceGetCount(src);
    NSDictionary *opts = @{(id)kCGImageSourceShouldCacheImmediately: @YES};

    // 先解码第 0 帧并立刻显示，避免切换动作时出现空白/停顿。
    CGImageRef first = CGImageSourceCreateImageAtIndex(src, 0, (__bridge CFDictionaryRef)opts);
    if (first) {
      UIImage *u0 = [UIImage imageWithCGImage:first];
      CGImageRelease(first);
      dispatch_async(dispatch_get_main_queue(), ^{
        TutuRabbitView *s = weakSelf;
        if (s && s->_gen == myGen) s->_imgLayer.contents = (__bridge id)u0.CGImage;
      });
    }

    NSMutableArray<UIImage *> *arr = [NSMutableArray arrayWithCapacity:n];
    for (size_t i = 0; i < n; i++) {
      TutuRabbitView *loopSelf = weakSelf;
      if (loopSelf == nil || loopSelf->_gen != myGen) { break; } // 动作已切换 → 放弃
      CGImageRef img = CGImageSourceCreateImageAtIndex(src, i, (__bridge CFDictionaryRef)opts);
      if (img) {
        [arr addObject:[UIImage imageWithCGImage:img]];
        CGImageRelease(img);
      }
    }
    CFRelease(src);

    dispatch_async(dispatch_get_main_queue(), ^{
      TutuRabbitView *s = weakSelf;
      if (!s || s->_gen != myGen || arr.count == 0) return;
      s->_frames = arr;
      s->_frameCount = (NSInteger)arr.count;
      s->_imgLayer.contents = (__bridge id)((UIImage *)arr[0]).CGImage;
      [s startLink];
    });
  });
}

- (void)startLink {
  [self stopLink];
  if (!self.window) return; // 不在窗口上不启动，避免离屏空转和 retain 环
  _startTime = CACurrentMediaTime();
  _link = [CADisplayLink displayLinkWithTarget:self selector:@selector(tick:)];
  if (@available(iOS 15.0, *)) {
    _link.preferredFrameRateRange = CAFrameRateRangeMake(20, 30, 24);
  }
  [_link addToRunLoop:[NSRunLoop mainRunLoop] forMode:NSRunLoopCommonModes];
}

- (void)stopLink {
  [_link invalidate];
  _link = nil;
}

- (void)tick:(CADisplayLink *)link {
  if (_frameCount <= 0 || !_frames) return;
  NSInteger idx = (NSInteger)((CACurrentMediaTime() - _startTime) / _frameDur);
  idx = idx % _frameCount;
  if (idx < 0) idx = 0;
  UIImage *img = _frames[(NSUInteger)idx];
  // 直接替换内容，禁用隐式动画，避免交叉淡化/闪烁。
  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  _imgLayer.contents = (__bridge id)img.CGImage;
  [CATransaction commit];
}

// 离开窗口时暂停（并打断 CADisplayLink 对 self 的持有，使视图能被释放）；回到窗口继续。
- (void)didMoveToWindow {
  [super didMoveToWindow];
  if (self.window) {
    if (!_link && _frames && _frameCount > 0) [self startLink];
  } else {
    [self stopLink];
  }
}

- (void)onMemoryWarning {
  // 内存告警：丢弃已解码帧，稍后自动重解码当前动作。
  NSString *a = _curAction;
  [self stopLink];
  _frames = nil;
  _frameCount = 0;
  _curAction = nil;
  if (a) [self setAction:a];
}

- (void)dealloc {
  _gen += 1; // 作废运行中的异步解码回调
  [self stopLink];
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

@end
