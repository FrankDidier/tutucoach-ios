#import "TutuDetectorModule.h"
#import "TutuDetectorEngine.h"
#import <AVFoundation/AVFoundation.h>
#import <CommonCrypto/CommonCrypto.h>

// 兔兔教练 手型检测原生模块（iOS）。
// 薄封装：把 JS 调用转发到共享引擎 TutuDetectorEngine。
@interface TutuDetectorModule ()
// 关键：合成器必须被「强引用持有」。若用局部变量，话还没说出口对象就被释放 → 没声音。
// （react-native-tts 在 release/真机上经常说不出话，所以我们自己用原生 AVSpeechSynthesizer 兜底。）
@property(nonatomic, strong) AVSpeechSynthesizer *synth;
@property(nonatomic, strong) AVSpeechSynthesisVoice *zhVoice;
// 声音复刻（老师本人音色）：从后端拉 WAV，用 AVAudioPlayer 播放。强引用持有，否则播一半被释放。
@property(nonatomic, strong) AVAudioPlayer *clonePlayer;
// 播报序号：新的一句会自增；在途的克隆下载播放前会校验序号，丢弃过期请求（避免叠音/拖尾）。
@property(nonatomic, assign) NSInteger speakSeq;
@end

@implementation TutuDetectorModule

RCT_EXPORT_MODULE(TutuDetector);

// 语音合成必须在主线程初始化/调用。
+ (BOOL)requiresMainQueueSetup { return YES; }

// 设置角度阈值（默认 20，与安卓一致）。
RCT_EXPORT_METHOD(setAngleThreshold:(double)threshold) {
  [TutuDetectorEngine shared].angleThreshold = (float)threshold;
}

// 重新激活音频会话。每次「兔兔说话」前由 JS 调用一次：
// 系统相机/相册选择器、来电、其它 App 等都可能在不触发「App 回到前台」的情况下
// 把我们在 AppDelegate 激活的 Playback 会话改掉或停掉，导致 TTS 没声音。
// 这里幂等地把分类重设为 Playback(+MixWithOthers) 并重新激活，保证随时能出声。
RCT_EXPORT_METHOD(reactivateAudioSession) {
  AVAudioSession *session = [AVAudioSession sharedInstance];
  NSError *err = nil;
  [session setCategory:AVAudioSessionCategoryPlayback
                  mode:AVAudioSessionModeDefault
               options:AVAudioSessionCategoryOptionMixWithOthers
                 error:&err];
  [session setActive:YES error:&err];
}

#pragma mark - 原生语音播报（AVSpeechSynthesizer）

// 自己用原生合成器播报中文，取代 react-native-tts（后者在 release/真机上常常没声音）。
// rate：语速倍率（1.0 = 正常）；pitch：音高（1.0 = 正常）。
RCT_EXPORT_METHOD(ttsSpeak:(NSString *)text rate:(double)rate pitch:(double)pitch) {
  if (text.length == 0) return;
  self.speakSeq += 1;
  dispatch_async(dispatch_get_main_queue(), ^{
    [self speakWithSynth:text rate:rate pitch:pitch];
  });
}

