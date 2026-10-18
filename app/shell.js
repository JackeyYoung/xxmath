/* app/shell.js —— 地图 + 课页 + 成长 三层壳
   不碰 core/，不碰 m1~m14 内部逻辑
*/

import { historyLoad } from '../core/history.js';
import { wbLoad } from '../core/wrongbook.js';
import { on, EVT } from '../core/events.js';

import { activityStatsByModule, activityLoad } from '../core/activity.js';

/* ============================================================
   1. 年级配置（为多年级扩展做准备）
   ============================================================ */
export const GRADE_CONFIG = {
  '3': {
    id: '3',
    name: '三年级',
    islands: [
      { id: 'm1',  icon: '🎯', name: '混合运算', color: 'blue',   desc: '先算乘除，后算加减' },
      { id: 'm2',  icon: '🧱', name: '铺地砖',   color: 'green',  desc: '一块一块铺满' },
      { id: 'm3',  icon: '🍕', name: '分数',     color: 'amber',  desc: '分一分，取几份' },
      { id: 'm4',  icon: '📏', name: '长度',     color: 'cyan',   desc: '毫米到千米' },
      { id: 'm5',  icon: '📐', name: '面积',     color: 'violet', desc: '长 × 宽 是多少格' },
      { id: 'm6',  icon: '💰', name: '小数',     color: 'pink',   desc: '元角分' },
      { id: 'm7',  icon: '🕐', name: '时间',     color: 'orange', desc: '时分秒' },
      { id: 'm8',  icon: '🍎', name: '倍数',     color: 'lime',   desc: '几倍是多少' },
      { id: 'm9',  icon: '🔢', name: '竖式',     color: 'sky',    desc: '一步步算' },
      { id: 'm10', icon: '📅', name: '日期',     color: 'red',    desc: '年月日' },
      { id: 'm11', icon: '📍', name: '方向',     color: 'teal',   desc: '第几列第几行' },
      { id: 'm12', icon: '⚖️', name: '质量',     color: 'purple', desc: '吨千克克' },
      { id: 'm13', icon: '💡', name: '思维',     color: 'indigo', desc: '四步法解题' },
    ],
  },
};

export function getGradeConfig() {
  const g = (typeof globalThis.__memCachePeek === 'function'
    ? globalThis.__memCachePeek('grade3_current_grade')
    : localStorage.getItem('grade3_current_grade')) || '3';
  return GRADE_CONFIG[g] || GRADE_CONFIG['3'];
}

/* ============================================================
   2. 路由：home / lesson / growth
   ============================================================ */
const ROUTES = ['home', 'lesson', 'growth'];
let currentRoute = 'home';
let currentLessonId = null;

export function navigate(route, opts = {}) {
  if (!ROUTES.includes(route)) return;
  currentRoute = route;
  if (opts.lessonId) currentLessonId = opts.lessonId;

  // ⭐ 只操作 class，display 交给 CSS 的 .page / .page.active 规则
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const targetId = route === 'home'   ? 'page-home'
                 : route === 'lesson' ? 'page-lesson'
                 :                      'page-growth';
  const target = document.getElementById(targetId);
  if (!target) {
    console.error('[shell] 找不到页面容器:', targetId);
    return;
  }
  target.classList.add('active');

  if (route === 'home') {
    window.__flushActivity?.();   // ⭐ 回首页前 flush
    renderHome();
    history.pushState({ route: 'home' }, '', '#home');
  } else if (route === 'lesson') {
    mountLesson(currentLessonId);
    history.pushState({ route: 'lesson', lessonId: currentLessonId }, '', `#lesson/${currentLessonId}`);
  } else {
    renderGrowth();
    history.pushState({ route: 'growth' }, '', '#growth');
  }

  window.scrollTo({ top: 0, behavior: 'auto' });
}

window.addEventListener('popstate', (e) => {
  const s = e.state;
  if (!s) { navigate('home'); return; }
  navigate(s.route, { lessonId: s.lessonId });
});

/* ============================================================
   3. Home 页：学习地图
   ============================================================ */
