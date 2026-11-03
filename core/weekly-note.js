/* core/weekly-note.js
   「本周一句话」的读写。

   背景：app/shell.js 里原来直接调用 noteGetThisWeek() / noteSetChild()，
   但这两个函数从来没有定义过（也没被 import）——
   所以「本周一句话」弹窗一打开就抛 ReferenceError，保存同样必崩。
   这里补上实现，按「周一为一周开始」存成 { 'YYYY-MM-DD': { child, parent } }。
*/
import { lsGet, lsSet } from './storage.js';
import { getWeeklyNoteKey } from './keys.js';

/** 本周一 00:00 的本地日期串，作为这一周的 key */
export function weekKeyOf(date = new Date()) {
  const d = new Date(date.getTime());
  const dow = d.getDay();                       // 0=周日
  const offset = dow === 0 ? -6 : 1 - dow;      // 回退到周一
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

function loadAll() {
  try {
    const raw = lsGet(getWeeklyNoteKey());
    const map = raw ? JSON.parse(raw) : {};
    return map && typeof map === 'object' ? map : {};
  } catch (e) {
    return {};
  }
}

function saveAll(map) {
  try { lsSet(getWeeklyNoteKey(), JSON.stringify(map)); } catch (e) {}
}

/** 本周的 { child, parent } */
export function noteGetThisWeek(date = new Date()) {
  const rec = loadAll()[weekKeyOf(date)];
  return { child: (rec && rec.child) || '', parent: (rec && rec.parent) || '' };
}

function patchThisWeek(patch, date = new Date()) {
  const map = loadAll();
  const key = weekKeyOf(date);
  map[key] = Object.assign({ child: '', parent: '' }, map[key], patch);
  saveAll(map);
  return map[key];
}

/** 孩子那句话 */
export function noteSetChild(text, date = new Date()) {
  return patchThisWeek({ child: String(text == null ? '' : text).trim() }, date);
}

/** 家长那句话（周报里可写，先备着） */
export function noteSetParent(text, date = new Date()) {
  return patchThisWeek({ parent: String(text == null ? '' : text).trim() }, date);
}
