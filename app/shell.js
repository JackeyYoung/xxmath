/* app/shell.js —— 地图 + 课页 + 成长 三层壳
   不碰 core/，不碰 m1~m14 内部逻辑
*/

import { historyLoad } from '../core/history.js';
import { wbLoad } from '../core/wrongbook.js';
import { on, EVT } from '../core/events.js';

import { activityStatsByModule, activityLoad } from '../core/activity.js';

import { masteryLoad } from '../core/mastery.js';

import {
escapeHtmlStrict, escapeHtml,
} from '../core/html.js';

import { targetLoad } from '../core/target.js';

import { msgLoad } from '../core/parent-message.js';

import { noteGetThisWeek, noteSetChild } from '../core/weekly-note.js';
import { showToast } from '../core/toast.js';

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

  // ⭐ 加掌握度
  const masteryMap = masteryLoad();
  const masteredByModule = {};
  // 需要知道每道题属于哪个模块 → 从 history 反查
  const historyAll = historyLoad();
  Object.values(masteryMap).forEach(rec => {
    if (rec.state !== 'mastered') return;
    const hist = historyAll.find(r => (r.problemText || '').trim() === rec.text);
    if (!hist) return;
    const mid = hist.moduleId || 'other';
    masteredByModule[mid] = (masteredByModule[mid] || 0) + 1;
  });

  Object.keys(stats).forEach(mid => {
    stats[mid].mastered = masteredByModule[mid] || 0;
  });

  return stats;
}

