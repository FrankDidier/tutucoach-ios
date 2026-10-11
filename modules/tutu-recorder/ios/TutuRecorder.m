#import "TutuRecorder.h"
#import <Speech/Speech.h>
#import <math.h>
#import <os/lock.h>
#import "TutuPianoTone.h"

// 麦里的声音换成 16k 送进琴声分辨。听琴的麦和听人说话的麦都往这里送。
@interface TutuToneFeed : NSObject
- (void)feed:(AVAudioPCMBuffer *)buf rate:(double)rate;
- (NSDictionary *)level;
@end

@implementation TutuToneFeed {
  TutuPianoTone *_tone;
  os_unfair_lock _lock;
  double _pos;
  double _acc;
  int _count;
  float _out[4096];
  NSTimeInterval _fedAt;
}

- (instancetype)init {
  if ((self = [super init])) {
    _tone = calloc(1, sizeof(TutuPianoTone));
    tutu_tone_reset(_tone);
    _lock = OS_UNFAIR_LOCK_INIT;
  }
  return self;
}

- (void)dealloc {
  free(_tone);
}

- (void)feed:(AVAudioPCMBuffer *)buf rate:(double)rate {
  AVAudioFrameCount n = buf.frameLength;
  if (n == 0 || rate <= 0) return;
  float *f = buf.floatChannelData ? buf.floatChannelData[0] : NULL;
  int16_t *s = (!f && buf.int16ChannelData) ? buf.int16ChannelData[0] : NULL;
  if (!f && !s) return;
  double step = rate / TUTU_TONE_RATE;
  os_unfair_lock_lock(&_lock);
  NSTimeInterval now = [NSDate date].timeIntervalSince1970;
  // 麦停过一阵再开，之前那两秒不能算进现在。
  if (now - _fedAt > 1.0) tutu_tone_reset(_tone);
  _fedAt = now;
  int m = 0;
  for (AVAudioFrameCount i = 0; i < n; i++) {
    _acc += f ? f[i] : s[i] / 32768.0;
    _count++;
    _pos += 1.0;
    if (_pos >= step) {
      _out[m++] = (float)(_acc / _count);
      _acc = 0;
      _count = 0;
      _pos -= step;
      if (m == 4096) {
        tutu_tone_push(_tone, _out, m);
        m = 0;
      }
    }
  }
  if (m) tutu_tone_push(_tone, _out, m);
  os_unfair_lock_unlock(&_lock);
}

- (NSDictionary *)level {
  os_unfair_lock_lock(&_lock);
  BOOL stale = [NSDate date].timeIntervalSince1970 - _fedAt > 1.0;
  TutuToneLevel lv = tutu_tone_level(_tone);
  os_unfair_lock_unlock(&_lock);
  if (stale) return @{@"rms": @0, @"piano": @0, @"loud": @0, @"swing": @0, @"tone": @0};
  return @{@"rms": @(lv.rms), @"piano": @(lv.piano), @"loud": @(lv.loud), @"swing": @(lv.swing),
           @"tone": @(tutu_tone_is_piano(lv) ? 1 : 0)};
}
@end

@interface TutuRecorder ()
@property(nonatomic, strong) AVAudioRecorder *recorder;
@property(nonatomic, strong) NSURL *fileURL;
@property(nonatomic, assign) NSTimeInterval startTime;
@property(nonatomic, strong) AVAudioEngine *meterEngine;
@property(nonatomic, strong) TutuToneFeed *tone;
@property(nonatomic, strong) AVAudioEngine *listenEngine;
@property(nonatomic, strong) SFSpeechRecognizer *recognizer;
@property(nonatomic, strong) SFSpeechAudioBufferRecognitionRequest *speechRequest;
@property(nonatomic, strong) SFSpeechRecognitionTask *speechTask;
// 角色要开口时把正在听的这一轮关掉，不然它自己的声音会被录成学生说的话。
// 传 nil 表示停麦但不出结果（测试换成识别口语音频）。
@property(nonatomic, copy) void (^listenFinish)(NSString *text);
// 按住说话松手：不再收音，等识别把最后几个字吐出来。
@property(nonatomic, copy) void (^listenEnd)(void);
// 手指还按着。松得比权限回调还快时，不能再开一个没人关的 60 秒录音。
@property(atomic, assign) BOOL talkHeld;
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

