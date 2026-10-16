/* core/keys.js
   所有 storage key 集中管理。年级相关的必须用函数，不能用常量。
*/

export const STUDENT_KEY = 'grade3_student_name';
export const REASON_KEY  = 'grade3_wrong_reasons_v1';
export const PRIORITY_DATE_KEY = 'grade3_priority_passed_date';
export const DAILY_CHEER_KEY   = 'grade3_daily_cheer_date';
export const TIMER_CHALLENGE_KEY = 'grade3_timer_challenge';
export const SOUND_ON_KEY = 'grade3_sound_on';
export const SESSION_BACKUP_KEY = 'grade3_session_backup_v1';
export const MIGRATED_FLAG = '__migrated_v1';

/* 年级相关：必须每次调用时求值 */
export function getGradeKey(prefix) {
  // 注意：依赖 core/storage 的 lsGet，但为避免循环依赖，
  // 这里用 try/catch 直接读内存（storage 会同步暴露 getMemory）
  let g = '3';
  try {
    // storage.js 会挂一个全局 __memCachePeek
    if (typeof globalThis.__memCachePeek === 'function') {
      g = globalThis.__memCachePeek('grade3_current_grade') || '3';
    } else {
      g = localStorage.getItem('grade3_current_grade') || '3';
    }
  } catch (e) {}
  return `grade${g}_${prefix}`;
}

export const getWrongBookKey = () => getGradeKey('wrong_book_v1');
export const getHistoryKey   = () => getGradeKey('practice_history_v1');

/* 所有需要持久化到 localForage 的 key 前缀判断 */
export function isPersistKey(k) {
  return typeof k === 'string' && /^grade\d+_/.test(k);
}

export const TAKEAWAY_KEY_PREFIX = 'grade3_takeaway_';

/* ⭐ 只本地保存、不同步到云端的 key */
export const LOCAL_ONLY_KEYS = new Set([
  'grade3_priority_passed_date',    // 每日"先算哪步"只问一次
  'grade3_daily_cheer_date',        // 每日鼓励只弹一次
  'grade3_sound_on',                // 音效开关
  'grade3_timer_challenge',         // 计时挑战记录
  'grade3_current_grade',           // 当前年级选择
]);