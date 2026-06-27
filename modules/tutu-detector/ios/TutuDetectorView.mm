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

- (void)setActive:(BOOL)active {
  if (_tornDown) return;
  if (_active == active) return;
  _active = active;
  if (active) {
    [self startDetection];
  } else {
    [self stopDetection];
  }
}

// RN 在导航返回 / 卸载该原生视图时会把它从窗口移除（newWindow == nil）。
// 这一步发生在 dealloc 与 bridge 拆除 onResult 之前，是最可靠的清理时机：
// 先彻底停掉相机与 MediaPipe，并清空 onResult，杜绝“返回后还回调 -> 闪退”。
- (void)willMoveToWindow:(UIWindow *)newWindow {
  [super willMoveToWindow:newWindow];
  if (newWindow == nil) {
    [self teardown];
  }
}

- (void)dealloc {
  [self teardown];
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

#pragma mark - 启停

- (void)startDetection {
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
      if (s == nil || s.tornDown || !s.active) return;
      [s configureIfNeeded];
      [[TutuDetectorEngine shared] startSession];
      if (![s.session isRunning]) {
        [s.session startRunning];
      }
    });
  }];
}

- (void)stopDetection {
  dispatch_async(self.cameraQueue, ^{
    if ([self.session isRunning]) {
      [self.session stopRunning];
    }
    [[TutuDetectorEngine shared] stopSession];
  });
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
  _configured = YES;

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
    return;
  }
  NSError *err = nil;
  AVCaptureDeviceInput *input = [AVCaptureDeviceInput deviceInputWithDevice:device error:&err];
  if (input && [_session canAddInput:input]) {
    [_session addInput:input];
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
  if (_tornDown || !_active || _liveLandmarker == nil) return;
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
  if (_tornDown || !_active || error != nil || result == nil) {
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
  if (_tornDown || self.onResult == nil) return;
  __weak TutuDetectorView *weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    TutuDetectorView *s = weakSelf;
    if (s == nil || s.tornDown) return;
    RCTBubblingEventBlock cb = s.onResult;
    if (cb) cb(payload);
  });
}

@end