- (TutuToneFeed *)toneFeed {
  if (self.tone == nil) self.tone = [[TutuToneFeed alloc] init];
  return self.tone;
}

- (void)stopMeterEngine {
  AVAudioEngine *engine = self.meterEngine;
  self.meterEngine = nil;
  if (engine == nil) return;
  @try {
    [engine.inputNode removeTapOnBus:0];
    [engine stop];
  } @catch (NSException *e) {
  }
}

// 一直开着麦，把声音送去分辨是不是琴声。麦被占着（0Hz）时不装 tap，免得闪退。
- (BOOL)startMeterEngine {
  if (self.meterEngine != nil && self.meterEngine.isRunning) return YES;
  [self stopMeterEngine];
  NSError *err = nil;
  AVAudioSession *session = [AVAudioSession sharedInstance];
  [session setCategory:AVAudioSessionCategoryPlayAndRecord
           withOptions:AVAudioSessionCategoryOptionDefaultToSpeaker | AVAudioSessionCategoryOptionMixWithOthers
                 error:&err];
  [session setActive:YES error:&err];
  AVAudioEngine *engine = [[AVAudioEngine alloc] init];
  AVAudioInputNode *input = engine.inputNode;
  AVAudioFormat *format = [input outputFormatForBus:0];
  if (format == nil || format.sampleRate <= 0 || format.channelCount == 0) return NO;
  TutuToneFeed *feed = [self toneFeed];
  double rate = format.sampleRate;
  @try {
    [input installTapOnBus:0 bufferSize:2048 format:format block:^(AVAudioPCMBuffer *buf, AVAudioTime *when) {
      [feed feed:buf rate:rate];
    }];
    [engine prepare];
    if (![engine startAndReturnError:&err]) {
      [input removeTapOnBus:0];
      return NO;
    }
  } @catch (NSException *e) {
    return NO;
  }
  self.meterEngine = engine;
  return YES;
}

// 陪练听琴：rms 是 0~1 的响度；tone=1 表示这两秒像琴声（音高稳、一下一下按），说话、角色自己的声音是 0。
RCT_EXPORT_METHOD(readLevel:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  // 测试写「0.3」是琴声，「0.3 voice」是有人在说话。
  NSString *scripted = [self scriptAt:@"tutu_level.txt" consume:NO];
  if (scripted != nil) {
    float rms = [scripted floatValue];
    if (rms < 0) rms = 0;
    if (rms > 1) rms = 1;
    BOOL voice = [scripted rangeOfString:@"voice"].location != NSNotFound;
    BOOL loud = rms >= 0.08f;
    resolve(@{@"rms": @(rms), @"piano": @(voice ? 0 : 1), @"loud": @(loud ? 1 : 0), @"swing": @3,
              @"tone": @((loud && !voice) ? 1 : 0)});
    return;
  }
  if (self.listenEngine != nil) {
    resolve([[self toneFeed] level]);
    return;
  }
  if (self.recorder && self.recorder.recording) {
    resolve(@{@"rms": @0, @"tone": @0});
    return;
  }
  AVAudioSession *session = [AVAudioSession sharedInstance];
  [session requestRecordPermission:^(BOOL granted) {
    if (!granted) {
      resolve(@{@"rms": @0, @"tone": @0});
      return;
    }
    dispatch_async(dispatch_get_main_queue(), ^{
      if (self.listenEngine == nil && ![self startMeterEngine]) {
        resolve(@{@"rms": @0, @"tone": @0});
        return;
      }
      resolve([[self toneFeed] level]);
    });
  }];
}

RCT_EXPORT_METHOD(stopMeter:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    [self stopMeterEngine];
    resolve(@{@"ok": @YES});
  });
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

