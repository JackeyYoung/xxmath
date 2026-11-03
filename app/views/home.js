/* app/views/home.js —— 学习地图（Vue 组件）

   改造要点：
   1) 数据计算与视图分离：getIslandStats / getWeekProgress / getTodayTasks 仍是纯函数（已导出，可单测）
   2) 视图交给 Vue：一个 shallowReactive store + 一个 template，不再拼 innerHTML
   3) 导航仍走 data-goto 事件委托（在 shell.js 的 initShell 里），所以模板里不需要绑定导航
   4) 修 S9 遗留：island 统计里 mastery 与 history 的关联改用 problemId（原来靠原文相等，空白差异会漏）
*/
import { createApp, defineComponent, shallowReactive } from '../../js/vendor/vue.esm-browser.prod.js';
import { activityLoad, activityStatsByModule } from '../../core/activity.js';
import { historyLoad } from '../../core/history.js';
import { masteryLoad } from '../../core/mastery.js';
import { problemIdOf, sameProblem } from '../../core/problem-id.js';
import { targetLoad } from '../../core/target.js';
import { wbLoad } from '../../core/wrongbook.js';
import { getGradeConfig } from '../grade-config.js';
import { navigate } from '../router.js';

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const WEEK_GOAL = 25;   // 一周 25 题

/* ---------------- 纯计算（可单测，不碰 DOM） ---------------- */

/** 每个知识岛的练习/正确/掌握统计 */
export function getIslandStats() {
  const history = historyLoad();
  const activity = activityStatsByModule();
  const masteryMap = masteryLoad();

  const pidToModule = {};
  const stats = {};
  const ensure = (mid) => {
    if (!stats[mid]) stats[mid] = { total: 0, correct: 0, practiced: 0, lastAt: 0, mastered: 0 };
    return stats[mid];
  };

  history.forEach((r) => {
    const mid = r.moduleId || r.problemSource || 'other';
    const pid = problemIdOf(r);
    if (pid) pidToModule[pid] = mid;
    const s = ensure(mid);
    s.total++;
    if (r.isCorrect) s.correct++;
    s.practiced++;
    if (r.timestamp > s.lastAt) s.lastAt = r.timestamp;
  });

  Object.keys(activity).forEach((mid) => {
    const s = ensure(mid);
    s.practiced += activity[mid].count;
    if (activity[mid].lastAt > s.lastAt) s.lastAt = activity[mid].lastAt;
  });

  // ⭐ S9：用 problemId 关联到模块（原来用 rec.text 直接查 map，空白差异会漏算）
  Object.values(masteryMap).forEach((rec) => {
    if (!rec || rec.state !== 'mastered') return;
    const pid = rec.problemId || problemIdOf(rec);
    const mid = pid ? pidToModule[pid] : null;
    if (!mid) return;
    ensure(mid).mastered++;
  });

  return stats;
}

/** 今天已经掌握的题 */
export function getTodayMastered(now = new Date()) {
  const start = new Date(now.getTime());
  start.setHours(0, 0, 0, 0);
  return Object.values(masteryLoad()).filter((r) => r && r.state === 'mastered' && r.lastAt >= start.getTime());
}

/** 本周进度（周一为一周起点） */
export function getWeekProgress(now = new Date()) {
  const dow = now.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now.getTime());
  monday.setDate(now.getDate() + offset);
  monday.setHours(0, 0, 0, 0);

  const weekStart = monday.getTime();
  const weekRecords = historyLoad().filter((r) => r.timestamp >= weekStart);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getTime());
    d.setDate(monday.getDate() + i);
    days.push({ date: d, count: 0, isToday: d.toDateString() === now.toDateString() });
  }
  const byDay = {};
  days.forEach((d) => { byDay[d.date.toDateString()] = d; });
  weekRecords.forEach((r) => {
    const d = byDay[new Date(r.timestamp).toDateString()];
    if (d) d.count++;
  });

  return {
    days,
    labels: WEEK_LABELS,
    total: weekRecords.length,
    goal: WEEK_GOAL,
    activeDays: days.filter((d) => d.count > 0).length,
    pct: Math.min(100, Math.round((weekRecords.length / WEEK_GOAL) * 100)),
  };
}

