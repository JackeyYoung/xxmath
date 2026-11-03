/* grades/grade3/modules/m9.js
   竖式运算（Brilliant 范式移植）
   ─────────────────────────────────────────────
   架构铁律：
   1. 拒绝全量重绘 —— 网格按题目建一次（buildOnce + 单元格注册表），
      之后所有变化只做"原地文字/档位更新"，绝不 innerHTML。
   2. 布局锁死 —— CSS Grid 轨道固定（design/tokens.js GRID），
      严禁用 transform 把上排数字挪到下排（会崩塌整个网格）；
      "落位"= 在余数行直接渲染新数字 + 自身 y:-20 砸下动画，
      源数字原地变灰占位，M9.broughtDown 防止重复动画。
   3. 纯函数分离 —— 除法逐步推导在 scoring/m9.js（divisionSteps / computeAnswerMap）。
   4. 状态驱动 —— 颜色由 (M9.waitingFor, M9.step, M9.filled, M9.broughtDown) 推导，
      动画结束（onComplete）才交还档位控制权。
   视觉参数全部来自 design/tokens.js，本文件零硬编码。
*/
import * as M9Score from '../scoring/m9.js';
import { getLifecycle, applyThemeVars, EASE, MOTION, GRID, STATUS, SURFACE } from '../design/tokens.js';
import { gsap } from '../design/motion.js';
import { COMBO } from '../../../core/ui/celebrate.js';
import { getEncouragement } from '../../../core/ui/encourage.js';
import { takeawayLoad } from '../../../core/takeaway.js';
import { registerActiveModule, unregisterActiveModule } from '../../../app/shell.js';
import { emitUI } from '../../../core/ui/bus-ui.js';
import { getVirtualKeypad } from '../../../core/ui/virtual-keypad.js';
import { ensureChromeStyle } from '../../../core/ui/brilliant-chrome.js';

export const meta = {
  title: '竖式运算',
  icon: '🔢',
  levels: [
    { id: 'add', name: '加法', icon: '➕' },
    { id: 'sub', name: '减法', icon: '➖' },
    { id: 'mul', name: '乘法', icon: '✖️' },
    { id: 'div', name: '除法', icon: '➗' },
  ]
};

/* ============ 样式（值全部来自 tokens；scoped 到 #m9display） ============ */
const STYLE_ID = 'b9-style';

function buildCss() {
  const G = GRID, S = STATUS;
  return `
#m9display .b9-root { --vc-gap: 4px; }
#m9display .vc-cell { transition: none; }
/* 答案槽：荧光绿细框、无底色、闪烁光标（输入由虚拟键盘认领，绝不弹原生键盘） */
#m9display .b9-slot { min-width: 40px; height: 44px; padding: 0 6px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1.5px solid ${S.ok}; border-radius: 8px; background: transparent;
  font-weight: 700; color: var(--b1-init); position: relative;
  box-shadow: 0 0 5px rgba(41,204,87,.22); }
#m9display .b9-slot:empty::before { content: '?'; opacity: .3; }
#m9display .b9-slot::after { content: ''; position: absolute; right: 5px; bottom: 8px;
  width: 2px; height: 55%; background: ${S.ok}; border-radius: 1px; animation: b9caret 1s steps(1) infinite; }
@keyframes b9caret { 50% { opacity: 0; } }
#m9display .b9-slot.b9-wrong { border-color: ${S.bad}; box-shadow: 0 0 7px rgba(239,68,68,.35); animation: b9shake .3s; }
@keyframes b9shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
#m9display .b9-colmark { box-shadow: inset 0 -3px 0 var(--b1-focus-ring); border-radius: 4px; }
#m9display .b9-placeholder { color: var(--b1-placeholder); font-size: 15px; padding: 18px 6px; text-align: center; }
`;
}

