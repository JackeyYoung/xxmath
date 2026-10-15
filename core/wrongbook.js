/* core/wrongbook.js
   错题本 CRUD
*/

import { lsGet, lsSet } from './storage.js';
import { getWrongBookKey } from './keys.js';
import { emit, EVT } from './events.js';

export function wbLoad() {
  try {
    const raw = lsGet(getWrongBookKey());
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[错题本] 读取失败', e);
    return [];
  }
}

export function wbSave(list) {
  try {
    lsSet(getWrongBookKey(), JSON.stringify(list));
  } catch (e) {
    console.warn('[错题本] 保存失败', e);
  }
  emit(EVT.DATA_CHANGED, { source: 'wrongbook' });
}

export function wbAdd(record) {
  const list = wbLoad();
  const filtered = list.filter(r => r.text !== record.text);
  filtered.unshift({ ...record, timestamp: Date.now() });
  if (filtered.length > 100) filtered.length = 100;
  wbSave(filtered);
}

export function wbRemove(text) {
  wbSave(wbLoad().filter(r => r.text !== text));
}

export function wbClear() {
  wbSave([]);
}

/* 做对后累计掌握进度 */
export function markRedoSuccess(problemText) {
  const list = wbLoad();
  const idx = list.findIndex(r => r.text === problemText);
  if (idx < 0) return { removed: false, masteredCount: 0 };

  const rec = list[idx];
  rec.masteredCount = (rec.masteredCount || 0) + 1;

  if (rec.masteredCount >= 2) {
    list.splice(idx, 1);
    wbSave(list);
    return { removed: true, masteredCount: rec.masteredCount };
  }
  wbSave(list);
  return { removed: false, masteredCount: rec.masteredCount };
}