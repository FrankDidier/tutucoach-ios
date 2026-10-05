// 陪练当前这一段的塔罗画面。看谱页读它，画在对应重点框上。
let current = null;

export function setCompanionTarot(card) {
  current = card || null;
}

export function peekCompanionTarot() {
  return current;
}

export function clearCompanionTarot() {
  current = null;
}