function getIslandStats() {
  const history = historyLoad();
  const activity = activityStatsByModule();

  const stats = {};
  // ① history
  history.forEach(r => {
    const key = r.moduleId || r.problemSource || 'other';
    if (!stats[key]) stats[key] = { total: 0, correct: 0, practiced: 0, lastAt: 0 };
    stats[key].total++;
    if (r.isCorrect) stats[key].correct++;
    stats[key].practiced++;
    if (r.timestamp > stats[key].lastAt) stats[key].lastAt = r.timestamp;
  });
  // ② activity
  Object.keys(activity).forEach(mid => {
    if (!stats[mid]) stats[mid] = { total: 0, correct: 0, practiced: 0, lastAt: 0 };
    stats[mid].practiced += activity[mid].count;
    if (activity[mid].lastAt > stats[mid].lastAt) stats[mid].lastAt = activity[mid].lastAt;
  });

  return stats;
}

export function renderHome() {
  const cfg = getGradeConfig();
  const stats = getIslandStats();

  // ⭐ 合并双数据源，算 last
  const history = historyLoad();
  const activity = activityLoad();
  const recent = [
    ...history.map(r => ({
      moduleId: r.moduleId || r.problemSource,
      at: r.timestamp,
      text: r.problemText,
      kind: 'practice',
    })),
    ...activity.map(a => ({
      moduleId: a.moduleId,
      at: a.at,
      text: a.label,
      kind: 'activity',
    })),
  ].sort((a, b) => b.at - a.at);

  const last = recent[0];
  let lastIslandId = null;
  if (last) {
    if (last.moduleId && cfg.islands.some(i => i.id === last.moduleId)) {
      lastIslandId = last.moduleId;
    } else if (last.moduleId && /^m\d+$/.test(last.moduleId)) {
      lastIslandId = last.moduleId;
    } else if (last.kind === 'practice') {
      lastIslandId = 'm13';
    }
  }
  const lastIsland = cfg.islands.find(i => i.id === lastIslandId);

  // ⭐ hero 文案
  const heroMeta = last
    ? (last.kind === 'activity'
        ? `上次玩了「${last.text}」`
        : `上次做到「${(last.text || '').slice(0, 16)}…」`)
    : '先算乘除，后算加减';

  const heroHtml = last ? `
    <button class="home-hero" data-goto="lesson" data-lesson="${lastIslandId || 'm1'}">
      <div class="home-hero-kicker">继续上次</div>
      <div class="home-hero-title">${lastIsland ? lastIsland.icon + ' ' + lastIsland.name : '混合运算'}</div>
      <div class="home-hero-meta">${heroMeta}</div>
      <div class="home-hero-cta">▶ 继续</div>
    </button>
  ` : `
    <button class="home-hero" data-goto="lesson" data-lesson="m1">
      <div class="home-hero-kicker">开始今天的第一题</div>
      <div class="home-hero-title">🎯 混合运算</div>
      <div class="home-hero-meta">先算乘除，后算加减</div>
      <div class="home-hero-cta">▶ 开始</div>
    </button>
  `;

  // 知识岛
  const islandsHtml = cfg.islands.map(isl => {
    const s = stats[isl.id] || { total: 0, correct: 0, practiced: 0 };
    const rate = s.total ? Math.round(s.correct / s.total * 100) : 0;

    // 有做题记录 → 显示正确率
    // 只有体验记录 → 显示"玩过 N 次"
    const metaText = s.total > 0
      ? `已练 ${s.total} 题 · ${rate}%`
      : s.practiced > 0
        ? `玩过 ${s.practiced} 次`
        : '还没开始';

    // 进度条：有做题记录用正确率，否则用体验次数（每 10 次满）
    const progress = s.total > 0
      ? Math.min(100, s.total * 8)
      : Math.min(100, s.practiced * 10);
    return `
      <button class="island island-${isl.color}" data-goto="lesson" data-lesson="${isl.id}">
        <div class="island-icon">${isl.icon}</div>
        <div class="island-name">${isl.name}</div>
        <div class="island-desc">${isl.desc}</div>
        <div class="island-progress"><span style="width:${progress}%"></span></div>
        <div class="island-meta">${metaText}</div>
      </button>
    `;
  }).join('');

  // 推荐（错题画像驱动）
  const wrong = wbLoad();
  const recommendHtml = wrong.length ? `
    <div class="home-recommend">
      <div class="home-recommend-icon">🤖</div>
      <div class="home-recommend-body">
        错题本还有 <b>${wrong.length}</b> 道题等着复习
      </div>
      <button class="home-recommend-cta" id="homeGoWrong">去复习</button>
    </div>
  ` : '';

  document.getElementById('page-home').innerHTML = `
    <div class="home-wrap">
      ${heroHtml}
      <div class="home-section-title">📚 知识岛</div>
      <div class="island-grid">${islandsHtml}</div>
      ${recommendHtml}
      <button class="home-growth-entry" data-goto="growth">
        📊 我的成长与家长周报 →
      </button>
    </div>
  `;

  // ⭐ 保留"去复习"按钮的特殊绑定（它不走 data-goto）
  const wbBtn = document.getElementById('homeGoWrong');
  if (wbBtn) wbBtn.addEventListener('click', () => {
    // 复用你现有的错题本抽屉
    document.getElementById('wrongBookBtn')?.click();
  });
}

