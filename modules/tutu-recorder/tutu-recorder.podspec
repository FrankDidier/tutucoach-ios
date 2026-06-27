require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "tutu-recorder"
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
end
