#import "TutuDetectorView.h"
#import "TutuDetectorEngine.h"
#import <AVFoundation/AVFoundation.h>
#import <MediaPipeTasksVision/MediaPipeTasksVision.h>

@interface TutuDetectorView () <AVCaptureVideoDataOutputSampleBufferDelegate,
                                MPPHandLandmarkerLiveStreamDelegate>
@property(nonatomic, strong) AVCaptureSession *session;
@property(nonatomic, strong) AVCaptureVideoPreviewLayer *previewLayer;
@property(nonatomic, strong) AVCaptureVideoDataOutput *videoOutput;
@property(nonatomic, strong) dispatch_queue_t cameraQueue;
@property(nonatomic, strong) MPPHandLandmarker *liveLandmarker;
@property(nonatomic, assign) BOOL configured;
@property(nonatomic, assign) NSInteger frameTimestampMs;
// YES 表示视图正在/已被销毁：用于抑制销毁后到达的相机帧 / MediaPipe 回调，
// 避免在 RN 已拆除该视图后再调用 onResult 而崩溃（对应安卓 isMonitoring 守卫）。
@property(nonatomic, assign) BOOL tornDown;
// YES 表示视图被临时移出窗口（例如系统相机/相册选择器全屏弹出时，UIKit 会把
// 下层 RN 视图暂时从窗口移除）。这是「可恢复」的暂停，绝不能当作永久销毁——
// 否则弹完选择器回来，相机就再也起不来了（灰屏、无法检测）。
@property(nonatomic, assign) BOOL windowDetached;
// 是否已通知 JS「预览就绪」（用于隐藏占位）。只发一次。
@property(nonatomic, assign) BOOL previewSignaled;
@end

@implementation TutuDetectorView

- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    self.backgroundColor = [UIColor colorWithRed:0.847 green:0.847 blue:0.847 alpha:1.0];
    _cameraQueue = dispatch_queue_create("com.impit.tutucoach.camera", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (void)layoutSubviews {
  [super layoutSubviews];
  _previewLayer.frame = self.bounds;
}

// active 只切换「是否跑 MediaPipe 打分」（对应安卓 isMonitoring）。
// 相机预览本身在视图进入窗口时就一直开着（对应安卓 onCreate→startCamera），
// 不随 active 启停 —— 这样用户一进检测页就能看到实时画面，而不是一片灰屏。
- (void)setActive:(BOOL)active {
  if (_tornDown) return;
  if (_active == active) return;
  _active = active;
  if (active) {
    // 开始打分前重置统计，并兜底确保相机在跑。
    [[TutuDetectorEngine shared] startSession];
    [self startPreview];
  }
}

// 视图离开/进入窗口。注意：会因「两种完全不同的原因」触发 newWindow == nil：
//   ① 导航返回 / RN 卸载视图（之后会 dealloc）——需要彻底清理；
//   ② 全屏弹出系统相机/相册选择器时，UIKit 暂时把下层视图移出窗口（之后会再加回来，
//      不会 dealloc）——只能「暂停」，不能彻底销毁，否则回来后相机再也起不来。
// 因为这里无法区分两者，所以统一只做「可恢复的暂停」：停相机但保留资源、用
// windowDetached 守卫丢弃在途回调（既防闪退、又能恢复）。真正的不可逆清理放到 dealloc。
- (void)willMoveToWindow:(UIWindow *)newWindow {
  [super willMoveToWindow:newWindow];
  if (_tornDown) return;
  if (newWindow == nil) {
    _windowDetached = YES;
    [self pauseCapture];
  } else {
    _windowDetached = NO;
    // 一进入/回到窗口就开预览（与安卓 onCreate→startCamera 一致）：包含首次进入检测页，
    // 以及全屏弹出系统相机/相册选择器后返回的场景。预览不依赖 active。
    [self startPreview];
  }
}

- (void)dealloc {
  [self teardown];
}

// 可恢复的暂停：停掉相机会话与引擎，但保留 session/landmarker/onResult，便于回来恢复。
- (void)pauseCapture {
  dispatch_queue_t q = _cameraQueue;
  AVCaptureSession *session = _session;
  if (q == nil) return;
  dispatch_async(q, ^{
    if ([session isRunning]) {
      [session stopRunning];
    }
    [[TutuDetectorEngine shared] stopSession];
  });
}


// 不可逆的彻底清理（幂等）。停止接收帧、停会话、释放 landmarker、断开回调。
// 注意：清理块只捕获局部强引用、不捕获 self —— 即使 teardown 从 dealloc 触发也安全（不会复活 self）。
- (void)teardown {
  if (_tornDown) return;
  _tornDown = YES;
  _active = NO;
  // 立刻断开 onResult：emit/回调里都会检查，确保不再向已失效的 RN bridge 抛事件。
  self.onResult = nil;
  // 取出资源到局部强引用；清空 ivar（之后 captureOutput 读到 nil 会直接 return）。
  AVCaptureVideoDataOutput *output = _videoOutput;
  AVCaptureSession *session = _session;
  MPPHandLandmarker *landmarker = _liveLandmarker;
  _liveLandmarker = nil;
  dispatch_queue_t q = _cameraQueue;
  if (q) {
    dispatch_async(q, ^{
      // 在相机串行队列上执行：与 captureOutput 串行化，杜绝数据竞争。
      if (output) {
        [output setSampleBufferDelegate:nil queue:NULL];
      }
      if ([session isRunning]) {
        [session stopRunning];
      }
      [[TutuDetectorEngine shared] stopSession];
      (void)landmarker;  // 持有到块结束，确保在任何在途帧处理完成后再释放
    });
  }
}

#pragma mark - 预览（相机一进页面就开，独立于 active 打分）

- (void)startPreview {
  if (_tornDown || _windowDetached) return;
  __weak TutuDetectorView *weakSelf = self;
  [self requestCameraPermission:^(BOOL granted) {
    TutuDetectorView *strongSelf = weakSelf;
    if (strongSelf == nil || strongSelf.tornDown) return;
    if (!granted) {
      [strongSelf emit:@{@"handDetected": @NO, @"hasMatch": @NO, @"pass": @NO,
                         @"matchRate": @0, @"errors": @[@"未获得摄像头权限"]}];
      return;
    }
    dispatch_async(strongSelf.cameraQueue, ^{
      TutuDetectorView *s = weakSelf;
      if (s == nil || s.tornDown || s.windowDetached) return;
      [s configureIfNeeded];
      if (![s.session isRunning]) {
        [s.session startRunning];
      }
      // 通知 JS 预览已就绪（隐藏「相机预览」占位）。即便没在打分也会发。
      if ([s.session isRunning]) {
        [s emit:@{@"previewReady": @YES}];
      }
    });
  }];
}

- (void)requestCameraPermission:(void (^)(BOOL granted))completion {
  AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];
  if (status == AVAuthorizationStatusAuthorized) {
    completion(YES);
  } else if (status == AVAuthorizationStatusNotDetermined) {
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo
                             completionHandler:^(BOOL granted) {
      dispatch_async(dispatch_get_main_queue(), ^{ completion(granted); });
    }];
  } else {
    completion(NO);
  }
}

