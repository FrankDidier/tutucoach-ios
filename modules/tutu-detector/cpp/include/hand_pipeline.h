// 兔兔教练 · 手型检测「实时管线」共享 C++ 组件
// =============================================================================
// 这是 Android 端 HandednessResolver.java 与 HandLandmarkStabilizer.java 的
// 1:1 忠实移植，作为 iOS / Android 共用单一事实来源，保证两端实时检测一致。
//
//   - HandednessResolver：把每帧检测到的若干只手稳定归属为「用户左手 / 右手」。
//   - HandLandmarkStabilizer：速度自适应 EMA，平滑抖动、输出整手运动幅度。
// =============================================================================
#ifndef TUTUCOACH_HAND_PIPELINE_H
#define TUTUCOACH_HAND_PIPELINE_H

#include <map>
#include <string>
#include <vector>

#include "hand_pose_analyzer.h"

namespace tutucoach {

// 解析结果：用户左/右手在原始结果中的下标，-1 表示该手缺席。
struct HandAssignment {
  int leftIndex = -1;
  int rightIndex = -1;
};

// 把每只手归属到「用户左手 / 用户右手」。
// allPoints：每只手的 21 个关键点（MediaPipe 顺序）
// mpLabels ：每只手的 MediaPipe 标签 "Left"/"Right"
// mpConf   ：每只手的标签置信度（0..1）
HandAssignment resolveHandedness(const std::vector<std::vector<Point>>& allPoints,
                                 const std::vector<std::string>& mpLabels,
                                 const std::vector<float>& mpConfidences);

// 关键点输入稳态器（速度自适应 EMA）。与 Android HandLandmarkStabilizer 一致。
class HandLandmarkStabilizer {
 public:
  static constexpr float MIN_ALPHA = 0.18f;
  static constexpr float MAX_ALPHA = 0.85f;
  static constexpr float VEL_LO = 0.005f;
  static constexpr float VEL_HI = 0.07f;

  std::vector<Point> stabilize(const std::string& handLabel,
                               const std::vector<Point>& raw);
  float getMotionMagnitude(const std::string& handLabel) const;
  void reset();
  void resetHand(const std::string& handLabel);

 private:
  std::map<std::string, std::vector<Point>> last_smoothed_;
  std::map<std::string, float> last_motion_magnitude_;
};

}  // namespace tutucoach

#endif  // TUTUCOACH_HAND_PIPELINE_H
