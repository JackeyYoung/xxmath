# js/vendor/ 说明

这个目录放的是**第三方库的本地副本**（项目当前无构建工具、无网络，全部走相对路径 import）。

| 文件 | 来源 | 用法 |
|---|---|---|
| `vue.esm-browser.prod.js` | Vue 3.5.44 `dist/` | `import { createApp } from '../../js/vendor/vue.esm-browser.prod.js'` —— 含运行时编译器，支持 `template` 字符串 |
| `gsap.min.js` | GSAP 3.10.3（UMD） | **不要 import**，见下 |
| `Flip.min.js` | GSAP Flip 3.10.3（UMD） | **不要 import**，见下 |
| `gsap-esm.js` | 本项目写的加载器 | `import { loadGsap } from '.../gsap-esm.js'` → `await loadGsap()` |
| `flip-esm.js` | 本项目写的加载器 | 按需，只在真的要 Flip 时用 |

## ⚠️ GSAP 的 UMD 构建不能用 `import` 加载

`gsap.min.js` 的 UMD 包装里有这一步：

```js
(t = t || self).window = t.window || {}
```

它要给**全局对象的 `window` 属性赋值**。而浏览器里 `window.window` 是 **getter-only** 属性，
加上 **ESM 模块默认严格模式**，赋值会直接抛：

```
TypeError: Cannot set property window of #<Window> which has only a getter
```

**为什么 `<script>` 里没事**：classic script 是非严格模式，同样的赋值**静默失败**而不抛错。
这就是 UMD 只适合 `<script>` 的原因。

### 正确用法

```js
import { loadGsap } from '../../../js/vendor/gsap-esm.js';

let gsap = await loadGsap();        // 动态注入 classic script，拿不到就是 undefined
if (!gsap) { /* 降级：无动画，功能照常 */ }
```

`gsap-esm.js` 做的事：检查 `window.gsap` → 没有就 `document.createElement('script')` 注入
`gsap.min.js`（非严格模式，不会抛）→ 加载完成从 `window.gsap` 取实例。
**永不 reject**，失败返回 `undefined`。

### 上了 Vite 之后

把 `loadGsap()` 换成官方 ESM 包即可：

```js
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
```

## ⚠️ Flip 插件：import 时就要真实 DOM

`Flip.min.js` 在 import 时会**自注册插件**，而注册过程会调用
`document.createElementNS` / `getBoundingClientRect` 等。
在没有真实 DOM 的环境（Node 单测、SSR）里直接 import 会抛：

```
TypeError: g.createElementNS is not a function
```

所以它单独放在 `flip-esm.js`，**只在真的需要 Flip 时才引入**，且必须在 gsap 之后。

## 另一类环境差异：Node 里没有 `self`

如果你在 Node 里跑测试并加载这些 UMD，需要补桩：

```js
globalThis.self = globalThis;   // UMD 的全局回退用 self
```

（本项目的 `verify-*.mjs` 已经这么做了。）
