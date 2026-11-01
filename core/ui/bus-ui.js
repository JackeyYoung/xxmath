/* core/ui/bus-ui.js */
import { on, emit } from '../events.js';

export const UI_EVT = {
  CORRECT:    'ui:correct',
  WRONG:      'ui:wrong',
  THUMB:      'ui:thumb',
  TIMER_START:'ui:timer:start',
  TIMER_END:  'ui:timer:end',
};

export function emitUI(type, payload) { emit('ui:' + type, payload); }
export function onUI(type, fn) { return on('ui:' + type, fn); }

/* ---------- M10：统一发「答对了」事件（带坐标 + 去重） ----------
 *
 * 背景：原来 13 个模块里只有 m1 / m9 自己 emitUI('CORRECT')，而且都不带坐标
 *      → 撒花 / 连对横幅基本不触发；要修就得改 11 个模块。
 *
 * 现在改成：所有模块记录答题都会走 ctx.data.historyAdd，
 * 由壳层在那里统一调用 emitCorrect()，一次覆盖全部模块。
 *
 * 坐标取「当前聚焦元素」的中心（输入框/按钮位置最自然），拿不到就退化到视口中上部。
 * 400ms 去重：同一道题被记录多次时只撒一次花。
 */
let _lastCorrectAt = 0;

export function resetCorrectDedupe() { _lastCorrectAt = 0; }

export function emitCorrect(moduleId, opts = {}) {
  const now = Date.now();
  const gap = typeof opts.dedupeMs === 'number' ? opts.dedupeMs : 400;
  if (now - _lastCorrectAt < gap) return false;
  _lastCorrectAt = now;

  let x = 0;
  let y = 0;
  try {
    const hasWin = typeof window !== 'undefined' && window && typeof window.innerWidth === 'number';
    x = hasWin ? window.innerWidth / 2 : 0;
    y = hasWin ? window.innerHeight / 3 : 0;

    const el = typeof document !== 'undefined' ? document.activeElement : null;
    if (el && typeof el.getBoundingClientRect === 'function') {
      const r = el.getBoundingClientRect();
      if (r && (r.width > 0 || r.height > 0)) {
        x = r.left + r.width / 2;
        y = r.top + r.height / 2;
      }
    }
  } catch (e) { /* 坐标算不出来就用兜底值，别让撒花影响判分 */ }

  emitUI('CORRECT', { moduleId, x, y });
  return true;
}