/** 今日任务（action 只在用户点击时执行） */
export function getTodayTasks(now = new Date()) {
  const targets = targetLoad();
  const start = new Date(now.getTime());
  start.setHours(0, 0, 0, 0);
  const todayRecords = historyLoad().filter((r) => r.timestamp >= start.getTime());
  const todayCount = todayRecords.length;

  const goalQ = targets.dailyQuestions;
  const goalStreak = targets.dailyStreak;
  const goalWrong = targets.wrongReview;
  const goalMastered = targets.dailyMastered;

  const tasks = [];
  tasks.push({
    id: 'daily-5',
    icon: '🎯',
    title: '今天做 ' + goalQ + ' 道题',
    desc: '已完成 ' + todayCount + ' / ' + goalQ,
    done: todayCount >= goalQ,
    progress: Math.min(100, Math.round((todayCount / goalQ) * 100)),
    action: () => navigate('lesson', { lessonId: 'm1' }),
  });

  const wrong = wbLoad();
  if (wrong.length > 0) {
    const reviewed = todayRecords.filter((r) => wrong.some((w) => sameProblem(w.text, r.problemText))).length;
    tasks.push({
      id: 'review-wrong',
      icon: '📕',
      title: '复习 ' + goalWrong + ' 道错题',
      desc: '错题本还有 ' + wrong.length + ' 道',
      done: reviewed >= goalWrong,
      progress: goalWrong > 0 ? Math.min(100, Math.round((reviewed / goalWrong) * 100)) : 100,
      action: () => document.getElementById('wrongBookBtn')?.click(),
    });
  }

  let streak = 0;
  for (const r of todayRecords) { if (r.isCorrect) streak++; else break; }
  tasks.push({
    id: 'streak-3',
    icon: '🔥',
    title: '连对 ' + goalStreak + ' 题',
    desc: streak >= goalStreak ? '已达成' : '当前连对 ' + streak + ' 题',
    done: streak >= goalStreak,
    progress: Math.min(100, Math.round((streak / goalStreak) * 100)),
    action: () => navigate('lesson', { lessonId: 'm1' }),
  });

  const todayMastered = Object.values(masteryLoad()).filter((r) => r && r.state === 'mastered' && r.lastAt >= start.getTime());
  tasks.push({
    id: 'master-1',
    icon: '🏆',
    title: '掌握 ' + goalMastered + ' 道题',
    desc: todayMastered.length >= goalMastered ? '已掌握 ' + todayMastered.length + ' 题' : '同一道题连续做对 2 次',
    done: todayMastered.length >= goalMastered,
    progress: Math.min(100, Math.round((todayMastered.length / goalMastered) * 100)),
    action: () => navigate('lesson', { lessonId: 'm1' }),
  });

  return tasks;
}

