#import "TutuDetectorEngine.h"
#import <MediaPipeTasksVision/MediaPipeTasksVision.h>

#include <string>
#include <vector>

#include "hand_pose_analyzer.h"
#include "hand_pipeline.h"

using tutucoach::HandPoseAnalyzer;
using tutucoach::HandLandmarkStabilizer;
using tutucoach::ErrorDetail;
using tutucoach::HandAssignment;

@implementation TutuDetectorEngine {
  MPPHandLandmarker *_imageLandmarker;  // 静态图片模式（模板 / 单图）
  HandPoseAnalyzer _analyzer;           // 共享 C++ 黄金核心
  HandLandmarkStabilizer _stabilizer;   // 共享 C++ 稳态器
  int _matchCount;
  int _mismatchCount;
  NSArray *_lastLiveHands;  // 最近一帧的手（用于实时定格设模版）
}

+ (instancetype)shared {
  static TutuDetectorEngine *instance = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    instance = [[TutuDetectorEngine alloc] init];
  });
  return instance;
}

- (instancetype)init {
  self = [super init];
  if (self) {
    _angleThreshold = HandPoseAnalyzer::DEFAULT_ANGLE_THRESHOLD;
    _analyzer.setAngleThreshold(_angleThreshold);
  }
  return self;
}

- (void)setAngleThreshold:(float)angleThreshold {
  _angleThreshold = angleThreshold;
  _analyzer.setAngleThreshold(angleThreshold);
}

#pragma mark - 模型

- (NSString *)modelPath {
  return [[NSBundle mainBundle] pathForResource:@"hand_landmarker" ofType:@"task"];
}

- (MPPHandLandmarker *)imageLandmarkerOrError:(NSError **)error {
  if (_imageLandmarker) return _imageLandmarker;
  NSString *path = [self modelPath];
  if (path == nil) {
    if (error) *error = [NSError errorWithDomain:@"TutuDetector" code:404
                          userInfo:@{NSLocalizedDescriptionKey: @"找不到 hand_landmarker.task 模型"}];
    return nil;
  }
  MPPHandLandmarkerOptions *options = [[MPPHandLandmarkerOptions alloc] init];
  options.baseOptions.modelAssetPath = path;
  options.runningMode = MPPRunningModeImage;
  options.numHands = 2;
  // 与安卓一致：降到 0.3 让稍远/稍偏的手仍被识别。
  options.minHandDetectionConfidence = 0.3f;
  options.minHandPresenceConfidence = 0.3f;
  options.minTrackingConfidence = 0.3f;
  _imageLandmarker = [[MPPHandLandmarker alloc] initWithOptions:options error:error];
  return _imageLandmarker;
}

#pragma mark - 工具

static std::vector<tutucoach::Point> MarksToCpp(NSArray<MPPNormalizedLandmark *> *marks) {
  std::vector<tutucoach::Point> pts;
  pts.reserve(marks.count);
  for (MPPNormalizedLandmark *m in marks) {
    tutucoach::Point p;
    p.x = m.x;
    p.y = m.y;
    pts.push_back(p);
  }
  return pts;
}

// JS 传入的 landmarks 数组 -> C++ 点集
static std::vector<tutucoach::Point> JsonToCpp(NSArray *landmarks) {
  std::vector<tutucoach::Point> pts;
  pts.reserve(landmarks.count);
  for (NSDictionary *d in landmarks) {
    tutucoach::Point p;
    p.x = [d[@"x"] floatValue];
    p.y = [d[@"y"] floatValue];
    pts.push_back(p);
  }
  return pts;
}

