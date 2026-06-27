import {NativeModules} from 'react-native';

// 原生录音模块（iOS: AVAudioRecorder）。方法：start() / stop() -> {path,durationMs} / cancel()。
export default NativeModules.TutuRecorder;
