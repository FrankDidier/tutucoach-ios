// 学生本地仓库 —— 对应安卓 StudentRepository（本地存储 + 可选服务端绑定）。
import {getJson, setJson} from './storage';

const K = 'student_list';

export async function listStudents() {
  return (await getJson(K, [])) || [];
}

// 归一化：去空格、大小写无关，用于「同一个学生」判重。
const norm = v => (v || '').trim().toLowerCase();

export async function saveStudent(student) {
  const list = await listStudents();
  // 1) 明确在编辑某条（有 localId）时，就更新那条。
  let idx = student.localId
    ? list.findIndex(s => s.localId === student.localId)
    : -1;
  // 2) 新增时先按「学号」判重：同一个学号已存在 → 视为同一个学生，更新而不是再录一遍。
  //    （修复：已录入的学生重新打上学号会重复录入的问题。）
  const sid = norm(student.studentId);
  if (idx < 0 && sid) {
    idx = list.findIndex(s => norm(s.studentId) === sid);
  }
  // 3) 没填学号时，按「姓名」判重，避免同名学生被重复添加。
  if (idx < 0 && !sid) {
    const nm = norm(student.name);
    if (nm) idx = list.findIndex(s => !norm(s.studentId) && norm(s.name) === nm);
  }
  if (idx >= 0) {
    // 保留原 localId，其余字段用新值覆盖（保存修改 / 补全学号都走这里）。
    list[idx] = {...list[idx], ...student, localId: list[idx].localId};
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

/**
 * 账号合并后「学生信息录入」本地名单常为空：把班级管理里已绑定的学生
 * 同步进本机名册（按学号去重，不覆盖已有备注/姓名）。
 */
export async function syncRosterFromServer(serverStudents) {
  const list = await listStudents();
  const bySid = new Map();
  list.forEach(s => {
    const k = norm(s.studentId);
    if (k) bySid.set(k, s);
  });
  let changed = false;
  for (const s of serverStudents || []) {
    const uid = (s.user_id || s.id || '').trim();
    if (!uid) continue;
    const nick = (s.nickname || s.name || '').trim();
    if (!nick || nick === uid.slice(-6)) continue;
    const key = norm(uid);
    if (bySid.has(key)) continue;
    let hit = false;
    for (const [k] of bySid) {
      if (uid.endsWith(k) || k.endsWith(uid.slice(-8))) {
        hit = true;
        break;
      }
    }
    if (hit) continue;
    const row = {
      localId: `${Date.now()}_${uid.slice(-6)}`,
      name: nick,
      studentId: uid,
      note: '（账号合并后自动同步）',
    };
    list.push(row);
    bySid.set(key, row);
    changed = true;
  }
  if (changed) await setJson(K, list);
  return list;
}