// 用系统合成器播一句（主线程调用）。声音复刻失败时也回退到这里，保证「总有声音」。
- (void)speakWithSynth:(NSString *)text rate:(double)rate pitch:(double)pitch {
  if (text.length == 0) return;
  // 懒加载并强引用持有合成器。关键：usesApplicationAudioSession = NO，
  // 让合成器「自己管理音频会话」——这是 AVSpeechSynthesizer 在真机上「调了 speak
  // 却不出声、连 didStart 都不触发」的标准修复（App 自己激活的会话会和它打架）。
  if (self.synth == nil) {
    self.synth = [[AVSpeechSynthesizer alloc] init];
    self.synth.usesApplicationAudioSession = NO;
  }
  if (self.zhVoice == nil) {
    self.zhVoice = [AVSpeechSynthesisVoice voiceWithLanguage:@"zh-CN"];
    if (self.zhVoice == nil) {
      self.zhVoice = [AVSpeechSynthesisVoice voiceWithLanguage:@"zh-Hans-CN"];
    }
  }
  // 打断上一句 + 停掉克隆播放，避免叠音。
  if (self.synth.isSpeaking) {
    [self.synth stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
  }
  if (self.clonePlayer.isPlaying) {
    [self.clonePlayer stop];
  }
  AVSpeechUtterance *u = [[AVSpeechUtterance alloc] initWithString:text];
  if (self.zhVoice) u.voice = self.zhVoice;
  // 默认语速约 0.5；按倍率缩放并夹在合理区间，避免太快听不清。
  float base = AVSpeechUtteranceDefaultSpeechRate;
  float r = base * (float)(rate <= 0 ? 1.0 : rate);
  u.rate = MAX(AVSpeechUtteranceMinimumSpeechRate, MIN(AVSpeechUtteranceMaximumSpeechRate, r));
  u.pitchMultiplier = (float)(pitch <= 0 ? 1.0 : MAX(0.5, MIN(2.0, pitch)));
  [self.synth speakUtterance:u];
}

// 声音复刻播报：voiceId>0 时从后端拉老师本人音色 WAV 播放（带本地缓存）；
// voiceId<=0 或拉取失败时，回退到系统合成器，确保始终有声音。
RCT_EXPORT_METHOD(ttsSpeakCloned:(NSString *)text
                  voiceId:(double)voiceId
                  rate:(double)rate
                  pitch:(double)pitch
                  baseUrl:(NSString *)baseUrl) {
  if (text.length == 0) return;
  self.speakSeq += 1;
  NSInteger seq = self.speakSeq;
  int vid = (int)voiceId;
  if (vid <= 0 || baseUrl.length == 0) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [self speakWithSynth:text rate:rate pitch:pitch];
    });
    return;
  }

  // 本地缓存路径：sha1(voiceId:text).wav，命中即秒播。
  NSString *cacheKey = [self sha1ForString:[NSString stringWithFormat:@"%d:%@", vid, text]];
  NSString *cacheDir = [NSTemporaryDirectory() stringByAppendingPathComponent:@"tutu_tts"];
  [[NSFileManager defaultManager] createDirectoryAtPath:cacheDir
                            withIntermediateDirectories:YES attributes:nil error:nil];
  NSString *cachePath = [cacheDir stringByAppendingPathComponent:
                         [cacheKey stringByAppendingString:@".wav"]];

  __weak TutuDetectorModule *weakSelf = self;
  void (^playFile)(NSString *) = ^(NSString *path) {
    dispatch_async(dispatch_get_main_queue(), ^{
      TutuDetectorModule *s = weakSelf;
      if (s == nil || seq != s.speakSeq) return;  // 已被更新的一句取代 → 丢弃
      [s playClonedFile:path];
    });
  };
  void (^fallback)(void) = ^{
    dispatch_async(dispatch_get_main_queue(), ^{
      TutuDetectorModule *s = weakSelf;
      if (s == nil || seq != s.speakSeq) return;
      [s speakWithSynth:text rate:rate pitch:pitch];
    });
  };

  if ([[NSFileManager defaultManager] fileExistsAtPath:cachePath]) {
    playFile(cachePath);
    return;
  }

  // 拉取：GET {baseUrl}/api/coach/tts?voice_id=..&text=..
  NSCharacterSet *allowed = [NSCharacterSet URLQueryAllowedCharacterSet];
  NSString *encText = [text stringByAddingPercentEncodingWithAllowedCharacters:allowed];
  NSString *urlStr = [NSString stringWithFormat:@"%@/api/coach/tts?voice_id=%d&text=%@",
                      baseUrl, vid, encText];
  NSURL *url = [NSURL URLWithString:urlStr];
  if (url == nil) { fallback(); return; }
  NSURLSessionDataTask *task = [[NSURLSession sharedSession]
      dataTaskWithURL:url
    completionHandler:^(NSData *data, NSURLResponse *resp, NSError *error) {
      NSInteger code = [resp isKindOfClass:[NSHTTPURLResponse class]]
                           ? ((NSHTTPURLResponse *)resp).statusCode : 0;
      if (error != nil || code != 200 || data.length < 64) {
        fallback();
        return;
      }
      [data writeToFile:cachePath atomically:YES];
      playFile(cachePath);
    }];
  [task resume];
}

