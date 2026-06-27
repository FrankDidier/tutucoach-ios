#import "TutuRecorder.h"

@interface TutuRecorder ()
@property(nonatomic, strong) AVAudioRecorder *recorder;
@property(nonatomic, strong) NSURL *fileURL;
@property(nonatomic, assign) NSTimeInterval startTime;
@end

@implementation TutuRecorder

RCT_EXPORT_MODULE(TutuRecorder);

+ (BOOL)requiresMainQueueSetup { return NO; }

// 开始录音：申请麦克风权限 -> 配置音频会话 -> 写入临时 m4a 文件。
RCT_EXPORT_METHOD(start:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  AVAudioSession *session = [AVAudioSession sharedInstance];
  [session requestRecordPermission:^(BOOL granted) {
    if (!granted) {
      reject(@"no_permission", @"麦克风权限被拒绝", nil);
      return;
    }
    NSError *err = nil;
    [session setCategory:AVAudioSessionCategoryPlayAndRecord
             withOptions:AVAudioSessionCategoryOptionDefaultToSpeaker
                   error:&err];
    [session setActive:YES error:&err];

    NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:@"tutu_voice.m4a"];
    self.fileURL = [NSURL fileURLWithPath:path];
    [[NSFileManager defaultManager] removeItemAtURL:self.fileURL error:nil];

    NSDictionary *settings = @{
      AVFormatIDKey: @(kAudioFormatMPEG4AAC),
      AVSampleRateKey: @16000.0,        // 16k 单声道，适配「大模型声音复刻」
      AVNumberOfChannelsKey: @1,
      AVEncoderAudioQualityKey: @(AVAudioQualityHigh),
    };
    NSError *initErr = nil;
    self.recorder = [[AVAudioRecorder alloc] initWithURL:self.fileURL
                                                settings:settings
                                                   error:&initErr];
    if (initErr || self.recorder == nil) {
      reject(@"init_failed", initErr.localizedDescription ?: @"录音初始化失败", initErr);
      return;
    }
    self.recorder.delegate = self;
    if (![self.recorder record]) {
      reject(@"record_failed", @"无法开始录音", nil);
      return;
    }
    self.startTime = [[NSDate date] timeIntervalSince1970];
    resolve(@{@"ok": @YES});
  }];
}

// 停止录音并返回文件路径 + 时长（毫秒）。
RCT_EXPORT_METHOD(stop:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (self.recorder == nil) {
    reject(@"not_recording", @"未在录音", nil);
    return;
  }
  [self.recorder stop];
  NSTimeInterval durMs = ([[NSDate date] timeIntervalSince1970] - self.startTime) * 1000.0;
  NSString *path = self.fileURL.path ?: @"";
  self.recorder = nil;
  NSError *e = nil;
  [[AVAudioSession sharedInstance]
      setActive:NO
      withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
      error:&e];
  resolve(@{@"path": path, @"durationMs": @((NSInteger)durMs)});
}

RCT_EXPORT_METHOD(cancel:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (self.recorder) {
    [self.recorder stop];
    self.recorder = nil;
  }
  if (self.fileURL) {
    [[NSFileManager defaultManager] removeItemAtURL:self.fileURL error:nil];
  }
  resolve(@{@"ok": @YES});
}

@end
