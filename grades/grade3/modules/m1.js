/* grades/grade3/modules/m1.js
   混合运算 · 步步为营（Brilliant 级交互重构）
   ─────────────────────────────────────────────
   架构铁律：
   1. 拒绝全量重绘 —— 算式行一旦生成就不可变（immutable row），
      新步骤只"追加"新行；被合并的格子用同尺寸静态文本替换，槽位永不移动。
   2. 布局锁死 —— 所有格子固定宽高（design/tokens.js DIMENSION），
      数字从 1 位变 3 位排版也不位移。
   3. 纯函数分离 —— 数学判定全部走 ../scoring/m1.js（canClickOp / computeStep / cleanParens）。
   4. 状态驱动动画 —— 先算后动：GSAP onComplete 里才提交状态（finishCommit）。
   视觉 / 动效参数全部来自 ../design/tokens.js，本文件零硬编码。
*/
import {
  parseExpression, tokensToString, tokensToMarkedHtml,
  canClickOp, computeStep, evaluatesNonNegative, evaluateExpression,
} from '../scoring/m1.js';
import { getLifecycle, applyThemeVars, EASE, MOTION, DIMENSION, STATUS, SURFACE, SOFT_GLOW, prefersReducedMotion, ensureMathTypoStyle } from '../design/tokens.js';
import { gsap } from '../design/motion.js';
import { registerActiveModule, unregisterActiveModule } from '../../../app/shell.js';
import { getGradeConfig } from '../../../app/grade-config.js';
import { emitUI } from '../../../core/ui/bus-ui.js';
import { getVirtualKeypad } from '../../../core/ui/virtual-keypad.js';
import { getAji } from '../../../core/ui/aji.js';
import {
  settle as learnerSettle, pickProblem, tagsForArithmetic,
} from '../../../core/learner.js';

const M1_PRESETS = [
  { name: '括号加法',  expr: '(3 + 6) ÷ (4 - 1)' },
  { name: '括号乘法',  expr: '(15 - 5) × 3' },
  { name: '括号除法',  expr: '36 ÷ (2 + 4)' },
  { name: '括号混合',  expr: '(8 + 7) × 2 - 10' },
  { name: '括号减乘',  expr: '20 - (3 + 2) × 4' },
  { name: '括号连除',  expr: '(12 + 8) ÷ (2 + 3)' },
  { name: '铅笔本子',  expr: '4 × 3 + 15' },
  { name: '乘加两步',  expr: '12 × 3 + 8' },
  { name: '带钱购物',  expr: '100 - 12 × 5' },
  { name: '两种水果',  expr: '8 × 5 + 8 × 3' },
  { name: '除加混合',  expr: '36 ÷ 4 + 15' },
  { name: '连续卖货',  expr: '45 - 18 - 15' },
  { name: '综合运算',  expr: '20 + 5 × 6 - 8' },
  { name: '同级连乘',  expr: '72 ÷ 8 × 3' },
  { name: '除加算式',  expr: '15 + 25 ÷ 5' },
  { name: '乘除混合',  expr: '6 × 8 - 20 ÷ 4' },
  { name: '两个乘法',  expr: '3 × 4 + 5 × 6' },
  { name: '分苹果',    expr: '40 ÷ 5 + 12' },
  { name: '买文具',    expr: '50 - 3 × 8' },
  { name: '数鸭子',    expr: '7 × 6 + 25' },
  { name: '分糖果',    expr: '48 ÷ 6 + 15 - 8' }
];

export const meta = {
  title: '混合运算 · 步步为营',
  icon: '🎯',
  levels: [
    { id: 'no-paren',  name: '无括号',   icon: '1️⃣', unlockAt: 0, filter: p => !/[()（）]/.test(p.expr) },
    { id: 'with-paren', name: '有括号',  icon: '2️⃣', unlockAt: 1, filter: p => /[()（）]/.test(p.expr) },
    { id: 'mul-div',   name: '乘除混合', icon: '3️⃣', unlockAt: 1, filter: p => /[×÷]/.test(p.expr) && /[+\-]/.test(p.expr) },
    { id: 'add-sub',   name: '加减混合', icon: '4️⃣', unlockAt: 2, filter: p => /[+\-]/.test(p.expr) && !/[×÷()（）]/.test(p.expr) },
  ],
};

/* ============ 纯函数：源区间归并 + 布局度量（可测试） ============ */

/* 单个 token 的固定格宽（与 CSS .b1-num/.b1-op/.b1-paren 一致） */
export function cellWidthOf(t) {
  if (t.type === 'op') return DIMENSION.opW;
  if (t.type === 'lparen' || t.type === 'rparen') return DIMENSION.parenW;
  return DIMENSION.numW;
}

/* 计算一行 token 的左右边缘（flex + gap 的确定性布局） */
export function cellMetrics(tokens) {
  const L = [], R = [];
  let x = 0;
  for (const t of tokens) {
    L.push(x);
    x += cellWidthOf(t);
    R.push(x);
    x += DIMENSION.rowGap;
  }
  return { L, R };
}

/* 由源区间 + 上一行的真实视觉边缘，推出新行每个格的盒模型。
   ⭐ 关键：必须传上一行的"实际渲染边缘"（含加宽的合并格），
   不能按 token 重新估——否则第三行起全部错位。 */
export function computeRowLayout(srcs, prevMetrics) {
  const L = [], R = [], widths = [], margins = [];
  let prevRight = null;
  srcs.forEach(([s, e]) => {
    const left = prevMetrics.L[s];
    const right = prevMetrics.R[e];
    widths.push(right - left);
    const expectedLeft = prevRight === null ? 0 : prevRight + DIMENSION.rowGap;
    const margin = left - expectedLeft;
    margins.push(margin > 0 ? margin : 0);
    L.push(left);
    R.push(right);
    prevRight = right;
  });
  return { L, R, widths, margins };
}

/* 合并结果字形的水平校准量：压到"弧底正下方"。
   弧底 x = 左右操作数视觉中心的中点；当左右格宽不等（如左侧是加宽的合并格）时，
   区间中心 ≠ 弧底，需要把字形相对盒子平移 (弧底 − 区间中心)。
   盒子不动 → 后续 token 的列对齐不受影响。 */
export function mergedGlyphShift(prevMetrics, leftIdx, rightIdx, spanL, spanR) {
  const lc = (prevMetrics.L[leftIdx] + prevMetrics.R[leftIdx]) / 2;
  const rc = (prevMetrics.L[rightIdx] + prevMetrics.R[rightIdx]) / 2;
  return (lc + rc) / 2 - (spanL + spanR) / 2;
}

/* 归并一步并跟踪"源区间"：
   每个产出 token 记录它来自旧行的哪些格 [s,e]，
   折叠括号时区间向括号对扩展 → 合并结果天然落在运算符中心（弧底正下方），
   且其余 token 与旧行逐列对齐。
   语义与 scoring/m1.js 的 cleanParens 严格一致（冒烟测试锁定）。 */
export function reduceWithSrc(tokens, opIdx, val) {
  const items = tokens.map((t, i) => ({ t, src: [i, i] }));
  items.splice(opIdx - 1, 3, { t: { type: 'num', val }, src: [opIdx - 1, opIdx + 1], fresh: true });

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].t.type !== 'lparen') continue;
      let depth = 1, j = i + 1;
      for (; j < items.length; j++) {
        if (items[j].t.type === 'lparen') depth++;
        if (items[j].t.type === 'rparen') { depth--; if (depth === 0) break; }
      }
      if (j >= items.length) continue;
      const inner = items.slice(i + 1, j);
      if (!inner.some(it => it.t.type === 'op')) {
        const lo = items[i].src[0], hi = items[j].src[1];
        const replacement = inner.map(it => ({
          t: it.t, fresh: it.fresh,
          src: [Math.min(lo, it.src[0]), Math.max(hi, it.src[1])],
        }));
        items.splice(i, j - i + 1, ...replacement);
        changed = true;
        break;
      }
    }
  }
  return items;
}

/* ============ 样式（值全部来自 tokens，注入一次，卸载移除） ============ */
const STYLE_ID = 'b1-style';

