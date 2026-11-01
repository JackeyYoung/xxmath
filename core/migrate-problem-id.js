/* core/migrate-problem-id.js
   S9 就地迁移（一次性、幂等）：
   1) 给 history / wrongbook 的每条记录补上 problemId
   2) 把以「题目原文」为 key 的四张表（mastery / takeaway / wrong_reasons）重建为以 problemId 为 key
   3) 完成后写本地标记（该标记只在本地，不进云端 —— 每台设备各迁一次）
*/
import { lsGet, lsSet } from './storage.js';
import { getGradeKey } from './keys.js';
import { problemId, normalizeProblemText } from './problem-id.js';

export const PROBLEM_ID_MIGRATED_FLAG = 'grade3_migrated_problem_id_v1';

function readJson(key, fallback) {
  try {
    const raw = lsGet(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  try { lsSet(key, JSON.stringify(value)); } catch (e) { console.warn('[迁移] 写入失败', key, e); }
}

/** 数组型表：给每条记录补 problemId（题目字段名可能是 problemText 或 text） */
function migrateArrayTable(key, textField, report, name) {
  const list = readJson(key, []);
  if (!Array.isArray(list) || list.length === 0) return;
  let changed = 0;
  const next = list.map(rec => {
    if (!rec) return rec;
    const pid = rec.problemId || problemId(rec[textField]);
    if (!pid || rec.problemId === pid) return rec;
    changed++;
    return Object.assign({}, rec, { problemId: pid });
  });
  if (changed) writeJson(key, next);
  report.push(name + ': 补 problemId ' + changed + '/' + list.length + ' 条');
}

export function migrateProblemIds() {
  if (lsGet(PROBLEM_ID_MIGRATED_FLAG) === '1') return { skipped: true, report: [] };
  const report = [];

  // ---------- 1. 数组型：history / wrongbook ----------
  migrateArrayTable(getGradeKey('practice_history_v1'), 'problemText', report, 'history');
  migrateArrayTable(getGradeKey('wrong_book_v1'), 'text', report, 'wrongbook');

  // ---------- 2. mastery：{ 原文: rec } → { problemId: rec } ----------
  try {
    const key = getGradeKey('mastery_v1');
    const map = readJson(key, {});
    const oldKeys = Object.keys(map || {});
    if (oldKeys.length) {
      const next = {};
      let merged = 0;
      oldKeys.forEach(oldKey => {
        const rec = map[oldKey] || {};
        const text = normalizeProblemText(rec.text || oldKey);
        const pid = rec.problemId || problemId(text);
        if (!pid) return;
        const prev = next[pid];
        if (!prev) {
          next[pid] = Object.assign({}, rec, { problemId: pid, text });
        } else {
          // 同一道题的不同空白写法：合并，保留更近的一次，尝试次数累加
          merged++;
          const total = (prev.totalAttempts || 0) + (rec.totalAttempts || 0);
          next[pid] = (rec.lastAt || 0) >= (prev.lastAt || 0)
            ? Object.assign({}, prev, rec, { problemId: pid, text, totalAttempts: total })
            : Object.assign({}, prev, { totalAttempts: total });
        }
      });
      writeJson(key, next);
      report.push('mastery: ' + oldKeys.length + ' → ' + Object.keys(next).length + ' 个 key' + (merged ? '（合并 ' + merged + ' 条重复）' : ''));
    }
  } catch (e) { console.warn('[迁移] mastery 失败', e); }

  // ---------- 3. takeaway map：{ 原文: '心得' } → { problemId: { t, n } } ----------
  try {
    const key = getGradeKey('takeaway_map_v1');
    const map = readJson(key, {});
    const oldKeys = Object.keys(map || {});
    if (oldKeys.length) {
      const next = {};
      oldKeys.forEach(oldKey => {
        const v = map[oldKey];
        const note = typeof v === 'string' ? v : (v && v.n) || '';
        const text = normalizeProblemText((v && v.t) || oldKey);
        const pid = problemId(text);
        if (!pid) return;
        // 撞 key 时保留更长的那条心得（信息量更大）
        if (!next[pid] || (next[pid].n || '').length < note.length) next[pid] = { t: text, n: note };
      });
      writeJson(key, next);
      report.push('takeaway: ' + oldKeys.length + ' → ' + Object.keys(next).length + ' 个 key');
    }
  } catch (e) { console.warn('[迁移] takeaway 失败', e); }

  // ---------- 4. wrong_reasons：{ 原文: [标签] } → { problemId: [标签] } ----------
  try {
    const key = getGradeKey('wrong_reasons_v1');
    const map = readJson(key, {});
    const oldKeys = Object.keys(map || {});
    if (oldKeys.length) {
      const next = {};
      oldKeys.forEach(oldKey => {
        const tags = Array.isArray(map[oldKey]) ? map[oldKey] : [];
        const pid = problemId(oldKey);
        if (!pid) return;
        next[pid] = Array.from(new Set([...(next[pid] || []), ...tags]));
      });
      writeJson(key, next);
      report.push('wrong_reasons: ' + oldKeys.length + ' → ' + Object.keys(next).length + ' 个 key');
    }
  } catch (e) { console.warn('[迁移] wrong_reasons 失败', e); }

  // ---------- 5. 落标记 ----------
  try { lsSet(PROBLEM_ID_MIGRATED_FLAG, '1'); } catch (e) {}
  if (report.length) console.log('[迁移] problemId 就地迁移完成:\n  ' + report.join('\n  '));
  return { skipped: false, report };
}
