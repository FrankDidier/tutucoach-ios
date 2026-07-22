#import "TutuRabbitView.h"
#import <ImageIO/ImageIO.h>
#import <os/lock.h>

// ============================================================================
// 兔子动画视图（对齐安卓 AnimatedImageDrawable 的顺滑度）
// ----------------------------------------------------------------------------
// 安卓 WebP 动画由 RenderThread 独立解码播放，完全不受 UI/JS 线程繁忙影响，所以顺。
// iOS 上 CGAnimateImageDataWithBlock 的帧定时挂在主 run loop，且逐帧「按需解码」——
// RN 主线程一忙就掉帧、卡顿。为此改成「后台解码 + 环形缓冲 + CADisplayLink 换帧」：
//   · 后台串行队列：把「即将播放的一小段帧」提前强制解码好(kCGImageSourceShouldCacheImmediately)
//     放进缓冲；只保留播放窗口内(~20 帧)的帧，内存受控（≈20MB，而非整套 ~300MB）。
//   · CADisplayLink(主线程)：每次只是把「已解码好的帧」直接贴到 layer.contents，
//     不做任何解码；仅在帧号真正推进时才换图，避免无谓的纹理刷新（这正是上次 CADisplayLink
//     方案卡顿的原因：每个刷新周期都重设纹理、且 UIImage 在显示时才解码）。
// APNG 资源：rabbit-<action>.apng，480x552 / 20fps，与安卓一致。
// ============================================================================

@class TutuRabbitView;
@interface TutuRabbitView (TutuTick)
- (void)tick:(CADisplayLink *)link;
@end

// CADisplayLink 会强引用 target，用弱代理打破循环，保证视图能正常释放。
@interface TutuRabbitWeakProxy : NSObject
@property (nonatomic, weak) TutuRabbitView *target;
@end
@implementation TutuRabbitWeakProxy
- (void)tick:(CADisplayLink *)link {
  TutuRabbitView *t = self.target;
  if (t) [t tick:link];
}
@end

@implementation TutuRabbitView {
  CALayer *_imgLayer;
  CADisplayLink *_link;
  dispatch_queue_t _decodeQueue;

  os_unfair_lock _lock;              // 保护下列播放态（主线程与解码队列共享）
  CGImageSourceRef _source;          // 当前动作的图源
  NSUInteger _frameCount;
  NSMutableArray<NSNumber *> *_delays;                 // 每帧时长(秒)
  NSMutableDictionary<NSNumber *, id> *_buffer;        // 帧号 -> 已解码 CGImage
  NSUInteger _displayIndex;          // 当前应显示的帧号
  NSInteger _gen;                    // 动作代数：切换/释放时自增，作废旧解码结果

  CFTimeInterval _accum;             // 距上次换帧累计的时间
  CFTimeInterval _lastTs;
  NSInteger _lastShownIndex;         // 已贴到 layer 的帧号（避免重复贴同一帧）
  BOOL _paused;                      // 不在窗口上（切到别的 Tab）时暂停，省 CPU、避免相互抢主线程

  NSMutableDictionary<NSString *, NSData *> *_dataCache; // 动作 -> APNG 压缩数据
}

static const NSUInteger kWindow = 20; // 提前解码 / 保留的帧窗口大小

- (instancetype)init {
  if (self = [super init]) {
    self.backgroundColor = [UIColor clearColor];
    self.userInteractionEnabled = NO;
    _imgLayer = [CALayer layer];
    _imgLayer.contentsGravity = kCAGravityResizeAspect;
    _imgLayer.masksToBounds = YES;
    _imgLayer.contentsScale = [UIScreen mainScreen].scale;
    [self.layer addSublayer:_imgLayer];

    _lock = OS_UNFAIR_LOCK_INIT;
    _buffer = [NSMutableDictionary dictionary];
    _delays = [NSMutableArray array];
    _dataCache = [NSMutableDictionary dictionary];
    _decodeQueue = dispatch_queue_create("com.tutu.rabbit.decode", DISPATCH_QUEUE_SERIAL);
    dispatch_set_target_queue(_decodeQueue,
        dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0));
    _gen = 0;
    _lastShownIndex = -1;

    TutuRabbitWeakProxy *proxy = [TutuRabbitWeakProxy new];
    proxy.target = self;
    _link = [CADisplayLink displayLinkWithTarget:proxy selector:@selector(tick:)];
    if (@available(iOS 15.0, *)) {
      _link.preferredFrameRateRange = CAFrameRateRangeMake(30, 60, 60);
    }
    [_link addToRunLoop:[NSRunLoop mainRunLoop] forMode:NSRunLoopCommonModes];
  }
  return self;
}

