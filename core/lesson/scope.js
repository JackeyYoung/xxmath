/* core/lesson/scope.js
   底座 ①：<LessonShell> 的等价物（Vue 里就是 setup() + onUnmounted）。

   解决的问题：
   - 模块卸载从不执行（S2）→ 所有副作用都登记在 scope 上，dispose() 一次性回收
   - 全局 DOM id 契约（S3）→ 只允许通过 $ / $$ 在 container 作用域内查询
   - 监听只挂不摘（S7）→ on() 返回解绑函数并自动登记

   Vue 化后对应关系：
     const scope = createScope(container, 'tpl-m4')  →  <template> + ref
     scope.on(el, 'click', fn)                       →  @click="fn"
     scope.onDispose(fn)                             →  onUnmounted(fn)
     scope.dispose()                                 →  组件卸载（自动）
*/

export function createScope(container, tplId) {
  const tpl = document.getElementById(tplId);
  if (!tpl) throw new Error('[scope] 找不到模板 #' + tplId);

  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));

  const disposers = [];
  let disposed = false;

  const scope = {
    container,

    /** 作用域内查询 —— 禁止再写 document.getElementById('m4xxx') */
    $(sel) { return container.querySelector(sel); },
    $$(sel) { return Array.from(container.querySelectorAll(sel)); },

    /** 绑定事件并登记解绑；返回 off 以便提前解绑 */
    on(target, type, handler, opts) {
      if (!target) return () => {};
      target.addEventListener(type, handler, opts);
      const off = () => target.removeEventListener(type, handler, opts);
      disposers.push(off);
      return off;
    },

    /** 登记任意清理动作（定时器、rAF、观察者、全局钩子） */
    onDispose(fn) {
      if (typeof fn === 'function' && !disposed) disposers.push(fn);
      return fn;
    },

    get disposed() { return disposed; },

    /** 幂等：重复调用安全 */
    dispose() {
      if (disposed) return;
      disposed = true;
      while (disposers.length) {
        const fn = disposers.pop();
        try { fn(); } catch (e) { console.warn('[scope] 清理失败', e); }
      }
      container.innerHTML = '';
    },
  };

  return scope;
}
