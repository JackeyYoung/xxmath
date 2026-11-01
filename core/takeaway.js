/* core/takeaway.js */
import { lsGet, lsSet, lsRemove } from './storage.js';
import { getGradeKey } from './keys.js';
import { emit, EVT } from './events.js';
import { problemId } from './problem-id.js';

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
  const key = problemId(text);
  if (!key) return;
  const map = loadTakeawayMap();
  const note = value && value.trim();
  if (note) {
    // ⭐ S9：值改成 { t: 题目原文, n: 心得 }，这样即使 key 被哈希也还能显示题目
    map[key] = { t: String(text).replace(/\s+/g, ' ').trim(), n: note };
  } else {
    delete map[key]; // 如果传空值，说明要删除心得
  }
  saveTakeawayMap(map);
}

export function takeawayLoad(text) {
  if (!text) return '';
  const map = loadTakeawayMap();
  // ⭐ S9：key 改成 problemId；值可能是新结构 { t, n }，也可能是迁移前的纯字符串
  const v = map[problemId(text)];
  if (v == null) return '';
  return typeof v === 'string' ? v : (v.n || '');
}

/** 获取所有心得，返回包含题目和心得的数组 */
export function takeawayListAll() {
  const map = loadTakeawayMap();
  return Object.keys(map).map(pid => {
    const v = map[pid];
    // ⭐ S9：兼容旧数据（值可能还是纯字符串），也兼容未迁移的情况
    if (typeof v === 'string') return { problemId: pid, problemText: pid, note: v };
    return { problemId: pid, problemText: (v && v.t) || '', note: (v && v.n) || '' };
  }).filter(x => x.note);
}