// 加“今日已掌握”卡片  
function getTodayMastered() {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const masteryMap = masteryLoad();
  const todayMastered = Object.values(masteryMap).filter(r =>
    r.state === 'mastered' && r.lastAt >= todayStart.getTime()
  );
  return todayMastered;
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
    // 只有体验记录 → 显示"玩过 N 次"→ 显示"掌握 N 次"
    const metaText = s.total > 0
      ? `已练 ${s.total} 题 · ${rate}%${s.mastered ? ` · 掌握 ${s.mastered}` : ''}`
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

  // renderHome 里，islandsHtml 生成后
  requestAnimationFrame(() => {
    document.querySelectorAll('.island-progress span').forEach(span => {
      span.style.transition = 'width .6s cubic-bezier(.34,1.3,.64,1)';
    });
  });

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

  // ⭐ 家长定的目标提示
  const targets = targetLoad();
  const isCustomTargets = targets.dailyQuestions !== 5 || targets.dailyStreak !== 3;
  const parentTargetHtml = isCustomTargets ? `
    <div class="home-parent-target">
      <span class="home-parent-target-icon">👨👩</span>
      <span>家长给你定了目标：每天 <b>${targets.dailyQuestions}</b> 题 · 连对 <b>${targets.dailyStreak}</b> 题 · 掌握 <b>${targets.dailyMastered}</b> 题</span>
    </div>
  ` : '';

  // ⭐ 今日任务
  const tasks = getTodayTasks();
  const tasksHtml = `
    <div class="home-tasks">
      <div class="home-tasks-hd">
        <span>📋 今日任务</span>
        <span class="home-tasks-count">${tasks.filter(t => t.done).length} / ${tasks.length}</span>
      </div>
      <div class="home-tasks-list">
        ${tasks.map(t => `
          <button class="home-task ${t.done ? 'done' : ''}" data-task-id="${t.id}">
            <div class="home-task-icon">${t.done ? '✅' : t.icon}</div>
            <div class="home-task-body">
              <div class="home-task-title">${t.title}</div>
              <div class="home-task-desc">${t.desc}</div>
              <div class="home-task-progress"><span style="width:${t.progress}%"></span></div>
            </div>
            <div class="home-task-arrow">${t.done ? '✓' : '→'}</div>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  //今日已掌握
  const todayMastered = getTodayMastered();
  const masteredHtml = todayMastered.length > 0 ? `
    <div class="home-mastered">
      <div class="home-mastered-hd">
        <span>🏆 今日已掌握</span>
        <span class="home-mastered-count">${todayMastered.length} 题</span>
      </div>
      <div class="home-mastered-list">
        ${todayMastered.slice(0, 3).map(r => `
          <div class="home-mastered-item">
            <span class="home-mastered-icon">✅</span>
            <span class="home-mastered-text">${escapeHtmlStrict(r.text.slice(0, 30))}${r.text.length > 30 ? '…' : ''}</span>
          </div>
        `).join('')}
        ${todayMastered.length > 3 ? `<div class="home-mastered-more">还有 ${todayMastered.length - 3} 题…</div>` : ''}
      </div>
      <button class="home-mastered-entry" data-goto="growth">
        查看全部成就 →
      </button>
    </div>
  ` : '';

  // ⭐ 本周进度
  const weekProgressHtml = (() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=周日, 1=周一, ...
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const weekStart = monday.getTime();
    const weekRecords = historyLoad().filter(r => r.timestamp >= weekStart);

    // 按天分组
    const dayMap = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dayMap[d.toDateString()] = { date: d, count: 0, isToday: d.toDateString() === now.toDateString() };
    }
    weekRecords.forEach(r => {
      const key = new Date(r.timestamp).toDateString();
      if (dayMap[key]) dayMap[key].count++;
    });

    const days = Object.values(dayMap);
    const totalWeek = weekRecords.length;
    const activeDays = days.filter(d => d.count > 0).length;
    const weekGoal = 25; // 一周 25 题
    const pct = Math.min(100, Math.round(totalWeek / weekGoal * 100));

    return `
      <div class="home-week">
        <div class="home-week-hd">
          <span>📅 本周进度</span>
          <span class="home-week-count"><b>${totalWeek}</b> / ${weekGoal} 题 · 学了 ${activeDays} 天</span>
          <button class="home-week-entry" data-goto="growth">查看周总结 →</button>
        </div>
        <div class="home-week-days">
          ${days.map(d => `
            <div class="home-week-day ${d.count > 0 ? 'active' : ''} ${d.isToday ? 'today' : ''}">
              <div class="home-week-dot">${d.count > 0 ? d.count : ''}</div>
              <div class="home-week-label">${['一','二','三','四','五','六','日'][days.indexOf(d)]}</div>
            </div>
          `).join('')}
        </div>
        <div class="home-week-bar">
          <span style="width:${pct}%"></span>
        </div>
      </div>
    `;
  })();

  document.getElementById('page-home').innerHTML = `
    <div class="home-wrap">
      ${heroHtml}
      ${parentTargetHtml}
      <div id="homeTasksWrap">${tasksHtml}</div>   <!-- ⭐ 包一层 -->
      ${weekProgressHtml}
      ${masteredHtml}
      <div class="home-section-title">📚 知识岛</div>
      <div class="island-grid">${islandsHtml}</div>
      ${recommendHtml}
      <button class="home-growth-entry" data-goto="growth">
        📊 我的成长与家长周报 →
      </button>
      <button class="home-parent-entry" id="homeParentEntry">
        💌 给孩子留一句话
      </button>
      <button class="home-parent-settings" id="homeParentSettings">
        ⚙️ 家长设置
      </button>
    </div>
  `;

  // Home 页加“家长入口”
  document.getElementById('homeParentEntry')?.addEventListener('click', () => {
    window.__showParentMessageModal?.();
  });
  document.getElementById('homeParentSettings')?.addEventListener('click', () => {
    window.__showParentSettingsModal?.();
  });

  // ⭐ 任务点击
  document.querySelectorAll('.home-task[data-task-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.taskId;
      const t = tasks.find(x => x.id === id);
      t?.action?.();
    });
  });

  // ⭐ 保留"去复习"按钮的特殊绑定（它不走 data-goto）
  const wbBtn = document.getElementById('homeGoWrong');
  if (wbBtn) wbBtn.addEventListener('click', () => {
    // 复用你现有的错题本抽屉
    document.getElementById('wrongBookBtn')?.click();
  });

}

