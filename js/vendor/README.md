# js/vendor/ 说明

这个目录放的是**第三方库的本地副本**（项目当前无构建工具、无网络，全部走相对路径 import）。

| 文件 | 来源 | 用法 |
|---|---|---|
| `vue.esm-browser.prod.js` | Vue 3.5.44 `dist/` | `import { createApp } from '../../js/vendor/vue.esm-browser.prod.js'` —— 含运行时编译器，支持 `template` 字符串 |
| `gsap/` | GSAP 3.15.0 官方 ESM 构建（`gsap/index.js` 装配 gsap-core + CSSPlugin，npm 源 `gsap@^3.15.0`） | `import { gsap } from '../../js/vendor/gsap/index.js'` —— **动效唯一真相源**（design/motion.js 桥与 virtual-keypad 均指向此） |

## 升级流程

1. `pnpm add gsap@<新版本>`（dependencies 里的 `gsap@^3.15.0` 记录源版本）
2. 从 `node_modules/gsap/dist/` 拷贝对应 ESM 文件覆盖 `js/vendor/gsap/`
3. 跑 `node scripts/check-syntax.mjs` + 全量测试确认无 API 漂移
