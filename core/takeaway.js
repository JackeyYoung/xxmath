/* core/takeaway.js */
import { lsGet, lsSet, lsRemove } from './storage.js';
import { getGradeKey } from './keys.js';
import { emit, EVT } from './events.js';

// 所有的年级共用这个 key，具体隔离由 getGradeKey 保证
function getTakeawayMapKey() {
  return getGradeKey('takeaway_map_v1');
}

// 读取整个映射表
function loadTakeawayMap() {
  try {
    const raw = lsGet(getTakeawayMapKey());
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

// 保存整个映射表
function saveTakeawayMap(map) {
  lsSet(getTakeawayMapKey(), JSON.stringify(map));
  emit(EVT.DATA_CHANGED, { source: 'takeaway' });
}

export function takeawaySave(text, value) {
  if (!text) return;
  const map = loadTakeawayMap();
  const key = text.trim();
  
  if (value && value.trim()) {
    map[key] = value.trim();
  } else {
    delete map[key]; // 如果传空值，说明要删除心得
  }
  saveTakeawayMap(map);
}

export function takeawayLoad(text) {
  if (!text) return '';
  const map = loadTakeawayMap();
  return map[text.trim()] || '';
}

/** 获取所有心得，返回包含题目和心得的数组 */
export function takeawayListAll() {
  const map = loadTakeawayMap();
  return Object.keys(map).map(problemText => ({
    problemText,
    note: map[problemText]
  }));
}