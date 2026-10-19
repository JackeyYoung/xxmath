/* core/weekly-note.js
   周报一句话：家长和孩子各写一句，按周存储
*/
import { lsGet, lsSet } from './storage.js';
import { getGradeKey } from './keys.js';
import { emit, EVT } from './events.js';

function getNoteKey() {
  return getGradeKey('weekly_notes_v1');
}

/** 取本周的 key：'2026-W42' */
export function weekKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // 周一为一周开始
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  const year = d.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function notesLoad() {
  try {
    const raw = lsGet(getNoteKey());
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function notesSave(map) {
  try {
    lsSet(getNoteKey(), JSON.stringify(map));
  } catch (e) {}
  emit(EVT.DATA_CHANGED, { source: 'weekly-note' });
}

/** 家长写一句 */
export function noteSetParent(text) {
  const wk = weekKey();
  const map = notesLoad();
  if (!map[wk]) map[wk] = {};
  map[wk].parent = text.trim();
  map[wk].parentAt = Date.now();
  notesSave(map);
}

/** 孩子写一句 */
export function noteSetChild(text) {
  const wk = weekKey();
  const map = notesLoad();
  if (!map[wk]) map[wk] = {};
  map[wk].child = text.trim();
  map[wk].childAt = Date.now();
  notesSave(map);
}

/** 读本周的 */
export function noteGetThisWeek() {
  const wk = weekKey();
  return notesLoad()[wk] || {};
}

/** 读某周的 */
export function noteGet(wk) {
  return notesLoad()[wk] || {};
}