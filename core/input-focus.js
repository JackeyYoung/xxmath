/* core/input-focus.js
   统一的输入框聚焦工具：延迟两帧 + preventScroll + 光标末尾 + 不可见时滚动
*/

/**
 * 聚焦输入框（统一体验）
 * @param {HTMLInputElement|HTMLTextAreaElement|string} target  元素或元素 id
 * @param {object} opts
 *   - selectAll: 是否全选（默认 false，光标移到末尾）
 *   - scroll: 是否在不可见时滚动（默认 true）
 */
export function focusInput(target, opts = {}) {
  const { selectAll = false, scroll = true } = opts;

  const tryFocus = () => {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el || !el.isConnected) return;

    try {
      el.focus({ preventScroll: true });
    } catch (e) {
      try { el.focus(); } catch (_) {}
    }

    try {
      if (selectAll) el.select();
      else el.setSelectionRange(el.value.length, el.value.length);
    } catch (_) {}

    if (scroll) {
      try {
        const rect = el.getBoundingClientRect();
        const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
        if (rect.top < 80 || rect.bottom > vh - 80) {
          el.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
      } catch (_) {}
    }
  };

  // ⭐ 延迟两帧，确保 DOM 重绘完成
  requestAnimationFrame(() => {
    requestAnimationFrame(tryFocus);
  });
}

/**
 * 等 DOM 出现某个输入框后再聚焦（用于动态渲染的场景）
 * @param {string} id  输入框 id
 * @param {object} opts
 *   - retry: 重试次数（默认 10）
 *   - interval: 重试间隔 ms（默认 50）
 */
export function focusInputWhenReady(id, opts = {}) {
  const { retry = 10, interval = 50, ...focusOpts } = opts;
  let tries = 0;
  const tick = () => {
    const el = document.getElementById(id);
    if (el && el.isConnected) {
      focusInput(el, focusOpts);
      return;
    }
    if (++tries >= retry) return;
    setTimeout(tick, interval);
  };
  requestAnimationFrame(tick);
}