- (void)layoutSubviews {
  [super layoutSubviews];
  _imgLayer.frame = self.bounds;
}

// 视图离开窗口（如切到别的 Tab，React Navigation 会 detach 屏幕）时暂停动画：
// 停掉 CADisplayLink 与后台解码，避免「首页兔子」和「练琴页兔子」同时空转、相互抢主线程
// 造成的卡顿；回到窗口时恢复。
- (void)didMoveToWindow {
  [super didMoveToWindow];
  if (self.window) {
    if (_paused) {
      _paused = NO;
      _lastTs = 0; // 重置计时基准，避免暂停期间的时间差一次性补进来
      _link.paused = NO;
      // 自增 gen 作废暂停前可能残留的解码链（避免恢复后出现多条并行解码链），
      // 但保留已解码好的帧缓冲（gen 只用于判定链是否过期，不清空 buffer）。
      os_unfair_lock_lock(&_lock);
      _gen += 1;
      NSInteger g = _gen;
      os_unfair_lock_unlock(&_lock);
      [self pumpDecode:g];
    }
  } else {
    _paused = YES;
    _link.paused = YES;
  }
}

- (NSData *)dataForAction:(NSString *)action {
  if (!action) return nil;
  NSData *d = _dataCache[action];
  if (d) return d;
  NSString *name = [NSString stringWithFormat:@"rabbit-%@", action];
  NSString *path = [[NSBundle mainBundle] pathForResource:name ofType:@"apng"];
  if (!path) return nil;
  d = [NSData dataWithContentsOfFile:path options:NSDataReadingMappedIfSafe error:nil];
  if (d) _dataCache[action] = d;
  return d;
}

- (void)setAction:(NSString *)action {
  if (!action || action.length == 0) action = @"stand";
  if ([action isEqualToString:_action]) return; // 同动作不重启，保持连续
  _action = [action copy];
  [self startAction:action];
}

// 切换动作：在主线程重置图源与播放态，并启动后台解码泵。
- (void)startAction:(NSString *)action {
  NSData *data = [self dataForAction:action];
  if (!data) data = [self dataForAction:@"stand"];
  if (!data) return;

  CGImageSourceRef src = CGImageSourceCreateWithData((__bridge CFDataRef)data, NULL);
  if (!src) return;
  NSUInteger count = CGImageSourceGetCount(src);
  if (count == 0) { CFRelease(src); return; }

  // 读每帧时长（APNG 元数据）。缺省 1/20s。
  NSMutableArray<NSNumber *> *delays = [NSMutableArray arrayWithCapacity:count];
  for (NSUInteger i = 0; i < count; i++) {
    double d = 0.05;
    CFDictionaryRef props = CGImageSourceCopyPropertiesAtIndex(src, i, NULL);
    if (props) {
      CFDictionaryRef png = (CFDictionaryRef)CFDictionaryGetValue(props, kCGImagePropertyPNGDictionary);
      if (png) {
        CFNumberRef v = (CFNumberRef)CFDictionaryGetValue(png, kCGImagePropertyAPNGUnclampedDelayTime);
        if (!v) v = (CFNumberRef)CFDictionaryGetValue(png, kCGImagePropertyAPNGDelayTime);
        if (v) { double t = 0; CFNumberGetValue(v, kCFNumberDoubleType, &t); if (t > 0.001) d = t; }
      }
      CFRelease(props);
    }
    [delays addObject:@(d)];
  }

  // 立刻同步解码第 0 帧，切换动作时无空白/闪烁（仅一帧，开销很小）。
  NSDictionary *cacheOpt = @{(id)kCGImageSourceShouldCacheImmediately: @YES};
  CGImageRef first = CGImageSourceCreateImageAtIndex(src, 0, (__bridge CFDictionaryRef)cacheOpt);

  os_unfair_lock_lock(&_lock);
  _gen += 1;
  NSInteger myGen = _gen;
  if (_source) CFRelease(_source);
  _source = src; // 转移所有权
  _frameCount = count;
  _delays = delays;
  [_buffer removeAllObjects];
  if (first) _buffer[@(0)] = (__bridge id)first;
  _displayIndex = 0;
  _accum = 0;
  _lastTs = 0;
  _lastShownIndex = 0;
  os_unfair_lock_unlock(&_lock);

  if (first) {
    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    _imgLayer.contents = (__bridge id)first;
    [CATransaction commit];
    CGImageRelease(first); // 字典已 __bridge 持有一次；这里释放本地 +1
  }

  [self pumpDecode:myGen];
}