/** 首页模型（把上面几个纯函数的结果组装成视图需要的形状） */
export function buildHomeModel(now = new Date()) {
  const cfg = getGradeConfig();
  const stats = getIslandStats();

  // 最近一次活动：history 与 activity 合并取最新
  const recent = [
    ...historyLoad().map((r) => ({ moduleId: r.moduleId || r.problemSource, at: r.timestamp, text: r.problemText, kind: 'practice' })),
    ...activityLoad().map((a) => ({ moduleId: a.moduleId, at: a.at, text: a.label, kind: 'activity' })),
  ].sort((a, b) => b.at - a.at);
  const last = recent[0];

  let lastIslandId = null;
  if (last) {
    if (last.moduleId && cfg.islands.some((i) => i.id === last.moduleId)) lastIslandId = last.moduleId;
    else if (last.moduleId && /^m\d+$/.test(last.moduleId)) lastIslandId = last.moduleId;
    else if (last.kind === 'practice') lastIslandId = 'm13';
  }
  const lastIsland = cfg.islands.find((i) => i.id === lastIslandId);

  const hero = last
    ? {
        lessonId: lastIslandId || 'm1',
        kicker: '继续上次',
        title: lastIsland ? lastIsland.icon + ' ' + lastIsland.name : '混合运算',
        meta: last.kind === 'activity' ? '上次玩了「' + last.text + '」' : '上次做到「' + String(last.text || '').slice(0, 16) + '…」',
        cta: '▶ 继续',
      }
    : {
        lessonId: 'm1',
        kicker: '开始今天的第一题',
        title: '🎯 混合运算',
        meta: '先算乘除，后算加减',
        cta: '▶ 开始',
      };

  const targets = targetLoad();
  const custom = targets.dailyQuestions !== 5 || targets.dailyStreak !== 3;
  const parentTarget = custom
    ? { q: targets.dailyQuestions, s: targets.dailyStreak, m: targets.dailyMastered }
    : null;

  const islands = cfg.islands.map((isl) => {
    const s = stats[isl.id] || { total: 0, correct: 0, practiced: 0, mastered: 0 };
    const rate = s.total ? Math.round((s.correct / s.total) * 100) : 0;
    const metaText = s.total > 0
      ? '已练 ' + s.total + ' 题 · ' + rate + '%' + (s.mastered ? ' · 掌握 ' + s.mastered : '')
      : s.practiced > 0
        ? '玩过 ' + s.practiced + ' 次'
        : '还没开始';
    const progress = s.total > 0 ? Math.min(100, s.total * 8) : Math.min(100, s.practiced * 10);
    return { id: isl.id, icon: isl.icon, name: isl.name, desc: isl.desc, color: isl.color, metaText, progress };
  });

  const mastered = getTodayMastered(now).map((r) => ({
    text: r.text || '',
    short: String(r.text || '').slice(0, 30) + (String(r.text || '').length > 30 ? '…' : ''),
  }));

  const tasks = getTodayTasks(now);

  return {
    hero,
    parentTarget,
    tasks,
    doneCount: tasks.filter((t) => t.done).length,
    week: getWeekProgress(now),
    mastered,
    islands,
    wrongCount: wbLoad().length,
  };
}

/* ---------------- 视图（Vue） ---------------- */

const store = shallowReactive({
  hero: { lessonId: 'm1', kicker: '', title: '', meta: '', cta: '' },
  parentTarget: null,
  tasks: [],
  doneCount: 0,
  week: { days: [], labels: WEEK_LABELS, total: 0, goal: WEEK_GOAL, activeDays: 0, pct: 0 },
  mastered: [],
  islands: [],
  wrongCount: 0,
});

function runTask(t) {
  if (t && typeof t.action === 'function') {
    try { t.action(); } catch (e) { console.warn('[home] 任务执行失败', e); }
  }
}

function openWrongbook() {
  document.getElementById('wrongBookBtn')?.click();
}

