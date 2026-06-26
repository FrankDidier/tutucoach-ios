// 学生本地仓库 —— 对应安卓 StudentRepository（本地存储 + 可选服务端绑定）。
import {getJson, setJson} from './storage';

const K = 'student_list';

export async function listStudents() {
  return (await getJson(K, [])) || [];
}

export async function saveStudent(student) {
  const list = await listStudents();
  const idx = list.findIndex(s => s.localId === student.localId);
  if (idx >= 0) {
    list[idx] = student;
  } else {
    list.push({...student, localId: student.localId || String(Date.now())});
  }
  await setJson(K, list);
  return list;
}

export async function deleteStudent(localId) {
  const list = await listStudents();
  const next = list.filter(s => s.localId !== localId);
  await setJson(K, next);
  return next;
}
