/* js/vendor/flip-esm.js —— GSAP Flip 插件的 ESM 垫片（**按需引入**）

   为什么单独一个文件：
   Flip 在 import 时会自注册，而注册过程需要真实 DOM（document.createElementNS、
   getBoundingClientRect 等）。在 Node / SSR / 单测环境里直接 import 会抛
   `TypeError: g.createElementNS is not a function`。

   所以只在「真的要用 Flip」的地方引入：
       import { Flip } from '../../../js/vendor/flip-esm.js';

   并且必须在 gsap-esm.js 之后（Flip 依赖 window.gsap 已存在才会自注册）。

   使用前提（见 m3-playbook / 交互设计结论）：
   - 元素数量不变、只是位置变化时，Flip 才有意义；
   - 变形类交互（3 个节点并 1 个）用 Timeline 更可控。
*/

import './gsap-esm.js';
import './Flip.min.js';

const _Flip = typeof globalThis !== 'undefined' ? globalThis.Flip : undefined;
const _gsap = typeof globalThis !== 'undefined' ? globalThis.gsap : undefined;

if (!_Flip) {
  console.error('[flip-esm] 没拿到 globalThis.Flip —— 检查 js/vendor/Flip.min.js 是否完整');
} else if (_gsap && typeof _gsap.registerPlugin === 'function') {
  try { _gsap.registerPlugin(_Flip); } catch (e) { console.warn('[flip-esm] registerPlugin 失败', e); }
}

export const Flip = _Flip;
export default _Flip;