// 后台解码泵：确保 [displayIndex, displayIndex+window] 窗口内的帧都已解码；
// 窗口已满则稍后重试。切换动作(gen 变化)或视图释放时自动停止。
- (void)pumpDecode:(NSInteger)gen {
  __weak TutuRabbitView *weakSelf = self;
  dispatch_async(_decodeQueue, ^{
    TutuRabbitView *self_ = weakSelf;
    if (!self_) return;
    if (self_->_paused) return; // 暂停时不再解码，恢复时会重新启动

    os_unfair_lock_lock(&self_->_lock);
    if (gen != self_->_gen) { os_unfair_lock_unlock(&self_->_lock); return; }
    NSUInteger count = self_->_frameCount;
    NSUInteger start = self_->_displayIndex;
    CGImageSourceRef src = self_->_source;
    if (src) CFRetain(src);
    // 找窗口内第一个尚未解码的帧
    NSInteger want = -1;
    for (NSUInteger off = 0; off < kWindow && off < count; off++) {
      NSUInteger idx = (start + off) % count;
      if (!self_->_buffer[@(idx)]) { want = (NSInteger)idx; break; }
    }
    os_unfair_lock_unlock(&self_->_lock);

    if (want < 0) {
      if (src) CFRelease(src);
      // 窗口已填满，稍后再看（消费者推进后会腾出空位）。
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(8 * NSEC_PER_MSEC)),
                     self_->_decodeQueue, ^{ [weakSelf pumpDecode:gen]; });
      return;
    }

    CGImageRef img = NULL;
    if (src) {
      NSDictionary *opt = @{(id)kCGImageSourceShouldCacheImmediately: @YES};
      img = CGImageSourceCreateImageAtIndex(src, (size_t)want, (__bridge CFDictionaryRef)opt);
      CFRelease(src);
    }

    if (img) {
      os_unfair_lock_lock(&self_->_lock);
      if (gen == self_->_gen) {
        self_->_buffer[@(want)] = (__bridge_transfer id)img; // 交给字典持有
      } else {
        CGImageRelease(img);
      }
      os_unfair_lock_unlock(&self_->_lock);
    }
    // 立刻继续解码下一帧
    [weakSelf pumpDecode:gen];
  });
}

// 主线程换帧：按累计时间推进帧号，仅贴「已解码好」的帧；顺带回收窗口外的旧帧。
- (void)tick:(CADisplayLink *)link {
  os_unfair_lock_lock(&_lock);
  NSUInteger count = _frameCount;
  if (count == 0) { os_unfair_lock_unlock(&_lock); return; }

  CFTimeInterval now = link.timestamp;
  if (_lastTs == 0) _lastTs = now;
  _accum += (now - _lastTs);
  _lastTs = now;

  double delay = (_displayIndex < _delays.count) ? _delays[_displayIndex].doubleValue : 0.05;
  BOOL advanced = NO;
  int guard = 0;
  while (_accum >= delay && guard++ < 240) {
    _accum -= delay;
    _displayIndex = (_displayIndex + 1) % count;
    advanced = YES;
    delay = (_displayIndex < _delays.count) ? _delays[_displayIndex].doubleValue : 0.05;
  }

  id frame = _buffer[@(_displayIndex)];
  NSInteger toShow = (NSInteger)_displayIndex;

  // 回收：窗口外(且已过去)的帧释放掉，内存维持在一个窗口以内。
  if (advanced && _buffer.count > kWindow) {
    NSMutableArray<NSNumber *> *drop = [NSMutableArray array];
    for (NSNumber *k in _buffer) {
      NSUInteger idx = k.unsignedIntegerValue;
      NSUInteger ahead = (idx + count - _displayIndex) % count;
      if (ahead >= kWindow) [drop addObject:k];
    }
    [_buffer removeObjectsForKeys:drop];
  }
  os_unfair_lock_unlock(&_lock);

  // 帧已解码好且帧号变化时才贴图（避免重复上传同一纹理）。
  if (frame && toShow != _lastShownIndex) {
    _lastShownIndex = toShow;
    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    _imgLayer.contents = frame;
    [CATransaction commit];
  }
}

- (void)dealloc {
  [_link invalidate];
  os_unfair_lock_lock(&_lock);
  _gen += 1;
  if (_source) { CFRelease(_source); _source = NULL; }
  [_buffer removeAllObjects];
  os_unfair_lock_unlock(&_lock);
}

@end
