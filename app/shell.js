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

import { showToast } from '../core/toast.js';

import { msgLoad, msgAdd, msgReply, msgGroupByTime, msgMarkAllRead } from '../core/parent-message.js';
import { targetLoad, targetSave, targetReset, DEFAULT_TARGETS } from '../core/target.js';
import { getStorageHealth, onStorageError } from '../core/storage.js';
import { getSyncState, forceSync, onSyncStateChange } from '../core/sync/sync-manager.js';
import { getErrorLog } from '../core/errors.js';
import { lsGet, lsSet } from '../core/storage.js';

import { openSyncSetupModal } from './sync-setup-ui.js';
import {
  getCurrentUser,
  ensureAnonymousLogin,
} from '../core/sync/auth.js';

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
   2. 路由：home / lesson / growth / message
   ============================================================ */
const ROUTES = ['home', 'lesson', 'growth', 'messages', 'settings'];
let currentRoute = 'home';
let currentLessonId = null;

export function navigate(route, opts = {}) {
  if (!ROUTES.includes(route)) return;
  currentRoute = route;
  if (opts.lessonId) currentLessonId = opts.lessonId;

  // ⭐ 核心新增：如果是进入 lesson 页面，隐藏全局 header
  // 如果是 lesson 页面，隐藏全局 header
  const globalHeader = document.getElementById('globalHeader');
  if (globalHeader) {
    if (route === 'lesson') {
      globalHeader.style.display = 'none';
    } else {
      globalHeader.style.display = 'block';
    }
  }

  // ⭐ 只操作 class，display 交给 CSS 的 .page / .page.active 规则
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const targetId = route === 'home'   ? 'page-home'
               : route === 'lesson' ? 'page-lesson'
               : route === 'growth' ? 'page-growth'
               : route === 'messages' ? 'page-messages'
               : route === 'settings' ? 'page-settings'
               :                        'page-home';
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
  } else if (route === 'growth') {
    renderGrowth();
    history.pushState({ route: 'growth' }, '', '#growth');
  } else if (route === 'messages') {           // ⭐ 新增
    renderMessages();
    history.pushState({ route: 'messages' }, '', '#messages');
  } else if (route === 'settings') {
    renderSettings();
    history.pushState({ route: 'settings' }, '', '#settings');
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
  const masteryMap = masteryLoad();

  // ⭐ 一次遍历 history，建 problemText → moduleId 的 map
  //    同时累计 stats
  const textToModule = {};
  const stats = {};

  history.forEach(r => {
    const text = (r.problemText || '').trim();
    const mid = r.moduleId || r.problemSource || 'other';

    // 建 map：用最新的记录覆盖（history 是 unshift 存的，最新的在前面，
    // 所以后面的会覆盖前面的，但我们只要一个映射，覆盖不覆盖无所谓）
    if (text) textToModule[text] = mid;

    if (!stats[mid]) stats[mid] = { total: 0, correct: 0, practiced: 0, lastAt: 0, mastered: 0 };
    stats[mid].total++;
    if (r.isCorrect) stats[mid].correct++;
    stats[mid].practiced++;
    if (r.timestamp > stats[mid].lastAt) stats[mid].lastAt = r.timestamp;
  });

  // ⭐ activity 合并
  Object.keys(activity).forEach(mid => {
    if (!stats[mid]) stats[mid] = { total: 0, correct: 0, practiced: 0, lastAt: 0, mastered: 0 };
    stats[mid].practiced += activity[mid].count;
    if (activity[mid].lastAt > stats[mid].lastAt) stats[mid].lastAt = activity[mid].lastAt;
  });

  // ⭐ mastery 统计：O(n)，直接查 textToModule，不再 find
  Object.values(masteryMap).forEach(rec => {
    if (rec.state !== 'mastered') return;
    const mid = textToModule[rec.text];
    if (!mid) return;
    if (!stats[mid]) stats[mid] = { total: 0, correct: 0, practiced: 0, lastAt: 0, mastered: 0 };
    stats[mid].mastered = (stats[mid].mastered || 0) + 1;
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
      <button class="home-messages-entry" data-goto="messages">
        💬 留言板
      </button>

      <button class="home-settings-entry" data-goto="settings">
        ⚙️ 设置
      </button>
    </div>
  `;



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
    action: () => {
      const currentLevel = localStorage.getItem('grade3_m1_level') || 'no-paren';
      navigate('lesson', { lessonId: 'm1' });
      // mountLesson 会根据当前层级出题
    }
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

  // ⭐ 路径点对应"难度层级"，而不是"做题数量"
  const LEVELS = {
    m1: [
      {
        id: 'no-paren',
        name: '无括号',
        icon: '1️⃣',
        desc: '先算乘除，后算加减',
        unlockAt: 0,           // 0 = 一开始就解锁
        test: (r) => !/[()（）]/.test(r.problemText),
        generate: () => window.__M1_PRESETS.filter(p => !/[()（）]/.test(p.expr)),
      },
      {
        id: 'with-paren',
        name: '有括号',
        icon: '2️⃣',
        desc: '先算括号里的',
        unlockAt: 1,           // 完成 1 个"无括号"才解锁
        test: (r) => /[()（）]/.test(r.problemText),
        generate: () => window.__M1_PRESETS.filter(p => /[()（）]/.test(p.expr)),
      },
      {
        id: 'mul-div',
        name: '乘除混合',
        icon: '3️⃣',
        desc: '乘除和加减一起出现',
        unlockAt: 1,
        test: (r) => /[×÷]/.test(r.problemText) && /[+\-]/.test(r.problemText),
        generate: () => window.__M1_PRESETS.filter(p => /[×÷]/.test(p.expr) && /[+\-]/.test(p.expr)),
      },
      {
        id: 'add-sub',
        name: '加减混合',
        icon: '4️⃣',
        desc: '只有加减，但有多步',
        unlockAt: 2,
        test: (r) => /[+\-]/.test(r.problemText) && !/[×÷()（）]/.test(r.problemText),
        generate: () => window.__M1_PRESETS.filter(p => /[+\-]/.test(p.expr) && !/[×÷()（）]/.test(p.expr)),
      },
    ],
    m9: [
      { id: 'add', name: '加法', icon: '➕', unlockAt: 0, test: (r) => r.problemText.includes('+') },
      { id: 'sub', name: '减法', icon: '➖', unlockAt: 1, test: (r) => r.problemText.includes('−') },
      { id: 'mul', name: '乘法', icon: '✖️', unlockAt: 1, test: (r) => r.problemText.includes('×') },
      { id: 'div', name: '除法', icon: '➗', unlockAt: 2, test: (r) => r.problemText.includes('÷') },
    ],
    m13: [
      { id: 'step-1', name: '一步', icon: '1️⃣', unlockAt: 0, test: (r) => (r.studentSteps?.length || 0) === 1 },
      { id: 'step-2', name: '两步', icon: '2️⃣', unlockAt: 1, test: (r) => (r.studentSteps?.length || 0) === 2 },
      { id: 'step-3', name: '三步', icon: '3️⃣', unlockAt: 2, test: (r) => (r.studentSteps?.length || 0) === 3 },
      { id: 'step-4', name: '四步', icon: '4️⃣', unlockAt: 3, test: (r) => (r.studentSteps?.length || 0) >= 4 },
    ],
  };

  // ⭐ 1. 前置声明并给 null 值，防止任何作用域污染
  let levels = null;
  const currentLevels = LEVELS[lessonId];
  if (currentLevels && Array.isArray(currentLevels) && currentLevels.length > 0) {
    levels = currentLevels;
  }

  // ⭐ 3. 前置清空 DOM（防止没配置的模块残留上一页的 HTML）
  const levelSelectorWrap = document.getElementById('lessonLevels');
  if (levelSelectorWrap) {
    levelSelectorWrap.innerHTML = '';
    levelSelectorWrap.classList.add('is-hidden'); // 默认先隐藏
  }

  let pathHtml;

  // ⭐ 根据当前层级出题
  if (levels) {
    const currentLevelId = localStorage.getItem(`grade3_${lessonId}_level`) || levels[0].id;
    const currentLevel = levels.find(lv => lv.id === currentLevelId);

    // ⭐ M1：需要 generate 换题目池（M1 有 generate）
    if (lessonId === 'm1' && currentLevel && currentLevel.generate) {
      const presets = currentLevel.generate();
      if (presets.length > 0 && window.__m1LoadPresets) {
        window.__m1LoadPresets(presets);
      }
    }

    // ⭐ M9：只需要 level id（不依赖 generate）
    if (lessonId === 'm9' && window.__m9SetLevel) {
      window.__m9SetLevel(currentLevelId);
      setTimeout(() => document.getElementById('m9random')?.click(), 30);
    }

    // ⭐ M13：只需要 level id（不依赖 generate）
    if (lessonId === 'm13' && window.__m13SetLevel) {
      window.__m13SetLevel(currentLevelId);
    }
  }

  if (levels) {
    // 计算每个层级是否"已完成"
    const levelDone = levels.map(lv => 
      moduleRecords.some(r => lv.test(r) && r.isCorrect)
    );
    const litDots = levelDone.filter(Boolean).length;
    pathHtml = levels.map((lv, i) => {
      let cls = '';
      if (i < litDots - 1) cls = 'done';
      else if (i === litDots - 1) cls = 'current';
      return `<span class="path-dot ${cls}" title="${lv.name}"></span>`;
    }).join('');
  } else {
    // 兜底：原有规则
    const totalDots = 4;
    const litDots = Math.min(totalDots, Math.ceil(totalCount / 2));
    pathHtml = Array.from({ length: totalDots }).map((_, i) => {
      let cls = '';
      if (i < litDots - 1) cls = 'done';
      else if (i === litDots - 1) cls = 'current';
      return `<span class="path-dot ${cls}"></span>`;
    }).join('');
  }

  document.getElementById('lessonHeader').innerHTML = `
    <button class="lesson-back" id="lessonBack" aria-label="返回首页">←</button>
    <div class="lesson-title">${meta.icon} ${meta.title}</div>
    <div class="lesson-path">${pathHtml}</div>
    <button class="lesson-more" id="lessonMore" aria-label="更多">⋯</button>
  `;

  // 顶部进度条（新增）
  const progressBar = document.getElementById('lessonProgress');
  if (progressBar && levels) {
    const levelDone = levels.map(lv =>
      moduleRecords.some(r => lv.test(r) && r.isCorrect)
    );
    const litDots = levelDone.filter(Boolean).length;
    const currentLevel = levels[litDots - 1] || levels[0];
    const pct = Math.round(litDots / levels.length * 100);
    const rate = totalCount ? Math.round(correctCount / totalCount * 100) : 0;

    progressBar.innerHTML = `
      <span>已练 <b>${totalCount}</b> 题 · 正确率 <b>${rate}%</b></span>
      <span class="lesson-progress-level">当前层级：<b>${currentLevel.name}</b></span>
      <div class="lesson-progress-bar"><span style="width:${pct}%"></span></div>
    `;
  } else {
      // ⭐ 没有层级的模块，彻底隐藏这个进度条
      progressBar.style.display = 'none'; 
      progressBar.innerHTML = '';
  }

  // ⭐ 层级选择器
  if (levelSelectorWrap && levels) {  
    levelSelectorWrap.classList.remove('is-hidden');  
    const currentLevelId = localStorage.getItem(`grade3_${lessonId}_level`) || levels[0].id;
    
    // 计算每层是否已完成
    const levelDone = levels.map(lv => 
      moduleRecords.some(r => lv.test(r) && r.isCorrect)
    );
    
    // 计算每层是否解锁
    const levelUnlocked = levels.map((lv, i) => {
      if (i === 0) return true;
      const prevDone = levelDone.slice(0, i).filter(Boolean).length;
      return prevDone >= lv.unlockAt;
    });

    levelSelectorWrap.innerHTML = levels.map((lv, i) => {
      const done = levelDone[i];
      const unlocked = levelUnlocked[i];
      const isCurrent = lv.id === currentLevelId;
      return `
        <button class="level-btn ${done ? 'done' : ''} ${isCurrent ? 'current' : ''} ${!unlocked ? 'locked' : ''}"
                data-level-id="${lv.id}"
                data-level-index="${i}"
                ${!unlocked ? 'disabled' : ''}>
          <span class="level-btn-icon">${done ? '✅' : unlocked ? lv.icon : '🔒'}</span>
          <span class="level-btn-name">${lv.name}</span>
        </button>
      `;
    }).join('');

    // 绑定点击
    levelSelectorWrap.querySelectorAll('.level-btn:not(.locked)').forEach(btn => {
      btn.addEventListener('click', () => {
        const levelId = btn.dataset.levelId;
        localStorage.setItem(`grade3_${lessonId}_level`, levelId);
        mountLesson(lessonId);

        // ⭐ 切层级后，M1 立刻随机出一题（更有"新关卡"的感觉）
        if (lessonId === 'm1') {
          setTimeout(() => document.getElementById('m1Random')?.click(), 50);
        }
        // M9 同理
        if (lessonId === 'm9') {
          setTimeout(() => document.getElementById('m9random')?.click(), 50);
        }
      });
    });

    // ⭐ 判断是否需要显示"右侧还有"箭头
    const updateScrollHint = () => {
      const canScroll = levelSelectorWrap.scrollWidth > levelSelectorWrap.clientWidth + 4;
      const atEnd = levelSelectorWrap.scrollLeft + levelSelectorWrap.clientWidth >= levelSelectorWrap.scrollWidth - 4;
      levelSelectorWrap.classList.toggle('all-visible', !canScroll || atEnd);
    };
    // 首次挂载时更新（等 DOM 布局完成）
    requestAnimationFrame(updateScrollHint);
    // 滚动时更新
    levelSelectorWrap.addEventListener('scroll', updateScrollHint, { passive: true });
    // 窗口大小变化时更新
    window.addEventListener('resize', updateScrollHint);
    // 内容变化时更新
    new MutationObserver(updateScrollHint).observe(levelSelectorWrap, { childList: true, subtree: true });
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
  if (window.visualViewport) {
    const adjustThumbBar = () => {
      const bar = document.getElementById('thumbBar');
      if (!bar) return;
      const vv = window.visualViewport;
      const keyboardHeight = window.innerHeight - vv.height;
      bar.style.bottom = keyboardHeight > 0 ? `${keyboardHeight}px` : '0';
    };
    window.visualViewport.addEventListener('resize', adjustThumbBar);
    window.visualViewport.addEventListener('scroll', adjustThumbBar);
  }

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
    renderMessages, renderSettings,
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

/* ============================================================
   8. Messages 页：留言板
   ============================================================ */

let _msgIdentity = '家长';  // 当前身份：'家长' | '孩子'

function renderMessages() {
  const stage = document.getElementById('messagesStage');
  if (!stage) return;

  // 顶部 header
  const hd = document.getElementById('messagesHeader');
  hd.innerHTML = `
    <button class="lesson-back" id="messagesBack">←</button>
    <div class="lesson-title">💬 留言板</div>
    <div style="width:36px"></div>
  `;
  document.getElementById('messagesBack').addEventListener('click', () => navigate('home'));

  const groups = msgGroupByTime();

  const composeHtml = `
    <div class="msg-compose">
      <div class="msg-identity">
        <span class="msg-identity-label">我是：</span>
        <button class="msg-identity-btn ${_msgIdentity === '家长' ? 'active' : ''}" data-identity="家长">👨‍👩‍👦 家长</button>
        <button class="msg-identity-btn ${_msgIdentity === '孩子' ? 'active' : ''}" data-identity="孩子">👦 孩子</button>
      </div>
      <textarea id="msgInput" placeholder="写一句…" maxlength="120"></textarea>
      <div class="msg-compose-actions">
        <button class="msg-attach-btn" id="msgAttachBtn">📎 关联题目</button>
        <button class="msg-send-btn" id="msgSendBtn">发送</button>
      </div>
      <div id="msgAttachPreview" class="msg-attach-preview" style="display:none;"></div>
    </div>
  `;

  const renderGroup = (title, list) => {
    if (!list.length) return '';
    return `
      <div class="msg-group">
        <div class="msg-group-hd">${title}</div>
        ${list.map(m => renderMessageItem(m)).join('')}
      </div>
    `;
  };

  const listHtml = [
    renderGroup('今天', groups.today),
    renderGroup('本周', groups.week),
    renderGroup('本月', groups.month),
    renderGroup('更早', groups.earlier),
  ].join('') || '<div class="msg-empty">还没有留言，写第一句吧 💬</div>';

  stage.innerHTML = `
    <div class="messages-wrap">
      ${composeHtml}
      ${listHtml}
    </div>
  `;

  // 身份切换
  stage.querySelectorAll('.msg-identity-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _msgIdentity = btn.dataset.identity;
      renderMessages();
    });
  });

  // 关联题目
  let _pendingAttach = null;
  document.getElementById('msgAttachBtn')?.addEventListener('click', () => {
    showAttachProblemModal((problem) => {
      _pendingAttach = problem;
      const preview = document.getElementById('msgAttachPreview');
      preview.style.display = 'block';
      preview.innerHTML = `
        <span>📎 关联：${escapeHtmlStrict(problem.text)}</span>
        <button id="msgAttachRemove" style="margin-left:8px;border:none;background:transparent;color:#ef4444;cursor:pointer;font-weight:700;">✕</button>
      `;
      document.getElementById('msgAttachRemove')?.addEventListener('click', () => {
        _pendingAttach = null;
        preview.style.display = 'none';
        preview.innerHTML = '';
      });
    });
  });

  // 发送
  document.getElementById('msgSendBtn')?.addEventListener('click', () => {
    const input = document.getElementById('msgInput');
    const text = input.value.trim();
    if (!text) { showToast('写一句再发吧', 'info'); return; }
    msgAdd({ text, from: _msgIdentity, linkedProblem: _pendingAttach });
    input.value = '';
    _pendingAttach = null;
    renderMessages();
    showToast('✅ 已留言', 'success');
  });

  // 回复按钮
  stage.querySelectorAll('.msg-reply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.msgId;
      const text = prompt('回一句…');
      if (text && text.trim()) {
        msgReply(id, text);
        renderMessages();
        showToast('✅ 已回复', 'success');
      }
    });
  });

  // 标记已读
  msgMarkAllRead();
}

function renderMessageItem(m) {
  const time = new Date(m.at);
  const timeStr = `${time.getMonth() + 1}/${time.getDate()} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
  const isParent = m.from === '家长';

  return `
    <div class="msg-item ${isParent ? 'from-parent' : 'from-child'}">
      <div class="msg-hd">
        <span class="msg-avatar">${isParent ? '👨‍👩‍👦' : '👦'}</span>
        <span class="msg-from">${m.from}</span>
        <span class="msg-time">${timeStr}</span>
      </div>
      <div class="msg-text">${escapeHtmlStrict(m.text)}</div>
      ${m.linkedProblem ? `
        <div class="msg-linked">
          <span>📎</span>
          <span>${escapeHtmlStrict(m.linkedProblem.text)}</span>
          ${m.linkedProblem.answer ? `<span class="msg-linked-answer">答案 ${escapeHtmlStrict(m.linkedProblem.answer)}</span>` : ''}
        </div>
      ` : ''}
      ${m.reply ? `
        <div class="msg-reply">
          <div class="msg-reply-hd">${isParent ? '👦 孩子回复' : '👨‍👩‍👦 家长回复'} · ${new Date(m.repliedAt).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'})}</div>
          <div class="msg-reply-text">${escapeHtmlStrict(m.reply)}</div>
        </div>
      ` : `
        <button class="msg-reply-btn" data-msg-id="${m.id}">💬 回一句</button>
      `}
    </div>
  `;
}

/* ⭐ 关联题目选择弹窗 */
function showAttachProblemModal(onSelect) {
  if (document.querySelector('.msg-attach-mask')) return;

  // 最近掌握的 5 条
  const masteryMap = masteryLoad();
  const mastered = Object.values(masteryMap)
    .filter(r => r.state === 'mastered')
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, 5);

  // 最近做错的 5 条
  const wrong = wbLoad().slice(0, 5);

  const mask = document.createElement('div');
  mask.className = 'msg-attach-mask';
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:10020;padding:20px;';
  mask.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:20px;width:400px;max-width:92vw;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(15,23,42,.3);">
      <div style="font-size:16px;font-weight:800;color:#1e293b;margin-bottom:14px;">📎 关联一道题</div>

      ${mastered.length ? `
        <div style="font-size:12.5px;font-weight:800;color:#15803d;margin-bottom:8px;">🏆 最近掌握的</div>
        ${mastered.map(r => `
          <button class="msg-attach-item" data-text="${escapeHtmlStrict(r.text)}" data-module=""
                  style="width:100%;text-align:left;padding:10px 12px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;margin-bottom:6px;font-size:13px;color:#15803d;cursor:pointer;font-family:inherit;">
            ${escapeHtmlStrict(r.text.slice(0, 40))}${r.text.length > 40 ? '…' : ''}
          </button>
        `).join('')}
      ` : ''}

      ${wrong.length ? `
        <div style="font-size:12.5px;font-weight:800;color:#b45309;margin-top:14px;margin-bottom:8px;">❌ 最近做错的</div>
        ${wrong.map(r => `
          <button class="msg-attach-item" data-text="${escapeHtmlStrict(r.text)}" data-module="${escapeHtmlStrict(r.moduleId || '')}" data-answer="${escapeHtmlStrict(r.correctAnswer || '')}"
                  style="width:100%;text-align:left;padding:10px 12px;background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px;margin-bottom:6px;font-size:13px;color:#b45309;cursor:pointer;font-family:inherit;">
            ${escapeHtmlStrict(r.text.slice(0, 40))}${r.text.length > 40 ? '…' : ''}
          </button>
        `).join('')}
      ` : ''}

      ${!mastered.length && !wrong.length ? `
        <div style="text-align:center;padding:30px 20px;color:#94a3b8;font-size:13px;">还没有题，做几道再来关联吧</div>
      ` : ''}

      <button id="msgAttachCancel" style="width:100%;margin-top:12px;padding:10px;border-radius:10px;background:#f1f5f9;color:#475569;border:none;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;">取消</button>
    </div>
  `;
  document.body.appendChild(mask);

  mask.querySelectorAll('.msg-attach-item').forEach(btn => {
    btn.addEventListener('click', () => {
      onSelect({
        text: btn.dataset.text,
        answer: btn.dataset.answer || '',
        moduleId: btn.dataset.module || '',
      });
      mask.remove();
    });
  });

  document.getElementById('msgAttachCancel').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
}

/* ============================================================
   9. Settings 页：设置
   ============================================================ */
function renderSettings() {
  const stage = document.getElementById('settingsStage');
  if (!stage) return;

  // 顶部 header
  const hd = document.getElementById('settingsHeader');
  hd.innerHTML = `
    <button class="lesson-back" id="settingsBack">←</button>
    <div class="lesson-title">⚙️ 设置</div>
    <div style="width:36px"></div>
  `;
  document.getElementById('settingsBack').addEventListener('click', () => navigate('home'));

  const targets = targetLoad();
  const storageHealth = getStorageHealth();
  const syncState = getSyncState();
  const soundOn = lsGet('grade3_sound_on') === '1';
  const errorLog = getErrorLog();
  const recentErrors = errorLog.filter(e => Date.now() - e.at < 7 * 86400000);

  const currentUser = (() => {
    try {
      if (typeof getCurrentUser === 'function') return getCurrentUser();
      if (typeof cloudbase !== 'undefined') {
        const s = cloudbase.auth().getLoginState();
        return s && s.user ? s.user : null;
      }
    } catch (e) {}
    return null;
  })();
  const isLoggedIn = !!currentUser;
  const accountName = currentUser?.nickName || currentUser?.uid || currentUser?.customUserId || '';

  stage.innerHTML = `
    <div class="settings-wrap">

      <!-- 1. 学习目标 -->
      <div class="settings-section">
        <div class="settings-section-hd">
          <span class="settings-section-icon">🎯</span>
          <span class="settings-section-title">学习目标</span>
          <span class="settings-section-desc">家长可以调整</span>
        </div>
        <div class="settings-section-body">
          ${[
            { key: 'dailyQuestions', label: '每天做题', min: 1, max: 20, unit: '道' },
            { key: 'dailyStreak', label: '每天连对', min: 1, max: 10, unit: '题' },
            { key: 'dailyMastered', label: '每天掌握', min: 1, max: 5, unit: '题' },
            { key: 'weeklyQuestions', label: '每周做题', min: 5, max: 100, unit: '道' },
            { key: 'wrongReview', label: '每天复习错题', min: 0, max: 10, unit: '道' },
          ].map(t => `
            <div class="settings-row">
              <span class="settings-label">${t.label}</span>
              <input type="number" data-target-key="${t.key}" value="${targets[t.key]}" min="${t.min}" max="${t.max}" class="settings-input">
              <span class="settings-unit">${t.unit}</span>
            </div>
          `).join('')}
          <div class="settings-row-actions">
            <button id="settingsResetTargets" class="settings-btn-secondary">恢复默认</button>
            <button id="settingsSaveTargets" class="settings-btn-primary">保存</button>
          </div>
        </div>
      </div>

      <!-- 2. 数据与同步 -->
      <div class="settings-section">
        <div class="settings-section-hd">
          <span class="settings-section-icon">☁️</span>
          <span class="settings-section-title">数据与同步</span>
        </div>
        <div class="settings-section-body">
          <div class="settings-row">
            <span class="settings-label">账号</span>
            <span class="settings-status ${isLoggedIn ? 'ok' : 'err'}">
              ${isLoggedIn
                ? `✅ 已登录${accountName ? '：' + escapeHtmlStrict(accountName.slice(0, 12)) : ''}`
                : '⚠️ 未登录'}
            </span>
            <button id="settingsSyncBtn" class="settings-btn-secondary">管理账号</button>
          </div>
          <div class="settings-row">
            <span class="settings-label">云同步状态</span>
            <span class="settings-status ${syncState === 'idle' ? 'ok' : ''}" id="syncStatusText">
              ${syncState === 'idle' ? '✅ 已同步' : syncState === 'syncing' ? '⏳ 同步中' : '⚠️ 未同步'}
            </span>
          </div>
          <div class="settings-row">
            <span class="settings-label">本地存储状态</span>
            <span class="settings-status ${storageHealth.ok ? 'ok' : 'err'}">
              ${storageHealth.ok ? '✅ 正常' : `⚠️ 失败 ${storageHealth.failCount} 次`}
            </span>
          </div>
          ${recentErrors.length ? `
            <div class="settings-row">
              <span class="settings-label">最近错误</span>
              <span class="settings-status err">${recentErrors.length} 个</span>
              <button id="settingsErrorLog" class="settings-btn-secondary">查看</button>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- 3. 体验 -->
      <div class="settings-section">
        <div class="settings-section-hd">
          <span class="settings-section-icon">🔊</span>
          <span class="settings-section-title">体验</span>
        </div>
        <div class="settings-section-body">
          <div class="settings-row">
            <span class="settings-label">音效</span>
            <button id="settingsSoundToggle" class="settings-toggle ${soundOn ? 'on' : ''}">
              ${soundOn ? '🔊 已开启' : '🔇 已关闭'}
            </button>
          </div>
        </div>
      </div>

      <!-- 4. 关于 -->
      <div class="settings-section">
        <div class="settings-section-hd">
          <span class="settings-section-icon">ℹ️</span>
          <span class="settings-section-title">关于</span>
        </div>
        <div class="settings-section-body">
          <div class="settings-row">
            <span class="settings-label">版本</span>
            <span class="settings-value">v1.0.0</span>
          </div>
        </div>
      </div>

    </div>
  `;

  // 保存目标
  document.getElementById('settingsSaveTargets')?.addEventListener('click', () => {
    const newTargets = { ...targets };
    stage.querySelectorAll('[data-target-key]').forEach(inp => {
      newTargets[inp.dataset.targetKey] = parseInt(inp.value, 10) || 1;
    });
    targetSave(newTargets);
    if (window.__shell?.refreshHomeTasks) window.__shell.refreshHomeTasks();
    window.showToast?.('✅ 目标已保存', 'success');
  });

  // 恢复默认
  document.getElementById('settingsResetTargets')?.addEventListener('click', () => {
    targetReset();
    renderSettings();
    if (window.__shell?.refreshHomeTasks) window.__shell.refreshHomeTasks();
    window.showToast?.('✅ 已恢复默认', 'success');
  });

  // 管理账号
  document.getElementById('settingsSyncBtn')?.addEventListener('click', async () => {
    openSyncSetupModal();
  });

  /* 手动同步
  document.getElementById('handleSyncBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('handleSyncBtn');
    const txt = document.getElementById('syncStatusText');
    btn.disabled = true;
    btn.textContent = '同步中…';
    if (txt) txt.textContent = '⏳ 同步中';
    try {
      await forceSync();
      if (txt) txt.textContent = '✅ 已同步';
      window.showToast?.('✅ 同步完成', 'success');
    } catch (e) {
      if (txt) txt.textContent = '⚠️ 同步失败';
      window.showToast?.('同步失败：' + e.message, 'info');
    } finally {
      btn.disabled = false;
      btn.textContent = '手动同步';
    }
  });
  */
  

  // 音效开关
  document.getElementById('settingsSoundToggle')?.addEventListener('click', () => {
    const newVal = !(lsGet('grade3_sound_on') === '1');
    lsSet('grade3_sound_on', newVal ? '1' : '0');
    renderSettings();
    window.showToast?.(newVal ? '🔊 音效已开启' : '🔇 音效已关闭', 'success');
  });

  // 错误日志
  document.getElementById('settingsErrorLog')?.addEventListener('click', () => {
    const log = getErrorLog().slice(-10);
    alert(log.map(e => `[${new Date(e.at).toLocaleTimeString('zh-CN')}] ${e.scope}: ${e.message}`).join('\n'));
  });
}