// ⭐ 计算今日任务
function getTodayTasks() {
  const targets = targetLoad();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayRecords = historyLoad().filter(r => r.timestamp >= todayStart.getTime());
  const todayCount = todayRecords.length;
  const todayCorrect = todayRecords.filter(r => r.isCorrect).length;

  const tasks = [];
  const todayGoal = targets.dailyQuestions;
  const todayGoalStreak = targets.dailyStreak;
  const todayGoalWrongReview = targets.wrongReview;
  const todayGoalMastered = targets.dailyMastered;


  // 任务 1：做完 5 道题
  tasks.push({
    id: 'daily-5',
    icon: '🎯',
    title: `今天做 ${todayGoal} 道题`,
    desc: `已完成 ${todayCount} / ${todayGoal}`,
    done: todayCount >= todayGoal,
    progress: Math.min(100, Math.round(todayCount / todayGoal * 100)),
    action: () => navigate('lesson', { lessonId: 'm1' }),
  });

  // 任务 2：复习错题本
  const wrong = wbLoad();
  if (wrong.length > 0) {
    const todayWrongReviewed = todayRecords.filter(r => wbLoad().some(w => w.text === r.problemText)).length;
    tasks.push({
      id: 'review-wrong',
      icon: '📕',
      title: `复习 ${todayGoalWrongReview} 道错题`,
      desc: `错题本还有 ${wrong.length} 道`,
      done: todayWrongReviewed >= todayGoalWrongReview,
      progress: Math.min(100, Math.round(todayWrongReviewed / todayGoalWrongReview * 100)),
      action: () => document.getElementById('wrongBookBtn')?.click(),
    });
  }

  // 任务 3：连对 3 题（从今天记录算）
  const todayStreak = (() => {
    let s = 0;
    for (const r of todayRecords) {
      if (r.isCorrect) s++;
      else break;
    }
    return s;
  })();
  tasks.push({
    id: 'streak-3',
    icon: '🔥',
    title: `连对 ${todayGoalStreak} 题`,
    desc: todayStreak >= todayGoalStreak ? '已达成' : `当前连对 ${todayStreak} 题`,
    done: todayStreak >= todayGoalStreak,
    progress: Math.min(100, Math.round(todayStreak / todayGoalStreak * 100)),
    action: () => navigate('lesson', { lessonId: 'm1' }),
  });

  // ⭐ 任务 4：今天掌握 1 题
  const masteryMap = masteryLoad();
  const todayMastered = Object.values(masteryMap).filter(r =>
    r.state === 'mastered' && r.lastAt >= todayStart.getTime()
  );
  tasks.push({
    id: 'master-1',
    icon: '🏆',
    title: `掌握 ${todayGoalMastered} 道题`,
    desc: todayMastered.length >= todayGoalMastered
      ? `已掌握 ${todayMastered.length} 题`
      : '同一道题连续做对 2 次',
    done: todayMastered.length >= todayGoalMastered,
    progress: Math.min(100, Math.round(todayMastered.length / todayGoalMastered * 100)),
    action: () => navigate('lesson', { lessonId: 'm1' }),
  });

  return tasks;
}

