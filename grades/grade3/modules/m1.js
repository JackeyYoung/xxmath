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
  canClickOp, computeStep, evaluatesNonNegative,
} from '../scoring/m1.js';
import { getLifecycle, applyThemeVars, EASE, MOTION, DIMENSION, STATUS, SURFACE, prefersReducedMotion } from '../design/tokens.js';
import { gsap } from '../design/motion.js';
import { COMBO } from '../../../core/ui/celebrate.js';
import { getEncouragement } from '../../../core/ui/encourage.js';
import { registerActiveModule, unregisterActiveModule } from '../../../app/shell.js';
import { getGradeConfig } from '../../../app/grade-config.js';
import { emitUI } from '../../../core/ui/bus-ui.js';
import { getVirtualKeypad } from '../../../core/ui/virtual-keypad.js';

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
  const D = DIMENSION, S = STATUS, F = SURFACE;
  return `
/* ── 顶栏（标题 + 边缘化的小图标按钮） ── */
.b1-topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.b1-topbar h2 { margin: 0; font-size: 19px; }
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

/* ── C 位舞台：超大等宽 + 呼吸感间距 ── */
.b1-board { position: relative; margin-top: 40px; margin-bottom: 8px; padding: 14px 10px 8px; border-radius: 16px; overflow: hidden;
  font-family: 'Consolas', 'SF Mono', ui-monospace, monospace; }
.b1-arcs  { position: absolute; top: 0; left: 0; pointer-events: none; overflow: visible; z-index: 0; }
.b1-rows  { position: relative; z-index: 1; display: flex; flex-direction: column; gap: ${D.rowGap}px; min-height: ${D.rowH}px; }
.b1-row   { display: flex; align-items: center; height: ${D.rowH}px; flex: none; }
.b1-cell  { display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: ${D.font}px; line-height: 1; font-variant-numeric: tabular-nums; user-select: none; -webkit-user-select: none; }
.b1-num   { width: ${D.numW}px; }
.b1-op    { width: ${D.opW}px; border-radius: 10px; }
.b1-paren { width: ${D.parenW}px; }
.b1-op.b1-clickable { cursor: pointer; }
.b1-op.b1-clickable:hover { filter: brightness(1.15) drop-shadow(0 0 6px var(--b1-focus-ring)); }
.b1-op.b1-clickable:active { filter: brightness(.9); }
.b1-op.b1-locked { cursor: default; pointer-events: none; }

/* ── 输入行：答案槽（无原生 input、无括号/箭头/问号）
      ⭐ 防跳动：行常驻占位（display 恒为 flex），激活只切 opacity，高度永不变化 ── */
.b1-inputrow { display: flex; align-items: center; gap: 10px; height: ${D.rowH}px; flex: none;
  opacity: 0; pointer-events: none; transition: opacity .25s ease; }
.b1-inputrow.b1-active { opacity: 1; pointer-events: auto; }
.b1-eq { color: var(--b1-history); font-weight: 800; font-size: ${Math.round(D.font * 0.8)}px; }
.b1-answer { min-width: ${D.numW}px; height: ${D.rowH - 8}px; position: relative;
  display: inline-flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: ${D.font}px; color: var(--b1-init);
  border-bottom: 1.5px solid var(--b1-focus-ring); }
.b1-answer::after { content: ''; position: absolute; right: 12px; bottom: 4px; width: 2.5px; height: 62%;
  background: var(--b1-focus); border-radius: 2px; animation: b1caret 1s steps(1) infinite; }
@keyframes b1caret { 50% { opacity: 0; } }
.b1-answer.b1-wrong { color: ${S.bad}; border-bottom-color: ${S.bad}; animation: b1shake .3s; }
@keyframes b1shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }

/* ── 聚光灯：等待输入时页面其余部分退后 ── */
.b1-card.b1-awaiting .lesson-hint,
.b1-card.b1-awaiting .b1-topbar,
.b1-card.b1-awaiting .priority-box,
.b1-card.b1-awaiting .b1-hint { opacity: .4; transition: opacity .25s; }

/* ── 弱化提示语 ── */
.b1-hint { margin-top: 32px; }
.b1-hint:not(.ok):not(.error) { color: ${F.hint}; font-size: 16px; }
.b1-placeholder { color: var(--b1-placeholder); font-size: 16px; padding: 14px 4px; }
@media (prefers-reduced-motion: reduce) { .b1-answer.b1-wrong { animation: none; } .b1-answer::after { animation: none; } .b1-inputrow { transition: none; } }
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

  // 样式注入（一次）
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = buildCss();
    document.head.appendChild(style);
  }
  const REDUCED = prefersReducedMotion();
  const keypad = getVirtualKeypad();

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
  };
  const M1_PRIORITY = { passed: false, expectedOps: [] };
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
    s.className = 'b1-cell b1-' + kind;
    s.textContent = text;
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
    fb.className = 'feedback' + (type ? ' ' + type : '');
    if (type === 'ok' || type === 'error') {
      const isOk = type === 'ok';
      ctx.showThumbBar({
        text: msg.replace(/^[✓❌🎉]\s*/, ''),
        ok: isOk,
        onNext: () => {
          if (M1.done) {
            $('#m1Random')?.click();
          } else {
            // 没做完：键盘保持/唤起，继续输入
            keypad.show({
              onDigit: (d) => {
                if (!M1.waiting || M1.busy) return;
                if (M1.answerBuf.length >= 4) return;
                M1.answerBuf += d;
                renderAnswerSlot();
              },
              onConfirm: () => m1SubmitAnswer(),
            });
            armOutsideConfirm();
            keypad.ensureVisible($('#m1fb'));
          }
        }
      });
    }
  }

  // ---------- 输入行（答案槽：无原生 input，键盘认领输入） ----------
  function renderAnswerSlot() {
    answerEl.textContent = M1.answerBuf;
  }

  /* ⭐ 极简输入区：不复写算式（无括号/箭头/问号），只出现 "= ___"；
     防跳动 —— 行常驻占位，激活只切 .b1-active（opacity），高度永不变化 */
  function showInputRow() {
    pendingEl.textContent = '';
    M1.answerBuf = '';
    renderAnswerSlot();
    inputRow.classList.add('b1-active');
  }

  function hideInputRow() {
    inputRow.classList.remove('b1-active');
  }

  // ---------- 载入新题 ----------
  function m1LoadExpression(str) {
    if (activeTl) { activeTl.kill(); activeTl = null; }
    // ⭐ 换题 = 场景复位：键盘收起、聚光灯解除
    disarmOutsideConfirm();
    keypad.hide();
    cardEl?.classList.remove('b1-awaiting');
    closeSheet();
    M1.original = str;
    M1.tokens = parseExpression(str);
    M1.done = false;
    M1.steps = [];
    M1.waiting = null;
    M1.busy = false;
    M1.answerBuf = '';
    M1_PRIORITY.passed = false;
    M1_PRIORITY.expectedOps = [];

    if (M1.tokens.length === 0) {
      renderPlaceholder();
      m1SetFeedback('❌ 无法识别这道算式，请检查输入', 'error');
      m1HidePriorityBox();
      return;
    }

    clearBoard();
    appendRow(buildRow(M1.tokens));
    m1HidePriorityBox();
    m1ShowPriorityBox();
    if (M1_PRIORITY.passed) m1SetFeedback('点击算式中的运算符，把它先算出来 👆', '');
    else m1SetFeedback('🤔 先选一选：这道题先算哪一步？', '');
  }

  // ---------- 点击运算符 ----------
  const WRONG_REASON = {
    'inner-paren': '❌ 先算括号里的哦！括号优先级最高。',
    'muldiv-first': '❌ 先算乘除哦！',
    'left-first': '❌ 要先算左边的这一步哦！从左到右。',
    'negative': '❌ 这样算会出现负数，我们还没学负数哦！',
    'div-zero': '❌ 不能除以 0 哦！',
    'not-ready': '',
    'not-op': '',
  };

  function m1ClickOp(i, cell) {
    if (M1.done || M1.busy || M1.waiting || !M1_PRIORITY.passed) return;
    if (cell?.closest('.b1-row')?.dataset.committed) return;   // ⭐ 已退役旧行的陈旧监听不再响应

    const toks = M1.tokens;
    const chk = canClickOp(toks, i);
    if (!chk.ok) {
      const msg = WRONG_REASON[chk.reason];
      if (msg) m1SetFeedback(msg, 'error');
      return;
    }

    const left = toks[i - 1], right = toks[i + 1], op = toks[i].val;
    let result;
    try {
      result = computeStep(left.val, right.val, op);
    } catch (e) {
      m1SetFeedback('❌ 不能除以 0 哦', 'error');
      return;
    }

    // 进入等待作答状态（DOM 仍在原行，不动布局）
    M1.waiting = {
      opIdx: i, op,
      left: left.val, right: right.val, result,
      markedHtml: tokensToMarkedHtml(toks, i - 1, i + 1),
      rowIdx: rowsMeta.length - 1,
      cell,
    };

    // 呼吸降噪：焦点染色，非焦点降到 0.4
    applyTier(cell, 'focus');
    cell.classList.remove('b1-clickable');
    const row = rowsMeta[M1.waiting.rowIdx];
    row.cells.forEach((c, j) => {
      if (j >= i - 1 && j <= i + 1) return;
      gsap.to(c, { opacity: MOTION.dimOpacity, duration: 0.2, ease: EASE.entry });
    });

    showGuideArc();   // ⭐ 极淡引导弧：两个操作数要"合"成一个的空间提示
    showInputRow();
    // ⭐ 场景驱动：键盘弹出（持久 —— 确认后不收起，直到终局）
    keypad.show({
      onDigit: (d) => {
        if (!M1.waiting || M1.busy) return;
        if (M1.answerBuf.length >= 4) return;
        M1.answerBuf += d;
        renderAnswerSlot();
      },
      onConfirm: () => m1SubmitAnswer(),
    });
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

  // ---------- 提交判卷 ----------
  function m1SubmitAnswer() {
    if (!M1.waiting || M1.busy) return;   // ⭐ busy 守卫：动画期间不重复进入
    const raw = M1.answerBuf.trim();
    if (!raw) return;

    let userVal;
    if (/^-?\d+(\.\d+)?$/.test(raw)) userVal = parseFloat(raw);
    else { m1ShowWrong('请输入一个数字'); return; }

    if (Math.abs(userVal - M1.waiting.result) < 0.001) {
      answerEl.classList.add('b1-correct');
      m1SetFeedback(getEncouragement('m1', COMBO.count), '');
      m1CommitSequence();   // ⭐ 键盘保持原位（持久），终局才收起
    } else {
      m1ShowWrong(`❌ 再想想～ 提示：${M1.waiting.op === '÷' ? '用乘法验算一下' : '再算一遍'}`);
      emitUI('WRONG', { moduleId: 'm1' });
    }
  }

  function m1ShowWrong(msg) {
    answerEl.classList.remove('b1-correct');
    answerEl.classList.add('b1-wrong');
    m1SetFeedback(msg, 'error');
    M1.answerBuf = '';
    setTimeout(() => {
      renderAnswerSlot();
      answerEl.classList.remove('b1-wrong');
    }, 450);
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
    const items = reduceWithSrc(row.tokens, w.opIdx, w.result);
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
  }

  // ---------- 状态提交（动画 onComplete 之后才执行 —— 铁律 4） ----------
  function finishCommit(newTokens) {
    const w = M1.waiting;
    M1.steps.push({ markedHtml: w.markedHtml, resultStr: tokensToString(newTokens) });
    M1.tokens = newTokens;
    M1.waiting = null;
    M1.busy = false;

    if (M1.tokens.length === 1) {
      M1.done = true;
      // ⭐ 终局谢幕：键盘平滑滑下，页面中央由拇指条接管
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

    // 同级混合 → 再考一次"先算哪步"
    const hasMulDiv = M1.tokens.some(t => t.type === 'op' && (t.val === '×' || t.val === '÷'));
    const hasAddSub = M1.tokens.some(t => t.type === 'op' && (t.val === '+' || t.val === '-'));
    if (hasMulDiv && hasAddSub) {
      M1_PRIORITY.passed = false;
      m1ShowPriorityBox();
    } else {
      M1_PRIORITY.passed = true;
      m1SetFeedback('✅ 正确！继续点击下一步的运算符。', 'ok');
    }
  }

  // ---------- 优先级测验（先算哪步） ----------
  const PRIORITY_OPTS = [
    { key: 'muldiv', label: '先算 乘除（× ÷）' },
    { key: 'addsub', label: '先算 加减（+ −）' },
  ];

  function m1InitPriorityOptions() {
    const opts = $('#m1PriorityOptions');
    if (!opts) return;
    // 只构建一次；之后仅切换 class，不再重写 DOM
    PRIORITY_OPTS.forEach(({ key, label }) => {
      const btn = document.createElement('button');
      btn.className = 'priority-opt';
      btn.dataset.key = key;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        const isCorrect = M1_PRIORITY.expectedOps.includes(key);
        opts.querySelectorAll('.priority-opt').forEach(b => b.classList.remove('chosen', 'wrong', 'correct'));
        btn.classList.add('chosen', isCorrect ? 'correct' : 'wrong');
        const fb = $('#m1PriorityFeedback');
        if (isCorrect) {
          fb.textContent = '✓ 对！先算乘除，再算加减。';
          fb.className = 'priority-feedback ok';
          M1_PRIORITY.passed = true;
          try {
            const d = new Date();
            const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            ctx.storage.set('grade3_priority_passed_date', todayStr);
          } catch (e) { console.warn('[m1] 写入优先级测验日期失败', e); }
          setTimeout(() => {
            m1HidePriorityBox();
            m1SetFeedback('点击算式中的运算符，把它先算出来 👆', '');
          }, 800);
        } else {
          fb.textContent = '再想想哦～';
          fb.className = 'priority-feedback error';
        }
      });
      opts.appendChild(btn);
    });
  }

  function m1ShowPriorityBox() {
    const box = $('#m1PriorityBox');
    const opts = $('#m1PriorityOptions');
    const fb = $('#m1PriorityFeedback');
    if (!box || !opts) return;

    try {
      const d = new Date();
      const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (ctx.storage.get('grade3_priority_passed_date') === todayStr) {
        M1_PRIORITY.passed = true;
        box.style.display = 'none';
        return;
      }
    } catch (e) { console.warn('[m1] 读取优先级测验日期失败', e); }

    const toks = M1.tokens;
    const hasParen = toks.some(t => t.type === 'lparen');
    const hasMulDiv = toks.some(t => t.type === 'op' && (t.val === '×' || t.val === '÷'));
    const hasAddSub = toks.some(t => t.type === 'op' && (t.val === '+' || t.val === '-'));

    if (hasParen) {
      M1_PRIORITY.passed = true;
      box.style.display = 'none';
      m1SetFeedback('✏️ 有括号，先算括号里的！', '');
      return;
    }
    if (!hasMulDiv || !hasAddSub) {
      M1_PRIORITY.passed = true;
      box.style.display = 'none';
      return;
    }

    M1_PRIORITY.expectedOps = ['muldiv'];
    opts.querySelectorAll('.priority-opt').forEach(b => b.classList.remove('chosen', 'wrong', 'correct'));
    if (fb) { fb.textContent = ''; fb.className = 'priority-feedback'; }
    box.style.display = 'block';
  }

  function m1HidePriorityBox() {
    const box = $('#m1PriorityBox');
    if (box) box.style.display = 'none';
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
      if (lines.length === 0) { m1SetFeedback('❌ 文件为空', 'error'); return; }
      presets = lines.map((line, i) => ({ name: '第' + (i + 1) + '题', expr: line }));
      m1InitSelect(presets);
      m1LoadExpression(lines[0]);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  });

  $('#m1Random')?.addEventListener('click', () => {
    const level = ctx.storage.get('grade3_m1_level') || 'no-paren';
    const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    const GEN = {
      'no-paren': () => {
        const type = rnd(1, 6);
        if (type === 1) return `${rnd(2, 9)} × ${rnd(2, 9)} + ${rnd(10, 99)}`;
        if (type === 2) { const b = rnd(5, 15), c = rnd(5, 15); return `${rnd(Math.max(30, b + c), 90)} - ${b} - ${c}`; }
        if (type === 3) { const b = rnd(2, 9), q = rnd(2, 9); return `${b * q} ÷ ${b} + ${rnd(10, 50)}`; }
        if (type === 4) { const a = rnd(2, 9), b = rnd(2, 9); return `${a} × ${b} - ${rnd(2, Math.min(9, a * b - 1))}`; }
        if (type === 5) return `${rnd(2, 9)} × ${rnd(2, 9)} + ${rnd(2, 9)} × ${rnd(2, 9)}`;
        const b = rnd(2, 9), c = rnd(2, 9); return `${rnd(Math.max(10, b * c), 99)} - ${b} × ${c}`;
      },
      'with-paren': () => {
        const type = rnd(1, 3);
        if (type === 1) { const a = rnd(2, 9), b = rnd(2, 9), c = rnd(2, 9); return `(${a} + ${b}) × ${c}`; }
        if (type === 2) { const b = rnd(2, 9), q = rnd(2, 9), a = rnd(1, 5); return `(${b * q + a} - ${a}) ÷ ${b}`; }
        const a = rnd(2, 9), b = rnd(2, 9), c = rnd(2, 9);
        return `(${a} + ${b}) × ${c} - ${rnd(2, Math.min(9, (a + b) * c - 1))}`;
      },
      'mul-div': () => {
        const type = rnd(1, 3);
        if (type === 1) return `${rnd(2, 9)} × ${rnd(2, 9)} + ${rnd(10, 99)}`;
        if (type === 2) { const b = rnd(2, 9), q = rnd(2, 9); return `${b * q} ÷ ${b} + ${rnd(10, 50)}`; }
        const b = rnd(2, 9), c = rnd(2, 9); return `${rnd(Math.max(10, b * c), 99)} - ${b} × ${c}`;
      },
      'add-sub': () => {
        const type = rnd(1, 3);
        if (type === 1) { const b = rnd(5, 15), c = rnd(5, 15); return `${rnd(Math.max(30, b + c), 90)} - ${b} - ${c}`; }
        if (type === 2) { const a = rnd(10, 50), b = rnd(10, 50); return `${a} + ${b} - ${rnd(5, Math.min(30, a + b - 1))}`; }
        return `${rnd(10, 40)} + ${rnd(5, 30)} + ${rnd(5, 30)}`;
      },
    };
    const gen = GEN[level] || GEN['no-paren'];
    // ⭐ 年级防卫：三年级尚未学负数 → 随机题保证标准顺序下全程非负（源头已约束 + 兜底重试）
    const allowNegative = getGradeConfig().allowNegative !== false;
    let expr = gen();
    if (!allowNegative) {
      for (let tries = 0; tries < 30 && !evaluatesNonNegative(expr); tries++) expr = gen();
    }
    m1LoadExpression(expr);
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
  // 抽屉里的换题动作完成后自动收起
  $('#m1Load')?.addEventListener('click', closeSheet);
  $('#m1UseCustom')?.addEventListener('click', closeSheet);
  $('#m1Upload')?.addEventListener('change', closeSheet);
  $('#m1Random')?.addEventListener('click', closeSheet);

  // ---------- 桌面物理键盘（虚拟键盘的补充，移动端不触发） ----------
  const onWinKey = (e) => {
    if (!M1.waiting || M1.busy) return;
    if (/^[0-9]$/.test(e.key)) {
      if (M1.answerBuf.length < 4) { M1.answerBuf += e.key; renderAnswerSlot(); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      m1SubmitAnswer();
    } else if (e.key === 'Backspace') {
      M1.answerBuf = M1.answerBuf.slice(0, -1);
      renderAnswerSlot();
    } else if (e.key === 'Escape') {
      m1CancelInput();
    }
  };
  window.addEventListener('keydown', onWinKey);

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
  m1InitPriorityOptions();
  m1InitSelect(presets);
  m1LoadExpression(presets[0].expr);

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
    window.removeEventListener('keydown', onWinKey);
    disarmOutsideConfirm();
    keypad.hide();
    if (sheetMask) sheetMask.remove();
    if (activeTl) { activeTl.kill(); activeTl = null; }
    container.querySelectorAll('.b1-cell, .b1-inputrow, .b1-row, .b1-arcs path').forEach(el => gsap.killTweensOf(el));
    document.getElementById(STYLE_ID)?.remove();
    container.innerHTML = '';
  };
}
