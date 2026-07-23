// 录音封装 —— 桥接原生 TutuRecorder（AVAudioRecorder, 录 m4a/AAC）。
// 原生模块未编入时全部安全降级（返回 no_module），不崩溃。
import {NativeModules} from 'react-native';

const Rec = NativeModules.TutuRecorder || null;

export function isRecorderAvailable() {
  return !!Rec;
}

/** 开始录音；成功返回 {ok:true}。 */
export async function startRecording() {
  if (!Rec) return {error: 'no_module'};
  try {
    await Rec.start();
    return {ok: true};
  } catch (e) {
    return {error: String(e?.message || e)};
  }
}

/** 停止录音；成功返回 {ok:true, path, durationMs, base64, bytes}。
 * base64 为录音内容（用于 JSON 上传，规避 file:// multipart 在部分机型发不出去的问题）。 */
export async function stopRecording() {
  if (!Rec) return {error: 'no_module'};
  try {
    const r = (await Rec.stop()) || {};
    return {
      ok: true,
      path: r.path,
      durationMs: r.durationMs,
      base64: r.base64 || '',
      bytes: r.bytes || 0,
    };
  } catch (e) {
    return {error: String(e?.message || e)};
  }
}

export async function cancelRecording() {
  if (!Rec) return;
  try {
    await Rec.cancel();
  } catch (e) {}
}

export default {isRecorderAvailable, startRecording, stopRecording, cancelRecording};