- (NSArray *)detectImageAtPath:(NSString *)path
                      cppHands:(std::vector<std::vector<tutucoach::Point>> *)cppHands
                        labels:(std::vector<std::string> *)labels
                         error:(NSError **)error {
  UIImage *img = [UIImage imageWithContentsOfFile:path];
  if (img == nil) {
    if (error) *error = [NSError errorWithDomain:@"TutuDetector" code:400
                          userInfo:@{NSLocalizedDescriptionKey: @"图片读取失败"}];
    return nil;
  }
  MPPHandLandmarker *landmarker = [self imageLandmarkerOrError:error];
  if (landmarker == nil) return nil;
  MPPImage *mppImage = [[MPPImage alloc] initWithUIImage:img error:error];
  if (mppImage == nil) return nil;
  MPPHandLandmarkerResult *result = [landmarker detectImage:mppImage error:error];
  if (result == nil) return nil;

  NSMutableArray *hands = [NSMutableArray array];
  for (NSUInteger i = 0; i < result.landmarks.count; i++) {
    NSArray<MPPNormalizedLandmark *> *marks = result.landmarks[i];
    NSString *label = @"Left";
    float score = 0.f;
    if (result.handedness.count > i && result.handedness[i].count > 0) {
      MPPCategory *c = result.handedness[i][0];
      label = c.categoryName ?: @"Left";
      score = c.score;
    }
    NSMutableArray *pointsJson = [NSMutableArray arrayWithCapacity:marks.count];
    for (MPPNormalizedLandmark *m in marks) {
      [pointsJson addObject:@{@"x": @(m.x), @"y": @(m.y)}];
    }
    [hands addObject:@{@"label": label, @"score": @(score), @"landmarks": pointsJson}];
    if (cppHands) cppHands->push_back(MarksToCpp(marks));
    if (labels) labels->push_back(std::string([label UTF8String]));
  }
  return hands;
}

static NSArray<NSString *> *ErrorMessages(const std::vector<ErrorDetail> &errors) {
  NSMutableArray *arr = [NSMutableArray array];
  for (const auto &e : errors) {
    [arr addObject:[NSString stringWithUTF8String:e.message.c_str()]];
  }
  return arr;
}

#pragma mark - 模板

- (NSDictionary *)setTemplateFromImagePath:(NSString *)path error:(NSError **)error {
  std::vector<std::vector<tutucoach::Point>> cppHands;
  std::vector<std::string> labels;
  NSArray *hands = [self detectImageAtPath:path cppHands:&cppHands labels:&labels error:error];
  if (hands == nil) return nil;
  _analyzer.clearTemplates();
  for (size_t i = 0; i < cppHands.size(); i++) {
    if (labels[i] == "Left") _analyzer.setLeftTemplate(cppHands[i]);
    else _analyzer.setRightTemplate(cppHands[i]);
  }
  return @{
    @"hasLeft": @(_analyzer.hasLeftTemplate()),
    @"hasRight": @(_analyzer.hasRightTemplate()),
    @"handCount": @((int)cppHands.size()),
  };
}

- (BOOL)hasLeftTemplate { return _analyzer.hasLeftTemplate(); }
- (BOOL)hasRightTemplate { return _analyzer.hasRightTemplate(); }
- (void)clearTemplates { _analyzer.clearTemplates(); }

- (NSDictionary *)analyzeImagePath:(NSString *)path error:(NSError **)error {
  NSArray *hands = [self detectImageAtPath:path cppHands:nullptr labels:nullptr error:error];
  if (hands == nil) return nil;
  return @{@"hands": hands};
}

#pragma mark - 实时会话

- (void)startSession {
  _matchCount = 0;
  _mismatchCount = 0;
  _stabilizer.reset();
  _analyzer.clearCurrent();
}

- (void)stopSession {
  _analyzer.clearCurrent();
}

