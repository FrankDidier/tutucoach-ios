// 乐谱上的段落：陪练念的「第一段、第二段」和谱面上的段落标记必须是同一套编号。

const CN_DIGITS = '零一二三四五六七八九';

export function cnNum(n) {
  if (n <= 10) return n === 10 ? '十' : CN_DIGITS[n];
  if (n < 20) return '十' + CN_DIGITS[n - 10];
  return CN_DIGITS[Math.floor(n / 10)] + '十' + (n % 10 ? CN_DIGITS[n % 10] : '');
}

function firstLine(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  return t.split(/[。！？!?]/)[0].trim();
}

// 先页，再行（高度差不到半个框算同一行），再从左到右。
export function readingCompare(a, b) {
  const dp = (a.page || 0) - (b.page || 0);
  if (dp) return dp;
  const dy = (a.y || 0) - (b.y || 0);
  const rowH = Math.min(a.h || 0.1, b.h || 0.1) / 2;
  if (Math.abs(dy) > rowH) return dy;
  return (a.x || 0) - (b.x || 0);
}

// 旧乐谱框上的字。段落不念、不显示标题，这里只交给服务器认出并进重点里的旧框字。
export function sectionLine(box) {
  const label = firstLine(box.label || box.text || '');
  const note = firstLine(box.note || '');
  if (/^第\d+页·第\d+段$/.test(label) && note && note !== '本段演奏重点') return note;
  return label;
}

// 一段可能跨好几行、好几页（好几个框）。返回按阅读顺序编号的段落：
// {n, head, line, end, rects}。段落只有编号，没有标题。
export function readingSections(annotations) {
  const all = (annotations || []).filter(Boolean).slice().sort(readingCompare);
  const groups = new Map();
  all.forEach(b => {
    const key = b.group || b.id || `${b.page}_${b.x}_${b.y}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  });
  const out = [];
  groups.forEach(rects => {
    const head = rects.find(r => !r.cont) || rects[0];
    out.push({head, line: sectionLine(head), end: rects[rects.length - 1], rects});
  });
  out.sort((a, b) => readingCompare(a.head, b.head));
  return out.map((s, i) => ({...s, n: i + 1}));
}
