// 兔兔教练 · 手型检测「黄金核心」实现（HandPoseAnalyzer.java 的 1:1 移植）
#include "hand_pose_analyzer.h"

#include <algorithm>
#include <cmath>

namespace tutucoach {

const int FINGER_JOINTS[5][4] = {
    {THUMB_CMC, THUMB_MCP, THUMB_IP, THUMB_TIP},
    {INDEX_MCP, INDEX_PIP, INDEX_DIP, INDEX_TIP},
    {MIDDLE_MCP, MIDDLE_PIP, MIDDLE_DIP, MIDDLE_TIP},
    {RING_MCP, RING_PIP, RING_DIP, RING_TIP},
    {PINKY_MCP, PINKY_PIP, PINKY_DIP, PINKY_TIP},
};

// ==================== 模板/当前帧 setter ====================

void HandPoseAnalyzer::setLeftTemplate(const std::vector<Point>& marks) {
  left_template_ = marks;
  has_left_template_ = true;
}

void HandPoseAnalyzer::setRightTemplate(const std::vector<Point>& marks) {
  right_template_ = marks;
  has_right_template_ = true;
}

void HandPoseAnalyzer::clearTemplates() {
  left_template_.clear();
  right_template_.clear();
  has_left_template_ = false;
  has_right_template_ = false;
}

void HandPoseAnalyzer::setCurrentLeft(const std::vector<Point>& marks) {
  current_left_ = marks;
  has_current_left_ = !marks.empty();
}

void HandPoseAnalyzer::setCurrentRight(const std::vector<Point>& marks) {
  current_right_ = marks;
  has_current_right_ = !marks.empty();
}

void HandPoseAnalyzer::clearCurrent() {
  current_left_.clear();
  current_right_.clear();
  has_current_left_ = false;
  has_current_right_ = false;
}

// ==================== 匹配判定 ====================

MatchResult HandPoseAnalyzer::analyzeDualHandMatch() {
  bool anyResult = false;
  bool allPass = true;

  if (has_left_template_ && has_current_left_) {
    MatchResult leftResult = analyzeHandMatch(left_template_, current_left_);
    if (leftResult.hasValue) {
      anyResult = true;
      if (!leftResult.value) allPass = false;
    }
  }
  if (has_right_template_ && has_current_right_) {
    MatchResult rightResult = analyzeHandMatch(right_template_, current_right_);
    if (rightResult.hasValue) {
      anyResult = true;
      if (!rightResult.value) allPass = false;
    }
  }
  return anyResult ? MatchResult::of(allPass) : MatchResult::none();
}

MatchResult HandPoseAnalyzer::analyzeHandMatch(const std::vector<Point>& tmpl,
                                               const std::vector<Point>& current) {
  if (tmpl.size() < 21 || current.size() < 21) {
    return MatchResult::none();
  }
  float palmTh = angle_threshold_ * PALM_THRESHOLD_RATIO;
  for (const auto& joints : FINGER_JOINTS) {
    OptFloat palmDev = palmAngleDeviation(joints, tmpl, current);
    OptFloat fingerDev = fingerAngleDeviation(joints, tmpl, current);
    if (palmDev.valid && std::fabs(palmDev.value) > palmTh) return MatchResult::of(false);
    if (fingerDev.valid && std::fabs(fingerDev.value) > angle_threshold_) return MatchResult::of(false);
  }
  return MatchResult::of(true);
}

// ==================== 错误检测 ====================

std::vector<ErrorDetail> HandPoseAnalyzer::detectErrorsForAiReporting() {
  return detectSpecificErrors();
}

std::vector<ErrorDetail> HandPoseAnalyzer::detectSpecificErrors() {
  std::vector<ErrorDetail> errors;
  if (has_left_template_ && has_current_left_ && !left_template_.empty()) {
    classifyHand("左手", left_template_, current_left_, errors);
  }
  if (has_right_template_ && has_current_right_ && !right_template_.empty()) {
    classifyHand("右手", right_template_, current_right_, errors);
  }
  return errors;
}

void HandPoseAnalyzer::classifyHand(const std::string& handLabel,
                                    const std::vector<Point>& tmpl,
                                    const std::vector<Point>& current,
                                    std::vector<ErrorDetail>& errors) {
  // 指节角：取偏差绝对值最大的一根手指；符号决定 扁指(<0)/勾指(>0)
  float strongestFingerDev = 0.0f;
  for (const auto& joints : FINGER_JOINTS) {
    OptFloat dev = fingerAngleDeviation(joints, tmpl, current);
    if (!dev.valid) continue;
    if (std::fabs(dev.value) > angle_threshold_ &&
        std::fabs(dev.value) > std::fabs(strongestFingerDev)) {
      strongestFingerDev = dev.value;
    }
  }
  if (strongestFingerDev != 0.0f) {
    if (strongestFingerDev < 0.0f) {
      errors.push_back({ErrorType::FINGER_FLAT, handLabel, handLabel + "扁指"});
    } else {
      errors.push_back({ErrorType::FINGER_HOOKED, handLabel, handLabel + "勾指"});
    }
  }

  // 掌侧角：阈值 ×0.8
  float palmTh = angle_threshold_ * PALM_THRESHOLD_RATIO;
  float strongestPalmDev = 0.0f;
  for (const auto& joints : FINGER_JOINTS) {
    OptFloat dev = palmAngleDeviation(joints, tmpl, current);
    if (!dev.valid) continue;
    if (std::fabs(dev.value) > palmTh &&
        std::fabs(dev.value) > std::fabs(strongestPalmDev)) {
      strongestPalmDev = dev.value;
    }
  }
  if (strongestPalmDev != 0.0f) {
    errors.push_back({ErrorType::PALM_COLLAPSED, handLabel, handLabel + "塌掌"});
  }
}

// ==================== 角度工具 ====================

OptFloat HandPoseAnalyzer::palmAngleDeviation(const int joints[4],
                                              const std::vector<Point>& tmpl,
                                              const std::vector<Point>& current) {
  float t = calculateThreePointAngle(tmpl[WRIST], tmpl[joints[0]], tmpl[joints[1]]);
  float c = calculateThreePointAngle(current[WRIST], current[joints[0]], current[joints[1]]);
  if (t < 0.0f || c < 0.0f) return {false, 0.0f};
  return {true, c - t};
}

OptFloat HandPoseAnalyzer::fingerAngleDeviation(const int joints[4],
                                                const std::vector<Point>& tmpl,
                                                const std::vector<Point>& current) {
  float t = calculateThreePointAngle(tmpl[joints[0]], tmpl[joints[1]], tmpl[joints[2]]);
  float c = calculateThreePointAngle(current[joints[0]], current[joints[1]], current[joints[2]]);
  if (t < 0.0f || c < 0.0f) return {false, 0.0f};
  return {true, c - t};
}

// 顶点 b 处 a→b 与 b→c 的夹角（度）。复刻 Java：float 计算 + double 三角函数。
float HandPoseAnalyzer::calculateThreePointAngle(const Point& a, const Point& b, const Point& c) {
  float abx = b.x - a.x;
  float aby = b.y - a.y;
  float bcx = c.x - b.x;
  float bcy = c.y - b.y;
  float dot = abx * bcx + aby * bcy;
  float mu = static_cast<float>(std::sqrt(static_cast<double>(abx * abx + aby * aby)));
  float mv = static_cast<float>(std::sqrt(static_cast<double>(bcx * bcx + bcy * bcy)));
  if (mu == 0.0f || mv == 0.0f) return -1.0f;
  double cosTheta = std::max(-1.0, std::min(1.0, static_cast<double>(dot / (mu * mv))));
  return static_cast<float>(std::acos(cosTheta) * 180.0 / M_PI);
}

// ==================== 诊断分数（仅日志） ====================

float HandPoseAnalyzer::computePalmScore(const std::vector<Point>& tmpl,
                                         const std::vector<Point>& current) {
  if (tmpl.size() < 21 || current.size() < 21) return 0.0f;
  float maxAbs = 0.0f;
  for (const auto& joints : FINGER_JOINTS) {
    OptFloat dev = palmAngleDeviation(joints, tmpl, current);
    if (!dev.valid) continue;
    float a = std::fabs(dev.value);
    if (a > maxAbs) maxAbs = a;
  }
  return std::min(1.0f, maxAbs / (angle_threshold_ * 2.0f));
}

float HandPoseAnalyzer::computeFlatScore(const std::vector<Point>& tmpl,
                                         const std::vector<Point>& current) {
  if (tmpl.size() < 21 || current.size() < 21) return 0.0f;
  float maxNeg = 0.0f;
  for (int i = 1; i < 5; i++) {
    OptFloat dev = fingerAngleDeviation(FINGER_JOINTS[i], tmpl, current);
    if (!dev.valid) continue;
    if (dev.value < 0.0f && -dev.value > maxNeg) maxNeg = -dev.value;
  }
  return std::min(1.0f, maxNeg / (angle_threshold_ * 2.0f));
}

}  // namespace tutucoach
