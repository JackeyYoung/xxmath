/* core/events.js
   极简事件总线，解耦 grade 切换 / 数据变更
*/

const _bus = new Map();

export function on(event, fn) {
  if (!_bus.has(event)) _bus.set(event, new Set());
  _bus.get(event).add(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  const set = _bus.get(event);
  if (set) set.delete(fn);
}

export function emit(event, payload) {
  const set = _bus.get(event);
  if (!set) return;
  set.forEach(fn => {
    try { fn(payload); } catch (e) {
      console.warn(`[events] ${event} 回调失败`, e);
    }
  });
}

/* 事件名常量 */
export const EVT = {
  GRADE_CHANGED: 'grade:changed',
  DATA_CHANGED:  'data:changed',   // history / wrongbook / takeaway 任一变化
};