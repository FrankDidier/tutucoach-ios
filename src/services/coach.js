// AI 教练角色 + 个性化总结（D），对应 Android 的 CoachRepository + CoachSummaryClient。
import {getJson, postJson} from './api';
import {getDeviceId} from './device';

/** 拉取后台配置的可见 AI 角色（含 voiceId / systemPrompt）。
 * 带 viewer=本设备id：这样能额外看到「自己老师」设为私有且已审核通过的分身。 */
export function fetchCoaches() {
  return getJson('/api/coach/list', {viewer: getDeviceId()});
}

/**
 * 练习结束时请求"会思考"的个性化点评（D1/D2）。
 * 返回 {ok, text, voice_id, llm}；text 可直接交给 TTS 播报。
 */
export function requestSummary({
  coachId,
  minutes,
  matchRate,
  topError = '',
  errorDetail = '',
  streak = 0,
}) {
  return postJson('/api/coach/summary', {
    coach_id: coachId,
    minutes,
    match_rate: matchRate,
    top_error: topError,
    error_detail: errorDetail,
    streak,
  });
}
