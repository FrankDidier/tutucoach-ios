import {Platform} from 'react-native';
import {getJson, postForm, postJson, SCORE_UPLOAD_TIMEOUT_MS} from './api';

function fileB64Payload(file) {
  const raw = file?.dataUri || file?.base64 || '';
  if (!raw) return '';
  if (raw.indexOf(',') >= 0 && String(raw).toLowerCase().startsWith('data:')) {
    return raw.split(',', 1)[1] || '';
  }
  return raw;
}

export async function uploadScore(
  teacherId,
  studentId,
  pieceName,
  file,
  {mode = 'replace', uploader = 'teacher'} = {},
) {
  const fd = new FormData();
  fd.append('teacher_id', teacherId || '');
  fd.append('student_id', studentId || '');
  fd.append('piece_name', pieceName || '');
  fd.append('mode', mode || 'replace');
  fd.append('uploader', uploader || 'teacher');
  // 上传只存图立刻返回；OCR/术语后台跑（像扫卷子先出结果）
  fd.append('defer_terms', '1');
  const uri = file?.uri || '';
  const b64 = fileB64Payload(file);
  const mime = file?.type || 'image/jpeg';
  const name = file?.name || 'score.jpg';
  // iOS 相册偶发 ph:// / assets-library://：FormData 读文件会挂死直到超时。
  // 有 base64 时优先走 file_b64，绕开坏 uri。
  const badUri =
    !uri ||
    uri.startsWith('ph://') ||
    uri.startsWith('assets-library://') ||
    uri.startsWith('phassets-library://');
  if (b64 && (badUri || file?.preferB64 || Platform?.OS === 'ios')) {
    fd.append('file_b64', b64);
    fd.append('file_name', name);
    fd.append('file_mime', mime);
    // 仍附可读 uri（file://）作双保险
    if (uri && (uri.startsWith('file://') || uri.startsWith('content://'))) {
      fd.append('file', {uri, type: mime, name});
    }
  } else if (uri) {
    fd.append('file', {uri, type: mime, name});
    if (b64 && b64.length < 6 * 1024 * 1024) {
      fd.append('file_b64', b64);
      fd.append('file_name', name);
      fd.append('file_mime', mime);
    }
  } else if (b64) {
    fd.append('file_b64', b64);
    fd.append('file_name', name);
    fd.append('file_mime', mime);
  } else {
    throw new Error('missing_file');
  }
  return postForm('/api/coach/score/upload', fd, null, SCORE_UPLOAD_TIMEOUT_MS);
}

export async function fetchScore(studentId, pieceName, teacherId = '', role = '') {
  return getJson('/api/coach/score', {
    student_id: studentId || '',
    piece_name: pieceName || '',
    teacher_id: teacherId || '',
    role: role || '',
  });
}

export async function saveScore(
  teacherId,
  studentId,
  pieceName,
  annotations,
  termTranslations,
  {approvePending = false, termOverlays, dividers} = {},
) {
  const body = {
    teacher_id: teacherId || '',
    student_id: studentId || '',
    piece_name: pieceName || '',
    annotations: Array.isArray(annotations) ? annotations : [],
    confirmed_annotations: Array.isArray(annotations) ? annotations : [],
    term_translations: Array.isArray(termTranslations) ? termTranslations : [],
    approve_pending: !!approvePending,
  };
  if (Array.isArray(termOverlays)) {
    body.term_overlays = termOverlays;
  }
  if (Array.isArray(dividers)) {
    body.dividers = dividers;
  }
  return postJson('/api/coach/score/save', body);
}

export async function deleteScore(teacherId, studentId, pieceName, pageIndex = null) {
  const body = {
    teacher_id: teacherId || '',
    student_id: studentId || '',
    piece_name: pieceName || '',
  };
  if (pageIndex !== null && pageIndex !== undefined) {
    body.page_index = pageIndex;
  } else {
    body.page_index = 'all';
  }
  return postJson('/api/coach/score/delete', body, null, 30000);
}

export async function suggestScore(teacherId, studentId, pieceName, existingFocus = []) {
  return postJson(
    '/api/coach/score/suggest',
    {
      teacher_id: teacherId || '',
      student_id: studentId || '',
      piece_name: pieceName || '',
      existing_focus: Array.isArray(existingFocus) ? existingFocus : [],
    },
    null,
    60000,
  );
}

// annotations：手机上现在的段落框（带老师刚写、可能还没存上的重点），重新分段时按段号带过去。
export async function boxesFromDividers(
  teacherId, studentId, pieceName, dividers, existingFocus = [], annotations = [],
) {
  return postJson(
    '/api/coach/score/boxes_from_dividers',
    {
      teacher_id: teacherId || '',
      student_id: studentId || '',
      piece_name: pieceName || '',
      dividers: Array.isArray(dividers) ? dividers : [],
      existing_focus: Array.isArray(existingFocus) ? existingFocus : [],
      annotations: Array.isArray(annotations) ? annotations : [],
    },
    null,
    60000,
  );
}

export async function recognizeScoreTerms(teacherId, studentId, pieceName) {
  // 翻译可能多页，给足时间；服务端 translate 模式已压到约十几秒/页
  return postJson(
    '/api/coach/score/ocr',
    {
      teacher_id: teacherId || '',
      student_id: studentId || '',
      piece_name: pieceName || '',
    },
    null,
    180000,
  );
}

// 老师用手指点谱上没认出来的术语：当场认，并记进术语库（下次不用再点）
export async function recognizeTermAt(
  teacherId,
  studentId,
  pieceName,
  page,
  x,
  y,
  {term = '', replaceId = ''} = {},
) {
  const body = {
    teacher_id: teacherId || '',
    student_id: studentId || '',
    piece_name: pieceName || '',
    page: page || 0,
    x,
    y,
  };
  if (term) body.term = term;
  if (replaceId) body.replace_id = replaceId;
  return postJson('/api/coach/score/term_at', body, null, 45000);
}

export default {
  uploadScore,
  fetchScore,
  saveScore,
  deleteScore,
  suggestScore,
  boxesFromDividers,
  recognizeScoreTerms,
  recognizeTermAt,
};
