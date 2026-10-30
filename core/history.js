/* core/history.js
   做题记录 CRUD
*/

/* core/history.js —— 在文件顶部常量区加 */
const HISTORY_MAX = 200;
const DEFAULT_MODULE_ID = 'm13';   // 兜底：未指定模块时归到解题思维

import { lsGet, lsSet } from './storage.js';
import { getHistoryKey } from './keys.js';
import { emit, EVT } from './events.js';


/* core/history.js —— 修改 historyLoad */
export function historyLoad() {
  try {
    const raw = lsGet(getHistoryKey());
    const list = raw ? JSON.parse(raw) : [];
    // ⭐ 兼容旧记录：没有 moduleId 的，按 problemSource 推断
    return list.map(r => {
      if (r.moduleId) return r;
      const src = r.problemSource || '';
      let mid = DEFAULT_MODULE_ID;
      if (src.includes('题库') || src.includes('内置')) mid = 'm13';
      else if (src.includes('自定义')) mid = 'm13';
      // 如果未来你在 problemSource 里写了 'm1'/'m9' 这类，也能识别
      const m = src.match(/^m\d+$/);
      if (m) mid = m[0];
      return { ...r, moduleId: mid };
    });
  } catch (e) {
    console.warn('[做题记录] 读取失败', e);
    return [];
  }
}

export function historyUpdate(problemText, aiFeedback) {
  const list = historyLoad();
  const index = list.findIndex(r => r.problemText === problemText);
  if (index >= 0) {
    list[index].aiFeedback = aiFeedback;
    list[index].correctAnswer = aiFeedback.answer?.full || list[index].correctAnswer;
    list[index].timestamp = Date.now();
    historySave(list); // 触发全局事件，让做题记录自动刷新
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

/* 修改 historyAdd：补 moduleId 默认值 */
export function historyAdd(record) {
  const list = historyLoad();
  list.unshift({
    id: 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    timestamp: Date.now(),
    // ⭐ 新增：模块归属，Home 页按此统计
    moduleId: record.moduleId || DEFAULT_MODULE_ID,
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