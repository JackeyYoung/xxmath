/* grades/grade3/design/motion.js
   GSAP 引入桥（真 ESM 构建，显式导出，不依赖 window）。
   业务模块只 import 本文件，将来切 Vue/构建化时只改这一处。
*/
export { gsap } from '../../../assets/gsap/index.js';