// shell.js 里，getTodayTasks 之后加
export function refreshHomeTasks() {
  const wrap = document.getElementById('homeTasksWrap');
  if (!wrap) return;
  const tasks = getTodayTasks();
  wrap.innerHTML = `
    <div class="home-tasks">
      <div class="home-tasks-hd">
        <span>📋 今日任务</span>
        <span class="home-tasks-count">${tasks.filter(t => t.done).length} / ${tasks.length}</span>
      </div>
      <div class="home-tasks-list">
        ${tasks.map(t => `
          <button class="home-task ${t.done ? 'done' : ''}" data-task-id="${t.id}">
            <div class="home-task-icon">${t.done ? '✅' : t.icon}</div>
            <div class="home-task-body">
              <div class="home-task-title">${t.title}</div>
              <div class="home-task-desc">${t.desc}</div>
              <div class="home-task-progress"><span style="width:${t.progress}%"></span></div>
            </div>
            <div class="home-task-arrow">${t.done ? '✓' : '→'}</div>
          </button>
        `).join('')}
      </div>
    </div>
  `;
  wrap.querySelectorAll('.home-task[data-task-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.taskId;
      const t = tasks.find(x => x.id === id);
      t?.action?.();
    });
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
  if (!pool) return;

  pool.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
  const section = document.getElementById(lessonId);
  if (!section) return;
  section.classList.add('active');
  retriggerModuleRender(lessonId);

  // ⭐ 动态路径点：根据本模块历史记录算进度
  const history = historyLoad();
  const moduleRecords = history.filter(r => r.moduleId === lessonId);
  const totalCount = moduleRecords.length;
  const correctCount = moduleRecords.filter(r => r.isCorrect).length;

  // 简单规则：每做 2 题点亮一个点，最多 4 个点
  const totalDots = 4;
  const litDots = Math.min(totalDots, Math.ceil(totalCount / 2));
  const pathHtml = Array.from({ length: totalDots }).map((_, i) => {
    let cls = '';
    if (i < litDots - 1) cls = 'done';
    else if (i === litDots - 1) cls = 'current';
    return `<span class="path-dot ${cls}"></span>`;
  }).join('');

  document.getElementById('lessonHeader').innerHTML = `
    <button class="lesson-back" id="lessonBack">←</button>
    <div class="lesson-title">${meta.icon} ${meta.title}</div>
    <div class="lesson-path">${pathHtml}</div>
    <button class="lesson-more" id="lessonMore">⋯</button>
  `;

  // 顶部进度条（新增）
  const progressBar = document.getElementById('lessonProgress');
  if (progressBar) {
    progressBar.innerHTML = totalCount > 0
      ? `<span>已练 <b>${totalCount}</b> 题 · 正确率 <b>${Math.round(correctCount / totalCount * 100)}%</b></span>`
      : `<span>还没开始，试试第一题吧</span>`;
  }

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