function buildCss() {
  const D = DIMENSION, F = SURFACE;
  return `
/* ── 顶栏（无标题，仅右缘小图标按钮——主舞台让位给算式） ── */
.b1-topbar { display: flex; align-items: center; justify-content: flex-end; gap: 12px; min-height: 38px; }
.b1-actions { display: flex; gap: 8px; }
.b1-iconbtn { width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--b1-history);
  background: transparent; color: var(--b1-history); font-size: 19px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; }
.b1-iconbtn:active { transform: scale(.93); }

/* ── 换题抽屉（Bottom Sheet） ── */
.b1-sheet { position: fixed; left: 12px; right: 12px; bottom: 0; z-index: 9995;
  background: var(--b1-sheet-bg, #fff); border-radius: 18px 18px 0 0;
  padding: 18px 16px calc(20px + env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; gap: 10px;
  box-shadow: 0 -10px 40px rgba(15,23,42,.22);
  transform: translateY(105%); transition: transform .3s cubic-bezier(.2,.9,.3,1); }
.b1-sheet.open { transform: translateY(0); }
.b1-mask { position: fixed; inset: 0; z-index: 9994; background: rgba(15,23,42,.35); }

/* ── C 位舞台：超大数字 + 呼吸感间距（字体统一走 TYPOGRAPHY：.math-num/.math-op 与 --math-* 变量） ── */
.b1-board { position: relative; margin-top: 40px; margin-bottom: 8px; padding: 14px 10px 8px; border-radius: 16px; overflow: hidden; }
.b1-arcs  { position: absolute; top: 0; left: 0; pointer-events: none; overflow: visible; z-index: 0; }
.b1-rows  { position: relative; z-index: 1; display: flex; flex-direction: column; gap: ${D.rowGap}px; min-height: ${D.rowH}px; }
.b1-row   { display: flex; align-items: center; height: ${D.rowH}px; flex: none; }
.b1-cell  { display: inline-flex; align-items: center; justify-content: center; font-size: ${D.font}px; line-height: 1; user-select: none; -webkit-user-select: none; }
/* 字体/字重/等宽数字由 .math-num / .math-op 工具类承载（TYPOGRAPHY 单一数据源），此处不再硬编码 */
.b1-num   { width: ${D.numW}px; }
.b1-op    { width: ${D.opW}px; border-radius: 10px;
  /* ⭐ 运算符 0.95 倍光学缩比（与 .math-op 工具类同规；声明在同表后部压过 .math-op 的 0.95em——
     em 参照父行字号，会丢 38px 基准，必须显式 calc） */
  font-size: calc(${D.font}px * 0.95); }
.b1-paren { width: ${D.parenW}px; }
.b1-op.b1-clickable { cursor: pointer; }
.b1-op.b1-clickable:hover { filter: brightness(1.15) drop-shadow(0 0 6px var(--b1-focus-ring)); }
.b1-op.b1-clickable:active { filter: brightness(.9); }
.b1-op.b1-locked { cursor: default; pointer-events: none; }

/* ── 输入行：答案槽（无原生 input、无等号/括号/箭头/问号）
      ⭐ 防跳动：行常驻占位（display 恒为 flex），激活只切 opacity，高度永不变化
      ⭐ 位置复用：答案槽绝对定位，由 JS 钉在"结果字形将出现的行内 x"上（弧底正下方），
         输入在哪结果就在哪，消除输入→落地的横向跳动。居中分量走 gsap xPercent ── */
.b1-inputrow { position: relative; display: flex; align-items: center; height: ${D.rowH}px; flex: none;
  opacity: 0; pointer-events: none; transition: opacity .25s ease; }
.b1-inputrow.b1-active { opacity: 1; pointer-events: auto; }
.b1-answer { position: absolute; left: 0; min-width: ${D.numW}px; height: ${D.rowH - 8}px;
  display: inline-flex; align-items: center; justify-content: center;
  font-family: var(--math-font-family, sans-serif); font-weight: var(--math-font-weight, 800);
  font-variant-numeric: var(--math-font-variant-numeric, tabular-nums);
  font-size: ${D.font}px; color: var(--b1-init);
  border-bottom: 1.5px solid var(--b1-focus-ring); }
.b1-answer::after { content: ''; position: absolute; right: 12px; bottom: 4px; width: 2.5px; height: 62%;
  background: var(--b1-focus); border-radius: 2px; animation: b1caret 1s steps(1) infinite; }
@keyframes b1caret { 50% { opacity: 0; } }
/* ⭐ 心流克制（探究式放行：错误照常提交，界面绝不明示）。
   全模块唯一的"指引色"：求助 / 终局静置 45 秒后，用主题暖黄 15% 微光（SOFT_GLOW）
   包住第一个错误步骤的结果数字 —— 可点击回滚重做；绝不出现红色 */
.b1-cell.b1-glow { box-shadow: inset 0 0 0 9999px ${SOFT_GLOW}; border-radius: 10px; transition: box-shadow .8s ease; cursor: pointer; }
.b1-cell.b1-editable { cursor: pointer; }

/* ── 聚光灯：等待输入时页面其余部分退后 ── */
.b1-card.b1-awaiting .b1-topbar,
.b1-card.b1-awaiting .priority-box,
.b1-card.b1-awaiting .b1-hint { opacity: .4; transition: opacity .25s; }

/* ── 弱化提示语 ── */
.b1-hint { margin-top: 32px; }
.b1-hint:not(.ok):not(.error) { color: ${F.hint}; font-size: 16px; }
.b1-placeholder { color: var(--b1-placeholder); font-size: 16px; padding: 14px 4px; }
@media (prefers-reduced-motion: reduce) { .b1-answer::after { animation: none; } .b1-inputrow { transition: none; } .b1-cell.b1-glow { transition: none; } }
`;
}

