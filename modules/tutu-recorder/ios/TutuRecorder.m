#import "TutuRecorder.h"
#import <Speech/Speech.h>

@interface TutuRecorder ()
@property(nonatomic, strong) AVAudioRecorder *recorder;
@property(nonatomic, strong) NSURL *fileURL;
@property(nonatomic, assign) NSTimeInterval startTime;
@property(nonatomic, strong) AVAudioRecorder *meter;
@property(nonatomic, strong) AVAudioEngine *listenEngine;
@property(nonatomic, strong) SFSpeechRecognizer *recognizer;
@property(nonatomic, strong) SFSpeechAudioBufferRecognitionRequest *speechRequest;
@property(nonatomic, strong) SFSpeechRecognitionTask *speechTask;
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
  // 直接把录音读成 base64 一并返回：上传走 JSON，绕开 RN 的 file:// multipart
  // 在部分机型上「请求发不出去」的问题（也顺带能判断是否真的录到了声音）。
  NSData *audio = [NSData dataWithContentsOfURL:self.fileURL];
  NSString *b64 = audio ? [audio base64EncodedStringWithOptions:0] : @"";
  NSUInteger bytes = audio ? audio.length : 0;
  self.recorder = nil;
  [self restorePlaybackSession];
  resolve(@{@"path": path,
            @"durationMs": @((NSInteger)durMs),
            @"base64": b64,
            @"bytes": @((NSInteger)bytes)});
}

// 录音结束后把音频会话恢复成可播放的 Playback，否则录完音兔兔语音会没声音。
- (void)restorePlaybackSession {
  AVAudioSession *session = [AVAudioSession sharedInstance];
  NSError *e = nil;
  [session setCategory:AVAudioSessionCategoryPlayback
                  mode:AVAudioSessionModeDefault
               options:AVAudioSessionCategoryOptionMixWithOthers
                 error:&e];
  [session setActive:YES error:&e];
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
  [self restorePlaybackSession];
  resolve(@{@"ok": @YES});
}

// 模拟器里没有琴和嘴。测试把一句话或一个响度写进临时文件，走和真麦同一条路。
- (NSString *)scriptAt:(NSString *)name consume:(BOOL)consume {
  NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:name];
  NSString *text = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:nil];
  if (text == nil) return nil;
  if (consume) {
    [[NSFileManager defaultManager] removeItemAtPath:path error:nil];
  }
  return [text stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
}

// 陪练听琴：只回一个 0~1 的响度，用来判断有没有在弹、稳不稳。
RCT_EXPORT_METHOD(readLevel:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSString *scripted = [self scriptAt:@"tutu_level.txt" consume:NO];
  if (scripted != nil) {
    float rms = [scripted floatValue];
    if (rms < 0) rms = 0;
    if (rms > 1) rms = 1;
    resolve(@{@"rms": @(rms)});
    return;
  }
  if ((self.recorder && self.recorder.recording) || self.listenEngine != nil) {
    resolve(@{@"rms": @0});
    return;
  }
  AVAudioSession *session = [AVAudioSession sharedInstance];
  [session requestRecordPermission:^(BOOL granted) {
    if (!granted) {
      resolve(@{@"rms": @0});
      return;
    }
    dispatch_async(dispatch_get_main_queue(), ^{
      NSError *err = nil;
      if (self.meter == nil || !self.meter.recording) {
        [session setCategory:AVAudioSessionCategoryPlayAndRecord
                 withOptions:AVAudioSessionCategoryOptionDefaultToSpeaker | AVAudioSessionCategoryOptionMixWithOthers
                       error:&err];
        [session setActive:YES error:&err];
        NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:@"tutu_meter.caf"];
        NSDictionary *settings = @{
          AVFormatIDKey: @(kAudioFormatLinearPCM),
          AVSampleRateKey: @16000.0,
          AVNumberOfChannelsKey: @1,
          AVLinearPCMBitDepthKey: @16,
          AVLinearPCMIsFloatKey: @NO,
        };
        self.meter = [[AVAudioRecorder alloc] initWithURL:[NSURL fileURLWithPath:path]
                                                 settings:settings
                                                    error:&err];
        self.meter.meteringEnabled = YES;
        [self.meter prepareToRecord];
        [self.meter record];
      }
      [self.meter updateMeters];
      float db = [self.meter averagePowerForChannel:0];
      float rms = (db + 45.f) / 45.f;
      if (rms < 0) rms = 0;
      if (rms > 1) rms = 1;
      resolve(@{@"rms": @(rms)});
    });
  }];
}

