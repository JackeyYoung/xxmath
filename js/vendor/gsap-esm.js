/* js/vendor/gsap-esm.js —— 加载 UMD 版 GSAP（**不能用 import**）

   为什么不能 `import './gsap.min.js'`：
   gsap.min.js 是 UMD，包装里有这一步：
       (t = t || self).window = t.window || {}
   在浏览器里 `window.window` 是 getter-only 属性，而 **ESM 模块是严格模式**，
   给 getter-only 属性赋值会直接抛：
       TypeError: Cannot set property window of #<Window> which has only a getter
   （这也是为什么这段代码在 <script> 里没事——classic script 是非严格模式，赋值静默失败。）

   所以这里改成**动态注入 classic script**：非严格模式、懒加载、失败也不抛。
   拿不到 GSAP 时返回 undefined，调用方走降级路径（无动画但功能完整）。

   上了 Vite 后换成 `import gsap from 'gsap'`（官方 ESM 包）即可。
*/

const SRC = './js/vendor/gsap.min.js';

let _promise = null;

/** 懒加载 GSAP，返回 gsap 实例或 undefined（永不 reject） */
export function loadGsap() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(undefined);
  if (window.gsap) return Promise.resolve(window.gsap);
  if (_promise) return _promise;

  _promise = new Promise((resolve) => {
    try {
      const s = document.createElement('script');
      s.src = SRC;
      s.async = true;
      s.onload = () => {
        if (window.gsap) resolve(window.gsap);
        else { console.warn('[gsap] 脚本已加载但没拿到 window.gsap'); resolve(undefined); }
      };
      s.onerror = () => { console.warn('[gsap] 加载失败：' + SRC + '（动画将降级为无动画）'); resolve(undefined); };
      document.head.appendChild(s);
    } catch (e) {
      console.warn('[gsap] 注入脚本失败', e);
      resolve(undefined);
    }
  });
  return _promise;
}

export default loadGsap;
