/* core/history.js
   做题记录 CRUD
*/

import { lsGet, lsSet } from './storage.js';
import { getHistoryKey } from './keys.js';
import { emit, EVT } from './events.js';

const HISTORY_MAX = 200;

export function historyLoad() {
  try {
    const raw = lsGet(getHistoryKey());
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[做题记录] 读取失败', e);
    return [];
  }
}

export function historySave(list) {
  try {
    lsSet(getHistoryKey(), JSON.stringify(list));
  } catch (e) {
    console.warn('[做题记录] 保存失败', e);
  }
  emit(EVT.DATA_CHANGED, { source: 'history' });
}

export function historyAdd(record) {
  const list = historyLoad();
  list.unshift({
    id: 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    timestamp: Date.now(),
    ...record,
  });
  if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
  historySave(list);
}

export function historyRemove(id) {
  const list = historyLoad().filter(r => r.id !== id);
  historySave(list);
}

export function historyClear() {
  historySave([]);
}