const HomeView = defineComponent({
  name: 'HomeView',
  setup() {
    return { s: store, runTask, openWrongbook };
  },
  template: `
<div class="home-wrap">
  <button class="home-hero" data-goto="lesson" :data-lesson="s.hero.lessonId">
    <div class="home-hero-kicker">{{ s.hero.kicker }}</div>
    <div class="home-hero-title">{{ s.hero.title }}</div>
    <div class="home-hero-meta">{{ s.hero.meta }}</div>
    <div class="home-hero-cta">{{ s.hero.cta }}</div>
  </button>

  <div v-if="s.parentTarget" class="home-parent-target">
    <span class="home-parent-target-icon">👨‍👩</span>
    <span>家长给你定了目标：每天 <b>{{ s.parentTarget.q }}</b> 题 · 连对 <b>{{ s.parentTarget.s }}</b> 题 · 掌握 <b>{{ s.parentTarget.m }}</b> 题</span>
  </div>

  <div id="homeTasksWrap">
    <div class="home-tasks">
      <div class="home-tasks-hd">
        <span>📋 今日任务</span>
        <span class="home-tasks-count">{{ s.doneCount }} / {{ s.tasks.length }}</span>
      </div>
      <div class="home-tasks-list">
        <button v-for="t in s.tasks" :key="t.id" class="home-task" :class="{ done: t.done }" @click="runTask(t)">
          <div class="home-task-icon">{{ t.done ? '✅' : t.icon }}</div>
          <div class="home-task-body">
            <div class="home-task-title">{{ t.title }}</div>
            <div class="home-task-desc">{{ t.desc }}</div>
            <div class="home-task-progress"><span :style="{ width: t.progress + '%' }"></span></div>
          </div>
          <div class="home-task-arrow">{{ t.done ? '✓' : '→' }}</div>
        </button>
      </div>
    </div>
  </div>

  <div class="home-week">
    <div class="home-week-hd">
      <span>📅 本周进度</span>
      <span class="home-week-count"><b>{{ s.week.total }}</b> / {{ s.week.goal }} 题 · 学了 {{ s.week.activeDays }} 天</span>
      <button class="home-week-entry" data-goto="growth">查看周总结 →</button>
    </div>
    <div class="home-week-days">
      <div v-for="(d, i) in s.week.days" :key="i" class="home-week-day" :class="{ active: d.count > 0, today: d.isToday }">
        <div class="home-week-dot">{{ d.count > 0 ? d.count : '' }}</div>
        <div class="home-week-label">{{ s.week.labels[i] }}</div>
      </div>
    </div>
    <div class="home-week-bar"><span :style="{ width: s.week.pct + '%' }"></span></div>
  </div>

  <div v-if="s.mastered.length" class="home-mastered">
    <div class="home-mastered-hd">
      <span>🏆 今日已掌握</span>
      <span class="home-mastered-count">{{ s.mastered.length }} 题</span>
    </div>
    <div class="home-mastered-list">
      <div v-for="(m, i) in s.mastered.slice(0, 3)" :key="i" class="home-mastered-item">
        <span class="home-mastered-icon">✅</span>
        <span class="home-mastered-text">{{ m.short }}</span>
      </div>
      <div v-if="s.mastered.length > 3" class="home-mastered-more">还有 {{ s.mastered.length - 3 }} 题…</div>
    </div>
    <button class="home-mastered-entry" data-goto="growth">
      查看全部成就 →
    </button>
  </div>

  <div class="home-section-title">📚 知识岛</div>
  <div class="island-grid">
    <button v-for="isl in s.islands" :key="isl.id" class="island" :class="'island-' + isl.color" data-goto="lesson" :data-lesson="isl.id">
      <div class="island-icon">{{ isl.icon }}</div>
      <div class="island-name">{{ isl.name }}</div>
      <div class="island-desc">{{ isl.desc }}</div>
      <div class="island-progress"><span :style="{ width: isl.progress + '%', transition: 'width .6s cubic-bezier(.34,1.3,.64,1)' }"></span></div>
      <div class="island-meta">{{ isl.metaText }}</div>
    </button>
  </div>

  <div v-if="s.wrongCount" class="home-recommend">
    <div class="home-recommend-icon">🤖</div>
    <div class="home-recommend-body">
      错题本还有 <b>{{ s.wrongCount }}</b> 道题等着复习
    </div>
    <button class="home-recommend-cta" @click="openWrongbook">去复习</button>
  </div>

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
  `,
});

let _app = null;

/** 把 store 刷新为最新数据 */
function refreshStore() {
  const m = buildHomeModel();
  store.hero = m.hero;
  store.parentTarget = m.parentTarget;
  store.tasks = m.tasks;
  store.doneCount = m.doneCount;
  store.week = m.week;
  store.mastered = m.mastered;
  store.islands = m.islands;
  store.wrongCount = m.wrongCount;
}

export function renderHome() {
  const el = document.getElementById('page-home');
  if (!el) return;

  refreshStore();

  // 只挂载一次：之后都是 store 驱动重渲染（不再整页 innerHTML）
  if (!_app) {
    _app = createApp(HomeView);
    _app.mount(el);
  }
}

/** 只刷新今日任务（家长改目标后调用） */
export function refreshHomeTasks() {
  store.tasks = getTodayTasks();
  store.doneCount = store.tasks.filter((t) => t.done).length;
}
