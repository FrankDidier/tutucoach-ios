#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <AVFoundation/AVFoundation.h>

@implementation AppDelegate

// 语音播报（TTS）关键修复：由 App 统一持有音频会话。
// react-native-tts 自身从不主动激活 AVAudioSession，导致 iOS 上「兔兔说话」经常没声音
// （而提示音 react-native-sound 自带会话管理所以能响）。
// 用 Playback 分类并保持激活：① 忽略「静音拨片」② 始终处于可播放状态。
// MixWithOthers 让我们不打断用户正在播放的其它音频，同时自身仍可出声。
- (void)tutu_activateAudioSession
{
  AVAudioSession *session = [AVAudioSession sharedInstance];
  NSError *err = nil;
  [session setCategory:AVAudioSessionCategoryPlayback
                  mode:AVAudioSessionModeDefault
               options:AVAudioSessionCategoryOptionMixWithOthers
                 error:&err];
  [session setActive:YES error:&err];
}

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"TutuCoachRN";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  [self tutu_activateAudioSession];
  // 每次回到前台都重新激活（录音/来电/其它 App 可能改动过会话），保证兔兔语音正常出声。
  // 用通知而非重写 applicationDidBecomeActive，避免覆盖 RN 基类的同名实现。
  [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(tutu_activateAudioSession)
                                               name:UIApplicationDidBecomeActiveNotification
                                             object:nil];

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

// 微信回调：通过通知转发给 RNWeChat（保持 AppDelegate 与微信 SDK 解耦）。
- (BOOL)application:(UIApplication *)application
            openURL:(NSURL *)url
            options:(NSDictionary<UIApplicationOpenURLOptionsKey, id> *)options
{
  [[NSNotificationCenter defaultCenter] postNotificationName:@"RNWeChatHandleOpenURL"
                                                      object:url];
  return YES;
}

- (BOOL)application:(UIApplication *)application
continueUserActivity:(NSUserActivity *)userActivity
 restorationHandler:(void (^)(NSArray<id<UIUserActivityRestoring>> *_Nullable))restorationHandler
{
  [[NSNotificationCenter defaultCenter] postNotificationName:@"RNWeChatHandleUniversalLink"
                                                      object:userActivity];
  return YES;
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
