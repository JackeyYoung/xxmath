/* core/target.js
   学习目标：家长可调
*/
import { lsGet, lsSet } from './storage.js';
import { getGradeKey } from './keys.js';
import { emit, EVT } from './events.js';

function getTargetKey() {
  return getGradeKey('targets_v1');
}

const DEFAULT_TARGETS = {
  dailyQuestions: 5,     // 每日做题数
  dailyStreak: 3,        // 每日连对数
  dailyMastered: 1,      // 每日掌握数
  weeklyQuestions: 25,   // 每周做题数
  wrongReview: 2,        // 每日复习错题数
};

export function targetLoad() {
  try {
    const raw = lsGet(getTargetKey());
    return raw ? { ...DEFAULT_TARGETS, ...JSON.parse(raw) } : { ...DEFAULT_TARGETS };
  } catch (e) {
    return { ...DEFAULT_TARGETS };
  }
}

export function targetSave(targets) {
  try {
    lsSet(getTargetKey(), JSON.stringify(targets));
  } catch (e) {}
  emit(EVT.DATA_CHANGED, { source: 'target' });
}

export function targetReset() {
  targetSave({ ...DEFAULT_TARGETS });
}

export { DEFAULT_TARGETS };