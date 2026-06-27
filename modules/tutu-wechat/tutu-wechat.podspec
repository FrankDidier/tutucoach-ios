require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "tutu-wechat"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://tutujiaolian.com"
  s.license      = { :type => "Proprietary" }
  s.author       = { "IMPIT" => "support@tutujiaolian.com" }
  s.platforms    = { :ios => "15.1" }
  s.source       = { :path => "." }

  s.source_files = "ios/**/*.{h,m}"
  s.public_header_files = "ios/**/*.h"

  s.dependency "React-Core"
  # 微信 Open SDK（登录/支付/分享）。2.0.5 暂未稳定上架 trunk，锁定 2.0.4。
  s.dependency "WechatOpenSDK-XCFramework", "2.0.4"
end
