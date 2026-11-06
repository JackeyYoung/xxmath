/* app/shell.js —— 壳层门面

   拆分后这里只剩三件事：
     1) 初始化：注册视图 + 全局点击委托 + hash 启动 + 拇指条
     2) 对外再导出（保持 main.js / m1 / m9 / m13 / wrongbook-ui 的 import 一字不改）
     3) 数据变化的兜底刷新

   各部分的归属：
     router.js      路由（视图注册表）
     grade-config.js 年级配置
     lesson-meta.js  课页元信息
     lesson-host.js  模块挂载/卸载、层级切换、拇指条
     views/home.js  学习地图 | views/growth.js 成长页
     views/messages.js 留言板 | views/settings.js 设置页
     lifecycle.js / active-modules.js 见同名文件
*/
import { EVT, on } from '../core/events.js';
import { wbRender } from '../core/wrongbook-render.js';
import { navigate, registerView } from './router.js';
import { ensureThumbBar, mountLesson, showThumbBar, hideThumbBar } from './lesson-host.js';
import { renderHome, refreshHomeTasks } from './views/home.js';
import { renderGrowth } from './views/growth.js';
import { renderMessages } from './views/messages.js';
import { renderSettings } from './views/settings.js';
import { activeModules, registerActiveModule, unregisterActiveModule } from './active-modules.js';
import { swapModule, unmountCurrentModule } from './lifecycle.js';
import { GRADE_CONFIG, getGradeConfig } from './grade-config.js';
import { registerGrade } from '../grades/registry.js';
import { ensureMathTypoStyle } from '../grades/grade3/design/tokens.js';
import { getKoji } from '../core/ui/koji.js';

/* ⚠️ 对外再导出必须写成「先 import 再 export { ... }」。
   之前这里写的是 `export { navigate } from './router.js'` —— 那种语法只把名字转手导出，
   并不会在本文件里创建本地绑定，于是 initShell 里用 navigate / showThumbBar / renderHome
   全都会 ReferenceError（浏览器里就是「点不动、页面不渲染」）。 */
export { activeModules, registerActiveModule, unregisterActiveModule };
export { swapModule, unmountCurrentModule };
export { navigate };
export { showThumbBar, hideThumbBar };
export { renderHome, refreshHomeTasks };
export { GRADE_CONFIG, getGradeConfig };

/* ============================================================
   7. 初始化
   ============================================================ */
export function initShell() {
  // ⭐ 全局数学排版（TYPOGRAPHY 单一数据源）：:root 变量 + .math-num/.math-op 一次性注入
  ensureMathTypoStyle();

  // ⭐ Koji 聊天舱（全局唯一 koji-drawer）：壳层启动即挂载，默认隐藏、右下角滑出
  getKoji();

  // ⭐ 年级 loader 注册（组合根接线）：mountLesson 经 loadGrade 取模块单一事实源
  registerGrade('3', () => import('../grades/grade3/index.js'));

  // ⭐ 视图注册：router 不认识任何视图，避免 router ↔ views 循环依赖
  registerView('home', () => renderHome());
  registerView('lesson', (opts) => mountLesson(opts && opts.lessonId));
  registerView('growth', () => renderGrowth());
  registerView('messages', () => renderMessages());
  registerView('settings', () => renderSettings());

  // ⭐ 终极方案：把事件委托直接绑在 body 上，永远不会丢
  if (!document.body.dataset._delegated) {
    document.body.dataset._delegated = '1';
    
    document.body.addEventListener('click', (e) => {
      // 处理所有带有 data-goto 的点击
      const target = e.target.closest('[data-goto]');
      if (target) {
        e.preventDefault();
        const route = target.dataset.goto;
        if (route === 'lesson') {
          navigate('lesson', { lessonId: target.dataset.lesson });
        } else {
          navigate(route);
        }
        return; // 处理完就退出
      }
      
      // 处理错题本按钮
      if (e.target.closest('#wrongBookBtn')) {
        const drawer = document.getElementById('wrongBookDrawer');
        if (drawer) drawer.classList.add('open');
        return;
      }

      // 处理错题本关闭
      if (e.target.closest('#wrongBookClose') || e.target.closest('#wrongBookMask')) {
        const drawer = document.getElementById('wrongBookDrawer');
        if (drawer) drawer.classList.remove('open');
        return;
      }
    });
    console.log('✅ 全局点击事件已绑定到 document.body');
  }

  // 下面保留你原来的 navigate 初始化和 hash 路由
  requestAnimationFrame(() => {
    const hash = location.hash.replace('#', '');
    if (hash.startsWith('lesson/')) {
      navigate('lesson', { lessonId: hash.split('/')[1] });
    } else if (hash === 'growth') {
      navigate('growth');
    } else {
      navigate('home');
    }
  });

  // ⭐ 核心修复：初始化拇指条，并挂载到 window 上供模块调用
  ensureThumbBar();
  window.__shell = {
    navigate,
    showThumbBar,
    hideThumbBar,
    refreshHomeTasks,
    renderHome
  };
  console.log('✅ 拇指条已初始化并挂载到全局');
}

//history 和 wrongbook“双写”,监听里加“兜底刷新”:避免更新时间差异导致数据不一致
on(EVT.DATA_CHANGED, (payload) => {
  // 目前你已经是双写，所以任何一个库变化，都刷新一下 UI
  if (payload.source === 'wrongbook' || payload.source === 'history') {
    try { wbRender(); } catch (e) { console.warn('[shell] 兜底刷新失败', e); }
    try { window._refreshGrowthCards?.(); } catch(e) {}
  }
});