// 开麦听一段话，最多 maxSec 秒。麦被系统听写或别的 App 占着时，输入格式会是 0Hz，
// 这时装 tap 会抛异常让整个 App 闪退，所以先检查、再兜住，用不了就返回 NO。
// done 在主线程回调；text 为 nil 表示被测试脚本截走了。
- (BOOL)hearFor:(NSTimeInterval)maxSec done:(void (^)(NSString *text))done {
  if (self.listenEngine) return NO;
  [self stopMeterEngine];
  NSError *err = nil;
  AVAudioSession *session = [AVAudioSession sharedInstance];
  [session setCategory:AVAudioSessionCategoryPlayAndRecord
           withOptions:AVAudioSessionCategoryOptionDefaultToSpeaker | AVAudioSessionCategoryOptionMixWithOthers
                 error:&err];
  [session setActive:YES error:&err];
  if (self.recognizer == nil) {
    self.recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:@"zh-CN"]];
  }
  if (self.recognizer == nil || !self.recognizer.available) {
    [self restorePlaybackSession];
    return NO;
  }
  SFSpeechAudioBufferRecognitionRequest *request = [[SFSpeechAudioBufferRecognitionRequest alloc] init];
  request.shouldReportPartialResults = YES;
  AVAudioEngine *engine = [[AVAudioEngine alloc] init];
  AVAudioInputNode *input = engine.inputNode;
  AVAudioFormat *format = [input outputFormatForBus:0];
  if (format == nil || format.sampleRate <= 0 || format.channelCount == 0) {
    [self restorePlaybackSession];
    return NO;
  }
  __block BOOL finished = NO;
  __block BOOL tapped = NO;
  __block NSString *latest = @"";
  __block SFSpeechRecognitionTask *task = nil;
  __block NSMutableArray *observers = [NSMutableArray array];
  void (^quiet)(void) = ^{
    @try {
      if (tapped) [input removeTapOnBus:0];
      tapped = NO;
      [engine stop];
    } @catch (NSException *e) {
    }
  };
  void (^finish)(NSString *) = ^(NSString *text) {
    if (finished) return;
    finished = YES;
    self.listenFinish = nil;
    self.listenEnd = nil;
    quiet();
    [task cancel];
    task = nil;
    for (id o in observers) [[NSNotificationCenter defaultCenter] removeObserver:o];
    [observers removeAllObjects];
    if (self.listenEngine == engine) self.listenEngine = nil;
    self.speechRequest = nil;
    [self restorePlaybackSession];
    done(text);
  };
  TutuToneFeed *feed = [self toneFeed];
  double rate = format.sampleRate;
  @try {
    [input installTapOnBus:0 bufferSize:1024 format:format block:^(AVAudioPCMBuffer *buf, AVAudioTime *when) {
      [request appendAudioPCMBuffer:buf];
      [feed feed:buf rate:rate];
    }];
    tapped = YES;
    [engine prepare];
    if (![engine startAndReturnError:&err]) {
      quiet();
      [self restorePlaybackSession];
      return NO;
    }
  } @catch (NSException *e) {
    quiet();
    [self restorePlaybackSession];
    return NO;
  }
  self.listenEngine = engine;
  self.speechRequest = request;
  NSOperationQueue *main = [NSOperationQueue mainQueue];
  [observers addObject:[[NSNotificationCenter defaultCenter]
      addObserverForName:AVAudioEngineConfigurationChangeNotification object:engine queue:main
              usingBlock:^(NSNotification *n) { finish(latest); }]];
  [observers addObject:[[NSNotificationCenter defaultCenter]
      addObserverForName:AVAudioSessionInterruptionNotification object:nil queue:main
              usingBlock:^(NSNotification *n) { finish(latest); }]];
  self.listenFinish = ^(NSString *text) {
    finish(text);
  };
  self.listenEnd = ^{
    if (finished) return;
    [request endAudio];
    quiet();
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      finish(latest);
    });
  };
  task = [self.recognizer recognitionTaskWithRequest:request
                                       resultHandler:^(SFSpeechRecognitionResult *result, NSError *error) {
    NSString *heard = result.bestTranscription.formattedString;
    BOOL last = (result && result.final) || error;
    dispatch_async(dispatch_get_main_queue(), ^{
      if (heard.length) latest = heard;
      if (last) finish(latest);
    });
  }];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(maxSec * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    if (finished) return;
    [request endAudio];
    finish(latest);
  });
  return YES;
}