- (void)playClonedFile:(NSString *)path {
  if (self.synth.isSpeaking) {
    [self.synth stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
  }
  if (self.clonePlayer.isPlaying) {
    [self.clonePlayer stop];
  }
  NSError *err = nil;
  AVAudioPlayer *p = [[AVAudioPlayer alloc] initWithContentsOfURL:[NSURL fileURLWithPath:path]
                                                            error:&err];
  if (p == nil) return;
  self.clonePlayer = p;
  [p prepareToPlay];
  [p play];
}

- (NSString *)sha1ForString:(NSString *)s {
  NSData *data = [s dataUsingEncoding:NSUTF8StringEncoding];
  uint8_t digest[CC_SHA1_DIGEST_LENGTH];
  CC_SHA1(data.bytes, (CC_LONG)data.length, digest);
  NSMutableString *out = [NSMutableString stringWithCapacity:CC_SHA1_DIGEST_LENGTH * 2];
  for (int i = 0; i < CC_SHA1_DIGEST_LENGTH; i++) [out appendFormat:@"%02x", digest[i]];
  return out;
}

RCT_EXPORT_METHOD(ttsStop) {
  self.speakSeq += 1;  // 让在途的克隆下载播放被丢弃
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.synth.isSpeaking) {
      [self.synth stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
    }
    if (self.clonePlayer.isPlaying) {
      [self.clonePlayer stop];
    }
  });
}

// 预热合成器：建立音频通道，避免「第一句没声音、后面才有声」的冷启动问题。
RCT_EXPORT_METHOD(ttsPrewarm) {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.synth == nil) {
      self.synth = [[AVSpeechSynthesizer alloc] init];
      self.synth.usesApplicationAudioSession = NO;
    }
    if (self.zhVoice == nil) {
      self.zhVoice = [AVSpeechSynthesisVoice voiceWithLanguage:@"zh-CN"];
      if (self.zhVoice == nil) {
        self.zhVoice = [AVSpeechSynthesisVoice voiceWithLanguage:@"zh-Hans-CN"];
      }
    }
    AVSpeechUtterance *u = [[AVSpeechUtterance alloc] initWithString:@" "];
    if (self.zhVoice) u.voice = self.zhVoice;
    u.volume = 0.0f;  // 静默预热
    [self.synth speakUtterance:u];
  });
}

#pragma mark - 相机权限状态查询

// 返回相机授权状态，供 JS 端在「灰屏」时引导用户去设置开启权限。
RCT_EXPORT_METHOD(cameraAuthStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  AVAuthorizationStatus st = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];
  NSString *s = @"notDetermined";
  if (st == AVAuthorizationStatusAuthorized) s = @"authorized";
  else if (st == AVAuthorizationStatusDenied) s = @"denied";
  else if (st == AVAuthorizationStatusRestricted) s = @"restricted";
  resolve(s);
}

// 仅检测一张图片的 21 关键点（验证 MediaPipe 跑通）。
RCT_EXPORT_METHOD(analyzeImagePath:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSError *error = nil;
  NSDictionary *res = [[TutuDetectorEngine shared] analyzeImagePath:path error:&error];
  if (res == nil) {
    reject(@"detect_failed", error.localizedDescription ?: @"检测失败", error);
    return;
  }
  resolve(res);
}

// 用一张图片设置左右手模板（对应安卓 processTemplateResult）。
RCT_EXPORT_METHOD(setTemplateFromImage:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSError *error = nil;
  NSDictionary *res = [[TutuDetectorEngine shared] setTemplateFromImagePath:path error:&error];
  if (res == nil) {
    reject(@"template_failed", error.localizedDescription ?: @"模板检测失败", error);
    return;
  }
  resolve(res);
}

RCT_EXPORT_METHOD(hasTemplate:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  TutuDetectorEngine *e = [TutuDetectorEngine shared];
  resolve(@{@"hasLeft": @([e hasLeftTemplate]), @"hasRight": @([e hasRightTemplate])});
}

RCT_EXPORT_METHOD(clearTemplates) {
  [[TutuDetectorEngine shared] clearTemplates];
}

// 把当前实时画面定格为模版（手保持正确姿势时调用）。
RCT_EXPORT_METHOD(captureTemplateFromLive:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve([[TutuDetectorEngine shared] captureTemplateFromLastFrame]);
}

@end
