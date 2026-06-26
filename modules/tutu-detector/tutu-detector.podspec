require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "tutu-detector"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://tutujiaolian.com"
  s.license      = { :type => "Proprietary" }
  s.author       = { "IMPIT" => "support@tutujiaolian.com" }
  s.platforms    = { :ios => "15.1" }
  s.source       = { :path => "." }

  # Obj-C++ 桥接 + 共享 C++「黄金核心」(与 Android 同一套检测逻辑)
  s.source_files = [
    "ios/**/*.{h,m,mm}",
    "cpp/src/**/*.cpp",
    "cpp/include/**/*.h"
  ]
  s.public_header_files = "ios/**/*.h"

  # MediaPipe 手部关键点模型随 Pod 一起打包进 App
  s.resources = ["resources/hand_landmarker.task"]

  # React Native 桥接头文件（<React/RCTBridgeModule.h> 等）
  s.dependency "React-Core"
  # MediaPipe iOS 任务库（手部关键点检测）
  s.dependency "MediaPipeTasksVision"

  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    "CLANG_CXX_LIBRARY" => "libc++",
    "HEADER_SEARCH_PATHS" => "\"$(PODS_TARGET_SRCROOT)/cpp/include\""
  }
end