RCT_EXPORT_METHOD(stopMeter:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (self.meter) {
    [self.meter stop];
    self.meter = nil;
  }
  resolve(@{@"ok": @YES});
}

// 测试用的口语音频。走系统语音识别，不把写好的字直接当听到的话。
- (NSString *)scriptedAudioPath {
  NSFileManager *fm = [NSFileManager defaultManager];
  for (NSString *name in @[@"tutu_said.wav", @"tutu_said.caf", @"tutu_said.m4a"]) {
    NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:name];
    if ([fm fileExistsAtPath:path]) return path;
  }
  return nil;
}

- (void)recognizeAudioFile:(NSString *)path done:(void (^)(NSString *text, NSInteger ms))done {
  if (self.recognizer == nil) {
    self.recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:@"zh-CN"]];
  }
  NSString *ext = path.pathExtension.length ? path.pathExtension : @"wav";
  NSString *play = [NSTemporaryDirectory() stringByAppendingPathComponent:
      [@"tutu_said_now." stringByAppendingString:ext]];
  NSFileManager *fm = [NSFileManager defaultManager];
  [fm removeItemAtPath:play error:nil];
  if (![fm moveItemAtPath:path toPath:play error:nil]) {
    done(@"", 0);
    return;
  }
  NSTimeInterval started = [NSDate date].timeIntervalSince1970;
  if (self.recognizer == nil || !self.recognizer.available) {
    [fm removeItemAtPath:play error:nil];
    done(@"", 0);
    return;
  }
  SFSpeechURLRecognitionRequest *request =
      [[SFSpeechURLRecognitionRequest alloc] initWithURL:[NSURL fileURLWithPath:play]];
  request.shouldReportPartialResults = YES;
  __block BOOL finished = NO;
  __block NSString *latest = @"";
  __block SFSpeechRecognitionTask *task = nil;
  void (^finish)(NSString *) = ^(NSString *text) {
    if (finished) return;
    finished = YES;
    [task cancel];
    [fm removeItemAtPath:play error:nil];
    NSInteger ms = (NSInteger)(([NSDate date].timeIntervalSince1970 - started) * 1000.0);
    NSString *line = [NSString stringWithFormat:@"%ld\t%@", (long)ms, text ?: @""];
    [line writeToFile:[NSTemporaryDirectory() stringByAppendingPathComponent:@"tutu_recognized.txt"]
           atomically:YES
             encoding:NSUTF8StringEncoding
                error:nil];
    done(text ?: @"", ms);
  };
  task = [self.recognizer recognitionTaskWithRequest:request
                                       resultHandler:^(SFSpeechRecognitionResult *result, NSError *error) {
    if (result.bestTranscription.formattedString.length) {
      latest = result.bestTranscription.formattedString;
    }
    if ((result && result.final) || error) {
      dispatch_async(dispatch_get_main_queue(), ^{
        finish(latest);
      });
    }
  }];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(8 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    finish(latest);
  });
}

