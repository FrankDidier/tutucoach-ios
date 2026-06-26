import {NativeModules, requireNativeComponent, Platform} from 'react-native';

const {TutuDetector} = NativeModules;

if (!TutuDetector && Platform.OS === 'ios') {
  console.warn('[tutu-detector] 原生模块未找到，请确认已 pod install 并重新构建 iOS。');
}

// 实时相机检测视图（iOS 原生）。props: active(bool), onResult(event), style。
export const TutuDetectorView =
  Platform.OS === 'ios' ? requireNativeComponent('TutuDetectorView') : null;

// 模块方法：
//   setAngleThreshold(20)
//   analyzeImagePath(path) -> {hands:[...]}
//   setTemplateFromImage(path) -> {hasLeft,hasRight,handCount}
//   hasTemplate() -> {hasLeft,hasRight}
//   clearTemplates()
export default TutuDetector;
