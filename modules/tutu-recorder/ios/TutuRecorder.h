#import <React/RCTBridgeModule.h>
#import <AVFoundation/AVFoundation.h>

// 录音原生模块：录制 AAC/m4a，单声道 16k，供「声音复刻」上传。
@interface TutuRecorder : NSObject <RCTBridgeModule, AVAudioRecorderDelegate>
@end
