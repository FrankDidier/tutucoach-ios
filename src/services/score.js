import {getJson, postForm, postJson} from './api';

export async function uploadScore(teacherId, studentId, pieceName, file) {
  const fd = new FormData();
  fd.append('teacher_id', teacherId || '');
  fd.append('student_id', studentId || '');
  fd.append('piece_name', pieceName || '');
  fd.append('file', {
    uri: file.uri,
    type: file.type || 'image/jpeg',
    name: file.name || 'score.jpg',
  });
  return postForm('/api/coach/score/upload', fd);
}

export async function fetchScore(studentId, pieceName, teacherId = '') {
  return getJson('/api/coach/score', {
    student_id: studentId || '',
    piece_name: pieceName || '',
    teacher_id: teacherId || '',
  });
}

export async function saveScore(teacherId, studentId, pieceName, annotations, termTranslations) {
  return postJson('/api/coach/score/save', {
    teacher_id: teacherId || '',
    student_id: studentId || '',
    piece_name: pieceName || '',
    annotations: Array.isArray(annotations) ? annotations : [],
    confirmed_annotations: Array.isArray(annotations) ? annotations : [],
    term_translations: Array.isArray(termTranslations) ? termTranslations : [],
  });
}

export async function suggestScore(teacherId, studentId, pieceName, existingFocus = []) {
  return postJson('/api/coach/score/suggest', {
    teacher_id: teacherId || '',
    student_id: studentId || '',
    piece_name: pieceName || '',
    existing_focus: Array.isArray(existingFocus) ? existingFocus : [],
  }, null, 60000);
}

export default {uploadScore, fetchScore, saveScore, suggestScore};
