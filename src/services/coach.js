// AI 教练角色 + 个性化总结（D），对应 Android 的 CoachRepository + CoachSummaryClient。
import {getJson, postJson} from './api';

/** 拉取后台配置的全部 AI 角色（含 voiceId / systemPrompt）。 */
export function fetchCoaches() {
  return getJson('/api/coach/list');
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