function renderWeeklySummary() {
  const wrap = document.getElementById('weeklySummaryWrap');
  if (!wrap) {
    console.warn('[renderWeeklySummary] weeklySummaryWrap 不存在');   // ⭐
    return;
  }

  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const weekRecords = historyLoad().filter(r => r.timestamp >= weekAgo);

  const total = weekRecords.length;
  const correct = weekRecords.filter(r => r.isCorrect).length;
  const rate = total ? Math.round(correct / total * 100) : 0;
  const days = new Set(weekRecords.map(r => {
    const d = new Date(r.timestamp); d.setHours(0, 0, 0, 0);
    return d.getTime();
  })).size;

  // ⭐ 本周掌握数
  const masteryMap = masteryLoad();
  const weekMastered = Object.values(masteryMap).filter(r =>
    r.state === 'mastered' && r.lastAt >= weekAgo
  );

  // 本周模块分布
  const byModule = {};
  weekRecords.forEach(r => {
    const mid = r.moduleId || 'other';
    byModule[mid] = (byModule[mid] || 0) + 1;
  });
  const topModules = Object.entries(byModule).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // 错题最多的模块
  const wrongByModule = {};
  weekRecords.filter(r => !r.isCorrect).forEach(r => {
    const mid = r.moduleId || 'other';
    wrongByModule[mid] = (wrongByModule[mid] || 0) + 1;
  });
  const topWrong = Object.entries(wrongByModule).sort((a, b) => b[1] - a[1])[0];

  /*成就墙*/
  const allMastered = Object.values(masteryMap).filter(r => r.state === 'mastered');
  const achievementHtml = `
    <div class="achievement-wall">
      <div class="achievement-wall-hd">
        <span>🏆 成就墙</span>
        <span class="achievement-wall-count">共掌握 <b>${allMastered.length}</b> 题</span>
      </div>
      ${allMastered.length === 0 ? `
        <div class="achievement-empty">
          还没有掌握的题，做对同一道题 2 次就能点亮第一颗星 ⭐
        </div>
      ` : `
        <div class="achievement-grid">
          ${allMastered.slice(0, 20).map((r, i) => `
            <div class="achievement-item" title="${escapeHtmlStrict(r.text)}">
              <div class="achievement-star">⭐</div>
              <div class="achievement-text">${escapeHtmlStrict(r.text.slice(0, 20))}${r.text.length > 20 ? '…' : ''}</div>
            </div>
          `).join('')}
          ${allMastered.length > 20 ? `<div class="achievement-more">还有 ${allMastered.length - 20} 题…</div>` : ''}
        </div>
      `}
    </div>
  `;

  // ⭐ 月对比
  const monthCompareHtml = (() => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

    const allHistory = historyLoad();
    const thisMonth = allHistory.filter(r => r.timestamp >= thisMonthStart);
    const lastMonth = allHistory.filter(r => r.timestamp >= lastMonthStart && r.timestamp < thisMonthStart);

    const thisTotal = thisMonth.length;
    const thisCorrect = thisMonth.filter(r => r.isCorrect).length;
    const thisRate = thisTotal ? Math.round(thisCorrect / thisTotal * 100) : 0;
    const lastTotal = lastMonth.length;
    const lastCorrect = lastMonth.filter(r => r.isCorrect).length;
    const lastRate = lastTotal ? Math.round(lastCorrect / lastTotal * 100) : 0;

    // 掌握数
    const masteryMap = masteryLoad();
    const thisMastered = Object.values(masteryMap).filter(r => r.state === 'mastered' && r.lastAt >= thisMonthStart).length;
    const lastMastered = Object.values(masteryMap).filter(r => r.state === 'mastered' && r.lastAt >= lastMonthStart && r.lastAt < thisMonthStart).length;

    // 学习天数
    const thisDays = new Set(thisMonth.map(r => new Date(r.timestamp).toDateString())).size;
    const lastDays = new Set(lastMonth.map(r => new Date(r.timestamp).toDateString())).size;

    if (lastTotal === 0 && thisTotal === 0) return '';

    const arrow = (cur, prev) => {
      if (prev === 0 && cur === 0) return '';
      if (prev === 0) return '<span class="month-arrow up">新</span>';
      if (cur > prev) return '<span class="month-arrow up">↑</span>';
      if (cur < prev) return '<span class="month-arrow down">↓</span>';
      return '<span class="month-arrow flat">—</span>';
    };

    return `
      <div class="month-compare">
        <div class="month-compare-hd">
          <span>📈 本月 vs 上月</span>
          <span class="month-compare-month">${now.getFullYear()}年${now.getMonth() + 1}月</span>
        </div>
        <div class="month-compare-grid">
          <div class="month-row">
            <span class="month-label">做题</span>
            <span class="month-value">${thisTotal}</span>
            <span class="month-vs">上月 ${lastTotal}</span>
            ${arrow(thisTotal, lastTotal)}
          </div>
          <div class="month-row">
            <span class="month-label">正确率</span>
            <span class="month-value">${thisRate}%</span>
            <span class="month-vs">上月 ${lastRate}%</span>
            ${arrow(thisRate, lastRate)}
          </div>
          <div class="month-row">
            <span class="month-label">掌握</span>
            <span class="month-value">${thisMastered}</span>
            <span class="month-vs">上月 ${lastMastered}</span>
            ${arrow(thisMastered, lastMastered)}
          </div>
          <div class="month-row">
            <span class="month-label">学习天数</span>
            <span class="month-value">${thisDays}</span>
            <span class="month-vs">上月 ${lastDays}</span>
            ${arrow(thisDays, lastDays)}
          </div>
        </div>
      </div>
    `;
  })();

  const note = noteGetThisWeek();
  const weeklyNoteHtml = `
    <div class="weekly-note">
      <div class="weekly-note-hd">
        <span>💬 本周一句话</span>
      </div>
      <div class="weekly-note-row">
        <div class="weekly-note-label">👨 家长</div>
        <div class="weekly-note-text ${note.parent ? '' : 'empty'}">
          ${note.parent ? escapeHtmlStrict(note.parent) : '家长还没写'}
        </div>
        ${!note.parent ? `<button class="weekly-note-write" id="weeklyNoteParentWrite">提醒家长 →</button>` : ''}
        ${!note.parent ? `<button class="weekly-note-write" id="weeklyNoteParentWrite">写一句 →</button>` : ''}
      </div>
      <div class="weekly-note-row">
        <div class="weekly-note-label">👦 孩子</div>
        <div class="weekly-note-text ${note.child ? '' : 'empty'}">
          ${note.child ? escapeHtmlStrict(note.child) : '我还没写'}
        </div>
        <button class="weekly-note-write" id="weeklyNoteChildWrite">
          ${note.child ? '改一句' : '写一句 →'}
        </button>
      </div>
    </div>
  `;

  document.getElementById('weeklyNoteParentWrite')?.addEventListener('click', () => {
    window.__showParentSettingsModal?.();
    // 弹窗打开后自动聚焦 textarea
    setTimeout(() => {
      document.getElementById('parentWeeklyNote')?.focus();
    }, 300);
  });

  wrap.innerHTML = `
    <div class="weekly-summary">
      <div class="weekly-summary-hd">
        <span>📊 本周学习总结</span>
        <span class="weekly-summary-range">${new Date(weekAgo).toLocaleDateString('zh-CN')} - 今天</span>
      </div>
      <div class="weekly-summary-stats">
        <div class="weekly-stat">
          <div class="weekly-stat-value">${total}</div>
          <div class="weekly-stat-label">做题</div>
        </div>
        <div class="weekly-stat">
          <div class="weekly-stat-value" style="color:#15803d;">${correct}</div>
          <div class="weekly-stat-label">做对</div>
        </div>
        <div class="weekly-stat">
          <div class="weekly-stat-value" style="color:#2563eb;">${rate}%</div>
          <div class="weekly-stat-label">正确率</div>
        </div>
        <div class="weekly-stat">
          <div class="weekly-stat-value" style="color:#7c3aed;">${weekMastered.length}</div>
          <div class="weekly-stat-label">掌握</div>
        </div>
        <div class="weekly-stat">
          <div class="weekly-stat-value" style="color:#f59e0b;">${days}</div>
          <div class="weekly-stat-label">学习天数</div>
        </div>
      </div>
      ${topModules.length ? `
        <div class="weekly-summary-section">
          <div class="weekly-summary-section-title">📚 本周练得最多</div>
          <div class="weekly-summary-tags">
            ${topModules.map(([mid, count]) => {
              const meta = LESSON_META[mid] || { title: mid, icon: '📖' };
              return `<span class="weekly-summary-tag">${meta.icon} ${meta.title} · ${count} 次</span>`;
            }).join('')}
          </div>
        </div>
      ` : ''}
      ${weekMastered.length ? `
        <div class="weekly-summary-section">
          <div class="weekly-summary-section-title">🏆 本周掌握的题</div>
          <div class="weekly-mastered-list">
            ${weekMastered.slice(0, 5).map(r => `
              <div class="weekly-mastered-item">✅ ${escapeHtmlStrict(r.text.slice(0, 32))}${r.text.length > 32 ? '…' : ''}</div>
            `).join('')}
            ${weekMastered.length > 5 ? `<div class="weekly-mastered-more">还有 ${weekMastered.length - 5} 题…</div>` : ''}
          </div>
        </div>
      ` : ''}
      ${topWrong ? `
        <div class="weekly-summary-section">
          <div class="weekly-summary-section-title">⚠️ 下周重点</div>
          <div class="weekly-summary-tip">
            集中练一练「<b>${(LESSON_META[topWrong[0]] || { title: topWrong[0] }).title}</b>」，本周错过 ${topWrong[1]} 次
          </div>
        </div>
      ` : ''}
      <div class="weekly-summary-actions">
        <button class="btn-secondary" id="weeklyExportBtn">📤 导出周报</button>
        <button class="btn" id="weeklyGoWrongBtn">📕 复习错题</button>
      </div>
    </div>
    ${weeklyNoteHtml}
    ${monthCompareHtml}
    ${achievementHtml}
  `;

  document.getElementById('weeklyExportBtn').addEventListener('click', () => {
    const name = (typeof getStudentName === 'function' && getStudentName()) || '未命名';
    const html = typeof buildWeeklyReportHtml === 'function' ? buildWeeklyReportHtml() : '';
    if (typeof downloadBlob === 'function') {
      downloadBlob(html, `周报_${name}_${new Date().toISOString().slice(0, 10)}.html`, 'text/html');
    }
    if (typeof showToast === 'function') showToast('✅ 周报已导出', 'success');
  });

  document.getElementById('weeklyGoWrongBtn').addEventListener('click', () => {
    document.getElementById('wrongBookBtn')?.click();
  });

   // 孩子写一句
  // ⭐ 改成：
  document.getElementById('weeklyNoteChildWrite')?.addEventListener('click', () => {
    showWeeklyNoteModal();
  });
  
}

