import {getJson, postForm, postJson} from './api';

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
  fd.append('file', {
    uri: file.uri,
    type: file.type || 'image/jpeg',
    name: file.name || 'score.jpg',
  });
  return postForm('/api/coach/score/upload', fd);
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
  {approvePending = false, termOverlays} = {},
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

export default {
  uploadScore,
  fetchScore,
  saveScore,
  deleteScore,
  suggestScore,
  recognizeScoreTerms,
};