#pragma mark - 配置

- (void)configureIfNeeded {
  if (_configured) return;

  _session = [[AVCaptureSession alloc] init];
  // 关键：不要让相机会话自动接管 App 的音频会话。默认 YES 时，相机一开始运行就会
  // 重设/停用我们在 AppDelegate 里激活的 Playback 会话，导致「检测时兔兔没声音」。
  // 我们只用相机的视频（不录音），所以关掉自动配置，保住语音播报。
  _session.automaticallyConfiguresApplicationAudioSession = NO;
  // 4:3 预设：iPhone 后置相机竖屏 = 3:4，与安卓 MEDIA_SIZE(1080×1440, 3:4) 一致。
  if ([_session canSetSessionPreset:AVCaptureSessionPresetPhoto]) {
    _session.sessionPreset = AVCaptureSessionPresetPhoto;
  }

  // 与安卓一致：后置摄像头（未镜像）。
  AVCaptureDevice *device =
      [AVCaptureDevice defaultDeviceWithDeviceType:AVCaptureDeviceTypeBuiltInWideAngleCamera
                                         mediaType:AVMediaTypeVideo
                                          position:AVCaptureDevicePositionBack];
  if (device == nil) {
    // 退而求其次：任意可用视频设备（极少数机型/系统下后置广角枚举失败）。
    device = [AVCaptureDevice defaultDeviceWithMediaType:AVMediaTypeVideo];
  }
  if (device == nil) {
    [self emit:@{@"handDetected": @NO, @"hasMatch": @NO, @"pass": @NO,
                 @"matchRate": @0, @"errors": @[@"未找到摄像头设备"]}];
    return;
  }
  NSError *err = nil;
  AVCaptureDeviceInput *input = [AVCaptureDeviceInput deviceInputWithDevice:device error:&err];
  if (input && [_session canAddInput:input]) {
    [_session addInput:input];
  } else {
    [self emit:@{@"handDetected": @NO, @"hasMatch": @NO, @"pass": @NO,
                 @"matchRate": @0,
                 @"errors": @[err ? [NSString stringWithFormat:@"无法打开摄像头：%@", err.localizedDescription]
                                  : @"无法打开摄像头（输入）"]}];
    return;
  }

  _videoOutput = [[AVCaptureVideoDataOutput alloc] init];
  _videoOutput.alwaysDiscardsLateVideoFrames = YES;  // 等价 KEEP_ONLY_LATEST
  _videoOutput.videoSettings = @{
    (NSString *)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA)
  };
  [_videoOutput setSampleBufferDelegate:self queue:_cameraQueue];
  if ([_session canAddOutput:_videoOutput]) {
    [_session addOutput:_videoOutput];
  }

  AVCaptureConnection *conn = [_videoOutput connectionWithMediaType:AVMediaTypeVideo];
  if (conn.isVideoOrientationSupported) {
    conn.videoOrientation = AVCaptureVideoOrientationPortrait;
  }

  // 预览层（铺满，等比裁剪）。用 weakSelf 避免“点启动后立刻返回”时在已销毁视图上操作图层而崩溃。
  __weak TutuDetectorView *weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    TutuDetectorView *s = weakSelf;
    if (s == nil || s.tornDown) return;
    s.previewLayer = [AVCaptureVideoPreviewLayer layerWithSession:s.session];
    s.previewLayer.videoGravity = AVLayerVideoGravityResizeAspectFill;
    s.previewLayer.frame = s.bounds;
    [s.layer insertSublayer:s.previewLayer atIndex:0];
  });

  [self setupLiveLandmarker];
  // 仅在成功配置完成后才标记，失败路径会提前 return 并保持未配置，便于下次重试。
  _configured = YES;
}

