/* core/ui/toast.js

   L2：这个文件和 core/toast.js 曾是两个同名不同物的实现（.m3-toast vs .toast-showing），
   各自只清理自己那一类，两条 toast 会叠在同一个位置。已合并到 core/toast.js，
   这里只做再导出，保持 `import { showToast } from './ui/toast.js'` 的调用方不用改。
*/
export { showToast } from '../toast.js';