/* ============================================================
   4. Lesson 页：课页壳
   ============================================================ */
const LESSON_META = {
  m1:  { title: '混合运算', icon: '🎯', steps: 4 },
  m2:  { title: '铺地砖',   icon: '🧱', steps: 3 },
  m3:  { title: '分数',     icon: '🍕', steps: 3 },
  m4:  { title: '长度',     icon: '📏', steps: 3 },
  m5:  { title: '面积',     icon: '📐', steps: 3 },
  m6:  { title: '小数',     icon: '💰', steps: 3 },
  m7:  { title: '时间',     icon: '🕐', steps: 3 },
  m8:  { title: '倍数',     icon: '🍎', steps: 3 },
  m9:  { title: '竖式',     icon: '🔢', steps: 4 },
  m10: { title: '日期',     icon: '📅', steps: 2 },
  m11: { title: '方向',     icon: '📍', steps: 2 },
  m12: { title: '质量',     icon: '⚖️', steps: 3 },
  m13: { title: '解题思维', icon: '💡', steps: 4 },
};

/* ⭐ 搬进 stage 后，重新跑一次模块自己的渲染入口 */
function retriggerModuleRender(lessonId) {
  try {
    switch (lessonId) {
      case 'm1':
        // M1 的 m1Render 是闭包，优先用挂到 window 的引用
        if (typeof window.__m1Rerender === 'function') {
          window.__m1Rerender();
        } else {
          // 兜底：点一下"重来一次"按钮，触发 m1LoadExpression
          document.getElementById('m1reset')?.click();
        }
        break;
      case 'm2':
        if (typeof window.m2Draw === 'function') { window.m2Draw(); window.m2Calc(); }
        break;
      case 'm3':
        if (typeof window.m3Reset === 'function') window.m3Reset();
        break;
      case 'm5':
        if (typeof window.m5Render === 'function') window.m5Render();
        break;
      case 'm6':
        if (typeof window.m6Update === 'function') window.m6Update();
        break;
      case 'm7':
        if (typeof window.m7Draw === 'function') { window.m7Draw(); window.m7UpdateDigital(); }
        break;
      case 'm9':
        if (typeof window.m9Render === 'function') window.m9Render();
        break;
      case 'm10':
        if (typeof window.m10Render === 'function') window.m10Render();
        break;
      case 'm11':
        if (typeof window.m11Render === 'function') window.m11Render();
        break;
      case 'm12':
        if (typeof window.m12Update === 'function') window.m12Update();
        break;
      case 'm13':
        if (typeof window.m13RenderSteps === 'function') window.m13RenderSteps();
        break;
      // m4/m8/m14 不需要额外渲染
    }
  } catch (e) {
    console.warn('[shell] 重新渲染模块失败:', lessonId, e);
  }
}

function mountLesson(lessonId) {
  if (!lessonId) lessonId = 'm1';
  const meta = LESSON_META[lessonId] || LESSON_META.m1;

  const pool = document.getElementById('modulePool');
  if (!pool) { console.error('[shell] #modulePool 不存在'); return; }

  // ⭐ 所有 module 取消 active
  pool.querySelectorAll('.module').forEach(m => {
    m.classList.remove('active');
  });

  // ⭐ 目标 module 加 active（容错：遍历找 id）
  let section = document.getElementById(lessonId);
  if (!section) {
    const target = String(lessonId).trim();
    section = [...pool.querySelectorAll('.module')].find(m =>
      (m.id || '').trim() === target
    );
  }
  if (!section) {
    console.error('[shell] 找不到模块:', lessonId);
    console.warn('[shell] 现有:', [...pool.querySelectorAll('.module')].map(m => m.id));
    return;
  }
  section.classList.add('active');

  // 重新触发模块渲染（Canvas 模块需要）
  retriggerModuleRender(lessonId);

  // header 渲染
  const pathHtml = Array.from({ length: meta.steps }).map((_, i) => {
    const cls = i === 0 ? 'done' : i === 1 ? 'current' : '';
    return `<span class="path-dot ${cls}"></span>`;
  }).join('');

  document.getElementById('lessonHeader').innerHTML = `
    <button class="lesson-back" id="lessonBack">←</button>
    <div class="lesson-title">${meta.icon} ${meta.title}</div>
    <div class="lesson-path">${pathHtml}</div>
    <button class="lesson-more" id="lessonMore">⋯</button>
  `;

  document.getElementById('lessonBack').addEventListener('click', () => navigate('home'));
  document.getElementById('lessonMore').addEventListener('click', () => {
    document.getElementById('wrongBookBtn')?.click();
  });

  ensureThumbBar();
}