/* ============ 组件 ============ */
export default async function mount(container, ctx) {
  const tpl = document.getElementById('tpl-m9');
  if (!tpl) {
    console.error('找不到 tpl-m9 模板');
    return;
  }
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));

  const $ = sel => container.querySelector(sel);
  const display = $('#m9display');
  const aInput  = $('#m9a');
  const bInput  = $('#m9b');
  const opInput = $('#m9op');
  const stepBtn = $('#m9step');
  const resetBtn = $('#m9reset');
  const fbEl = $('#m9fb');
  const cardEl = container.querySelector('.b9-card');
  if (!display || !aInput || !bInput || !opInput) return;

  ensureChromeStyle();
  const keypad = getVirtualKeypad();

  // 样式注入 + 主题变量（跟随 <html data-theme>）
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = buildCss();
    document.head.appendChild(style);
  }
  let LC = getLifecycle();
  applyThemeVars(display, LC);
  const applySheetTheme = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    cardEl?.style.setProperty('--b1-sheet-bg', dark ? '#1e293b' : '#ffffff');
  };
  applySheetTheme();
  const themeObserver = new MutationObserver(() => {
    LC = getLifecycle();
    applyThemeVars(display, LC);
    applySheetTheme();
    m9Render();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  const M9 = {
    a: 348, b: 176, op: '+', step: -1, waitingFor: null, filled: {}, submitting: false,
    broughtDown: new Set(),   // ⭐ 已播过"落位"动画的步骤（防重绘重复动画）
  };

  const getAddSubMaxLen = () => M9Score.getAddSubMaxLen(M9.a, M9.b, M9.op);
  const computeAnswerMap = () => M9Score.computeAnswerMap({ a: M9.a, b: M9.b, op: M9.op });
  const m9GetMaxSteps = () => M9Score.getMaxSteps({ a: M9.a, b: M9.b, op: M9.op });
  const calcFinalResult = () => M9Score.calcFinalResult({ a: M9.a, b: M9.b, op: M9.op });
  const divisionSteps = () => M9Score.divisionSteps(M9.a, M9.b);

  let ANSWER = computeAnswerMap();

  /* ============ 网格注册表（build once） ============ */
  let grid = null;          // { kind, cells: Map(key→el), meta, slotKey }
  let slotEl = null;        // 当前等待格里的"答案槽"（绿细框，非 input）
  const M9_BUF_MAX = 4;

  function makeCell(key, row, col, cls = '') {
    const el = document.createElement('div');
    el.className = cls;
    el.dataset.m9key = key;
    if (row != null) el.style.gridRow = String(row);
    if (col != null) el.style.gridColumn = String(col);
    grid.cells.set(key, el);
    return el;
  }

  /* ---- 加减法网格 ---- */
  function buildAddSub() {
    const maxLen = getAddSubMaxLen();
    const root = document.createElement('div');
    root.className = 'vertical-calc b9-root';
    display.appendChild(root);

    const carryRow = document.createElement('div');
    carryRow.className = 'vc-row';
    const c0 = document.createElement('div'); c0.className = 'vc-cell carry'; carryRow.appendChild(c0);
    for (let i = 0; i < maxLen; i++) carryRow.appendChild(makeCell(`c-${i}`, null, null, 'vc-cell carry'));
    root.appendChild(carryRow);

    const aRow = document.createElement('div');
    aRow.className = 'vc-row';
    const aLead = document.createElement('div'); aLead.className = 'vc-cell'; aRow.appendChild(aLead);
    for (let i = 0; i < maxLen; i++) aRow.appendChild(makeCell(`a-${i}`, null, null, 'vc-cell'));
    root.appendChild(aRow);

    const bRow = document.createElement('div');
    bRow.className = 'vc-row';
    const opCell = document.createElement('div'); opCell.className = 'vc-cell op'; opCell.textContent = M9.op; bRow.appendChild(opCell);
    for (let i = 0; i < maxLen; i++) bRow.appendChild(makeCell(`b-${i}`, null, null, 'vc-cell'));
    root.appendChild(bRow);

    root.appendChild(Object.assign(document.createElement('div'), { className: 'vc-line' }));

    const rRow = document.createElement('div');
    rRow.className = 'vc-row';
    const rLead = document.createElement('div'); rLead.className = 'vc-cell'; rRow.appendChild(rLead);
    for (let i = 0; i < maxLen; i++) rRow.appendChild(makeCell(`r-${i}`, null, null, 'vc-cell'));
    root.appendChild(rRow);

    grid.meta = { maxLen };
  }

  /* ---- 乘法网格 ---- */
  function buildMul() {
    const displayCols = 4;
    const aLen = String(M9.a).length;
    const root = document.createElement('div');
    root.className = 'vertical-calc b9-root';
    display.appendChild(root);

    const carryRow = document.createElement('div');
    carryRow.className = 'vc-row';
    const cLead = document.createElement('div'); cLead.className = 'vc-cell'; carryRow.appendChild(cLead);
    for (let col = displayCols - 1; col >= 0; col--) carryRow.appendChild(makeCell(`c-${col}`, null, null, 'vc-cell carry'));
    root.appendChild(carryRow);

    const aRow = document.createElement('div');
    aRow.className = 'vc-row';
    const aLead = document.createElement('div'); aLead.className = 'vc-cell'; aRow.appendChild(aLead);
    for (let col = displayCols - 1; col >= 0; col--) aRow.appendChild(makeCell(`a-${col}`, null, null, 'vc-cell'));
    root.appendChild(aRow);

    const bRow = document.createElement('div');
    bRow.className = 'vc-row';
    const opCell = document.createElement('div'); opCell.className = 'vc-cell op'; opCell.textContent = '×'; bRow.appendChild(opCell);
    const pad1 = document.createElement('div'); pad1.className = 'vc-cell'; bRow.appendChild(pad1);
    const pad2 = document.createElement('div'); pad2.className = 'vc-cell'; bRow.appendChild(pad2);
    const pad3 = document.createElement('div'); pad3.className = 'vc-cell'; bRow.appendChild(pad3);
    const bCell = document.createElement('div'); bCell.className = 'vc-cell'; bCell.textContent = M9.b; bRow.appendChild(bCell);
    root.appendChild(bRow);

    root.appendChild(Object.assign(document.createElement('div'), { className: 'vc-line' }));

    const rRow = document.createElement('div');
    rRow.className = 'vc-row';
    const rLead = document.createElement('div'); rLead.className = 'vc-cell'; rRow.appendChild(rLead);
    for (let col = displayCols - 1; col >= 0; col--) rRow.appendChild(makeCell(`r-${col}`, null, null, 'vc-cell'));
    root.appendChild(rRow);

    grid.meta = { displayCols, aLen };
  }

  /* ---- 除法网格（二维 Grid，列轨道锁死） ---- */
  function buildDiv() {
    const steps = divisionSteps();
    const aStr = String(M9.a);
    const n = aStr.length;

    // 被除数 < 除数：无逐步过程，给占位说明
    if (!steps.length) {
      const ph = document.createElement('div');
      ph.className = 'b9-placeholder';
      ph.textContent = `${M9.a} ÷ ${M9.b} = 0 余 ${M9.a}（被除数比除数小，商是 0）`;
      display.appendChild(ph);
      grid.meta = { steps: [], n: 0 };
      return;
    }

    const root = document.createElement('div');
    root.className = 'vc-div-grid b9-root';
    root.style.gridTemplateColumns = `${GRID.labelW}px ${GRID.sepW}px repeat(${n}, ${GRID.digitW}px)`;
    root.style.gridAutoRows = `${GRID.rowH}px`;
    display.appendChild(root);

    // 行1：商
    steps.forEach((s, idx) => root.appendChild(makeCell(`q-${idx}`, 1, 2 + s.end + 1, 'vc-div-q')));
    // 行2：除号 | 分隔 | 被除数
    const divisorCell = root.appendChild(makeCell('divisor', 2, 1, 'vc-div-divisor'));
    divisorCell.textContent = M9.b;
    root.appendChild(makeCell('sep', 2, 2, 'vc-div-sep'));
    for (let i = 0; i < n; i++) {
      const dCell = root.appendChild(makeCell(`d-${i}`, 2, 3 + i));
      dCell.textContent = aStr[i];
    }
    // 每步：乘积行 / 减法线（一条跨列元素，跨度取乘积列——教科书式）/ 余数行 + 落位格
    // ⭐ 步骤组按进程展开：建格时全部隐藏（行高塌缩），进行到该步才显示——
    //    网格高度随计算过程增长，提示语不会被键盘遮挡
    let row = 3;
    grid.meta.stepCells = steps.map(() => []);
    grid.meta.stepShown = steps.map(() => false);
    const addStepCell = (idx, el) => { el.style.display = 'none'; grid.meta.stepCells[idx].push(el); };
    steps.forEach((s, idx) => {
      const prodDigits = String(s.prod).split('');
      const prodStartCol = 3 + s.end - (prodDigits.length - 1);
      prodDigits.forEach((_, i) => addStepCell(idx, root.appendChild(makeCell(`p-${idx}-${i}`, row, prodStartCol + i))));
      row++;
      const line = document.createElement('div');
      line.className = 'vc-div-line';
      line.dataset.m9key = `ln-${idx}`;
      line.style.gridRow = String(row);
      line.style.gridColumn = `${prodStartCol} / ${3 + s.end + 2}`;
      line.style.opacity = '0';
      grid.cells.set(`ln-${idx}`, line);
      addStepCell(idx, root.appendChild(line));
      row++;
      if (idx < steps.length - 1) {
        const remDigits = String(s.rem).split('');
        const remStartCol = 3 + s.end - (remDigits.length - 1);
        remDigits.forEach((_, i) => addStepCell(idx, root.appendChild(makeCell(`r-${idx}-${i}`, row, remStartCol + i))));
        // ⭐ 落位格：下一位被除数将"摘"到这里，与余数并排组成工作值
        if (s.end + 1 < n) addStepCell(idx, root.appendChild(makeCell(`bd-${idx}`, row, 3 + s.end + 1)));
        row++;
      }
    });
    // 末步余数（最终结果的一部分）——归入最后一步的展示组
    const last = steps[steps.length - 1];
    const finalDigits = String(last.rem).split('');
    const finalStartCol = 3 + last.end - (finalDigits.length - 1);
    const lastIdx = steps.length - 1;
    finalDigits.forEach((_, i) => addStepCell(lastIdx, root.appendChild(makeCell(`rf-${i}`, row, finalStartCol + i))));

    grid.meta = { steps, n, stepCells: grid.meta.stepCells ?? [], stepShown: grid.meta.stepShown ?? steps.map(() => false) };
  }

  /* ---- 重建（仅换题时允许） ---- */
  function rebuild() {
    unmountSlot();
    if (grid) grid.cells.forEach(el => gsap.killTweensOf(el));
    display.innerHTML = '';          // ⭐ 只有换新题才允许清空
    grid = { kind: null, cells: new Map(), meta: {}, slotKey: null };
    if (M9.op === '+' || M9.op === '−') { grid.kind = 'addsub'; buildAddSub(); }
    else if (M9.op === '×') { grid.kind = 'mul'; buildMul(); }
    else { grid.kind = 'div'; buildDiv(); }
    m9Render();
  }

  /* ============ 档位与文字（原地更新） ============ */
  function setTier(el, tier) {
    if (!el || el.dataset.b1Animating === '1') return;   // 动画中的格子不抢涂装
    const t = LC[tier];
    el.dataset.b1Tier = tier;
    el.style.color = t.color;
    el.style.opacity = t.opacity;
    el.style.background = t.bg || '';
    el.style.textShadow =
      tier === 'result' ? `0 0 14px ${STATUS.ok}80` :
      tier === 'focus'  ? `0 0 10px ${LC.focus.ring}` : '';
    return el;
  }

  function setCellText(el, text) {
    if (!el || el.dataset.b1Animating === '1') return;
    if (slotEl && el.contains(slotEl)) return;   // ⭐ 答案槽挂在这格里，不能清
    if (el.textContent !== text) el.textContent = text;
  }

  /* 当前等待填写的目标（waitingFor + step 共同判定 —— 唯一判定入口） */
  function currentTarget() {
    if (!M9.waitingFor) return null;   // ⭐ 不在等待态：没有目标（修复完成后残留绿框）
    const curStep = M9.step;
    if (grid.kind === 'addsub') {
      const curI = grid.meta.maxLen - 1 - curStep;
      if (M9.waitingFor === 'carry') {
        const K = (ANSWER[`carry-${curI + 1}`] && !M9.filled[`carry-${curI + 1}`]) ? curI + 1 : curI;
        // ⭐ 渲染映射：carry-K 显示在 c-(K-1) 格（写在左侧数字上方）——此前差一列
        return { key: `carry-${K}`, cellKey: `c-${K - 1}`, maxlength: 1 };
      }
      return { key: `result-${curI}`, cellKey: `r-${curI}`, maxlength: 1 };
    }
    if (grid.kind === 'mul') {
      if (M9.waitingFor === 'carry') return { key: `carry-${curStep + 1}`, cellKey: `c-${curStep + 1}`, maxlength: 1 };
      return { key: `result-${curStep}`, cellKey: `r-${curStep}`, maxlength: 1 };
    }
    // ÷
    const steps = grid.meta.steps;
    if (M9.waitingFor === 'quotient') return { key: `quotient-${curStep}`, cellKey: `q-${curStep}`, maxlength: 1 };
    if (M9.waitingFor === 'product') {
      const len = String(steps[curStep].prod).length;
      return { key: `product-${curStep}`, cellKey: `p-${curStep}-${len - 1}`, maxlength: 3 };
    }
    if (M9.waitingFor === 'remainder') {
      const len = String(steps[curStep].rem).length;
      const isFinal = curStep === steps.length - 1;
      return { key: `remainder-${curStep}`, cellKey: isFinal ? `rf-${len - 1}` : `r-${curStep}-${len - 1}`, maxlength: len };
    }
    return null;
  }

  /* 稳定档：闪光结束后这一格归属哪一档 */
  function steadyTierForKey(key) {
    if (key.startsWith('quotient')) return 'history';
    if (key.startsWith('remainder-') && isFinalRemainderKey(key)) return 'history';
    if (key.startsWith('result')) return 'history';
    return 'consumed';   // product / carry / 中间余数 → 被消耗
  }
  function isFinalRemainderKey(key) {
    if (grid.kind !== 'div') return false;
    const idx = Number(key.split('-')[1]);
    return idx === grid.meta.steps.length - 1;
  }

  /* 答案槽：绿细框非 input，键盘认领输入（光标为 CSS 动画） */
  function mountSlot() {
    const target = currentTarget();
    if (!target) { unmountSlot(); return null; }
    if (grid.slotKey === target.cellKey && slotEl) return slotEl;
    unmountSlot();
    const cell = grid.cells.get(target.cellKey);
    if (!cell) return null;
    const slot = document.createElement('span');
    slot.className = 'b9-slot';
    slot.dataset.m9slot = '1';
    cell.appendChild(slot);
    grid.slotKey = target.cellKey;
    slotEl = slot;
    return slot;
  }

  function unmountSlot() {
    if (slotEl) { gsap.killTweensOf(slotEl); slotEl.remove(); }
    slotEl = null;
    if (grid) grid.slotKey = null;
  }

  function renderSlot() {
    if (slotEl) slotEl.textContent = M9.answerBuf;
  }

  /* ---- 刷新（原地，无 innerHTML） ---- */
  function m9Render() {
    if (!grid) { rebuild(); return; }

    if (grid.kind === 'addsub') refreshAddSub();
    else if (grid.kind === 'mul') refreshMul();
    else refreshDiv();

    // 反馈文案
    if (M9.step < 0) {
      setFeedback('点击「下一步」，开始计算');
    } else if (M9.waitingFor) {
      const label = {
        carry: '✏️ 请填写进位/借位', result: '✏️ 请填写这一位的得数', quotient: '✏️ 请填写这一位的商', product: '✏️ 请填写乘积', remainder: '✏️ 请填写余数',
      }[M9.waitingFor] || '✏️ 请填写';
      setFeedback(label, '');
    } else if (M9.step >= m9GetMaxSteps()) {
      setFeedback(`🎉 算出来啦！${M9.a} ${M9.op} ${M9.b} = <b>${calcFinalResult()}</b>`, 'ok');
    } else {
      setFeedback(`✅ 已算到第 ${M9.step + 1} 步`, 'ok');
    }

    if (stepBtn) {
      stepBtn.disabled = !!M9.waitingFor;
      stepBtn.style.opacity = M9.waitingFor ? '.5' : '';
    }
  }

  function refreshAddSub() {
    const { maxLen } = grid.meta;
    const aStr = String(M9.a).padStart(maxLen, '0');
    const bStr = String(M9.b).padStart(maxLen, '0');
    const curI = M9.step >= 0 ? maxLen - 1 - M9.step : -1;
    const done = M9.step >= m9GetMaxSteps();   // 完成后撤掉列引导

    for (let i = 0; i < maxLen; i++) {
      // 进位：填过的 → 被消耗档
      const carryKey = `carry-${i + 1}`;
      const cEl = grid.cells.get(`c-${i}`);
      setCellText(cEl, M9.filled[carryKey] ?? '');
      setTier(cEl, M9.filled[carryKey] != null ? 'consumed' : 'init');
      // 被加数 / 加数：初始常量，绝不黄色；当前列给细下划线引导
      const aEl = grid.cells.get(`a-${i}`);
      setCellText(aEl, aStr[i] === '0' && i < maxLen - String(M9.a).length ? '' : aStr[i]);
      const bEl = grid.cells.get(`b-${i}`);
      setCellText(bEl, bStr[i] === '0' && i < maxLen - String(M9.b).length ? '' : bStr[i]);
      const isCurCol = i === curI && !done;
      [aEl, bEl].forEach(el => {
        setTier(el, 'init');
        el.classList.toggle('b9-colmark', isCurCol);
      });
      // 得数：填过 → 历史档
      const rEl = grid.cells.get(`r-${i}`);
      setCellText(rEl, M9.filled[`result-${i}`] ?? '');
      setTier(rEl, M9.filled[`result-${i}`] != null ? 'history' : 'init');
    }
    mountSlot();
  }

  function refreshMul() {
    const { displayCols, aLen } = grid.meta;
    const aRev = String(M9.a).split('').reverse();
    const curPos = M9.step;
    const done = M9.step >= m9GetMaxSteps();   // 完成后撤掉列引导

    for (let col = 0; col < displayCols; col++) {
      const carryKey = `carry-${col}`;
      const cEl = grid.cells.get(`c-${col}`);
      setCellText(cEl, M9.filled[carryKey] ?? '');
      setTier(cEl, M9.filled[carryKey] != null ? 'consumed' : 'init');

      const aEl = grid.cells.get(`a-${col}`);
      setCellText(aEl, col < aLen ? aRev[col] : '');
      setTier(aEl, 'init');
      aEl.classList.toggle('b9-colmark', col === curPos && curPos >= 0 && curPos < aLen && !done);

      const rEl = grid.cells.get(`r-${col}`);
      setCellText(rEl, M9.filled[`result-${col}`] ?? '');
      setTier(rEl, M9.filled[`result-${col}`] != null ? 'history' : 'init');
    }
    mountSlot();
  }

  function refreshDiv() {
    const { steps, n } = grid.meta;
    if (!steps.length) { unmountSlot(); return; }
    const curStep = M9.step;
    // ⭐ 整题完成的判定：最终余数已填（step >= maxSteps 在最后一步进行中就会成立，不能用）
    const done = M9.filled[`remainder-${steps.length - 1}`] != null;
    const target = currentTarget();

    // 被除数：初始常量（绝不黄色）；已被处理/摘走的 → 原地变灰占位
    let maxBrought = -1;
    M9.broughtDown.forEach(idx => { maxBrought = Math.max(maxBrought, steps[idx].end + 1); });
    const processedEdge = curStep > 0 ? steps[curStep - 1].end : -1;
    const consumedEdge = Math.max(processedEdge, maxBrought);
    const aStr = String(M9.a);
    for (let i = 0; i < n; i++) {
      const el = grid.cells.get(`d-${i}`);
      setCellText(el, aStr[i]);
      setTier(el, i <= consumedEdge ? 'consumed' : 'init');
    }

    // 商：填过 → 历史档（商属于"已产出的重要历史"）
    steps.forEach((s, idx) => {
      const el = grid.cells.get(`q-${idx}`);
      setCellText(el, M9.filled[`quotient-${idx}`] ?? '');
      setTier(el, M9.filled[`quotient-${idx}`] != null ? 'history' : 'init');
    });

    // ⭐ 步骤组展开：进行中/已完成的步骤可见，未开始的行高塌缩
    steps.forEach((s, idx) => {
      const visible = idx <= curStep;
      if (grid.meta.stepShown[idx] !== visible) {
        grid.meta.stepShown[idx] = visible;
        grid.meta.stepCells[idx].forEach(el => { el.style.display = visible ? '' : 'none'; });
      }
    });

    steps.forEach((s, idx) => {
      // 乘积：填过 → 被消耗档（减数）
      const prodDigits = String(s.prod).split('');
      prodDigits.forEach((_, i) => {
        const el = grid.cells.get(`p-${idx}-${i}`);
        setCellText(el, M9.filled[`product-${idx}`] != null ? prodDigits[i] : '');
        setTier(el, M9.filled[`product-${idx}`] != null ? 'consumed' : 'init');
      });

      // 减法线：乘积落位后浮现
      const ln = grid.cells.get(`ln-${idx}`);
      const show = M9.filled[`product-${idx}`] != null;
      if (show && ln.dataset.revealed !== '1') {
        ln.dataset.revealed = '1';
        gsap.to(ln, { opacity: 1, duration: 0.3, ease: EASE.entry });
      }

      // 中间余数行：正在供数的行（idx === curStep-1 且未完成）= 当前工作值 → 亮黄；
      // 一旦算出新余数（步骤完成）→ 立刻褪成极暗灰
      if (idx < steps.length - 1) {
        const remDigits = String(s.rem).split('');
        const filled = M9.filled[`remainder-${idx}`] != null;
        remDigits.forEach((_, i) => {
          const el = grid.cells.get(`r-${idx}-${i}`);
          setCellText(el, filled ? remDigits[i] : '');
          setTier(el, filled ? (idx === curStep - 1 && !done ? 'focus' : 'consumed') : 'init');
        });
        // 落位格：属于当前工作值 → 亮黄
        const bd = grid.cells.get(`bd-${idx}`);
        if (bd) {
          setCellText(bd, M9.broughtDown.has(idx) ? aStr[s.end + 1] : '');
          setTier(bd, M9.broughtDown.has(idx) ? (idx === curStep - 1 && !done ? 'focus' : 'consumed') : 'init');
        }
      }
    });

    // 末步余数（最终结果的一部分）→ 历史档
    const last = steps[steps.length - 1];
    const finalDigits = String(last.rem).split('');
    const finalFilled = M9.filled[`remainder-${steps.length - 1}`];
    finalDigits.forEach((_, i) => {
      const el = grid.cells.get(`rf-${i}`);
      setCellText(el, finalFilled != null ? finalDigits[i] : '');
      setTier(el, finalFilled != null ? 'history' : 'init');
    });

    // 输入框：只有 waitingFor 时挂载（绿细框，绝无杂乱底色）
    if (M9.waitingFor && target) mountSlot();
    else unmountSlot();
  }

  /* ============ 动画 ============ */

  /* 答对：绿框消失 → 数字以结果档闪光落位 → 平滑过渡到稳定档 */
  function flashFilled(cell, raw, key) {
    unmountSlot();
    cell.textContent = raw;
    cell.dataset.b1Animating = '1';
    const t = LC.result;
    cell.style.color = t.color;
    cell.style.opacity = 1;
    cell.style.textShadow = `0 0 14px ${STATUS.ok}80`;
    gsap.fromTo(cell, { scale: 0.55, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.32, ease: EASE.land });
    const steady = steadyTierForKey(key);
    const st = LC[steady];
    gsap.to(cell, {
      color: st.color, opacity: st.opacity, duration: 0.35,
      delay: MOTION.holdGlow + 0.25,
      onComplete: () => {
        cell.dataset.b1Animating = '';
        cell.style.textShadow = '';
        m9Render();
      },
    });
  }

  /* 落位（Bring Down）：在余数行直接渲染下一位被除数，y:-20 砸下；
     源数字原地变灰占位。M9.broughtDown 先登记，重绘绝不重复动画。 */
  function bringDown(idx) {
    const { steps, n } = grid.meta;
    if (idx < 0 || idx >= steps.length - 1) return;
    if (M9.broughtDown.has(idx)) return;
    M9.broughtDown.add(idx);                     // ⭐ 先登记，防重复动画
    const col = steps[idx].end + 1;
    if (col >= n) return;
    const cell = grid.cells.get(`bd-${idx}`);
    const src = grid.cells.get(`d-${col}`);
    if (!cell) return;
    cell.textContent = String(M9.a)[col];
    cell.dataset.b1Animating = '1';
    const t = LC.result;
    cell.style.color = t.color;
    cell.style.textShadow = `0 0 14px ${STATUS.ok}80`;
    gsap.fromTo(cell, { y: MOTION.dropYResult, opacity: 0 }, {
      y: 0, opacity: 1, duration: 0.5, ease: EASE.land,
      onComplete: () => {
        cell.dataset.b1Animating = '';
        cell.style.textShadow = '';
        m9Render();   // 落位完成 → 归入当前工作值（亮黄）
      },
    });
    // 源数字原地变灰占位
    if (src) {
      src.dataset.b1Animating = '1';
      const c = LC.consumed;
      gsap.to(src, { color: c.color, opacity: c.opacity, duration: 0.35, ease: EASE.entry,
        onComplete: () => { src.dataset.b1Animating = ''; } });
    }
  }

  /* ============ 反馈 / 交互（逻辑与旧版一致） ============ */
  function hasCarry(a, b, op) {
    const sa = String(a).split('').reverse().map(Number);
    const sb = String(b).split('').reverse().map(Number);
    const len = Math.max(sa.length, sb.length);
    let carry = 0;
    for (let i = 0; i < len; i++) {
      const da = sa[i] || 0, db = sb[i] || 0;
      if (op === '+') {
        const sum = da + db + carry;
        if (sum >= 10) return true;
        carry = Math.floor(sum / 10);
      } else {
        const diff = da - db - carry;
        if (diff < 0) return true;
        carry = diff < 0 ? 1 : 0;
      }
    }
    return false;
  }

  function randomProblemByOp(op) {
    const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    let a, b;
    if (op === '+') {
      do { a = rnd(100, 999); b = rnd(100, 999); } while (!hasCarry(a, b, '+'));
    } else if (op === '−') {
      do { a = rnd(200, 999); b = rnd(100, a - 1); } while (!hasCarry(a, b, '−'));
    } else if (op === '×') {
      do { a = rnd(12, 99); b = rnd(2, 9); } while (a * b < 100 && rnd(0, 1) === 0);
    } else {
      do { b = rnd(2, 9); const q = rnd(2, Math.floor(999 / b)); a = q * b + rnd(0, b - 1); } while (a > 999 || a < b * 2);
    }
    return { a, b };
  }

  function isMulDiv() { return M9.op === '×' || M9.op === '÷'; }

  function setFeedback(html, type) {
    if (!fbEl) return;
    fbEl.innerHTML = html;
    fbEl.className = 'feedback' + (type ? ' ' + type : '');
    if (type === 'ok' || type === 'error') {
      const isOk = type === 'ok';
      ctx.showThumbBar({
        text: html.replace(/<[^>]+>/g, '').replace(/^[✓❌🎉]\s*/, ''),
        ok: isOk,
        onNext: () => {
          if (M9.step >= m9GetMaxSteps()) {
            $('#m9random')?.click();
          } else {
            $('#m9step')?.click();
          }
        }
      });
    }
  }

  /* ---- 除法完成（submitInline 与 prompt 共用，修掉旧版 final 未定义的雷） ---- */
  function finishDivision() {
    M9.waitingFor = null;
    disarmOutsideConfirm();
    keypad.hide();
    m9Render();
    setFeedback(`🎉 算出来啦！${M9.a} ${M9.op} ${M9.b} = <b>${calcFinalResult()}</b>`, 'ok');
    emitUI('CORRECT', { moduleId: 'm9' });
    const final = calcFinalResult();
    ctx.data.historyAdd({
      problemText: `${M9.a} ${M9.op} ${M9.b}`, problemSource: 'm9', moduleId: 'm9',
      studentSteps: Object.keys(M9.filled).map(k => ({ rel: k, sub: '', res: M9.filled[k] })),
      studentAnswer: String(final), isCorrect: true, correctAnswer: String(final), aiFeedback: null,
    });
    const mrec = ctx.data.masteryRecord(`${M9.a} ${M9.op} ${M9.b}`, true);
    if (mrec && mrec.state === 'mastered') {
      ctx.toast('🏆 这道题你掌握了！', 'success');
      setTimeout(() => ctx.showMasteryCard({ problemText: `${M9.a} ${M9.op} ${M9.b}`, correctAnswer: String(calcFinalResult()), takeaway: takeawayLoad(`${M9.a} ${M9.op} ${M9.b}`) }), 800);
    }
  }

  /* ---- 估算（先估算再动笔） ---- */
  const M9_ESTIMATE = { passed: false };

  function m9ShowEstimateBox() {
    const box = $('#m9EstimateBox');
    const opts = $('#m9EstimateOptions');
    const fb = $('#m9EstimateFeedback');
    if (!box || !opts) return;

    const a = M9.a, b = M9.b, op = M9.op;
    let exact;
    if (op === '+') exact = a + b;
    else if (op === '−') exact = a - b;
    else if (op === '×') exact = a * b;
    else exact = Math.floor(a / b);

    const roundTo = 100;
    const base = Math.floor(exact / roundTo) * roundTo;
    const options = [
      { min: base - 100, max: base, label: `${base - 100}~${base}` },
      { min: base, max: base + 100, label: `${base}~${base + 100}` },
      { min: base + 100, max: base + 200, label: `${base + 100}~${base + 200}` },
    ];
    options.sort(() => Math.random() - 0.5);
    const correctIdx = options.findIndex(o => exact >= o.min && exact <= o.max);

    opts.innerHTML = options.map((o, i) => `<button class="priority-opt" data-idx="${i}">${o.label}</button>`).join('');
    fb.textContent = ''; fb.className = 'priority-feedback';

    opts.querySelectorAll('.priority-opt').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        const isCorrect = (i === correctIdx);
        opts.querySelectorAll('.priority-opt').forEach(b => b.classList.remove('chosen', 'wrong', 'correct'));
        btn.classList.add('chosen', isCorrect ? 'correct' : 'wrong');

        if (isCorrect) {
          fb.textContent = `✓ 对！精确结果是 ${exact}。开始一步步计算吧！`;
          fb.className = 'priority-feedback ok';
          M9_ESTIMATE.passed = true;
          setTimeout(() => {
            box.style.display = 'none';
            m9Render();
            setFeedback('✅ 估算正确！「下一步」开始计算。', 'ok');
            M9.step = 0;
            m9PromptCurrentStep();
          }, 800);
        } else {
          fb.textContent = `❌ 再想想——精确结果在 ${options[correctIdx].label} 之间`;
          fb.className = 'priority-feedback error';
          setTimeout(() => btn.classList.remove('chosen', 'wrong'), 1200);
        }
      });
    });
    box.style.display = 'block';
  }

  function m9HideEstimateBox() {
    const box = $('#m9EstimateBox');
    if (box) box.style.display = 'none';
  }

  function m9NextStep() {
    if (M9.waitingFor) { setFeedback('请先填写当前格子哦', 'error'); return; }
    if (M9.step === -1 && !M9_ESTIMATE.passed) { m9ShowEstimateBox(); return; }
    const maxSteps = m9GetMaxSteps();
    if (M9.step >= maxSteps) return;
    M9.step++;
    m9PromptCurrentStep();
  }

  function m9PromptCurrentStep() {
    _promptInner();
    m9Render();
    // ⭐ 场景驱动：等待填写 → 键盘弹出（持久）；否则收起
    if (M9.waitingFor) {
      M9.answerBuf = '';        // ⭐ 新目标新缓冲（否则上一格的数字会串进来）
      renderSlot();
      keypad.show({
        onDigit: (d) => {
          if (!M9.waitingFor || M9.submitting) return;
          const t = currentTarget();
          if (!t || M9.answerBuf.length >= t.maxlength || M9.answerBuf.length >= M9_BUF_MAX) return;
          M9.answerBuf += d;
          renderSlot();
        },
        onConfirm: () => submitBuffer(),
      });
      armOutsideConfirm();
      // ⭐ 提示语滚到键盘上沿之上（长除法网格很深，下边缘不被遮挡）
      keypad.ensureVisible($('#m9fb'));
    } else {
      disarmOutsideConfirm();
    }
  }

  function _promptInner() {
    const curStep = M9.step;
    const op = M9.op;

    if (op === '+' || op === '−') {
      const curI = getAddSubMaxLen() - 1 - curStep;
      const prevCarryKey = `carry-${curI + 1}`;
      if (ANSWER[prevCarryKey] && !M9.filled[prevCarryKey]) { M9.waitingFor = 'carry'; return; }
      const curCarryKey = `carry-${curI}`;
      if (ANSWER[curCarryKey] && !M9.filled[curCarryKey]) { M9.waitingFor = 'carry'; return; }
      const resultKey = `result-${curI}`;
      if (!M9.filled[resultKey]) { M9.waitingFor = 'result'; return; }
      M9.waitingFor = null; return;
    }

    if (op === '×') {
      const carryKey = `carry-${curStep + 1}`;
      if (ANSWER[carryKey] && !M9.filled[carryKey]) { M9.waitingFor = 'carry'; return; }
      M9.waitingFor = 'result'; return;
    }

    if (op === '÷') {
      // ⭐ 落位动画：上一步完成后，把下一位被除数"摘"进余数行
      const steps = grid.meta.steps;
      const prevIdx = curStep - 1;
      if (prevIdx >= 0 && prevIdx < steps.length - 1 && !M9.broughtDown.has(prevIdx)) {
        bringDown(prevIdx);
      }
      const qKey = `quotient-${curStep}`;
      if (!M9.filled[qKey]) { M9.waitingFor = 'quotient'; return; }
      const pKey = `product-${curStep}`;
      if (!M9.filled[pKey]) { M9.waitingFor = 'product'; return; }
      const rKey = `remainder-${curStep}`;
      if (!M9.filled[rKey]) { M9.waitingFor = 'remainder'; return; }

      M9.step++;
      if (M9.step > m9GetMaxSteps()) {
        M9.step--;
        finishDivision();
        return;
      }
      _promptInner();
      return;
    }
  }

  function isStepComplete() {
    const curStep = M9.step;
    const op = M9.op;

    if (op === '+' || op === '−') {
      const curI = getAddSubMaxLen() - 1 - curStep;
      if (ANSWER[`carry-${curI + 1}`] && !M9.filled[`carry-${curI + 1}`]) return false;
      if (!M9.filled[`result-${curI}`]) return false;
      if (ANSWER[`carry-${curI}`] && !M9.filled[`carry-${curI}`]) return false;
      return true;
    }
    if (op === '×') {
      if (ANSWER[`carry-${curStep + 1}`] && !M9.filled[`carry-${curStep + 1}`]) return false;
      if (!M9.filled[`result-${curStep}`]) return false;
      return true;
    }
    if (op === '÷') {
      if (!M9.filled[`quotient-${curStep}`]) return false;
      if (!M9.filled[`product-${curStep}`]) return false;
      if (!M9.filled[`remainder-${curStep}`]) return false;
      return true;
    }
    return true;
  }

  function highlightM9WrongHint() {
    container.querySelectorAll('#m9display .b9-colmark').forEach(el => {
      el.classList.add('explore-highlight');
      setTimeout(() => el.classList.remove('explore-highlight'), 1200);
    });
    if (M9.op === '÷') {
      const divisor = grid?.cells.get('divisor');
      if (divisor) { divisor.classList.add('explore-highlight'); setTimeout(() => divisor.classList.remove('explore-highlight'), 1200); }
    }
  }

  function submitBuffer() {
    if (M9.submitting || !M9.waitingFor) return;
    const raw = M9.answerBuf.trim();
    if (!raw) return;

    M9.submitting = true;
    const target = currentTarget();
    if (!target) { M9.submitting = false; return; }
    const { key } = target;
    const expected = ANSWER[key];

    if (String(raw) === String(expected)) {
      M9.filled[key] = raw;
      M9.waitingFor = null;
      setFeedback(getEncouragement('m9', COMBO.count), 'ok');
      // ⭐ Brilliant 反馈：绿框消失，数字闪光落位，随后平滑过渡到稳定档（键盘保持原位）
      const cell = slotEl?.parentElement || grid.cells.get(target.cellKey);
      flashFilled(cell, raw, key);

      setTimeout(() => {
        M9.submitting = false;
        if (isStepComplete()) {
          M9.step++;
          if (M9.step > m9GetMaxSteps()) {
            M9.step--;
            // ⭐ 终局：键盘滑下
            disarmOutsideConfirm();
            keypad.hide();
            if (M9.op === '÷') finishDivision();
            else {
              M9.waitingFor = null; m9Render();
              setFeedback(`🎉 算出来啦！${M9.a} ${M9.op} ${M9.b} = <b>${calcFinalResult()}</b>`, 'ok');
              emitUI('CORRECT', { moduleId: 'm9' });
              const final = calcFinalResult();
              ctx.data.historyAdd({
                problemText: `${M9.a} ${M9.op} ${M9.b}`, problemSource: 'm9', moduleId: 'm9',
                studentSteps: Object.keys(M9.filled).map(k => ({ rel: k, sub: '', res: M9.filled[k] })),
                studentAnswer: String(final), isCorrect: true, correctAnswer: String(final), aiFeedback: null,
              });
              const mrec = ctx.data.masteryRecord(`${M9.a} ${M9.op} ${M9.b}`, true);
              if (mrec && mrec.state === 'mastered') {
                ctx.toast('🏆 这道题你掌握了！', 'success');
                setTimeout(() => ctx.showMasteryCard({ problemText: `${M9.a} ${M9.op} ${M9.b}`, correctAnswer: String(calcFinalResult()), takeaway: takeawayLoad(`${M9.a} ${M9.op} ${M9.b}`) }), 800);
              }
            }
            return;
          }
          m9Render(); m9PromptCurrentStep();
        } else {
          m9Render(); m9PromptCurrentStep();
        }
      }, 700);
    } else {
      // 答错：槽抖动 + 清空，键盘保持原位
      if (slotEl) {
        slotEl.classList.add('b9-wrong');
        setTimeout(() => slotEl?.classList.remove('b9-wrong'), 400);
      }
      setFeedback('❌ 再想想', 'error');
      emitUI('WRONG', { moduleId: 'm9' });
      M9.answerBuf = '';
      setTimeout(() => renderSlot(), 420);
      M9.submitting = false;
      highlightM9WrongHint();
    }
  }

  function m9Reset() {
    ctx.ui?.hideThumbBar?.();   // ⭐ 契约化：保留原 window.__shell?.hideThumbBar 的可选链守卫语义
    document.getElementById('thumbBar')?.classList.remove('show', 'ok', 'err');

    let a = +aInput.value, b = +bInput.value;
    if (!Number.isFinite(a)) a = 0; if (!Number.isFinite(b)) b = 0;
    a = Math.floor(a); b = Math.floor(b);
    M9.a = Math.max(0, Math.min(999, a)); M9.op = opInput.value;

    if (isMulDiv()) { b = Math.max(1, Math.min(9, b)); bInput.max = 9; bInput.min = 1; }
    else { b = Math.max(0, Math.min(999, b)); bInput.max = 999; bInput.min = 0; }
    M9.b = b;

    M9.step = -1; M9.waitingFor = null; M9.filled = {};
    M9.broughtDown = new Set();
    M9.submitting = false;
    M9.answerBuf = '';
    disarmOutsideConfirm();
    keypad.hide();
    closeSheet();
    ANSWER = computeAnswerMap(); M9_ESTIMATE.passed = false; m9HideEstimateBox();

    if (M9.op === '÷' && M9.a < M9.b) {
      aInput.value = M9.a; bInput.value = M9.b;
      rebuild();
      setFeedback(`💡 ${M9.a} ÷ ${M9.b} = 0 余 ${M9.a}（被除数比除数小）`, 'ok');
      return;
    }

    aInput.value = M9.a; bInput.value = M9.b;
    setFeedback('点击「下一步」，开始计算');
    rebuild();
  }

  /* ---- 换题抽屉 ---- */
  const sheet = $('#m9sheet');
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
  $('#m9gear')?.addEventListener('click', () => {
    if (sheet?.classList.contains('open')) closeSheet();
    else openSheet();
  });
  $('#m9random')?.addEventListener('click', closeSheet);
  $('#m9reset')?.addEventListener('click', closeSheet);

  /* ---- 点键盘以外区域 = 自动确认（沿用原失焦提交习惯） ---- */
  let outsideConfirmArmed = false;
  function armOutsideConfirm() {
    if (outsideConfirmArmed) return;
    outsideConfirmArmed = true;
    document.addEventListener('pointerdown', onOutsidePointer, true);
  }
  function disarmOutsideConfirm() {
    outsideConfirmArmed = false;
    document.removeEventListener('pointerdown', onOutsidePointer, true);
  }
  function onOutsidePointer(e) {
    if (e.target.closest?.('.vkp')) return;
    // ⭐ 点按钮/输入框/抽屉等交互控件时不触发"点外确认"，交给控件自己的动作；
    //    否则点「随机/↻/⚙」会先 submitBuffer，其 700ms 后的延时 prompt 会把键盘再弹回来
    if (e.target.closest?.('button, input, select, .b1-sheet, .b1-mask')) return;
    if (M9.answerBuf.trim()) submitBuffer();
  }

  /* ---- 桌面物理键盘 ---- */
  const onWinKey = (e) => {
    if (!M9.waitingFor || M9.submitting) return;
    if (/^[0-9]$/.test(e.key)) {
      const t = currentTarget();
      const max = Math.min(t?.maxlength ?? 1, M9_BUF_MAX);
      if (M9.answerBuf.length < max) { M9.answerBuf += e.key; renderSlot(); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submitBuffer();
    } else if (e.key === 'Backspace') {
      M9.answerBuf = M9.answerBuf.slice(0, -1);
      renderSlot();
    }
  };
  window.addEventListener('keydown', onWinKey);

  const handleM9Random = () => {
    const level = localStorage.getItem('grade3_m9_level') || null;
    let op;
    if (level === 'add') op = '+';
    else if (level === 'sub') op = '−';
    else if (level === 'mul') op = '×';
    else if (level === 'div') op = '÷';
    else op = ['+', '−', '×', '÷'][Math.floor(Math.random() * 4)];

    const { a, b } = randomProblemByOp(op);
    aInput.value = a; bInput.value = b; opInput.value = op;
    aInput.dispatchEvent(new Event('input', { bubbles: true }));
    bInput.dispatchEvent(new Event('input', { bubbles: true }));
    opInput.dispatchEvent(new Event('change', { bubbles: true }));
  };

  $('#m9random')?.addEventListener('click', handleM9Random);
  stepBtn.addEventListener('click', m9NextStep);
  resetBtn.addEventListener('click', m9Reset);
  aInput.addEventListener('input', m9Reset);
  bInput.addEventListener('input', m9Reset);
  opInput.addEventListener('change', m9Reset);

  m9Reset();

  ctx.registerLevelHandler('m9', (levelId) => {
    if (!aInput || !bInput || !opInput) return;

    let op = '+';
    if (levelId === 'sub') op = '−';
    else if (levelId === 'mul') op = '×';
    else if (levelId === 'div') op = '÷';

    const { a, b } = randomProblemByOp(op);
    aInput.value = a;
    bInput.value = b;
    opInput.value = op;
    m9Reset();
  });

  registerActiveModule('m9', {
    redo: (text) => {
      const m = text.match(/^(\d+)\s*([+\-−×÷])\s*(\d+)$/);
      if (m) {
        aInput.value = m[1]; opInput.value = m[2]; bInput.value = m[3];
        m9Reset();
      }
    }
  });

  return () => {
    unregisterActiveModule('m9');
    themeObserver.disconnect();
    window.removeEventListener('keydown', onWinKey);
    disarmOutsideConfirm();
    keypad.hide();
    if (sheetMask) sheetMask.remove();
    unmountSlot();
    if (grid) grid.cells.forEach(el => gsap.killTweensOf(el));
    document.getElementById(STYLE_ID)?.remove();
    container.innerHTML = '';
  };
}
