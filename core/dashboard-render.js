/* core/dashboard-render.js */
import { historyLoad } from './history.js';
import { wbLoad } from './wrongbook.js';

let _currentRange = 'today';
let _lastVals = {};

// ⭐ 新增：允许外部设置当前范围
export function setRange(range) {
  if (['today', 'week', 'all'].includes(range)) {
    _currentRange = range;
  }
}

export function getStudyStreak() {
  const list = historyLoad();
  if (!list.length) return 0;

  const dates = new Set();
  list.forEach(r => {
    const d = new Date(r.timestamp); d.setHours(0, 0, 0, 0);
    dates.add(d.getTime());
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let streak = 0;
  let cur = today.getTime();
  while (dates.has(cur)) { streak++; cur -= 86400000; }

  if (streak === 0) {
    let y = today.getTime() - 86400000;
    while (dates.has(y)) { streak++; y -= 86400000; }
  }
  return streak;
}

function _bumpBefore() {
  const ids = ['dashToday', 'dashCorrect', 'dashRate', 'dashStreak', 'dashWrong'];
  const out = {};
  ids.forEach(id => {
    const el = document.getElementById(id);
    out[id] = el ? el.textContent.trim() : '';
  });
  return out;
}

function _bumpAfter(before) {
  const ids = ['dashToday', 'dashCorrect', 'dashRate', 'dashStreak', 'dashWrong'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const after = el.textContent.trim();
    if (before[id] !== after && before[id] !== '') {
      el.classList.add('bump');
      setTimeout(() => el.classList.remove('bump'), 260);
    }
  });
}

export function renderDashboard() {
  const before = _bumpBefore();

  const history = historyLoad();
  const now = Date.now();
  let start;
  if (_currentRange === 'today') {
    const d = new Date(); d.setHours(0,0,0,0);
    start = d.getTime();
  } else if (_currentRange === 'week') {
    start = now - 7 * 86400000;
  } else {
    start = 0;
  }
  const list = history.filter(r => r.timestamp >= start);
  const total = list.length;
  const correct = list.filter(r => r.isCorrect).length;
  const rate = total ? Math.round(correct / total * 100) : null;
  const streak = getStudyStreak();
  const wrongCount = wbLoad().length;

  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set('dashToday', `${total} <small>道</small>`);
  set('dashCorrect', `${correct} <small>道</small>`);
  set('dashRate', rate === null ? `— <small>%</small>` : `${rate} <small>%</small>`);
  set('dashStreak', `${streak} <small>天</small>`);
  set('dashWrong', `${wrongCount} <small>道</small>`);
  set('dashToday2', `${total} <small>道</small>`);
  set('dashCorrect2', `${correct} <small>道</small>`);
  set('dashRate2', rate === null ? `— <small>%</small>` : `${rate} <small>%</small>`);
  set('dashStreak2', `${streak} <small>天</small>`);
  set('dashWrong2', `${wrongCount} <small>道</small>`);

  _renderGrowthBars();
  _renderStreakDots(streak);
  _bumpAfter(before);
}

function _renderGrowthBars() {
  const history = historyLoad();
  const days = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    days.push({ date: d, label: `${d.getMonth() + 1}/${d.getDate()}`, total: 0, correct: 0 });
  }
  history.forEach(r => {
    const d = new Date(r.timestamp); d.setHours(0, 0, 0, 0);
    const slot = days.find(x => x.date.getTime() === d.getTime());
    if (slot) { slot.total++; if (r.isCorrect) slot.correct++; }
  });
  const maxTotal = Math.max(1, ...days.map(x => x.total));
  const html = days.map(d => {
    const totalH = d.total ? Math.round(d.total / maxTotal * 100) : 0;
    const correctH = d.total ? Math.round(d.correct / d.total * totalH) : 0;
    return `
      <div class="growth-bar-wrap">
        <div class="growth-bar-count">${d.total || ''}</div>
        <div class="growth-bar-stack">
          <div class="growth-bar-seg correct" style="height:${correctH}%"></div>
          <div class="growth-bar-seg wrong" style="height:${totalH - correctH}%"></div>
        </div>
        <div class="growth-bar-label">${d.label}</div>
      </div>
    `;
  }).join('');

  ['growthBarsBox', 'growthChartInline'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

function _renderStreakDots(streak) {
  const cycle = (streak > 0 && streak % 7 === 0) ? 7 : (streak % 7);
  const loops = Math.floor(streak / 7);
  const html = Array.from({ length: 7 }).map((_, i) => {
    let cls = 'streak-dot';
    if (i < cycle) {
      cls += ' lit';
      if (loops >= 1 && i === 6) cls += ' flower';
      if (loops >= 4 && i === 3) cls += ' fruit';
    }
    return `<span class="${cls}"></span>`;
  }).join('');

  ['streakDotsBox', 'streakTreeInline'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });

  const label = loops >= 4 ? ' 🌟 已结果' : (loops >= 1 ? ' 🌸 开花' : '');
  ['streakDaysLabel', 'streakTreeInlineLabel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = `已连续 ${streak} 天${label}`;
  });
}

/* L7：m14 原来把「一段统计卡」的 HTML 复制了 5 份，这里收敛成一个构造器 */
/* M3：改为直接建节点并返回 DocumentFragment，调用方用 replaceChildren 挂上去，
   不再产生 HTML 字符串（也避免 num/label 进 HTML 解析器）。 */
export function statCard(num, unit, label) {
  const wrap = document.createElement('div');
  wrap.className = 'growth-card-stat';

  const numEl = document.createElement('div');
  numEl.className = 'num';
  numEl.textContent = String(num);
  const small = document.createElement('small');
  small.textContent = String(unit);
  numEl.append(small);

  const lblEl = document.createElement('div');
  lblEl.className = 'lbl';
  lblEl.textContent = String(label);

  wrap.append(numEl, lblEl);
  return wrap;
}
export function statCards(list) {
  const frag = document.createDocumentFragment();
  for (const [n, u, l] of list) frag.append(statCard(n, u, l));
  return frag;
}

/* L7：m14 与 dashboard-render 曾各自渲染同一批节点（后写者赢），
   现在 m14 只调用这两个入口，不再自己拼图表。 */
export function renderWeekBars() { _renderGrowthBars(); }
export function renderStreakDots(streak) { _renderStreakDots(streak); }

export function bindRangeTabs() {
  const tabs = document.querySelectorAll('#rangeTabs .range-tab');
  tabs.forEach(t => {
    if (t.dataset._bound) return;
    t.dataset._bound = '1';
    t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      _currentRange = t.dataset.range;
      renderDashboard();
    });
  });
}