/* ============================================================
   6. Growth 页：把 m14 搬进来
   ============================================================ */
function renderGrowth() {
  const stage = document.getElementById('growthStage');
  if (stage.dataset.mounted === '1') {
    // ⭐ 已挂载，只刷新总结卡
    renderWeeklySummary();
    return;
  }

  const section = document.getElementById('m14');
  if (section) {
    section.parentNode.removeChild(section);
    stage.appendChild(section);
    section.style.display = 'block';
    section.classList.add('active');
  }
  stage.dataset.mounted = '1';

  // ⭐ 顶部插入本周总结卡
  const hd = document.getElementById('growthHeader');
  hd.innerHTML = `
    <button class="lesson-back" id="growthBack">←</button>
    <div class="lesson-title">📊 我的成长</div>
    <div style="width:36px"></div>
  `;
  document.getElementById('growthBack').addEventListener('click', () => navigate('home'));

  // ⭐ 在 m14 前面插入总结卡容器
  const summaryWrap = document.createElement('div');
  summaryWrap.id = 'weeklySummaryWrap';
  summaryWrap.className = 'weekly-summary-wrap';
  stage.insertBefore(summaryWrap, stage.firstChild);

  renderWeeklySummary();

   // ⭐ 本周周报提示
  const now = new Date();
  const dayOfWeek = now.getDay();
  const isSunday = dayOfWeek === 0;
  const weekAgo = now.getTime() - 7 * 86400000;
  const weekRecords = historyLoad().filter(r => r.timestamp >= weekAgo);

  if (weekRecords.length > 0) {
    const tip = document.createElement('div');
    tip.className = 'growth-weekly-tip';
    tip.innerHTML = isSunday
      ? `📊 <b>今天是周日</b>，本周学习了 <b>${weekRecords.length}</b> 道题，看看周报吧 →`
      : `📊 本周已学习 <b>${weekRecords.length}</b> 道题，<b>周日</b>会生成完整周报`;
    tip.style.cssText = 'margin: 12px 16px; padding: 12px 16px; background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border: 2px solid #bae6fd; border-radius: 12px; font-size: 13px; color: #0c4a6e; line-height: 1.7;';
    const header = document.getElementById('growthHeader');
    if (header && header.nextSibling) {
      header.parentNode.insertBefore(tip, header.nextSibling);
    }
  }
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
    navigate, renderHome, refreshHomeTasks, mountLesson, renderGrowth,
    showThumbBar, hideThumbBar,
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

/* ⭐ 孩子写"本周一句话"的弹窗 */
function showWeeklyNoteModal() {
  if (document.querySelector('.weekly-note-mask')) return;

  const current = noteGetThisWeek().child || '';

  const mask = document.createElement('div');
  mask.className = 'weekly-note-mask';
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:flex-end;justify-content:center;z-index:10020;padding:0;';
  mask.innerHTML = `
    <div class="weekly-note-modal" style="
      background:#fff;
      border-radius:20px 20px 0 0;
      padding:24px 20px calc(20px + env(safe-area-inset-bottom));
      width:100%;
      max-width:480px;
      box-shadow:0 -8px 40px rgba(15,23,42,.25);
      animation:weeklyNoteSlideUp .28s cubic-bezier(.34,1.3,.64,1);
    ">
      <div style="font-size:40px;text-align:center;margin-bottom:8px;">💬</div>
      <div style="font-size:16px;font-weight:800;color:#1e293b;text-align:center;margin-bottom:6px;">这一周，最想对自己说什么？</div>
      <div style="font-size:12.5px;color:#64748b;text-align:center;line-height:1.7;margin-bottom:16px;">
        家长打开成长页会看到这句话
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:12px;">
        ${[
          '这周我学会了好多',
          '我下次要更细心',
          '乘法越来越顺了',
          '我最喜欢竖式',
          '谢谢爸爸妈妈'
        ].map(t => `
          <button class="weekly-note-quick" data-text="${t}" style="
            padding:6px 12px;border:1.5px solid #e5e7eb;border-radius:999px;
            background:#fff;color:#475569;font-size:12px;font-weight:700;
            cursor:pointer;font-family:inherit;
          ">${t}</button>
        `).join('')}
      </div>

      <textarea
        id="weeklyNoteInput"
        placeholder="写一句…"
        maxlength="80"
        style="
          width:100%;
          padding:12px 14px;
          border:2px solid #e5e7eb;
          border-radius:12px;
          font-size:15px;
          font-family:inherit;
          outline:none;
          resize:none;
          height:80px;
          margin-bottom:14px;
          box-sizing:border-box;
        "
      >${escapeHtmlStrict(current)}</textarea>

      <div style="display:flex;gap:10px;">
        <button id="weeklyNoteCancel" style="
          flex:1;padding:14px;border-radius:12px;background:#f1f5f9;
          color:#475569;border:none;cursor:pointer;font-size:15px;
          font-weight:700;font-family:inherit;
        ">取消</button>
        <button id="weeklyNoteSave" style="
          flex:2;padding:14px;border-radius:12px;background:#2563eb;
          color:#fff;border:none;cursor:pointer;font-size:15px;
          font-weight:700;font-family:inherit;box-shadow:0 3px 0 #1d4ed8;
        ">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(mask);

  const input = document.getElementById('weeklyNoteInput');

  // 快捷语
  mask.querySelectorAll('.weekly-note-quick').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.text;
      input.focus();
    });
  });

  // 取消
  document.getElementById('weeklyNoteCancel').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });

  // 保存
  document.getElementById('weeklyNoteSave').addEventListener('click', () => {
    const text = input.value.trim();
    if (!text) {
      showToast('写一句再保存吧', 'info');
      return;
    }
    noteSetChild(text);
    mask.remove();
    renderWeeklySummary();
    showToast('✅ 写好了，家长打开成长页会看到', 'success');
  });

  // 自动聚焦（延迟一点，避免 iOS 键盘弹起时页面跳动）
  setTimeout(() => {
    try {
      input.focus({ preventScroll: true });
    } catch (e) {
      input.focus();
    }
  }, 250);
}
