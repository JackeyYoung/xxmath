/* core/activity.js
   体验记录：只记"玩过什么模块、玩了多久、最近一次是什么时候"
   不进 history，不进错题本，不参与正确率统计
*/
import { lsGet, lsSet } from './storage.js';
import { getGradeKey } from './keys.js';
import { emit, EVT } from './events.js';

const ACTIVITY_MAX = 200;

function getActivityKey() {
  return getGradeKey('activity_v1');
}

export function activityLoad() {
  try {
    const raw = lsGet(getActivityKey());
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function activitySave(list) {
  try {
    lsSet(getActivityKey(), JSON.stringify(list));
  } catch (e) {}
  emit(EVT.DATA_CHANGED, { source: 'activity' });
}

/**
 * 记一次体验
 * @param {string} moduleId  'm2' / 'm3' / ...
 * @param {object} meta      { label, detail }
 */
export function activityAdd(moduleId, meta = {}) {
  if (!moduleId) return;
  const list = activityLoad();
  list.unshift({
    moduleId,
    label: meta.label || '',
    detail: meta.detail || '',
    at: Date.now(),
  });
  if (list.length > ACTIVITY_MAX) list.length = ACTIVITY_MAX;
  activitySave(list);
}

/** 按模块聚合：{ m2: { count, lastAt }, ... } */
export function activityStatsByModule() {
  const stats = {};
  activityLoad().forEach(r => {
    if (!stats[r.moduleId]) stats[r.moduleId] = { count: 0, lastAt: 0 };
    stats[r.moduleId].count++;
    if (r.at > stats[r.moduleId].lastAt) stats[r.moduleId].lastAt = r.at;
  });
  return stats;
}