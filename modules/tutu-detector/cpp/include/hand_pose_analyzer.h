// 兔兔教练 · 手型检测「黄金核心」(platform-agnostic C++17)
// =============================================================================
// 这是 Android 端 HandPoseAnalyzer.java 的 1:1 忠实移植，作为 iOS / Android 共用的
// 单一事实来源（single source of truth），保证两端检测结果按位一致(bit-identical)。
//
// 设计要点（与 2.0.12.1 原版一致，详见 Java 版 Javadoc）：
//   - 纯逐指几何阈值判定，无评分/归一化/smoothStep；
//   - 每根手指检查两个角度：掌侧角 WRIST→MCP→PIP、指节角 MCP→PIP→DIP；
//   - 掌侧阈值 = angleThreshold × 0.8（PALM_THRESHOLD_RATIO）；
//   - 错误归类由偏差「符号」决定：扁指(<0) / 勾指(>0) / 塌掌。
//
// 浮点语义：刻意复刻 Java 的 float 计算 + double 三角函数，使两端逐位一致。
// =============================================================================
#ifndef TUTUCOACH_HAND_POSE_ANALYZER_H
#define TUTUCOACH_HAND_POSE_ANALYZER_H

#include <string>
#include <vector>

namespace tutucoach {

struct Point {
  float x = 0.0f;
  float y = 0.0f;
};

// MediaPipe 21 关键点索引
enum LandmarkIndex {
  WRIST = 0,
  THUMB_CMC = 1, THUMB_MCP = 2, THUMB_IP = 3, THUMB_TIP = 4,
  INDEX_MCP = 5, INDEX_PIP = 6, INDEX_DIP = 7, INDEX_TIP = 8,
  MIDDLE_MCP = 9, MIDDLE_PIP = 10, MIDDLE_DIP = 11, MIDDLE_TIP = 12,
  RING_MCP = 13, RING_PIP = 14, RING_DIP = 15, RING_TIP = 16,
  PINKY_MCP = 17, PINKY_PIP = 18, PINKY_DIP = 19, PINKY_TIP = 20,
};

enum class ErrorType {
  PALM_COLLAPSED,
  FINGER_FLAT,
  FINGER_HOOKED,
  THUMB_ISSUE,
  WRIST_LOW,
  NONE,
};

struct ErrorDetail {
  ErrorType type;
  std::string handLabel;  // "左手" / "右手"
  std::string message;    // 例如 "左手塌掌"
};

// optional<bool> 的等价物：用于 analyzeHandMatch（null=数据不足）
struct MatchResult {
  bool hasValue = false;
  bool value = false;
  static MatchResult none() { return {false, false}; }
  static MatchResult of(bool v) { return {true, v}; }
};

// optional<float> 的等价物：用于角度偏差（invalid=角度无效）
struct OptFloat {
  bool valid = false;
  float value = 0.0f;
};

// 每根手指的 {MCP, PIP, DIP, TIP}
extern const int FINGER_JOINTS[5][4];

class HandPoseAnalyzer {
 public:
  // 2.0.12.1 默认阈值
  static constexpr float DEFAULT_ANGLE_THRESHOLD = 20.0f;
  // 掌侧角阈值比例（见 Java Javadoc）
  static constexpr float PALM_THRESHOLD_RATIO = 0.8f;

  HandPoseAnalyzer() = default;

  void setLeftTemplate(const std::vector<Point>& marks);
  void setRightTemplate(const std::vector<Point>& marks);
  bool hasLeftTemplate() const { return has_left_template_; }
  bool hasRightTemplate() const { return has_right_template_; }
  void clearTemplates();

  void setCurrentLeft(const std::vector<Point>& marks);
  void setCurrentRight(const std::vector<Point>& marks);
  void clearCurrent();

  void setAngleThreshold(float threshold) { angle_threshold_ = threshold; }
  float getAngleThreshold() const { return angle_threshold_; }

  // ==================== 匹配判定（2.0.12.1 verbatim） ====================
  MatchResult analyzeDualHandMatch();
  MatchResult analyzeHandMatch(const std::vector<Point>& tmpl,
                               const std::vector<Point>& current);

  // ==================== 错误检测 ====================
  std::vector<ErrorDetail> detectErrorsForAiReporting();
  std::vector<ErrorDetail> detectSpecificErrors();

  // ==================== 诊断分数（仅日志，不参与检测决策） ====================
  float computePalmScore(const std::vector<Point>& tmpl,
                         const std::vector<Point>& current);
  float computeFlatScore(const std::vector<Point>& tmpl,
                         const std::vector<Point>& current);

  // 角度工具（公开以便测试）：顶点 b，a→b 与 b→c 的夹角（度）；无效返回 -1
  static float calculateThreePointAngle(const Point& a, const Point& b, const Point& c);

 private:
  void classifyHand(const std::string& handLabel,
                    const std::vector<Point>& tmpl,
                    const std::vector<Point>& current,
                    std::vector<ErrorDetail>& errors);

  OptFloat palmAngleDeviation(const int joints[4],
                              const std::vector<Point>& tmpl,
                              const std::vector<Point>& current);
  OptFloat fingerAngleDeviation(const int joints[4],
                                const std::vector<Point>& tmpl,
                                const std::vector<Point>& current);

  std::vector<Point> left_template_;
  std::vector<Point> right_template_;
  bool has_left_template_ = false;
  bool has_right_template_ = false;

  std::vector<Point> current_left_;
  std::vector<Point> current_right_;
  bool has_current_left_ = false;
  bool has_current_right_ = false;

  float angle_threshold_ = DEFAULT_ANGLE_THRESHOLD;
};

}  // namespace tutucoach

#endif  // TUTUCOACH_HAND_POSE_ANALYZER_H