export default async function mount(container, ctx) {
  const tpl = document.getElementById('tpl-m1');
  if (!tpl) {
    console.error('[m1] 找不到 tpl-m1 模板');
    return;
  }
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));

  const $ = sel => container.querySelector(sel);
  const board = $('#m1board');
  const rowsEl = $('#m1rows');
  const svgEl = $('#m1arcs');
  const inputRow = $('#m1inputrow');
  const pendingEl = $('#m1pending');
  const answerEl = $('#m1answer');
  const cardEl = container.querySelector('.b1-card');
  if (!board || !rowsEl || !svgEl || !inputRow || !answerEl) {
    console.error('[m1] 模板结构缺失（b1-board / b1-rows / b1-arcs / b1-answer）');
    return;
  }

  // ⭐ 噪音清理（模板是共享的，DOM 层面在模块内修正）：
  //    输入行撤掉内联 display:none → 防跳动（常驻占位，只动 opacity）；
  //    箭头 → 是复写时代的残留；data-empty → '?' 占位已废除
  inputRow.style.display = '';
  container.querySelector('.b1-arrow')?.remove();
  answerEl.removeAttribute('data-empty');

  // ⭐ 全局数学排版（TYPOGRAPHY）：:root 变量 + .math-num/.math-op 工具类（幂等，shell 已注则跳过）
  ensureMathTypoStyle();

  // 样式注入（一次）
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = buildCss();
    document.head.appendChild(style);
  }
  const REDUCED = prefersReducedMotion();
  const keypad = getVirtualKeypad();
  const aji = getAji();     // ⭐ Aji 交互助教（双引擎；主动式浮条 = 唯一求助入口）

  /* ---------- 算式舞台视觉居中 + 键盘避让 ─────────────────────
     标题下线后，主舞台（b1-board）占据「页头以下 ~ 软键盘以上」可视带的正中。
     平移对象 = 舞台(b1-board) + 其下反馈行：同进退互不遮挡，卡片内 fixed 抽屉不受影响。
     键盘弹起 → 可视带收窄，舞台平滑上移保证算式完全可见；收起 → 平滑回正中。 ---------- */
  let m1StageCy = 0;   // 当前平移量（布局位置 = rect.top - cy）
  function m1CenterStage() {
    if (!cardEl || !board) return;
    // ⭐ Aji 聊天舱展开时让位管线归它接管（两套 transform 同写 y 会互相覆盖）
    if (aji.stageOwned('m1')) return;
    const vv = window.visualViewport;
    const kb = vv ? Math.max(0, window.innerHeight - vv.height) : 0;
    const bandTop = 64;                                   // 页头高度
    const bandBottom = window.innerHeight - kb - 12;
    // ⭐ 布局位置用 offsetTop 链计算（对 transform 免疫）——rect.top 在 gsap 补间中途读数会漂移
    let el = board, docTop = 0;
    while (el && el !== document.body) { docTop += el.offsetTop; el = el.offsetParent; }
    const stageTop = docTop - (window.scrollY || 0);
    const stageH = board.offsetHeight || DIMENSION.rowH * 2;
    const targetTop = Math.max(bandTop, (bandTop + bandBottom) / 2 - stageH / 2);
    const delta = Math.round(targetTop - stageTop);
    if (delta === m1StageCy) return;
    m1StageCy = delta;
    gsap.to([board, $('#m1fb')].filter(Boolean), { y: delta, duration: 0.3, ease: EASE.entry, overwrite: 'auto' });
  }
  const m1OnStageReflow = () => m1CenterStage();
  window.visualViewport?.addEventListener('resize', m1OnStageReflow);
  window.visualViewport?.addEventListener('scroll', m1OnStageReflow);
  window.addEventListener('resize', m1OnStageReflow);
  // ⭐ 把舞台交给 Aji：聊天舱展开时在「页头 ~ 舱体上缘」带内居中，收起时交还 m1CenterStage
  //    ⚠️ 交还前必须重置 m1StageCy 记忆——Aji 在背后移动过元素，
  //    模块若仍认为"已居中"会 early-return，算式永远卡在上移位置收不回来。
  aji.registerStage({
    moduleId: 'm1', el: board, extra: [$('#m1fb')], gap: 20,
    onRest: () => { m1StageCy = NaN; m1CenterStage(); },
  });

  // ---------- 主题（跟随 <html data-theme> 实时切换） ----------
  let LC = getLifecycle();
  applyThemeVars(board, LC);
  const applySheetTheme = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    cardEl?.style.setProperty('--b1-sheet-bg', dark ? '#1e293b' : '#ffffff');
  };
  applySheetTheme();
  const themeObserver = new MutationObserver(() => {
    LC = getLifecycle();
    applyThemeVars(board, LC);
    applySheetTheme();
    rowsMeta.forEach(r => r.cells.forEach(c => {
      if (c.dataset.b1Tier) applyTier(c, c.dataset.b1Tier);
    }));
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ---------- 状态 ----------
  const M1 = {
    original: '', tokens: [], steps: [], done: false,
    waiting: null,          // { opIdx, op, left, right, result, markedHtml }
    busy: false,            // 动画进行中，锁点击
    answerBuf: '',          // 键盘输入缓冲
    standardAnswer: null,   // ⭐ 原题标准答案（终局回溯的比对基准）
    recheck: null,          // ⭐ 终局回溯：{ firstWrongIdx }——放弃时才结算为错
    tags: [],               // ⭐ 当前题目的结构化标签（记忆引擎用）
    usedHint: false,        // ⭐ 本题是否用过 Aji 提示
  };
  // ⭐ 「先算乘除」优先级测验已下线（强制弹窗违背心流）——算理教学下沉进 Aji 对话框，
  //    学生直接开算，绝不阻断；无记录/加分业务可保留
  let presets = [...M1_PRESETS];
  const rowsMeta = [];      // [{ el, cells, tokens, freshCell|null }]，与 rowsEl 子元素一一对应
  let activeTl = null;

  const fmtNum = n => Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);

  // ---------- 生命周期配色 ----------
  function applyTier(el, tier) {
    const t = LC[tier];
    el.dataset.b1Tier = tier;   // 供主题切换时重涂
    gsap.set(el, { color: t.color, opacity: t.opacity });
    el.style.background = t.bg || '';
    el.style.textShadow =
      tier === 'result' ? `0 0 16px ${STATUS.ok}80` :
      tier === 'focus'  ? `0 0 12px ${LC.focus.ring}` : '';
    return el;
  }

  // ---------- 行构建（不可变行） ----------
  function makeCell(text, kind) {
    const s = document.createElement('span');
    // ⭐ 数学排版统一：数字/括号挂 .math-num，运算符挂 .math-op（TYPOGRAPHY 单一数据源）
    s.className = 'b1-cell b1-' + kind + (kind === 'op' ? ' math-op' : ' math-num');
    // ⭐ 减号渲染规范化：scoring 层 token 内部用 ASCII '-'（parseExpression 归一 + 判分依赖，不动），
    //    显示层统一为数学减号 U+2212 '−'
    s.textContent = (kind === 'op' && text === '-') ? '−' : text;
    return s;
  }

  function buildRow(tokens, { freshIdx = -1, srcs = null, prevMetrics = null } = {}) {
    const row = { el: document.createElement('div'), cells: [], tokens, freshCell: null, L: null, R: null };
    row.el.className = 'b1-row';

    // ⭐ 源区间布局映射：新行每格继承上一行的真实视觉边缘——
    //    合并格横跨被消耗区间并居中（中心 = 弧底 = 运算符中心），
    //    其余格与上一行逐列对齐；行行链式传递，永不按 token 重估
    let lay = null;
    if (srcs && prevMetrics) {
      lay = computeRowLayout(srcs, prevMetrics);
      row.L = lay.L;
      row.R = lay.R;
    } else {
      const m = cellMetrics(tokens);
      row.L = m.L;
      row.R = m.R;
    }

    tokens.forEach((t, i) => {
      let cell;
      if (t.type === 'lparen' || t.type === 'rparen') {
        cell = makeCell(t.val, 'paren');
        applyTier(cell, 'init');
      } else if (t.type === 'num') {
        cell = makeCell(fmtNum(t.val), 'num');
        applyTier(cell, i === freshIdx ? 'result' : 'init');
        if (i === freshIdx) row.freshCell = cell;
      } else {
        cell = makeCell(t.val, 'op');
        applyTier(cell, 'init');
        const chk = canClickOp(tokens, i);
        // ⭐ 所有运算符都可点：点错了在提示区给原因，而不是静默锁定（"点了没反应"）
        cell.classList.add('b1-clickable');
        cell.title = chk.ok ? '点我先算这一步' : '点这里看看为什么不能算';
        cell.addEventListener('click', () => m1ClickOp(i, cell));
      }
      if (lay) {
        cell.style.width = lay.widths[i] + 'px';
        if (lay.margins[i] > 0) cell.style.marginLeft = lay.margins[i] + 'px';
      }
      row.cells.push(cell);
      row.el.appendChild(cell);
    });
    return row;
  }

  function appendRow(row) {
    rowsMeta.push(row);
    rowsEl.appendChild(row.el);
    return row;
  }

  function clearBoard() {
    hideGuideArc(true);
    rowsMeta.length = 0;
    rowsEl.innerHTML = '';          // 只有"换新题"才允许整体清空
    svgEl.innerHTML = '';
  }

  function renderPlaceholder() {
    clearBoard();
    const p = document.createElement('div');
    p.className = 'b1-placeholder';
    p.textContent = '请在上方选择或输入算式';
    rowsEl.appendChild(p);
  }

  // ---------- SVG 圆弧漏斗 ----------
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function syncSvgSize() {
    // ⭐ 不用 viewBox 缩放（面板长高时会把旧弧线纵向拉伸错位），
    //    直接用 px 属性建立 1:1 坐标系；面板后来变高时靠 overflow:visible 兜底
    svgEl.setAttribute('width', Math.max(1, board.scrollWidth));
    svgEl.setAttribute('height', Math.max(1, board.scrollHeight));
    svgEl.removeAttribute('viewBox');
  }

  /* 弧线路径构建（碰撞弧线与引导弧共用）：三次贝塞尔 C 指令，
     起点/终点在两个操作数底部中心，控制点 Y 轴向下偏移 → 对称下潜的平缓圆弧 */
  function buildArcPath(leftCell, rightCell, opacity = 1) {
    const boardRect = board.getBoundingClientRect();
    const l = leftCell.getBoundingClientRect();
    const r = rightCell.getBoundingClientRect();
    const lx = l.left + l.width / 2 - boardRect.left;
    const rx = r.left + r.width / 2 - boardRect.left;
    const ly = l.bottom - boardRect.top - 2;
    const ry = r.bottom - boardRect.top - 2;
    const dip = MOTION.arcDip;

    syncSvgSize();

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M ${lx} ${ly} C ${lx} ${ly + dip}, ${rx} ${ry + dip}, ${rx} ${ry}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', LC.focus.color);
    path.setAttribute('stroke-width', MOTION.strokeWidth);
    path.setAttribute('stroke-linecap', 'round');
    if (opacity < 1) path.setAttribute('opacity', String(opacity));
    svgEl.appendChild(path);
    return { path, lx, ly, rx, ry };
  }

  function drawArcGeometry(leftCell, rightCell, tickTargetY) {
    const { path, lx, ly } = buildArcPath(leftCell, rightCell);

    // 弧底中心：采样取最低点
    const len = path.getTotalLength();
    let bx = lx, by = ly, best = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const p = path.getPointAtLength(len * i / 20);
      if (p.y > best) { best = p.y; bx = p.x; by = p.y; }
    }

    // 垂直指示线：从弧底中心精准指向下方结果顶端
    const tick = document.createElementNS(SVG_NS, 'path');
    const tickEnd = Math.min(by + MOTION.tickLen, Math.max(by + 4, tickTargetY));
    tick.setAttribute('d', `M ${bx} ${by} L ${bx} ${tickEnd}`);
    tick.setAttribute('fill', 'none');
    tick.setAttribute('stroke', LC.focus.color);
    tick.setAttribute('stroke-width', MOTION.strokeWidth);
    tick.setAttribute('stroke-linecap', 'round');
    svgEl.appendChild(tick);

    for (const p of [path, tick]) {
      const pl = p.getTotalLength();
      gsap.set(p, { strokeDasharray: pl, strokeDashoffset: pl });
    }
    return { path, tick };
  }

  /* ---------- 引导弧（等待输入态的空间引导）：代替复写算式。
     复用 buildArcPath 的贝塞尔几何，在两个操作数下方展开一条极淡圆弧
     （stroke-dashoffset 描边生长 0.2s ease-out，≈18% 透明度，绝不抢戏）；
     答对 → 瞬时让位给同几何的碰撞弧线（无缝衔接）；Esc → 淡出。 ---------- */
  let guideArc = null;

  function showGuideArc() {
    const w = M1.waiting;
    const row = rowsMeta[w?.rowIdx];
    if (!w || !row) return;
    hideGuideArc(true);   // 防残留
    const { path } = buildArcPath(row.cells[w.opIdx - 1], row.cells[w.opIdx + 1], 0.18);
    const len = path.getTotalLength();
    gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
    gsap.to(path, { strokeDashoffset: 0, duration: 0.2, ease: EASE.entry });
    guideArc = path;
  }

  function hideGuideArc(instant = false) {
    if (!guideArc) return;
    const p = guideArc;
    guideArc = null;
    if (instant) { gsap.killTweensOf(p); p.remove(); return; }
    gsap.to(p, { opacity: 0, duration: 0.25, ease: EASE.exit, onComplete: () => p.remove() });
  }

  // ---------- 反馈 ----------
  function m1SetFeedback(msg, type) {
    const fb = $('#m1fb');
    if (!fb) return;   // 卸载后的迟到定时器
    fb.textContent = msg;
    // ⭐ 保留 b1-hint 弱化档（模板语义：提示语恒安静；ok/error 才切换强调色）
    fb.className = 'feedback b1-hint' + (type ? ' ' + type : '');
    if (type === 'ok' || type === 'error') {
      const isOk = type === 'ok';
      ctx.showThumbBar({
        text: msg.replace(/^[✓❌🎉]\s*/, ''),
        ok: isOk,
        // ⭐ 状态 A（终局正确）：按钮「下一题」→ 直接换题
        nextLabel: '下一题',
        onNext: () => {
          if (M1.done) {
            $('#m1Random')?.click();
          } else {
            // 没做完：键盘保持/唤起，继续输入
            showKeypad();
            armOutsideConfirm();
            keypad.ensureVisible($('#m1fb'));
          }
        }
      });
    }
  }

  /* ⭐ 首行度量校准：flex 行无列间距规则，首行按格子紧排渲染——
     用真实 rect 把 row0 的 L/R 校准为实际渲染边缘，使 度量==渲染 同坐标系。
     此后 弧底 / 输入框钉位 / 结果落地 三者严格共线（消除首步 8px 幻影间距偏移）。
     jsdom 等无布局环境（rect 宽为 0）自动跳过，回落 cellMetrics。 */
  function m1CalibrateRow0Metrics() {
    const row0 = rowsMeta[0];
    if (!row0 || !row0.cells.length) return;
    // ⭐ 基准 = 行内容原点（.b1-rows 左缘，与 b1-inputrow 内容原点重合），
    //    不能用 board 左缘（会把内边距双计进度量）
    const br = rowsEl.getBoundingClientRect();
    const L = [], R = [];
    let ok = true;
    row0.cells.forEach(c => {
      const r = c.getBoundingClientRect();
      if (!r.width) { ok = false; return; }
      L.push(r.left - br.left);
      R.push(r.right - br.left);
    });
    if (ok) { row0.L = L; row0.R = R; }
  }

  // ---------- 输入行（答案槽：无原生 input，键盘认领输入） ----------
  function renderAnswerSlot() {
    answerEl.textContent = M1.answerBuf;
  }

  /* ⭐ 输入框位置复用（消除视觉跳跃）：预演本步归并——用与 m1CommitSequence
     完全相同的几何链（reduceWithSrc → computeRowLayout → mergedGlyphShift）
     算出"结果字形将出现的行内 x"，把答案槽中心钉在这一点上。
     输入在哪，结果就在哪（Δx = 0），且天然紧贴弧底正下方。 */
  function m1AnswerTargetX(rowIdx, opIdx) {
    const row = rowsMeta[rowIdx];
    if (!row || !row.tokens[opIdx - 1]) return null;
    const items = reduceWithSrc(row.tokens, opIdx, 0);
    const freshIdx = items.findIndex(x => x.fresh);
    if (freshIdx < 0) return null;
    const prevMetrics = (row.L && row.R) ? { L: row.L, R: row.R } : cellMetrics(row.tokens);
    const lay = computeRowLayout(items.map(x => x.src), prevMetrics);
    const shift = mergedGlyphShift(prevMetrics, opIdx - 1, opIdx + 1, lay.L[freshIdx], lay.R[freshIdx]);
    return (lay.L[freshIdx] + lay.R[freshIdx]) / 2 + shift;
  }

  /* 答案槽钉位：left = 目标 x（槽自身以 gsap xPercent:-50 居中）。
     ⭐ 边界保护：靠右的结果不撑破行宽，两侧各留 4px。 */
  function m1PlaceAnswerAt(x) {
    if (x == null) { answerEl.style.left = ''; return; }
    const half = Math.max(DIMENSION.numW, answerEl.offsetWidth) / 2;
    const rowW = inputRow.clientWidth || half * 2;
    const clamped = Math.max(half + 4, Math.min(x, rowW - half - 4));
    answerEl.style.left = clamped + 'px';
  }

  /* ⭐ 极简输入区：不复写算式（无等号/括号/箭头/问号），只有干净的下划线答案槽；
     防跳动 —— 行常驻占位，激活只切 .b1-active（opacity），高度永不变化 */
  function showInputRow() {
    pendingEl.textContent = '';
    M1.answerBuf = '';
    answerEl.classList.remove('b1-correct');   // ⭐ 上一题/上一步的判定残留不入新输入
    renderAnswerSlot();
    inputRow.classList.add('b1-active');
    // ⭐ 居中分量走 gsap（CSS transform 会被补间整个覆盖）；弹出时 0.2s 轻滑入场
    gsap.set(answerEl, { xPercent: -50 });
    if (REDUCED) gsap.set(answerEl, { x: 0, opacity: 1 });
    else gsap.fromTo(answerEl, { x: 12, opacity: 0 }, { x: 0, opacity: 1, duration: 0.2, ease: EASE.entry, overwrite: 'auto' });
  }

  function hideInputRow() {
    inputRow.classList.remove('b1-active');
  }

  /* ⭐ 键盘接入（黑盒回调制）：屏幕键与实体键统一由键盘组件路由到此；
     缓冲截断/判卷守卫留在业务层（最终权威），键盘外点击的自动确认也归业务（armOutsideConfirm） */
  function showKeypad() {
    keypad.show({
      onDigit: (d) => {
        if (!M1.waiting || M1.busy) return;
        if (M1.answerBuf.length >= 4) return;
        M1.answerBuf += d;
        renderAnswerSlot();
      },
      onConfirm: () => m1SubmitAnswer(),
      onBackspace: () => {
        if (!M1.waiting || M1.busy) return;
        M1.answerBuf = M1.answerBuf.slice(0, -1);
        renderAnswerSlot();
      },
      onCancel: () => m1CancelInput(),   // 实体 Esc
      maxLength: 4,
    });
  }

  // ---------- 载入新题 ----------
  function m1LoadExpression(str) {
    m1SettleAbandoned();   // ⭐ 主动换题/放弃：终局答错且未修正的尝试，此刻才结算为错
    if (activeTl) { activeTl.kill(); activeTl = null; }
    // ⭐ 换题 = 场景复位：键盘收起、聚光灯解除
    disarmOutsideConfirm();
    keypad.hide();
    cardEl?.classList.remove('b1-awaiting');
    closeSheet();
    M1.original = str;
    M1.tokens = parseExpression(str);
    M1.standardAnswer = evaluateExpression(M1.tokens);   // ⭐ 终局比对基准（非法算式 → null）
    M1.done = false;
    M1.steps = [];
    M1.waiting = null;
    M1.busy = false;
    M1.answerBuf = '';
    M1.recheck = null;
    // ⭐ 本次尝试的状态复位（记忆引擎用）：题目标签在下方按算式实算，
    //    绝不沿用上一题的 Tags——否则会把"上一题的学情"记到这一题头上
    M1.usedHint = false;
    M1.tags = tagsForArithmetic(str);

    if (M1.tokens.length === 0) {
      renderPlaceholder();
      m1SetFeedback('无法识别这道算式，请检查输入');
      return;
    }

    clearBoard();
    appendRow(buildRow(M1.tokens));
    m1CalibrateRow0Metrics();
    m1SetFeedback('点击算式中的运算符，把它先算出来 👆', '');
    m1AutoPromptFinalStep();   // ⭐ 载入即最后一步（如 5 − 3）→ 直通输入
    // ⭐ 常规态（初始/等待输入）：空闲 35s 才浮条；任何有效操作自动重置
    aji.hideToast();
    // 点浮条 → 显式 'hint' 场景：给"这一步"的算理拆解（本地规则优先，零网络）
    aji.requestIdleToast(35000, AJI_TOAST_NORMAL, () => aji.handleAsk('', 'hint'));
  }

  /* ⭐ 消灭最后一步的冗余点击（直通输入）：行内只剩 数字 运算符 数字 时，
     系统自动为这最后一步生成输入框并弹起键盘——用户不需要再点那个运算符。
     载入即终局（如 5 − 3）与推导走到终局两种时刻都会触发。 */
  function m1AutoPromptFinalStep() {
    if (M1.done || M1.busy || M1.waiting || M1.recheck) return;
    const toks = M1.tokens;
    if (toks.length !== 3) return;
    if (toks[0].type !== 'num' || toks[1].type !== 'op' || toks[2].type !== 'num') return;
    if (!canClickOp(toks, 1).ok) return;   // 不合法（如除 0）就不自动弹，交给点击路径给原因
    const row = rowsMeta[rowsMeta.length - 1];
    if (!row || row.el.dataset.committed) return;
    m1EnterWaiting(rowsMeta.length - 1, 1, row.cells[1]);
  }

  // ---------- 点击运算符 ----------
  // ⭐ 心流克制：点错运算是"引导时机"不是"错误警报"——中性文案、无 error 红档、无 ❌
  const WRONG_REASON = {
    'inner-paren': '先算括号里的哦！括号优先级最高。',
    'muldiv-first': '先算乘除哦！',
    'left-first': '要先算左边的这一步哦！从左到右。',
    'negative': '这样算会出现负数，我们还没学负数哦！',
    'div-zero': '不能除以 0 哦！',
    'not-ready': '',
    'not-op': '',
  };

  function m1ClickOp(i, cell) {
    if (M1.done || M1.busy || M1.waiting) return;
    if (cell?.closest('.b1-row')?.dataset.committed) return;   // ⭐ 已退役旧行的陈旧监听不再响应

    const chk = canClickOp(M1.tokens, i);
    if (!chk.ok) {
      const msg = WRONG_REASON[chk.reason];
      if (msg) m1SetFeedback(msg);
      return;
    }
    m1EnterWaiting(rowsMeta.length - 1, i, cell);
  }

  /* 进入等待作答状态（DOM 仍在原行，不动布局）。
     点击运算符 / 最后一步直通输入 / 回滚重做 三条路径共用此入口 */
  function m1EnterWaiting(rowIdx, i, cell) {
    const toks = rowsMeta[rowIdx].tokens;
    const left = toks[i - 1], right = toks[i + 1], op = toks[i].val;
    let result;
    try {
      result = computeStep(left.val, right.val, op);
    } catch (e) {
      m1SetFeedback('不能除以 0 哦');
      return;
    }

    M1.waiting = {
      opIdx: i, op,
      left: left.val, right: right.val, result,
      markedHtml: tokensToMarkedHtml(toks, i - 1, i + 1),
      rowIdx,
      cell,
    };

    // 呼吸降噪：焦点染色，非焦点降到 0.4
    applyTier(cell, 'focus');
    cell.classList.remove('b1-clickable');
    const row = rowsMeta[rowIdx];
    row.cells.forEach((c, j) => {
      if (j >= i - 1 && j <= i + 1) return;
      gsap.to(c, { opacity: MOTION.dimOpacity, duration: 0.2, ease: EASE.entry });
    });

    showGuideArc();   // ⭐ 极淡引导弧：两个操作数要"合"成一个的空间提示
    m1PlaceAnswerAt(m1AnswerTargetX(rowIdx, i));   // ⭐ 答案槽直落结果位（弧底正下方，Δx=0）
    showInputRow();
    // ⭐ 场景驱动：键盘弹出（持久 —— 确认后不收起，直到终局）
    showKeypad();
    armOutsideConfirm();
    cardEl?.classList.add('b1-awaiting');   // 聚光灯：页面其余部分退后
    m1SetFeedback('✏️ 请算出这一步的得数', '');
    // ⭐ 提示语滚到键盘上沿之上（下边缘不被遮挡）
    keypad.ensureVisible($('#m1fb'));
  }

  /* 点按键盘以外的任意区域 = "我输完了" → 自动确认（沿用原失焦提交的习惯） */
  let outsideConfirmArmed = false;
  function armOutsideConfirm() {
    if (outsideConfirmArmed) return;
    outsideConfirmArmed = true;
    // arm 发生在 click（同一次 tap 的 pointerdown 之后），不会误吞本次 tap
    document.addEventListener('pointerdown', onOutsidePointer, true);
  }
  function disarmOutsideConfirm() {
    outsideConfirmArmed = false;
    document.removeEventListener('pointerdown', onOutsidePointer, true);
  }
  function onOutsidePointer(e) {
    if (e.target.closest?.('.vkp')) return;               // 键盘内部的按下交给键盘
    if (M1.answerBuf.trim()) m1SubmitAnswer();            // 空缓冲不触发（与原 blur 行为一致）
  }

  function m1CancelInput() {
    if (!M1.waiting || M1.busy) return;   // ⭐ 动画进行中不允许取消，防止状态撕裂
    const { opIdx, rowIdx, cell } = M1.waiting;
    hideGuideArc();                       // ⭐ 引导弧淡出退场
    const row = rowsMeta[rowIdx];
    if (row && row.cells[opIdx] === cell) {
      applyTier(cell, 'init');
      cell.classList.add('b1-clickable');
      row.cells.forEach((c, j) => {
        if (j >= opIdx - 1 && j <= opIdx + 1) return;
        gsap.to(c, { opacity: LC.init.opacity, duration: 0.2, ease: EASE.entry });
      });
    }
    M1.waiting = null;
    disarmOutsideConfirm();
    keypad.hide();
    cardEl?.classList.remove('b1-awaiting');
    hideInputRow();
    m1SetFeedback('点击算式中的运算符，把它先算出来 👆', '');
  }

  // ---------- 提交判卷（探究式放行：对错都提交，绝不打断） ----------
  function m1SubmitAnswer() {
    if (!M1.waiting || M1.busy) return;   // ⭐ busy 守卫：动画期间不重复进入
    const raw = M1.answerBuf.trim();
    if (!raw) return;

    let userVal;
    if (/^-?\d+(\.\d+)?$/.test(raw)) userVal = parseFloat(raw);
    else return;   // ⭐ 非数字同样静默：数字原样保留，等自己退格重输

    // ⭐ 探究式放行：无论对错都提交——带着用户的真实输入继续往下算，
    //    界面绝不报错、绝不弹任何"正确"暗示（鼓励语/绿框都在禁止之列），对错只在内部登记。
    const w = M1.waiting;
    w.userVal = userVal;
    w.isCorrect = Math.abs(userVal - w.result) < 0.001;
    if (!w.isCorrect) emitUI('WRONG', { moduleId: 'm1' });   // ⭐ 隐形埋点：界面绝不亮红灯
    m1CommitSequence();   // ⭐ 键盘保持原位（持久），终局才收起
  }

  /* ---------- 终局回溯（探究式，无倒计时）────────────────────
     过程全程放行：错误的中间结果照常进入推导链（M1.steps 记录 expected/actual/isCorrect，
     界面绝不明示）。只有当"推导到最后一步、最终得数与标准答案不符"时：
     ① 提示语平滑切换为柔声的一句（无 error 档 → 无红、无缩略条）；
     ② 系统静默等待：静置 45 秒（MOTION.recheckIdle，任何动作都重新起算）
        或用户点开 Aji 悬浮球求助 —— 才用主题暖黄 15%（SOFT_GLOW）
        包住 M1.steps 中第一个 isCorrect:false 那一步的结果格；
     ③ 点击高亮格 → 回滚到该步重新输入；答对后平滑清空后续所有行重新推导；
        一直不改就不催、不判 0，只有主动换题/放弃才结算并记为错。 ---------- */
  const RECHECK_HINT = '好像哪里出了一点小偏差，我们回头检查一下？';
  let recheckTimer = null;
  let recheckActivityArmed = false;
  let recheckGlowCell = null;   // 被高亮的第一个错误结果格（可点击回滚）

  function m1EnterRecheck() {
    const k = M1.steps.findIndex(s => !s.isCorrect);
    M1.recheck = { firstWrongIdx: k >= 0 ? k : M1.steps.length - 1 };
    m1SetFeedback(RECHECK_HINT);
    // ⭐ 状态 B（终局回溯）：Thumb Bar「去修改」+「看答案」（Aji 浮条绝不在此阶段出现）
    aji.hideToast();
    ctx.showThumbBar({
      text: RECHECK_HINT,
      ok: false,
      nextLabel: '去修改',
      onNext: () => m1GoFix(),
      retryLabel: '看答案',
      onRetry: () => m1GiveUp(),
    });
    armRecheckTimer();
    armRecheckActivity();
    m1ArmEditable();   // ⭐ 全盘可编辑：所有历史结果格恢复可点击
  }

  function armRecheckTimer() {
    if (recheckTimer) clearTimeout(recheckTimer);
    recheckTimer = setTimeout(() => { recheckTimer = null; m1ShowSoftGlow(); }, MOTION.recheckIdle * 1000);
  }

  /* 静置守护：回溯未决期间，用户的任何动作都让 45 秒重新起算 */
  function onRecheckActivity() {
    if (!M1.recheck) { disarmRecheckActivity(); return; }
    armRecheckTimer();
  }
  function armRecheckActivity() {
    if (recheckActivityArmed) return;
    recheckActivityArmed = true;
    document.addEventListener('pointerdown', onRecheckActivity, true);
    document.addEventListener('keydown', onRecheckActivity, true);
  }
  function disarmRecheckActivity() {
    recheckActivityArmed = false;
    document.removeEventListener('pointerdown', onRecheckActivity, true);
    document.removeEventListener('keydown', onRecheckActivity, true);
  }

  /* 微光：只给第一个错误步骤的结果格加视觉引导（点击行为由 editable 统一处理） */
  function m1ShowSoftGlow() {
    m1ClearSoftGlow();
    if (!M1.recheck) return;
    const cell = rowsMeta[M1.recheck.firstWrongIdx + 1]?.freshCell;
    if (!cell) return;
    cell.classList.add('b1-glow');
    recheckGlowCell = cell;
  }

  function m1ClearSoftGlow() {
    recheckGlowCell = null;
    container.querySelectorAll('.b1-glow').forEach(el => el.classList.remove('b1-glow'));
  }

  /* ⭐ 全盘可编辑：回溯期所有历史结果格恢复可点击，点击任一步即级联重置到该步 */
  const m1EditableCells = [];
  function m1ArmEditable() {
    m1DisarmEditable();
    M1.steps.forEach((s, idx) => {
      const cell = rowsMeta[idx + 1]?.freshCell;
      if (!cell) return;
      cell.classList.add('b1-editable');
      const handler = () => m1ClickHistoryStep(idx);
      cell._m1EditableHandler = handler;
      cell.addEventListener('click', handler);
      m1EditableCells.push(cell);
    });
  }
  function m1DisarmEditable() {
    m1EditableCells.forEach(cell => {
      cell.classList.remove('b1-editable');
      if (cell._m1EditableHandler) cell.removeEventListener('click', cell._m1EditableHandler);
      cell._m1EditableHandler = null;
    });
    m1EditableCells.length = 0;
  }
  function m1ClickHistoryStep(idx) {
    if (!M1.recheck || M1.busy) return;
    const opIdx = M1.steps[idx]?.opIdx;
    m1SettleRecheck();
    if (opIdx != null) m1RevertToStep(idx, opIdx);
    // ⭐ 回溯静默期：20s 计时从这里起算（点格/改错=有效操作，自动重置；一直没修好才浮条）
    aji.requestIdleToast(20000, AJI_TOAST_RECHECK, () => aji.handleAsk('', 'review'));   // 修复期求助 → 错误回顾
  }

  /* 「去修改」：平滑滚动到第一个错步并激活输入 */
  function m1GoFix() {
    if (!M1.recheck) return;
    const idx = M1.recheck.firstWrongIdx;
    const cell = rowsMeta[idx + 1]?.freshCell;
    if (cell) { try { cell.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
    m1ClickHistoryStep(idx);
  }

  /* 「看答案」：放弃 → 判错 + 展示正确答案 + 「下一题」 */
  function m1GiveUp() {
    const r = M1.recheck;
    m1SettleRecheck();   // ⭐ 清光清计时清可编辑
    aji.hideToast();     // ⭐ Aji 浮条与计时一并退场
    if (!r) return;
    const s = M1.steps[r.firstWrongIdx];
    if (ctx.data?.historyAdd) {
      ctx.data.historyAdd({
        problemText: M1.original, problemSource: 'm1', moduleId: 'm1',
        studentSteps: M1.steps.map((st, idx) => ({ rel: `第 ${idx + 1} 步`, sub: st.markedHtml, res: st.resultStr })),
        studentAnswer: s ? fmtNum(s.actual) : '（未完成）',
        isCorrect: false,
        correctAnswer: s ? fmtNum(s.expected) : fmtNum(M1.standardAnswer ?? 0),
        aiFeedback: null,
      });
    }
    if (ctx.data?.masteryRecord) ctx.data.masteryRecord(M1.original, false);
    // ⭐ 记忆引擎：错 → 入 Event Store（带错因与是否用过提示）
    m1RecordLearner({ isCorrect: false, hasErrors: true, wrongStep: s, usedHint: M1.usedHint });
    const ans = fmtNum(M1.standardAnswer ?? 0);
    const fb = $('#m1fb');
    if (fb) { fb.textContent = `正确答案是：${ans}。`; fb.className = 'feedback b1-hint'; }
    // ⭐ 状态 C（放弃看答案）：展示答案 + 「下一题」
    ctx.showThumbBar({
      text: `正确答案是：${ans}`,
      ok: false,
      hideRetry: true,
      nextLabel: '下一题',
      onNext: () => $('#m1Random')?.click(),
    });
    M1.done = true;
  }

  /* ⭐ 级联重置：回滚到第 k 步之前——清掉 k+1 起的行与步骤，重开第 k 步输入 */
  function m1RevertToStep(k, opIdx) {
    const rowK = rowsMeta[k];
    if (!rowK) return;
    while (rowsMeta.length > k + 1) {   // 含错误结果行与后续所有行
      const r = rowsMeta.pop();
      r.el.remove();
    }
    M1.steps.length = k;
    M1.tokens = rowK.tokens;
    M1.done = false;
    svgEl.innerHTML = '';               // 清掉残留弧线
    rowK.el.dataset.committed = '';     // 解除退役
    const opCell = rowK.cells[opIdx];
    if (opCell) {
      opCell.classList.add('b1-clickable');
      opCell.classList.remove('b1-locked');
      applyTier(opCell, 'init');
    }
    m1ClickOp(opIdx, opCell);           // 直接重开这一步的输入
  }

  /* 修正成功 / 换题 / 卸载：微光与守护无痕退场（recheck 相应清空或由结算方接管） */
  function m1SettleRecheck() {
    M1.recheck = null;
    if (recheckTimer) { clearTimeout(recheckTimer); recheckTimer = null; }
    disarmRecheckActivity();
    m1ClearSoftGlow();
    m1DisarmEditable();
  }

  /* 只有主动换题 / 放弃时才结束并记为错 —— 在此之前系统不催、不判 0 */
  function m1SettleAbandoned() {
    const r = M1.recheck;
    m1SettleRecheck();   // ⭐ 无论是否未决，微光/守护都无痕退场（求助微光也随换题消散）
    if (!r) return;
    const s = M1.steps[r.firstWrongIdx];
    if (ctx.data?.historyAdd) {
      ctx.data.historyAdd({
        problemText: M1.original, problemSource: 'm1', moduleId: 'm1',
        studentSteps: M1.steps.map((st, idx) => ({ rel: `第 ${idx + 1} 步`, sub: st.markedHtml, res: st.resultStr })),
        studentAnswer: s ? fmtNum(s.actual) : '（未完成）',
        isCorrect: false,
        correctAnswer: s ? fmtNum(s.expected) : fmtNum(M1.standardAnswer ?? 0),
        aiFeedback: null,
      });
    }
    if (ctx.data?.masteryRecord) ctx.data.masteryRecord(M1.original, false);
    m1RecordLearner({ isCorrect: false, hasErrors: true, wrongStep: s, usedHint: M1.usedHint });
  }

  /* ⭐ 记忆引擎结算（m1 的唯一调用点）。
     铁律：做对且过程无错 → 绝不写 Event Store，只喂聚合器。 */
  function m1RecordLearner({ isCorrect, hasErrors, wrongStep, usedHint }) {
    try {
      const s = wrongStep || {};
      learnerSettle({
        moduleId: 'm1',
        topic: meta.title || '混合运算',
        problemText: M1.original,
        tags: M1.tags && M1.tags.length ? M1.tags : tagsForArithmetic(M1.original),
        isCorrect, hasErrors,
        correctAnswer: s.expected != null ? fmtNum(s.expected) : fmtNum(M1.standardAnswer ?? 0),
        studentAnswer: s.actual != null ? fmtNum(s.actual) : '',
        // 错因用中文说清"哪一步的什么算错了"，供 RAG 直接引述
        errorStep: s.actual != null
          ? `第 ${(M1.steps.indexOf(s) + 1) || 1} 步：${String(s.markedHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()} 算成了 ${fmtNum(s.actual)}，应为 ${fmtNum(s.expected)}`
          : '',
        usedHint: !!usedHint,
      });
    } catch (e) { /* 学情记录失败绝不阻断做题 */ }
  }

  // ---------- 合并动画（核心时间轴） ----------
  function m1CommitSequence() {
    const w = M1.waiting;
    if (!w) return;
    M1.busy = true;
    hideGuideArc(true);   // ⭐ 引导弧瞬时让位：碰撞弧线同几何、同起点随即生长 → 视觉无缝衔接
    hideInputRow();

    const row = rowsMeta[w.rowIdx];
    // ⭐ 旧行就地退役：标记已提交，剩余可点运算符全部锁定——
    //    不可变行不重建 DOM，陈旧的点击监听必须就此失效
    row.el.dataset.committed = '1';
    row.cells.forEach(c => {
      if (c.classList.contains('b1-clickable')) {
        c.classList.remove('b1-clickable');
        c.classList.add('b1-locked');
      }
    });

    const leftCell = row.cells[w.opIdx - 1];
    const opCell = row.cells[w.opIdx];
    const rightCell = row.cells[w.opIdx + 1];

    // 1. 源区间归并：拿到新 tokens 的同时拿到每个格的横向区间映射
    //    （合并格中心 = 弧底 = 运算符中心，其余格与上一行逐列对齐）
    //    ⭐ 探究式放行：用学生的真实输入值归并（对错都照常砸落）
    const items = reduceWithSrc(row.tokens, w.opIdx, w.userVal);
    const newTokens = items.map(x => x.t);
    const freshIdx = items.findIndex(x => x.fresh);
    // ⭐ 传上一行的真实渲染边缘（含加宽合并格），不能按 token 重估
    const prevMetrics = (row.L && row.R) ? { L: row.L, R: row.R } : cellMetrics(row.tokens);
    const newRow = buildRow(newTokens, { freshIdx, srcs: items.map(x => x.src), prevMetrics });

    // ⭐ 字形校准：左右操作数宽度不等时，把结果数字压到弧底正下方
    //    （盒子不动，后续列对齐不受影响）
    if (newRow.freshCell) {
      const shift = mergedGlyphShift(
        prevMetrics, w.opIdx - 1, w.opIdx + 1,
        newRow.L[freshIdx], newRow.R[freshIdx],
      );
      if (Math.abs(shift) > 0.5) {
        newRow.freshCell.style.position = 'relative';
        newRow.freshCell.style.left = shift + 'px';
      }
    }
    gsap.set(newRow.cells, { opacity: 0 });   // 占位但不显示 → 行高已锁定，弧线可以精准测量
    appendRow(newRow);

    // 2. 测量：弧线从左数底部钻出，滑向右数底部；指示线指向新行结果格顶端
    const newRect = newRow.freshCell
      ? newRow.freshCell.getBoundingClientRect()
      : newRow.el.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    const { path, tick } = drawArcGeometry(leftCell, rightCell, newRect.top - boardRect.top);

    // 3. 位移量：左 / 右数字各走一半，在运算符中心相撞
    const bl = leftCell.getBoundingClientRect();
    const br = rightCell.getBoundingClientRect();
    const dxMid = (br.left + br.width / 2 - (bl.left + bl.width / 2)) / 2;

    const prevFresh = rowsMeta.length >= 3 ? rowsMeta[rowsMeta.length - 3].freshCell : null;
    const freshCell = newRow.freshCell || newRow.cells[0];
    const otherIdx = [];
    row.cells.forEach((_, j) => { if (j < w.opIdx - 1 || j > w.opIdx + 1) otherIdx.push(row.cells[j]); });

    const moveAt = MOTION.lineGrowDur * MOTION.lineStartMove;         // 线画到 70% 数字才起步
    const collideAt = moveAt + MOTION.mergeDur;

    const tl = gsap.timeline({
      onComplete: () => { activeTl = null; finishCommit(newTokens); },
    });
    if (REDUCED) tl.timeScale(12);
    activeTl = tl;

    tl
      // 0. 呼吸降噪已在 clickOp 时做了一半；这里保持
      // 1. 圆弧发芽：从左侧数字底部钻出
      .to(path, { strokeDashoffset: 0, duration: MOTION.lineGrowDur, ease: EASE.entry }, 0)
      // 2. 连通后保持高亮
      .to({}, { duration: MOTION.holdGlow }, MOTION.lineGrowDur)
      // 3. 70% 处数字起步：back.out 相撞的物理感
      .to(leftCell,  { x: dxMid,  duration: MOTION.mergeDur, ease: EASE.land }, moveAt)
      .to(rightCell, { x: -dxMid, duration: MOTION.mergeDur, ease: EASE.land }, moveAt)
      .to(opCell, { scale: 0, opacity: 0, duration: 0.22, ease: EASE.exit }, moveAt + MOTION.overlap)
      // 4. 碰撞：缩小即消失；指示线在碰撞瞬间补完
      .to([leftCell, rightCell], { scale: 0, duration: MOTION.collideDur, ease: EASE.exit }, collideAt)
      .to(tick, { strokeDashoffset: 0, duration: 0.18, ease: EASE.entry }, collideAt)
      // 5. 原槽位换入灰暗静态文本（同尺寸 → 零位移），上一行的结果降为历史档
      .call(() => swapToConsumed(row, w.opIdx), null, collideAt + MOTION.collideDur)
      .call(() => { if (prevFresh) gsap.to(prevFresh, { color: LC.history.color, opacity: LC.history.opacity, duration: 0.3 }); }, null, collideAt)
      // 6. 新行揭示：其余数字淡入交错；结果格"聚变产出"——短距离三段式砸落：
      //    下落 power3.in → 触地压扁 power2.out → back.out(3) 回弹（距离短 -20，物理产生感但不抢戏）
      .addLabel('reveal', collideAt + MOTION.collideDur)
      // 弧线 + 指示线连通保持后，一起过渡到冷暗灰（被消耗档）
      .to([path, tick], { stroke: LC.consumed.color, opacity: LC.consumed.opacity, duration: 0.3, ease: EASE.entry }, 'reveal')
      .to(otherIdx, { opacity: 1, duration: 0.12, ease: EASE.entry }, 'reveal')   // 先恢复 1.0（呼吸结束）
      .to(newRow.cells.filter(c => c !== newRow.freshCell), {
        opacity: 1, duration: 0.2, stagger: MOTION.stagger, ease: EASE.entry,
      }, 'reveal+=0.05')
      .fromTo(freshCell,
        { y: MOTION.dropYResult, scale: 0.8, opacity: 0 },
        { y: 0, scale: 1, opacity: 1, duration: 0.22, ease: 'power3.in' }, 'reveal+=0.08')      // 下落
      .to(freshCell, { scaleX: 1.08, scaleY: 0.92, duration: 0.12, ease: 'power2.out' }, 'reveal+=0.30')   // 触地压扁
      .to(freshCell, { scaleX: 1, scaleY: 1, duration: 0.28, ease: 'back.out(3)', clearProps: 'scaleX,scaleY' }, 'reveal+=0.42')   // 回弹
      // 7. 旧行其余元素缓缓融入背景（被消耗档）
      .to(otherIdx, { color: LC.consumed.color, opacity: LC.consumed.opacity, duration: 0.35, ease: EASE.entry }, 'reveal+=0.2')
      // 8. 时间轴留白：让大脑处理信息
      .to({}, { duration: MOTION.restPause });
  }

  function swapToConsumed(row, opIdx) {
    const mk = (txt, kind, old) => {
      const s = makeCell(txt, kind);
      applyTier(s, 'consumed');
      // ⭐ 继承被替换格的盒模型与字形校准（合并格可能加宽/偏移），槽位零位移
      s.style.width = old.style.width;
      s.style.marginLeft = old.style.marginLeft;
      if (old.style.left) { s.style.position = 'relative'; s.style.left = old.style.left; }
      return s;
    };
    const l = row.cells[opIdx - 1], o = row.cells[opIdx], r = row.cells[opIdx + 1];
    const lNew = mk(fmtNum(row.tokens[opIdx - 1].val), 'num', l);
    const oNew = mk(row.tokens[opIdx].val, 'op', o);
    const rNew = mk(fmtNum(row.tokens[opIdx + 1].val), 'num', r);
    row.el.replaceChild(lNew, l);
    row.el.replaceChild(oNew, o);
    row.el.replaceChild(rNew, r);
    row.cells[opIdx - 1] = lNew;
    row.cells[opIdx] = oNew;
    row.cells[opIdx + 1] = rNew;
    // ⭐ 同步 freshCell 引用：结果格被消耗替换后，回溯微光仍需指到"活着的"DOM 格
    if (row.freshCell === l) row.freshCell = lNew;
    else if (row.freshCell === o) row.freshCell = oNew;
    else if (row.freshCell === r) row.freshCell = rNew;
  }

  // ---------- 状态提交（动画 onComplete 之后才执行 —— 铁律 4） ----------
  function finishCommit(newTokens) {
    const w = M1.waiting;
    // ⭐ 内部登记每一步的期望/实际/对错（界面绝不明示）
    M1.steps.push({
      opIdx: w.opIdx,
      markedHtml: w.markedHtml,
      resultStr: tokensToString(newTokens),
      expected: w.result, actual: w.userVal, isCorrect: w.isCorrect,
    });
    M1.tokens = newTokens;
    M1.waiting = null;
    M1.busy = false;

    if (M1.tokens.length === 1) {
      const finalVal = M1.tokens[0].val;
      const offTarget = M1.standardAnswer != null && Math.abs(finalVal - M1.standardAnswer) >= 0.001;
      const hasErrorInProcess = M1.steps.some(s => !s.isCorrect);   // ⭐ 过程轨迹有任何错误 → 同样视为答错
      if (offTarget || hasErrorInProcess) {
        // ⭐ 终局审判：最终结果错，或过程输入有错 → 回溯（错就是错，错得有逻辑）
        disarmOutsideConfirm();
        keypad.hide();
        cardEl?.classList.remove('b1-awaiting');
        m1EnterRecheck();
        return;
      }
      M1.done = true;
      // ⭐ 终局谢幕：键盘平滑滑下，页面中央由拇指条接管（Aji 使命完成，退场）
      aji.hideToast();
      disarmOutsideConfirm();
      keypad.hide();
      cardEl?.classList.remove('b1-awaiting');
      const finalCell = rowsMeta[rowsMeta.length - 1].freshCell;
      if (finalCell) {
        gsap.fromTo(finalCell, { scale: 0.6 }, { scale: 1, duration: 0.9, ease: EASE.emphasize, clearProps: 'scale' });
      }
      m1SetFeedback(`🎉 全部算完！结果是 ${fmtNum(M1.tokens[0].val)}。`, 'ok');
      emitUI('CORRECT', { moduleId: 'm1' });
      if (ctx.data && ctx.data.historyAdd) {
        ctx.data.historyAdd({
          problemText: M1.original, problemSource: 'm1', moduleId: 'm1',
          studentSteps: M1.steps.map((s, idx) => ({ rel: `第 ${idx + 1} 步`, sub: s.markedHtml, res: s.resultStr })),
          studentAnswer: fmtNum(M1.tokens[0].val), isCorrect: true, correctAnswer: fmtNum(M1.tokens[0].val), aiFeedback: null,
        });
      }
      if (ctx.data && ctx.data.masteryRecord) ctx.data.masteryRecord(M1.original, true);
      // ⭐ 记忆引擎：做对且过程无错 → 绝不入 Event Store，只让对应 Tag 的连续正确 +1
      m1RecordLearner({ isCorrect: true, hasErrors: false, usedHint: M1.usedHint });
      return;
    }

    // 提示下一个可点运算符（脉动）
    setTimeout(() => {
      if (M1.done || M1.waiting || M1.busy) return;
      const toks = M1.tokens;
      for (let j = 0; j < toks.length; j++) {
        if (toks[j].type !== 'op') continue;
        if (!canClickOp(toks, j).ok) continue;
        const lastRow = rowsMeta[rowsMeta.length - 1];
        const cell = lastRow && lastRow.cells[j];
        if (cell) {
          gsap.fromTo(cell, { scale: 1 }, {
            scale: 1.14, repeat: 3, yoyo: true,
            duration: MOTION.hintPulseDur, ease: 'sine.inOut', clearProps: 'scale',
          });
        }
        break;
      }
    }, (MOTION.restPause + 0.1) * 1000);

    // ⭐ 过程零判定：不弹任何"正确"暗示，只给中性引导（先算乘除的算理在 Aji 对话框里）
    m1SetFeedback('点击下一个运算符，继续算 👆', '');
    m1AutoPromptFinalStep();   // ⭐ 推导走到最后一步（num op num）→ 直通输入，不再点运算符
  }

  // ---------- 控件（与旧版行为一致） ----------
  function m1InitSelect(items) {
    const select = $('#m1Select');
    if (!select) return;
    select.innerHTML = items.map((p, i) => `<option value="${i}">${p.name}：${p.expr}</option>`).join('');
  }

  $('#m1Load')?.addEventListener('click', () => {
    const idx = +$('#m1Select').value;
    const p = presets[idx];
    if (p) m1LoadExpression(p.expr);
  });

  $('#m1UseCustom')?.addEventListener('click', () => {
    const t = $('#m1Custom').value.trim();
    if (!t) return;
    m1LoadExpression(t);
    $('#m1Custom').value = '';
  });

  $('#m1Custom')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('#m1UseCustom')?.click();
  });

  $('#m1Upload')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const lines = ev.target.result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) { m1SetFeedback('文件是空的，换一个试试吧'); return; }
      presets = lines.map((line, i) => ({ name: '第' + (i + 1) + '题', expr: line }));
      m1InitSelect(presets);
      m1LoadExpression(lines[0]);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  });

  /* ---------- 无感定制生成器（记忆引擎干预出口） ----------
     题目标签强制返回：{ problemText, tags, answer }——任务书 §五.3。
     mode 干预（任务书 §一.5）：
       consolidate 降维巩固：参数范围收窄（乘数退到 2~5、加数退到 20 以内）
       advance     升维挑战：参数范围放宽（乘数升到 6~9、加数升到 10~99）
       normal      原样 */
  const M1_LEVEL_TAGS = {
    'no-paren': ['混合运算', '乘法', '加法', '减法', '乘法进位'],
    'with-paren': ['含括号', '混合运算', '乘法', '加法'],
    'mul-div': ['混合运算', '乘法', '除法'],
    'add-sub': ['加法', '减法'],
  };
  /** 各层级按难度干预的取数区间 */
  const M1_RANGE = {
    consolidate: { mul: [2, 5], mul2: [2, 5], addHi: 20, subHi: 40, big: [10, 40] },
    normal:      { mul: [2, 9], mul2: [2, 9], addHi: 99, subHi: 90, big: [10, 99] },
    advance:     { mul: [6, 9], mul2: [6, 9], addHi: 99, subHi: 99, big: [50, 99] },
  };

  function m1GenerateExpr(level, mode = 'normal') {
    const R = M1_RANGE[mode] || M1_RANGE.normal;
    const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const mul = () => rnd(R.mul[0], R.mul[1]);
    const mul2 = () => rnd(R.mul2[0], R.mul2[1]);

    const GEN = {
      'no-paren': () => {
        const type = rnd(1, 6);
        if (type === 1) return `${mul()} × ${mul2()} + ${rnd(10, R.addHi)}`;
        if (type === 2) { const b = rnd(5, 15), c = rnd(5, 15); return `${rnd(Math.max(30, b + c), R.subHi)} - ${b} - ${c}`; }
        if (type === 3) { const b = mul(), q = mul2(); return `${b * q} ÷ ${b} + ${rnd(10, R.addHi)}`; }
        if (type === 4) { const a = mul(), b = mul2(); return `${a} × ${b} - ${rnd(2, Math.min(9, a * b - 1))}`; }
        if (type === 5) return `${mul()} × ${mul2()} + ${mul()} × ${mul2()}`;
        const b = mul(), c = mul2(); return `${rnd(Math.max(10, b * c), R.subHi)} - ${b} × ${c}`;
      },
      'with-paren': () => {
        const type = rnd(1, 3);
        if (type === 1) { const a = mul(), b = mul2(), c = mul(); return `(${a} + ${b}) × ${c}`; }
        if (type === 2) { const b = mul(), q = mul2(), a = rnd(1, 5); return `(${b * q + a} - ${a}) ÷ ${b}`; }
        const a = mul(), b = mul2(), c = mul();
        return `(${a} + ${b}) × ${c} - ${rnd(2, Math.min(9, (a + b) * c - 1))}`;
      },
      'mul-div': () => {
        const type = rnd(1, 3);
        if (type === 1) return `${mul()} × ${mul2()} + ${rnd(10, R.addHi)}`;
        if (type === 2) { const b = mul(), q = mul2(); return `${b * q} ÷ ${b} + ${rnd(10, R.addHi)}`; }
        const b = mul(), c = mul2(); return `${rnd(Math.max(10, b * c), R.subHi)} - ${b} × ${c}`;
      },
      'add-sub': () => {
        const type = rnd(1, 3);
        if (type === 1) { const b = rnd(5, 15), c = rnd(5, 15); return `${rnd(Math.max(30, b + c), R.subHi)} - ${b} - ${c}`; }
        if (type === 2) { const a = rnd(10, R.addHi), b = rnd(10, R.addHi); return `${a} + ${b} - ${rnd(5, Math.min(30, a + b - 1))}`; }
        return `${rnd(10, R.big[0])} + ${rnd(5, 30)} + ${rnd(5, 30)}`;
      },
    };
    return (GEN[level] || GEN['no-paren'])();
  }

  /** 生成 + 校验 + 打标签（pickProblem 的 generator 契约：必须返回 { problemText, tags }） */
  function m1MakeProblem(level, mode) {
    const allowNegative = getGradeConfig().allowNegative !== false;
    let expr = m1GenerateExpr(level, mode);
    // ⭐ 年级防卫：三年级尚未学负数 → 随机题保证标准顺序下全程非负（源头已约束 + 兜底重试）
    if (!allowNegative) {
      for (let tries = 0; tries < 30 && !evaluatesNonNegative(expr); tries++) expr = m1GenerateExpr(level, mode);
    }
    return { problemText: expr, tags: tagsForArithmetic(expr) };
  }

  $('#m1Random')?.addEventListener('click', () => {
    const level = ctx.storage.get('grade3_m1_level') || 'no-paren';
    // ⭐ 无感定制生成：先问记忆引擎"这题该练什么"，再按 Tag 定向生成/匹配。
    //    consolidate = 顽固短板 → 降维巩固；advance = 已掌握 → 升维挑战；normal 原样。
    const picked = pickProblem((g) => m1MakeProblem(level, g.mode), {
      candidateTags: M1_LEVEL_TAGS[level] || M1_LEVEL_TAGS['no-paren'],
      moduleId: 'm1',
    });
    m1LoadExpression(picked ? picked.problemText : m1GenerateExpr(level, 'normal'));
  });

  $('#m1reset')?.addEventListener('click', () => {
    if (M1.original) m1LoadExpression(M1.original);
  });

  // ---------- 换题抽屉（Bottom Sheet） ----------
  const sheet = $('#m1sheet');
  let sheetMask = null;
  function openSheet() {
    if (!sheetMask) {
      sheetMask = document.createElement('div');
      sheetMask.className = 'b1-mask';
      sheetMask.addEventListener('click', closeSheet);
      document.body.appendChild(sheetMask);
    }
    sheetMask.style.display = 'block';
    sheet.style.display = 'flex';
    requestAnimationFrame(() => sheet.classList.add('open'));
  }
  function closeSheet() {
    if (!sheet) return;
    sheet.classList.remove('open');
    if (sheetMask) sheetMask.style.display = 'none';
  }
  $('#m1gear')?.addEventListener('click', () => {
    if (sheet?.classList.contains('open')) closeSheet();
    else openSheet();
  });
  // ---------- Aji 全站陪学助教（模块只报数据 + 本地规则，UI 全在 aji.js） ----------
  const AJI_TOAST_NORMAL = '有点卡壳？点击看看我怎么想。';   // 常规态（空闲 35s）
  const AJI_TOAST_RECHECK = '卡住了吗？需要我讲讲这一步吗？'; // 回溯期（空闲 20s）
  const AJI_HINT_CONTENT = '先算乘除，后算加减；有括号先算括号里的。点击算式中的运算符，把它先算出来。';
  aji.registerModuleContext({
    moduleId: 'm1',
    topic: '混合运算',
    knowledgeCards: [
      { title: '运算顺序', content: '先算乘除，后算加减。<b>有括号就先算括号里的</b>，括号优先级最高。' },
      { title: '从左到右', content: '同级运算（都是加减、或都是乘除）要<b>从左往右</b>依次算：15 − 9 − 8 先算 15 − 9。' },
      { title: '算完要检查', content: '算完再回头看一眼每一步，看看有没有进位忘了加、或者顺序取错了。' },
    ],
    // ⭐ 当前题目（无则空串 → Aji 判为"无题目上下文"场景）
    problemText: () => M1.original || '',
    // ⭐ 是否已动过手：场景一（刚进页面未做题 = 打招呼 + 核心法则）与场景二（做到一半）的分水岭
    isStarted: () => M1.steps.length > 0,
    // ⭐ 当前步骤与错误记录
    progress: () => {
      if (!M1.steps.length) return '（尚未开始计算）';
      const wrong = M1.steps.filter(s => !s.isCorrect).length;
      const done = M1.steps.map((st, i) => `第${i + 1}步=${st.resultStr}`).join('，');
      return `已算 ${M1.steps.length} 步：${done}${wrong ? `；其中 ${wrong} 步算错` : '；暂无错误'}`;
    },
    // ⭐ 是否出错：过程有错也算（任务书 §五.2 的 hasErrors 语义）
    isError: () => !!M1.recheck || M1.steps.some(s => !s.isCorrect),
    // ⭐ 本地规则优先（快思考）：常规态 = 算理提示；回溯/修复态 = 错误回顾 + 微光
    resolveLocal: (intent) => {
      if (M1.recheck && !M1.busy) m1ShowSoftGlow();   // 回溯期求助 → 微光轻照第一个错步
      M1.usedHint = true;                             // ⭐ 用过 Aji 提示 → 随错题一起入库
      return {
        type: (intent === 'review' || M1.recheck) ? 'error_review' : 'hint',
        title: '这一步怎么想？',
        content: AJI_HINT_CONTENT,
        actions: [{ text: '我懂了', type: 'close' }],
      };
    },
  });
  // 抽屉里的换题动作完成后自动收起
  $('#m1Load')?.addEventListener('click', closeSheet);
  $('#m1UseCustom')?.addEventListener('click', closeSheet);
  $('#m1Upload')?.addEventListener('change', closeSheet);
  $('#m1Random')?.addEventListener('click', closeSheet);

  // ---------- 层级切换 ----------
  ctx.registerLevelHandler('m1', (levelId) => {
    const lv = meta.levels.find(x => x.id === levelId) || meta.levels[0];
    const filteredPresets = M1_PRESETS.filter(lv.filter);
    presets = filteredPresets.length > 0 ? filteredPresets : M1_PRESETS;
    m1InitSelect(presets);
    const randomIdx = Math.floor(Math.random() * presets.length);
    m1LoadExpression(presets[randomIdx].expr);
  });

  // ---------- 启动 ----------
  m1InitSelect(presets);
  m1LoadExpression(presets[0].expr);
  requestAnimationFrame(m1CenterStage);   // ⭐ 布局就绪后舞台居中

  registerActiveModule('m1', {
    loadCustom: (text) => {
      const custom = $('#m1Custom');
      if (custom) {
        custom.value = text;
        $('#m1UseCustom')?.click();
      }
    }
  });

  // ---------- 清理 ----------
  return () => {
    unregisterActiveModule('m1');
    themeObserver.disconnect();
    disarmOutsideConfirm();
    m1SettleRecheck();   // ⭐ 心流守护（定时器/文档监听/微光）随卸载无痕退场
    aji.hideToast();     // ⭐ 防旧计时器在后台触发
    aji.clearStage('m1');   // ⭐ 释放让位接管（防旧模块的舞台对象滞留）
    window.visualViewport?.removeEventListener('resize', m1OnStageReflow);
    window.visualViewport?.removeEventListener('scroll', m1OnStageReflow);
    window.removeEventListener('resize', m1OnStageReflow);
    keypad.hide();
    if (sheetMask) sheetMask.remove();
    if (activeTl) { activeTl.kill(); activeTl = null; }
    container.querySelectorAll('.b1-cell, .b1-inputrow, .b1-row, .b1-arcs path').forEach(el => gsap.killTweensOf(el));
    document.getElementById(STYLE_ID)?.remove();
    container.innerHTML = '';
  };
}
