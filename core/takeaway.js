/* core/takeaway.js
   一题一得 CRUD
*/

import { lsGet, lsSet, lsRemove, lsKeysByPrefix } from './storage.js';
import { TAKEAWAY_KEY_PREFIX } from './keys.js';
import { emit, EVT } from './events.js';

export function takeawayKey(text) {
  if (!text) return null;
  const t = String(text).trim();
  if (!t) return null;
  let hash = 0;
  for (let i = 0; i < t.length; i++) {
    hash = ((hash << 5) - hash) + t.charCodeAt(i);
    hash |= 0;
  }
  return TAKEAWAY_KEY_PREFIX + Math.abs(hash).toString(36);
}

export function takeawaySave(text, value) {
  const key = takeawayKey(text);
  if (!key) return;
  if (value && value.trim()) lsSet(key, value.trim());
  else lsRemove(key);
  emit(EVT.DATA_CHANGED, { source: 'takeaway' });
}

export function takeawayLoad(text) {
  const key = takeawayKey(text);
  if (!key) return '';
  return lsGet(key) || '';
}

export function takeawayListAll() {
  const out = [];
  lsKeysByPrefix(TAKEAWAY_KEY_PREFIX).forEach(k => {
    const v = lsGet(k);
    if (v && v.trim()) out.push({ key: k, note: v.trim() });
  });
  return out;
}