- (NSDictionary *)processLiveHands:(NSArray *)hands {
  // 无手 → 不计入统计（与安卓 handleLiveResult 一致）。
  if (hands == nil || hands.count == 0) {
    return @{
      @"handDetected": @NO,
      @"hasMatch": @NO,
      @"pass": @NO,
      @"matchRate": @([self currentMatchRate]),
      @"errors": @[],
    };
  }

  _analyzer.clearCurrent();
  _lastLiveHands = hands;

  std::vector<std::vector<tutucoach::Point>> allPoints;
  std::vector<std::string> mpLabels;
  std::vector<float> mpConfidences;
  for (NSDictionary *h in hands) {
    allPoints.push_back(JsonToCpp(h[@"landmarks"]));
    NSString *label = h[@"label"] ?: @"Left";
    mpLabels.push_back(std::string([label UTF8String]));
    mpConfidences.push_back([h[@"score"] floatValue]);
  }

  HandAssignment assign = tutucoach::resolveHandedness(allPoints, mpLabels, mpConfidences);

  // 修复「塌掌 → 匹配失败」：单手练习时塌掌会让 MediaPipe 偶发翻转 Left/Right 标签，
  // 这只手于是被丢进未设模板的一侧，analyzeDualHandMatch() 因模板侧无当前手而返回
  // 无值（底部「匹配失败」），而扁指/勾指不改变手心朝向、标签稳定故能识别。
  // 画面只有一只手、且只设置了一只手的模板时，直接按「已设模板侧」归属。
  if (allPoints.size() == 1) {
    bool onlyLeftTpl = _analyzer.hasLeftTemplate() && !_analyzer.hasRightTemplate();
    bool onlyRightTpl = _analyzer.hasRightTemplate() && !_analyzer.hasLeftTemplate();
    if (onlyLeftTpl) {
      assign.leftIndex = 0;
      assign.rightIndex = -1;
    } else if (onlyRightTpl) {
      assign.leftIndex = -1;
      assign.rightIndex = 0;
    }
  }

  if (assign.leftIndex >= 0) {
    std::vector<tutucoach::Point> stable =
        _stabilizer.stabilize("Left", allPoints[assign.leftIndex]);
    _analyzer.setCurrentLeft(stable);
  }
  if (assign.rightIndex >= 0) {
    std::vector<tutucoach::Point> stable =
        _stabilizer.stabilize("Right", allPoints[assign.rightIndex]);
    _analyzer.setCurrentRight(stable);
  }

  tutucoach::MatchResult match = _analyzer.analyzeDualHandMatch();
  if (!match.hasValue) {
    return @{
      @"handDetected": @YES,
      @"hasMatch": @NO,
      @"pass": @NO,
      @"matchRate": @([self currentMatchRate]),
      @"errors": @[],
    };
  }

  if (match.value) {
    _matchCount++;
  } else {
    _mismatchCount++;
  }

  NSArray<NSString *> *errors = @[];
  if (!match.value) {
    errors = ErrorMessages(_analyzer.detectSpecificErrors());
  }

  return @{
    @"handDetected": @YES,
    @"hasMatch": @YES,
    @"pass": @(match.value),
    @"matchRate": @([self currentMatchRate]),
    @"errors": errors,
  };
}

- (NSDictionary *)captureTemplateFromLastFrame {
  if (_lastLiveHands == nil || _lastLiveHands.count == 0) {
    return @{@"hasLeft": @NO, @"hasRight": @NO, @"handCount": @0};
  }
  std::vector<std::vector<tutucoach::Point>> allPoints;
  std::vector<std::string> mpLabels;
  std::vector<float> mpConfidences;
  for (NSDictionary *h in _lastLiveHands) {
    allPoints.push_back(JsonToCpp(h[@"landmarks"]));
    NSString *label = h[@"label"] ?: @"Left";
    mpLabels.push_back(std::string([label UTF8String]));
    mpConfidences.push_back([h[@"score"] floatValue]);
  }
  HandAssignment assign = tutucoach::resolveHandedness(allPoints, mpLabels, mpConfidences);
  _analyzer.clearTemplates();
  if (assign.leftIndex >= 0) _analyzer.setLeftTemplate(allPoints[assign.leftIndex]);
  if (assign.rightIndex >= 0) _analyzer.setRightTemplate(allPoints[assign.rightIndex]);
  return @{
    @"hasLeft": @(_analyzer.hasLeftTemplate()),
    @"hasRight": @(_analyzer.hasRightTemplate()),
    @"handCount": @((int)allPoints.size()),
  };
}

- (double)currentMatchRate {
  int total = _matchCount + _mismatchCount;
  if (total <= 0) return 0.0;
  return (double)_matchCount / (double)total * 100.0;
}

@end
