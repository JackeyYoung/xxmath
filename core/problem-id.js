/* core/problem-id.js
   题目主键（problemId）—— 把「题目原文」升级为一个稳定的派生 ID。
   - 归一化只做「空白折叠 + 首尾去空格」，不改任何字符语义（避免把不同的题合并）
   - ID 用 FNV-1a 32 位哈希，单机几千道题的量级碰撞可忽略
   - 只依赖文本，任何时候都能由原文重算 → 天然幂等，不依赖迁移是否成功
*/

export function normalizeProblemText(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
}

export function problemId(text) {
  const s = normalizeProblemText(text);
  if (!s) return '';
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'p' + h.toString(16).padStart(8, '0');
}

/** 从记录里取 ID（优先用已存的，兼容迁移前后的两种数据） */
export function problemIdOf(record) {
  if (!record) return '';
  if (record.problemId) return record.problemId;
  return problemId(record.text != null ? record.text : record.problemText);
}

/** 两条题目是否同一道 —— 这是唯一正确的比较方式，替代 r.text === text */
export function sameProblem(a, b) {
  const ida = a && typeof a === 'object' ? problemIdOf(a) : problemId(a);
  const idb = b && typeof b === 'object' ? problemIdOf(b) : problemId(b);
  return !!ida && ida === idb;
}
