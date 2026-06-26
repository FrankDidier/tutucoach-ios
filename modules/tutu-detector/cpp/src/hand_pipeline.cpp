#include "hand_pipeline.h"

#include <algorithm>
#include <cctype>
#include <cmath>

namespace tutucoach {

namespace {
constexpr float kThumbOffsetRatioThreshold = 0.10f;  // 几何复核阈值（保留）
constexpr float kLowConfidence = 0.85f;              // 低置信度阈值（保留）

float wristX(const std::vector<Point>& points) {
  if (points.size() <= static_cast<size_t>(WRIST)) return 0.0f;
  return points[WRIST].x;
}

bool equalsIgnoreCase(const std::string& a, const char* b) {
  std::string lower = a;
  for (char& c : lower) c = static_cast<char>(std::tolower(c));
  return lower == b;
}
}  // namespace

HandAssignment resolveHandedness(const std::vector<std::vector<Point>>& allPoints,
                                 const std::vector<std::string>& mpLabels,
                                 const std::vector<float>& mpConfidences) {
  HandAssignment empty;
  if (allPoints.empty()) return empty;
  if (mpLabels.size() != allPoints.size()) return empty;

  const size_t n = allPoints.size();

  if (n == 1) {
    // 单只手：直接信 MediaPipe 标签（0.10.5+ 已修正旧版镜像翻转）。
    if (allPoints[0].size() < 21) return empty;
    bool mpSaysLeft = equalsIgnoreCase(mpLabels[0], "left");
    HandAssignment a;
    if (mpSaysLeft) {
      a.leftIndex = 0;
      a.rightIndex = -1;
    } else {
      a.leftIndex = -1;
      a.rightIndex = 0;
    }
    return a;
  }

  // n>=2：找屏幕最左 (min x) 与最右 (max x) 两只手。
  int leftScreenIdx = 0;
  int rightScreenIdx = 0;
  float minX = wristX(allPoints[0]);
  float maxX = minX;
  for (size_t i = 1; i < n; i++) {
    float xi = wristX(allPoints[i]);
    if (xi < minX) {
      minX = xi;
      leftScreenIdx = static_cast<int>(i);
    }
    if (xi > maxX) {
      maxX = xi;
      rightScreenIdx = static_cast<int>(i);
    }
  }
  if (leftScreenIdx == rightScreenIdx) {
    leftScreenIdx = 0;
    rightScreenIdx = 1;
  }

  // BACK 摄像头未镜像 → 屏幕左侧 = 用户右手，屏幕右侧 = 用户左手。
  HandAssignment a;
  a.rightIndex = leftScreenIdx;
  a.leftIndex = rightScreenIdx;
  return a;
}

// ===================== HandLandmarkStabilizer =====================

namespace {
float dist(const Point& a, const Point& b) {
  float dx = a.x - b.x;
  float dy = a.y - b.y;
  return std::sqrt(dx * dx + dy * dy);
}

float palmSpan(const std::vector<Point>& hand) {
  return dist(hand[MIDDLE_MCP], hand[PINKY_MCP]);
}

float clamp01(float v) {
  if (v < 0.0f) return 0.0f;
  if (v > 1.0f) return 1.0f;
  return v;
}
}  // namespace

std::vector<Point> HandLandmarkStabilizer::stabilize(const std::string& handLabel,
                                                     const std::vector<Point>& raw) {
  if (raw.size() < 21) return raw;

  auto it = last_smoothed_.find(handLabel);
  if (it == last_smoothed_.end() || it->second.size() != raw.size()) {
    last_smoothed_[handLabel] = raw;
    last_motion_magnitude_[handLabel] = 0.0f;
    return raw;
  }
  const std::vector<Point>& prev = it->second;

  float span = palmSpan(prev);
  if (span < 1e-4f) span = 1.0f;

  float wristVel = dist(prev[WRIST], raw[WRIST]) / span;
  float mcpVel = dist(prev[MIDDLE_MCP], raw[MIDDLE_MCP]) / span;
  float globalVel = std::max(wristVel, mcpVel);

  float motionMagnitude = clamp01((globalVel - VEL_LO) / std::max(1e-6f, VEL_HI - VEL_LO));
  last_motion_magnitude_[handLabel] = motionMagnitude;

  std::vector<Point> out;
  out.reserve(raw.size());
  for (size_t i = 0; i < raw.size(); i++) {
    const Point& p = raw[i];
    const Point& q = prev[i];
    float pointVel = dist(p, q) / span;
    float t = clamp01((pointVel - VEL_LO) / std::max(1e-6f, VEL_HI - VEL_LO));
    float alpha = MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * t;
    Point smoothed;
    smoothed.x = q.x + alpha * (p.x - q.x);
    smoothed.y = q.y + alpha * (p.y - q.y);
    out.push_back(smoothed);
  }
  last_smoothed_[handLabel] = out;
  return out;
}

float HandLandmarkStabilizer::getMotionMagnitude(const std::string& handLabel) const {
  auto it = last_motion_magnitude_.find(handLabel);
  return it == last_motion_magnitude_.end() ? 0.0f : it->second;
}

void HandLandmarkStabilizer::reset() {
  last_smoothed_.clear();
  last_motion_magnitude_.clear();
}

void HandLandmarkStabilizer::resetHand(const std::string& handLabel) {
  last_smoothed_.erase(handLabel);
  last_motion_magnitude_.erase(handLabel);
}

}  // namespace tutucoach