/* ============================================================
   5. 拇指区反馈条（Brilliant 式底部 Banner）
   ============================================================ */
function ensureThumbBar() {
  if (document.getElementById('thumbBar')) return;
  const bar = document.createElement('div');
  bar.id = 'thumbBar';
  bar.className = 'thumb-bar';
  bar.innerHTML = `
    <div class="thumb-bar-body" id="thumbBarBody"></div>
    <div class="thumb-bar-actions">
      <button class="thumb-btn secondary" id="thumbRetry" hidden>再试</button>
      <button class="thumb-btn primary" id="thumbNext" hidden>继续</button>
    </div>
  `;
  document.body.appendChild(bar);

  // ⭐ 绑一次，永远不重复
  document.getElementById('thumbRetry').addEventListener('click', () => {
    const lesson = document.querySelector('#modulePool .module.active');  // ⭐ 改这里
    if (!lesson) { hideThumbBar(); return; }
    const reset = lesson.querySelector('[id$="reset"]');
    if (reset) reset.click();
    hideThumbBar();
  });
  document.getElementById('thumbNext').addEventListener('click', () => {
    hideThumbBar();
  });
}

export function showThumbBar({ text, ok, onNext }) {
  const bar = document.getElementById('thumbBar');
  if (!bar) return;
  bar.classList.add('show', ok ? 'ok' : 'err');
  document.getElementById('thumbBarBody').innerHTML = text;
  const retry = document.getElementById('thumbRetry');
  const next = document.getElementById('thumbNext');
  retry.hidden = ok;
  next.hidden = false;
  next.textContent = ok ? '继续' : '看看为什么';
  next.onclick = () => { hideThumbBar(); onNext?.(); };
}

export function hideThumbBar() {
  document.getElementById('thumbBar')?.classList.remove('show', 'ok', 'err');
}

/* ============================================================
   6. Growth 页：把 m14 搬进来
   ============================================================ */
function renderGrowth() {
  const stage = document.getElementById('growthStage');
  if (stage.dataset.mounted === '1') return;
  const section = document.getElementById('m14');
  if (section) {
    section.parentNode.removeChild(section);
    stage.appendChild(section);
    section.style.display = 'block';
    section.classList.add('active');
  }
  stage.dataset.mounted = '1';

  // 顶部返回
  const hd = document.getElementById('growthHeader');
  hd.innerHTML = `
    <button class="lesson-back" id="growthBack">←</button>
    <div class="lesson-title">📊 我的成长</div>
    <div style="width:36px"></div>
  `;
  document.getElementById('growthBack').addEventListener('click', () => navigate('home'));
}

/* ============================================================
   7. 初始化
   ============================================================ */
export function initShell() {
  //在 initShell 里把 .tabs 隐藏
  document.querySelector('.tabs')?.style.setProperty('display', 'none');
  // ⭐ 事件委托：绑在 #page-home 上，永不丢失
  const homeEl = document.getElementById('page-home');
  if (homeEl && !homeEl.dataset._delegated) {
    homeEl.dataset._delegated = '1';
    homeEl.addEventListener('click', (e) => {
      const target = e.target.closest('[data-goto]');
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      const route = target.dataset.goto;
      if (route === 'lesson') navigate('lesson', { lessonId: target.dataset.lesson });
      else navigate(route);
    });
  }
  on(EVT.DATA_CHANGED, () => { if (currentRoute === 'home') renderHome(); });
  on(EVT.GRADE_CHANGED, () => { renderHome(); });

  // ⭐ 暴露给 Console 调试
  window.__shell = {
      navigate, renderHome, mountLesson, renderGrowth,
      showThumbBar, hideThumbBar,   // ⭐ 加上这两个
   };

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
}