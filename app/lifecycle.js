/* app/lifecycle.js
   模块生命周期：把「卸载 → 清空 → 挂载」串行化（S2 修复的核心）。

   从 shell.js 抽出，理由同 active-modules.js：
   lesson-host / views 都需要它，但不该为此依赖整个 shell。
*/

let _currentCleanup = null;              // fn / Promise<fn> / Promise<null>
let _swapChain = Promise.resolve();      // 串行队列：任意时刻只有一个模块在切换

/** 解析并执行上一个模块的 cleanup（兼容 null / 同步函数 / Promise<函数>） */
export async function unmountCurrentModule(reason = '') {
  const pending = _currentCleanup;
  _currentCleanup = null;                // 先摘引用，防止重入时被二次执行
  if (!pending) return;
  try {
    const cleanup = typeof pending === 'function' ? pending : await pending;
    if (typeof cleanup === 'function') await cleanup();
  } catch (e) {
    console.warn(`[lifecycle] 模块卸载失败${reason ? `(${reason})` : ''}`, e);
  }
}

/**
 * 模块切换的唯一入口，严格三段式且全局串行：
 *   1) 先调用上一个模块的 cleanup —— 此时它的 DOM 还活着，cleanup 里读得到
 *   2) 再清空容器 —— 清空是壳层的责任，不再依赖 cleanup 顺带做
 *   3) 再执行 run()（加载 + 挂载），run 的返回值作为下一次的 cleanup
 * 串行是必需的：m1 / m13 的 cleanup 里有 container.innerHTML = ''，
 * 若两次切换并发，迟到的 cleanup 会清掉新模块刚渲染的 DOM。
 */
export function swapModule(stage, run) {
  _swapChain = _swapChain
    .then(async () => {
      await unmountCurrentModule('swap');

      if (stage) stage.innerHTML = '';

      let pending;
      try { pending = run(); }                // run 的同步异常也在这里收住
      catch (e) { console.error('[lifecycle] 模块挂载失败', e); return null; }
      if (!pending) return null;

      // 存 Promise 而不是裸函数；顺手挂 catch，避免 unhandled rejection
      _currentCleanup = Promise.resolve(pending).catch(e => {
        console.error('[lifecycle] 模块挂载失败', e);
        return null;                          // 失败时 resolve 成 null，卸载时直接跳过
      });
      return _currentCleanup;
    })
    .catch(e => console.error('[lifecycle] 模块切换失败', e));

  return _swapChain;
}
