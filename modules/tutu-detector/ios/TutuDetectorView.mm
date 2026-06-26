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
  if (_active == active) return;
  _active = active;
  if (active) {
    [self startDetection];
  } else {
    [self stopDetection];
  }
}

- (void)dealloc {
  [self stopDetection];
}

#pragma mark - 启停

- (void)startDetection {
  __weak TutuDetectorView *weakSelf = self;
  [self requestCameraPermission:^(BOOL granted) {
    if (!granted) {
      [weakSelf emit:@{@"handDetected": @NO, @"hasMatch": @NO, @"pass": @NO,
                       @"matchRate": @0, @"errors": @[@"未获得摄像头权限"]}];
      return;
    }
    dispatch_async(weakSelf.cameraQueue, ^{
      [weakSelf configureIfNeeded];
      [[TutuDetectorEngine shared] startSession];
      if (![weakSelf.session isRunning]) {
        [weakSelf.session startRunning];
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

  // 预览层（铺满，等比裁剪）。
  dispatch_async(dispatch_get_main_queue(), ^{
    self.previewLayer = [AVCaptureVideoPreviewLayer layerWithSession:self.session];
    self.previewLayer.videoGravity = AVLayerVideoGravityResizeAspectFill;
    self.previewLayer.frame = self.bounds;
    [self.layer insertSublayer:self.previewLayer atIndex:0];
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
  if (_liveLandmarker == nil) return;
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
  if (error != nil || result == nil) {
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
  if (self.onResult == nil) return;
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.onResult) self.onResult(payload);
  });
}

@end
