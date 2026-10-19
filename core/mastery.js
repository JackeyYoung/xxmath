/* core/mastery.js
   掌握度：按题目文本记录每道题的掌握状态
   - new: 从未做过
   - learning: 做过但没连对 2 次
   - mastered: 连续做对 2 次
*/
import { lsGet, lsSet } from './storage.js';
import { getGradeKey } from './keys.js';
import { emit, EVT } from './events.js';

function getMasteryKey() {
  return getGradeKey('mastery_v1');
}

export function masteryLoad() {
  try {
    const raw = lsGet(getMasteryKey());
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function masterySave(map) {
  try {
    lsSet(getMasteryKey(), JSON.stringify(map));
  } catch (e) {}
  emit(EVT.DATA_CHANGED, { source: 'mastery' });
}

/** 记录一次答题结果，更新掌握度 */
export function masteryRecord(problemText, isCorrect) {
  if (!problemText) return;
  const key = String(problemText).trim();
  const map = masteryLoad();
  const rec = map[key] || {
    text: key,
    correctStreak: 0,   // 连续正确次数
    totalAttempts: 0,   // 总尝试次数
    lastCorrect: null,
    lastAt: 0,
    state: 'new',       // new / learning / mastered
  };

  rec.totalAttempts++;
  rec.lastCorrect = !!isCorrect;
  rec.lastAt = Date.now();

  if (isCorrect) {
    rec.correctStreak = (rec.correctStreak || 0) + 1;
    if (rec.correctStreak >= 2) rec.state = 'mastered';
    else rec.state = 'learning';
  } else {
    rec.correctStreak = 0;
    rec.state = 'learning';
  }

  map[key] = rec;
  masterySave(map);
  return rec;
}

/** 按题目查掌握度 */
export function masteryGet(problemText) {
  if (!problemText) return null;
  const key = String(problemText).trim();
  return masteryLoad()[key] || null;
}

/** 按模块统计掌握度 */
export function masteryStatsByModule() {
  const map = masteryLoad();
  const stats = {};
  Object.values(map).forEach(r => {
    // 从 history 里找这条题的 moduleId
    // 简单做法：从 problemText 的模块归属推，但不太准
    // 更准：history 里查
    // 这里先用简单版：按 state 统计总数
  });
  return stats;
}

/** 所有已掌握的题 */
export function masteryListMastered() {
  const map = masteryLoad();
  return Object.values(map).filter(r => r.state === 'mastered');
}

/** 所有"学过但没掌握"的题 */
export function masteryListLearning() {
  const map = masteryLoad();
  return Object.values(map).filter(r => r.state === 'learning');
}