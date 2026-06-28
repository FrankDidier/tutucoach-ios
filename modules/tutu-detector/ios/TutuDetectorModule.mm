#import "TutuDetectorModule.h"
#import "TutuDetectorEngine.h"
#import <AVFoundation/AVFoundation.h>

// 兔兔教练 手型检测原生模块（iOS）。
// 薄封装：把 JS 调用转发到共享引擎 TutuDetectorEngine。
@interface TutuDetectorModule ()
// 关键：合成器必须被「强引用持有」。若用局部变量，话还没说出口对象就被释放 → 没声音。
// （react-native-tts 在 release/真机上经常说不出话，所以我们自己用原生 AVSpeechSynthesizer 兜底。）
@property(nonatomic, strong) AVSpeechSynthesizer *synth;
@property(nonatomic, strong) AVSpeechSynthesisVoice *zhVoice;
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
  dispatch_async(dispatch_get_main_queue(), ^{
    // 1) 懒加载并强引用持有合成器。关键：usesApplicationAudioSession = NO，
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

    // 2) 打断上一句，避免叠音。
    if (self.synth.isSpeaking) {
      [self.synth stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
    }

    AVSpeechUtterance *u = [[AVSpeechUtterance alloc] initWithString:text];
    if (self.zhVoice) u.voice = self.zhVoice;
    // 默认语速约 0.5；按倍率缩放并夹在合理区间，避免太快听不清。
    float base = AVSpeechUtteranceDefaultSpeechRate;
    float r = base * (float)(rate <= 0 ? 1.0 : rate);
    u.rate = MAX(AVSpeechUtteranceMinimumSpeechRate, MIN(AVSpeechUtteranceMaximumSpeechRate, r));
    u.pitchMultiplier = (float)(pitch <= 0 ? 1.0 : MAX(0.5, MIN(2.0, pitch)));
    [self.synth speakUtterance:u];
  });
}

RCT_EXPORT_METHOD(ttsStop) {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.synth.isSpeaking) {
      [self.synth stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
    }
  });
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