// 听学生说一句。没有权限或听不到时返回空字符串，不报错。
RCT_EXPORT_METHOD(listenOnce:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSString *scripted = [self scriptAt:@"tutu_heard.txt" consume:YES];
  if (scripted != nil) {
    resolve(@{@"text": scripted});
    return;
  }
  NSString *audio = [self scriptedAudioPath];
  if (audio != nil) {
    [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
      if (status != SFSpeechRecognizerAuthorizationStatusAuthorized) {
        resolve(@{@"text": @""});
        return;
      }
      dispatch_async(dispatch_get_main_queue(), ^{
        [self recognizeAudioFile:audio done:^(NSString *text, NSInteger ms) {
          resolve(@{@"text": text ?: @"", @"ms": @(ms)});
        }];
      });
    }];
    return;
  }
  [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
    if (status != SFSpeechRecognizerAuthorizationStatusAuthorized) {
      resolve(@{@"text": @""});
      return;
    }
    dispatch_async(dispatch_get_main_queue(), ^{
      if (self.meter) {
        [self.meter stop];
        self.meter = nil;
      }
      if (self.listenEngine) {
        resolve(@{@"text": @""});
        return;
      }
      NSError *err = nil;
      AVAudioSession *session = [AVAudioSession sharedInstance];
      [session setCategory:AVAudioSessionCategoryPlayAndRecord
               withOptions:AVAudioSessionCategoryOptionDefaultToSpeaker | AVAudioSessionCategoryOptionMixWithOthers
                     error:&err];
      [session setActive:YES error:&err];
      if (self.recognizer == nil) {
        self.recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:@"zh-CN"]];
      }
      self.speechRequest = [[SFSpeechAudioBufferRecognitionRequest alloc] init];
      self.speechRequest.shouldReportPartialResults = YES;
      AVAudioEngine *engine = [[AVAudioEngine alloc] init];
      self.listenEngine = engine;
      AVAudioInputNode *input = engine.inputNode;
      AVAudioFormat *format = [input outputFormatForBus:0];
      __block BOOL done = NO;
      __block NSString *latest = @"";
      void (^finish)(NSString *) = ^(NSString *text) {
        if (done) return;
        done = YES;
        [input removeTapOnBus:0];
        [engine stop];
        [self.speechTask cancel];
        self.speechTask = nil;
        self.speechRequest = nil;
        self.listenEngine = nil;
        [self restorePlaybackSession];
        resolve(@{@"text": text ?: @""});
      };
      [input installTapOnBus:0 bufferSize:1024 format:format block:^(AVAudioPCMBuffer *buf, AVAudioTime *when) {
        [self.speechRequest appendAudioPCMBuffer:buf];
      }];
      [engine prepare];
      if (![engine startAndReturnError:&err]) {
        self.listenEngine = nil;
        resolve(@{@"text": @""});
        return;
      }
      // 麦已经开着时，后放进来的口语音频也要认，不要等到这轮听完。
      void (^__block pickup)(void) = ^{
        if (done) return;
        NSString *line = [self scriptAt:@"tutu_heard.txt" consume:YES];
        if (line.length) {
          finish(line);
          return;
        }
        NSString *path = [self scriptedAudioPath];
        if (!path.length) return;
        done = YES;
        [input removeTapOnBus:0];
        [engine stop];
        [self.speechTask cancel];
        self.speechTask = nil;
        self.speechRequest = nil;
        self.listenEngine = nil;
        [self recognizeAudioFile:path done:^(NSString *text, NSInteger ms) {
          resolve(@{@"text": text ?: @"", @"ms": @(ms)});
        }];
      };
      for (int i = 1; i <= 7; i++) {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(i * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
          pickup();
        });
      }
      self.speechTask = [self.recognizer recognitionTaskWithRequest:self.speechRequest
                                                      resultHandler:^(SFSpeechRecognitionResult *result, NSError *error) {
        if (result.bestTranscription.formattedString.length) {
          latest = result.bestTranscription.formattedString;
        }
        if (result.final || error) {
          dispatch_async(dispatch_get_main_queue(), ^{
            finish(latest);
          });
        }
      }];
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(8 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [self.speechRequest endAudio];
        finish(latest);
      });
    });
  }];
}

@end
