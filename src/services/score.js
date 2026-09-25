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
  const uri = file?.uri || '';
  const b64 = fileB64Payload(file);
  const mime = file?.type || 'image/jpeg';
  const name = file?.name || 'score.jpg';
  // iOS 相册偶发 ph:// / assets-library://：FormData 读文件会挂死直到超时。
  // 有 base64 时改走 file_b64，绕开坏 uri。
  const badUri =
    !uri ||
    uri.startsWith('ph://') ||
    uri.startsWith('assets-library://') ||
    uri.startsWith('phassets-library://');
  if (b64 && (badUri || file?.preferB64)) {
    fd.append('file_b64', b64);
    fd.append('file_name', name);
    fd.append('file_mime', mime);
  } else if (uri) {
    fd.append('file', {uri, type: mime, name});
    // 双保险：uri 传失败时服务端也能用 b64（body 略大，但比超时强）
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

export async function boxesFromDividers(teacherId, studentId, pieceName, dividers, existingFocus = []) {
  return postJson(
    '/api/coach/score/boxes_from_dividers',
    {
      teacher_id: teacherId || '',
      student_id: studentId || '',
      piece_name: pieceName || '',
      dividers: Array.isArray(dividers) ? dividers : [],
      existing_focus: Array.isArray(existingFocus) ? existingFocus : [],
    },
    null,
    60000,
  );
}

export async function recognizeScoreTerms(teacherId, studentId, pieceName) {
  return postJson(
    '/api/coach/score/ocr',
    {
      teacher_id: teacherId || '',
      student_id: studentId || '',
      piece_name: pieceName || '',
    },
    null,
    90000,
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