// 关掉正在听的这一轮，结果按没听到处理。
RCT_EXPORT_METHOD(cancelListen:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    void (^stop)(NSString *) = self.listenFinish;
    if (stop) stop(@"");
    resolve(@(stop != nil));
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
      BOOL on = [self hearFor:8 done:^(NSString *text) {
        if (text != nil) {
          resolve(@{@"text": text});
          return;
        }
        NSString *path = [self scriptedAudioPath];
        if (!path.length) {
          resolve(@{@"text": @""});
          return;
        }
        [self recognizeAudioFile:path done:^(NSString *heard, NSInteger ms) {
          resolve(@{@"text": heard ?: @"", @"ms": @(ms)});
        }];
      }];
      if (!on) {
        resolve(@{@"text": @""});
        return;
      }
      // 麦已经开着时，后放进来的话或口语音频也要认，不要等到这轮听完。
      void (^mine)(NSString *) = self.listenFinish;
      for (int i = 1; i <= 7; i++) {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(i * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
          void (^stop)(NSString *) = self.listenFinish;
          if (stop == nil || stop != mine) return;
          NSString *line = [self scriptAt:@"tutu_heard.txt" consume:YES];
          if (line.length) {
            stop(line);
          } else if ([self scriptedAudioPath].length) {
            stop(nil);
          }
        });
      }
    });
  }];
}

// 按住说话：按下开麦，松手（talkEnd）后返回这段话。最长一分钟。
// 正在自动听的那一轮会先被关掉。麦用不了时返回 {text:"", busy:true}。
RCT_EXPORT_METHOD(talkStart:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  self.talkHeld = YES;
  [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
    if (status != SFSpeechRecognizerAuthorizationStatusAuthorized) {
      resolve(@{@"text": @"", @"denied": @YES});
      return;
    }
    [[AVAudioSession sharedInstance] requestRecordPermission:^(BOOL granted) {
      dispatch_async(dispatch_get_main_queue(), ^{
        if (!granted) {
          resolve(@{@"text": @"", @"denied": @YES});
          return;
        }
        void (^stop)(NSString *) = self.listenFinish;
        if (stop) stop(@"");
        if (!self.talkHeld) {
          resolve(@{@"text": @""});
          return;
        }
        BOOL on = [self hearFor:60 done:^(NSString *text) {
          resolve(@{@"text": text ?: @""});
        }];
        if (on) return;
        if ([self scriptAt:@"tutu_heard.txt" consume:NO] == nil) {
          resolve(@{@"text": @"", @"busy": @YES});
          return;
        }
        // 模拟器没有麦时，松手那一刻读测试写好的话。
        __block BOOL over = NO;
        self.listenFinish = ^(NSString *text) {
          if (over) return;
          over = YES;
          self.listenFinish = nil;
          self.listenEnd = nil;
          resolve(@{@"text": text ?: @""});
        };
        self.listenEnd = ^{
          void (^stop)(NSString *) = self.listenFinish;
          if (stop) stop(@"");
        };
      });
    }];
  }];
}

RCT_EXPORT_METHOD(talkEnd:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  self.talkHeld = NO;
  dispatch_async(dispatch_get_main_queue(), ^{
    NSString *line = [self scriptAt:@"tutu_heard.txt" consume:YES];
    void (^stop)(NSString *) = self.listenFinish;
    void (^end)(void) = self.listenEnd;
    if (line.length && stop) {
      stop(line);
    } else if (end) {
      end();
    }
    resolve(@(end != nil));
  });
}

RCT_EXPORT_METHOD(talkCancel:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  self.talkHeld = NO;
  dispatch_async(dispatch_get_main_queue(), ^{
    void (^stop)(NSString *) = self.listenFinish;
    if (stop) stop(@"");
    resolve(@(stop != nil));
  });
}

@end