- (void)setupLiveLandmarker {
  NSString *path = [[NSBundle mainBundle] pathForResource:@"hand_landmarker" ofType:@"task"];
  if (path == nil) return;
  MPPHandLandmarkerOptions *options = [[MPPHandLandmarkerOptions alloc] init];
  options.baseOptions.modelAssetPath = path;
  options.runningMode = MPPRunningModeLiveStream;
  options.numHands = 2;
  options.minHandDetectionConfidence = 0.3f;
  options.minHandPresenceConfidence = 0.3f;
  options.minTrackingConfidence = 0.3f;
  options.handLandmarkerLiveStreamDelegate = self;
  NSError *err = nil;
  _liveLandmarker = [[MPPHandLandmarker alloc] initWithOptions:options error:&err];
}

#pragma mark - 相机帧 -> MediaPipe

- (void)captureOutput:(AVCaptureOutput *)output
    didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer
           fromConnection:(AVCaptureConnection *)connection {
  if (_tornDown || _windowDetached) return;
  // 第一帧到达即确认预览已就绪（即使尚未点「启动」打分），让 JS 隐藏占位。
  if (!_previewSignaled) {
    _previewSignaled = YES;
    [self emit:@{@"previewReady": @YES}];
  }
  // 仅在「启动」后跑 MediaPipe 打分（对应安卓 isMonitoring）。
  if (!_active || _liveLandmarker == nil) return;
  NSError *err = nil;
  // 后置相机竖屏：朝向 .right 让 MediaPipe 拿到正立的竖屏图像。
  MPPImage *image = [[MPPImage alloc] initWithSampleBuffer:sampleBuffer
                                               orientation:UIImageOrientationRight
                                                     error:&err];
  if (image == nil) return;
  _frameTimestampMs += 33;  // ~30fps，时间戳必须单调递增
  [_liveLandmarker detectAsyncImage:image timestampInMilliseconds:_frameTimestampMs error:&err];
}

#pragma mark - MediaPipe 结果回调

- (void)handLandmarker:(MPPHandLandmarker *)handLandmarker
    didFinishDetectionWithResult:(MPPHandLandmarkerResult *)result
         timestampInMilliseconds:(NSInteger)timestampInMilliseconds
                           error:(NSError *)error {
  if (_tornDown || _windowDetached || !_active || error != nil || result == nil) {
    return;
  }
  NSMutableArray *hands = [NSMutableArray array];
  for (NSUInteger i = 0; i < result.landmarks.count; i++) {
    NSArray<MPPNormalizedLandmark *> *marks = result.landmarks[i];
    NSString *label = @"Left";
    float score = 0.f;
    if (result.handedness.count > i && result.handedness[i].count > 0) {
      MPPCategory *c = result.handedness[i][0];
      label = c.categoryName ?: @"Left";
      score = c.score;
    }
    NSMutableArray *pts = [NSMutableArray arrayWithCapacity:marks.count];
    for (MPPNormalizedLandmark *m in marks) {
      [pts addObject:@{@"x": @(m.x), @"y": @(m.y)}];
    }
    [hands addObject:@{@"label": label, @"score": @(score), @"landmarks": pts}];
  }

  NSDictionary *res = [[TutuDetectorEngine shared] processLiveHands:hands];
  [self emit:res];
}

- (void)emit:(NSDictionary *)payload {
  if (_tornDown || _windowDetached || self.onResult == nil) return;
  __weak TutuDetectorView *weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    TutuDetectorView *s = weakSelf;
    if (s == nil || s.tornDown || s.windowDetached) return;
    RCTBubblingEventBlock cb = s.onResult;
    if (cb) cb(payload);
  });
}

@end
