import {getItem, setItem} from './storage';

function key(studentId, piece) {
  return `practice_checks:${studentId || ''}:${piece || ''}`;
}

export async function loadChecks(studentId, piece) {
  const raw = await getItem(key(studentId, piece));
  try {
    const o = JSON.parse(raw || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch (e) {
    return {};
  }
}

export async function toggleCheck(studentId, piece, id) {
  const cur = await loadChecks(studentId, piece);
  cur[id] = !cur[id];
  await setItem(key(studentId, piece), JSON.stringify(cur));
  return cur;
}
