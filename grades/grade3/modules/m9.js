/* grades/grade3/modules/m9.js
   竖式运算（Brilliant 范式移植）
   ─────────────────────────────────────────────
   架构铁律：
   1. 拒绝全量重绘 —— 网格按题目建一次（buildOnce + 单元格注册表），
      之后所有变化只做"原地文字/档位更新"，绝不 innerHTML。
   2. 布局锁死 —— CSS Grid 轨道固定（design/tokens.js GRID），
      严禁用 transform 把上排数字挪到下排（会崩塌整个网格）；
      "落位"= FLIP：目标格在余数行原位渲染，动画用瞬时 transform 反向偏移
      （起点钉在源格上 → 斜向飞落回正），不触碰 grid 轨道布局；
      源数字原地变灰占位，M9.broughtDown 防止重复动画。
      填格（进位/乘积/商/余数）= 单纯书写 → 只做 scale 脉冲，绝不砸落。
   3. 纯函数分离 —— 除法逐步推导在 scoring/m9.js（divisionSteps / computeAnswerMap）。
   4. 状态驱动 —— 颜色由 (M9.waitingFor, M9.step, M9.filled, M9.broughtDown) 推导，
      动画结束（onComplete）才交还档位控制权。
   视觉参数全部来自 design/tokens.js，本文件零硬编码。
*/
import * as M9Score from '../scoring/m9.js';
import { getLifecycle, applyThemeVars, EASE, MOTION, GRID, STATUS, SURFACE, SOFT_GLOW, ensureMathTypoStyle } from '../design/tokens.js';
import { gsap } from '../design/motion.js';
import { takeawayLoad } from '../../../core/takeaway.js';
import { registerActiveModule, unregisterActiveModule } from '../../../app/shell.js';
import { emitUI } from '../../../core/ui/bus-ui.js';
import { getVirtualKeypad } from '../../../core/ui/virtual-keypad.js';
import { getAji } from '../../../core/ui/aji.js';
import { ensureChromeStyle } from '../../../core/ui/brilliant-chrome.js';
import {
  settle as learnerSettle, pickProblem, tagsForVertical,
} from '../../../core/learner.js';

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
/* ⭐ 数学排版统一（TYPOGRAPHY 单一数据源，经 :root 变量）：
   #m9display 作用域覆盖 index.html 遗留的 monospace/700；零 DOM/class 改动，不触碰网格几何。
   字号维持各自语义层级（数字 38 / 进位 22 / 商位行同 38），仅归一 family/weight/variant。 */
#m9display .vc-cell, #m9display .vc-div-grid > div {
  font-family: var(--math-font-family, sans-serif);
  font-variant-numeric: var(--math-font-variant-numeric, tabular-nums); }
#m9display .vc-cell { font-weight: var(--math-font-weight, 800); }
#m9display .vc-div-grid > div { font-weight: var(--math-font-weight, 800); }
/* 运算符与 .math-op 同规：0.95 倍 + 1px 光学下移（覆盖遗留 32px，与 m1 的 38×0.95 完全一致）。
   ⭐ 不能写 0.95em —— em 参照父元素字号（此处父行无 38px），必须显式 calc */
#m9display .vc-cell.op { font-size: calc(var(--math-size-l, 38px) * 0.95); transform: translateY(1px); }
/* 答案槽：荧光绿细框、无底色、闪烁光标（输入由虚拟键盘认领，绝不弹原生键盘） */
#m9display .b9-slot { min-width: 40px; height: 44px; padding: 0 6px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1.5px solid ${S.ok}; border-radius: 8px; background: transparent;
  font-family: var(--math-font-family, sans-serif); font-weight: var(--math-font-weight, 800);
  font-variant-numeric: var(--math-font-variant-numeric, tabular-nums);
  color: var(--b1-init); position: relative;
  box-shadow: 0 0 5px rgba(41,204,87,.22); }
#m9display .b9-slot:empty::before { content: '?'; opacity: .3; }
#m9display .b9-slot::after { content: ''; position: absolute; right: 5px; bottom: 8px;
  width: 2px; height: 55%; background: ${S.ok}; border-radius: 1px; animation: b9caret 1s steps(1) infinite; }
@keyframes b9caret { 50% { opacity: 0; } }
/* ⭐ 心流克制（答错静默：无红、无抖、无弹窗、不清数字）。
   全模块唯一的"指引色"：求助 / 终局静置 45 秒后，用主题暖黄 15% 微光（SOFT_GLOW）
   轻照出错格 —— inset 铺满 + 柔角，绝不出现红色 */
#m9display .b9-glow { box-shadow: inset 0 0 0 9999px ${SOFT_GLOW}; border-radius: 8px; transition: box-shadow .8s ease; }
#m9display .b9-editable { cursor: pointer; }
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
  const fbEl = $('#m9fb');
  const cardEl = container.querySelector('.b9-card');
  /* ⭐ 换题抽屉（#m9a/#m9b/#m9op）与右上角 ↻/⚙ 已整体移除。
     原先抽屉里的三个 input **是状态载体**（m9Reset 直接读 +aInput.value），
     现在状态收敛到 M9.a / M9.b / M9.op 本身——UI 只是它的投影，不再是唯一真相。 */
  if (!display) return;

  ensureChromeStyle();
  ensureMathTypoStyle();   // ⭐ 全局数学排版（TYPOGRAPHY，幂等）
  const aji = getAji();    // ⭐ Aji 交互助教（双引擎；主动式浮条 = 唯一求助入口）
  const keypad = getVirtualKeypad();

  /* ---------- 算式舞台视觉居中 + 键盘避让（与 m1 同规） ─────────────────────
     标题下线后，主舞台（#m9display）占据「页头以下 ~ 软键盘以上」可视带的正中。
     平移对象 = 舞台(#m9display) + 其下反馈行：同进退互不遮挡，卡片内 fixed 抽屉不受影响。 ---------- */
  let m9StageCy = 0;   // 当前平移量（布局位置 = rect.top - cy）
  function m9CenterStage() {
    if (!cardEl || !display) return;
    // ⭐ Aji 聊天舱展开时让位管线归它接管（两套 transform 同写 y 会互相覆盖）
    if (aji.stageOwned('m9')) return;
    const vv = window.visualViewport;
    const kb = vv ? Math.max(0, window.innerHeight - vv.height) : 0;
    const bandTop = 64;                                   // 页头高度
    const bandBottom = window.innerHeight - kb - 12;
    // ⭐ 布局位置用 offsetTop 链计算（对 transform 免疫）——rect.top 在 gsap 补间中途读数会漂移
    let el = display, docTop = 0;
    while (el && el !== document.body) { docTop += el.offsetTop; el = el.offsetParent; }
    const stageTop = docTop - (window.scrollY || 0);
    const stageH = display.offsetHeight || GRID.rowH * 2;
    const targetTop = Math.max(bandTop, (bandTop + bandBottom) / 2 - stageH / 2);
    const delta = Math.round(targetTop - stageTop);
    if (delta === m9StageCy) return;
    m9StageCy = delta;
    gsap.to([display, fbEl].filter(Boolean), { y: delta, duration: 0.3, ease: EASE.entry, overwrite: 'auto' });
  }
  const m9OnStageReflow = () => m9CenterStage();
  window.visualViewport?.addEventListener('resize', m9OnStageReflow);
  window.visualViewport?.addEventListener('scroll', m9OnStageReflow);
  window.addEventListener('resize', m9OnStageReflow);
  // ⭐ 把舞台交给 Aji：聊天舱展开时在「页头 ~ 舱体上缘」带内居中，收起时交还 m9CenterStage
  //    ⚠️ 交还前必须重置 m9StageCy 记忆——Aji 在背后移动过元素，
  //    模块若仍认为"已居中"会 early-return，算式永远卡在上移位置收不回来。
  aji.registerStage({
    moduleId: 'm9', el: display, extra: [fbEl], gap: 20,
    onRest: () => { m9StageCy = NaN; m9CenterStage(); },
  });


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
    history: {},              // ⭐ 探究式放行：key → { expected, actual, isCorrect, cellKey, step, type }
    recheck: null,            // ⭐ 终局回溯：{ firstWrongKey }——放弃时才结算为错
    tags: [],                 // ⭐ 当前题目的结构化标签（记忆引擎用）
    usedHint: false,          // ⭐ 本题是否用过 Aji 提示
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
    root.style.setProperty('--vc-div-w', `${n * GRID.digitW}px`);   // 厂字"一横"跨被除数的宽度
    display.appendChild(root);

    // 行1：商
    steps.forEach((s, idx) => root.appendChild(makeCell(`q-${idx}`, 1, 2 + s.end + 1, 'vc-div-q')));
    // 行2：除号 | 分隔 | 被除数
    const divisorCell = root.appendChild(makeCell('divisor', 2, 1, 'vc-div-divisor'));
    divisorCell.textContent = M9.b;
    const sepCell = root.appendChild(makeCell('sep', 2, 2, 'vc-div-sep'));
    // 厂字"撇"(丿)：绝对定位 SVG 路径，从被除数左上角向左下带弧度（控制点偏左形成弧）
    const pieSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    pieSvg.setAttribute('class', 'vc-div-pie');
    pieSvg.setAttribute('viewBox', `0 0 ${GRID.sepW} ${GRID.rowH}`);
    pieSvg.setAttribute('preserveAspectRatio', 'none');
    pieSvg.setAttribute('aria-hidden', 'true');
    const piePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const px0 = GRID.sepW, pcx = Math.round(GRID.sepW * 0.33), pcy = Math.round(GRID.rowH * 0.44), py1 = Math.round(GRID.rowH * 0.80);
    piePath.setAttribute('d', `M ${px0} 0 Q ${pcx} ${pcy} 0 ${py1}`);
    piePath.setAttribute('fill', 'none');
    piePath.setAttribute('stroke', 'currentColor');
    piePath.setAttribute('stroke-width', '2');
    piePath.setAttribute('stroke-linecap', 'round');
    pieSvg.appendChild(piePath);
    sepCell.appendChild(pieSvg);
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
      setFeedback('点击竖式中的待填格，开始计算 👆');
    } else if (M9.waitingFor) {
      if (M9.recheck) {
        // ⭐ 终局回溯：柔声提示（无 error 档 → 无红、无缩略条），任何重绘都保持这句话
        setFeedback(RECHECK_HINT);
      } else {
        const label = {
          carry: '✏️ 请填写进位/借位', result: '✏️ 请填写这一位的得数', quotient: '✏️ 请填写这一位的商', product: '✏️ 请填写乘积', remainder: '✏️ 请填写余数',
        }[M9.waitingFor] || '✏️ 请填写';
        setFeedback(label, '');
      }
    } else if (M9.step >= m9GetMaxSteps()) {
      // ⭐ 终局回溯态：保持柔声提示，绝不被"算出来啦"覆盖
      if (M9.recheck) setFeedback(RECHECK_HINT);
      else setFeedback(`🎉 算出来啦！${M9.a} ${M9.op} ${M9.b} = <b>${calcFinalResult()}</b>`, 'ok');
    } else {
      setFeedback(`✅ 已算到第 ${M9.step + 1} 步`, 'ok');
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

  /* ⭐ 探究式放行：把用户填写的值按标准答案的位数右对齐拆分。
     渲染永远用用户输入（M9.filled），绝不用标准答案（steps[idx].prod/rem）兜底覆盖。 */
  function splitFilled(key, standardVal) {
    const v = M9.filled[key];
    if (v == null) return null;
    const s = String(v);
    const len = String(standardVal).length;
    const arr = new Array(len).fill('');
    for (let i = 0; i < len; i++) {
      const si = s.length - len + i;
      if (si >= 0) arr[i] = s[si];
    }
    return arr;
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
      // 乘积：填过 → 被消耗档（减数）。⭐ 渲染用户输入，绝不用标准答案 s.prod 覆盖
      const prodDigits = splitFilled(`product-${idx}`, s.prod);
      const prodLen = String(s.prod).length;
      for (let i = 0; i < prodLen; i++) {
        const el = grid.cells.get(`p-${idx}-${i}`);
        setCellText(el, prodDigits ? prodDigits[i] : '');
        setTier(el, prodDigits ? 'consumed' : 'init');
      }

      // 减法线：乘积落位后浮现
      const ln = grid.cells.get(`ln-${idx}`);
      const show = M9.filled[`product-${idx}`] != null;
      if (show && ln.dataset.revealed !== '1') {
        ln.dataset.revealed = '1';
        gsap.to(ln, { opacity: 1, duration: 0.3, ease: EASE.entry });
      }

      // 中间余数行：正在供数的行（idx === curStep-1 且未完成）= 当前工作值 → 亮黄；
      // 一旦算出新余数（步骤完成）→ 立刻褪成极暗灰。⭐ 渲染用户输入，绝不用 s.rem 覆盖
      if (idx < steps.length - 1) {
        const remDigits = splitFilled(`remainder-${idx}`, s.rem);
        const filled = remDigits != null;
        const remLen = String(s.rem).length;
        for (let i = 0; i < remLen; i++) {
          const el = grid.cells.get(`r-${idx}-${i}`);
          setCellText(el, filled ? remDigits[i] : '');
          setTier(el, filled ? (idx === curStep - 1 && !done ? 'focus' : 'consumed') : 'init');
        }
        // 落位格：属于当前工作值 → 亮黄
        const bd = grid.cells.get(`bd-${idx}`);
        if (bd) {
          setCellText(bd, M9.broughtDown.has(idx) ? aStr[s.end + 1] : '');
          setTier(bd, M9.broughtDown.has(idx) ? (idx === curStep - 1 && !done ? 'focus' : 'consumed') : 'init');
        }
      }
    });

    // 末步余数（最终结果的一部分）→ 历史档。⭐ 渲染用户输入，绝不用 last.rem 覆盖
    const last = steps[steps.length - 1];
    const finalDigits = splitFilled(`remainder-${steps.length - 1}`, last.rem);
    const finalFilled = finalDigits != null;
    const finalLen = String(last.rem).length;
    for (let i = 0; i < finalLen; i++) {
      const el = grid.cells.get(`rf-${i}`);
      setCellText(el, finalFilled ? finalDigits[i] : '');
      setTier(el, finalFilled ? 'history' : 'init');
    }

    // 输入框：只有 waitingFor 时挂载（绿细框，绝无杂乱底色）
    if (M9.waitingFor && target) mountSlot();
    else unmountSlot();
  }

  /* ============ 动画 ============ */

  /* 答对：绿框消失 → 数字原地"书写脉冲"（结果档白/绿光闪 + scale 1.15→1）→ 平滑过渡到稳定档。
     ⭐ 单纯书写（进位/乘积/商/余数）绝不砸落：无 y 轴位移、无 opacity 瞬脱——
        数字一直在原地，只是被"写上去"并亮了一下。 */
  function flashFilled(cell, raw, key) {
    unmountSlot();
    cell.textContent = raw;
    cell.dataset.b1Animating = '1';
    const t = LC.result;
    cell.style.color = t.color;
    cell.style.opacity = 1;
    cell.style.textShadow = `0 0 14px ${STATUS.ok}80`;
    gsap.fromTo(cell, { scale: 1.15 }, { scale: 1, duration: 0.32, ease: EASE.land, clearProps: 'scale' });
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

  /* 落位（Bring Down）：FLIP 具身认知 —— "把上面的数字拿下来"。
     First：改写文字前测源格（被除数行 d-col）位置；
     Invert：写入目标格（余数行 bd-idx）后测其位置，反算 dx/dy；
     Play：从源格位置斜向飞落回正（微压扁 0.85 + back.out(1.2) 回弹落座）。
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
    // FLIP First：textContent 改写前测源格
    const srcRect = src ? src.getBoundingClientRect() : null;
    cell.textContent = String(M9.a)[col];
    cell.dataset.b1Animating = '1';
    const t = LC.result;
    cell.style.color = t.color;
    cell.style.textShadow = `0 0 14px ${STATUS.ok}80`;
    // FLIP Invert：目标格与源格中心差 → 起点钉在源格上
    const cellRect = cell.getBoundingClientRect();
    let dx = 0, dy = MOTION.dropYResult;         // 兜底：源格/目标格测不到 → 退化为短距砸落
    if (srcRect && srcRect.width && cellRect.width && cellRect.height) {
      dx = (srcRect.left + srcRect.width / 2) - (cellRect.left + cellRect.width / 2);
      dy = (srcRect.top + srcRect.height / 2) - (cellRect.top + cellRect.height / 2);
    }
    gsap.fromTo(cell, { x: dx, y: dy, scale: 0.85, opacity: 0.7 }, {
      x: 0, y: 0, scale: 1, opacity: 1, duration: 0.42, ease: EASE.land,   // back.out(1.2) 微压扁回弹
      clearProps: 'transform,opacity',
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

  /* ⭐ 无感定制生成：mode 干预参数范围（任务书 §一.5）
       consolidate 降维巩固：三位数退成两位数、乘数退到 2~5
       advance     升维挑战：三位数升到 500~999
       normal      原样 */
  const M9_RANGE = {
    consolidate: { add: [100, 399], addB: [100, 299], subA: [150, 499], mulA: [12, 49], mulB: [2, 5], divB: [2, 5] },
    normal:      { add: [100, 999], addB: [100, 999], subA: [200, 999], mulA: [12, 99], mulB: [2, 9], divB: [2, 9] },
    advance:     { add: [500, 999], addB: [300, 999], subA: [600, 999], mulA: [50, 99], mulB: [6, 9], divB: [6, 9] },
  };

  function randomProblemByOp(op, mode = 'normal') {
    const R = M9_RANGE[mode] || M9_RANGE.normal;
    const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    let a, b;
    if (op === '+') {
      do { a = rnd(R.add[0], R.add[1]); b = rnd(R.addB[0], R.addB[1]); } while (!hasCarry(a, b, '+'));
    } else if (op === '−') {
      do { a = rnd(R.subA[0], R.subA[1]); b = rnd(100, Math.max(101, a - 1)); } while (!hasCarry(a, b, '−'));
    } else if (op === '×') {
      do { a = rnd(R.mulA[0], R.mulA[1]); b = rnd(R.mulB[0], R.mulB[1]); } while (a * b < 100 && rnd(0, 1) === 0);
    } else {
      do { b = rnd(R.divB[0], R.divB[1]); const q = rnd(2, Math.floor(999 / b)); a = q * b + rnd(0, b - 1); } while (a > 999 || a < b * 2);
    }
    return { a, b };
  }

  function isMulDiv() { return M9.op === '×' || M9.op === '÷'; }

  function setFeedback(html, type) {
    if (!fbEl) return;
    fbEl.innerHTML = html;
    // ⭐ 保留 b1-hint 弱化档（模板语义：提示语恒安静；ok/error 才切换强调色）
    fbEl.className = 'feedback b1-hint' + (type ? ' ' + type : '');
    if (type === 'ok' || type === 'error') {
      const isOk = type === 'ok';
      ctx.showThumbBar({
        text: html.replace(/<[^>]+>/g, '').replace(/^[✓❌🎉]\s*/, ''),
        ok: isOk,
        // ⭐ 状态 A（终局正确）：按钮「下一题」→ 直接换题
        nextLabel: '下一题',
        onNext: () => {
          if (M9.step >= m9GetMaxSteps()) {
            m9NextProblem();
          }
          // 过程中的「继续」：推进由 700ms 定时器接手、键盘已就位，无需额外动作
        }
      });
    }
  }

  /* ---- 除法完成（submitInline 与 prompt 共用，修掉旧版 final 未定义的雷） ---- */
  function finishDivision() {
    M9.waitingFor = null;
    disarmOutsideConfirm();
    keypad.hide();
    aji.hideToast();    // ⭐ 终局：Aji 使命完成，退场
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
    // ⭐ 记忆引擎：除法终局正确 → 绝不入 Event Store，只让 Tag 连续正确 +1
    m9RecordLearner({ isCorrect: true, hasErrors: false, usedHint: M9.usedHint });
    if (mrec && mrec.state === 'mastered') {
      ctx.toast('🏆 这道题你掌握了！', 'success');
      setTimeout(() => ctx.showMasteryCard({ problemText: `${M9.a} ${M9.op} ${M9.b}`, correctAnswer: String(calcFinalResult()), takeaway: takeawayLoad(`${M9.a} ${M9.op} ${M9.b}`) }), 800);
    }
  }

  /* ---- 估算（先估算再动笔）→ 下沉为 Aji 对话内容 ----
     强制估算弹窗已下线：学生点击待填格直接开算，绝不阻断。
     常规态 Aji 浮条轻声问「要不要先估一估」——点了才有估算对话卡片，
     不点就完全放行（估算无记录/加分业务，旧的闸门状态一并废弃）。 */
  function m9EstimateData() {
    const a = M9.a, b = M9.b, op = M9.op;
    let exact;
    if (op === '+') exact = a + b;
    else if (op === '−') exact = a - b;
    else if (op === '×') exact = a * b;
    else exact = Math.floor(a / b);
    const base = Math.floor(exact / 100) * 100;
    const options = [
      { min: base - 100, max: base, label: `${base - 100}~${base}` },
      { min: base, max: base + 100, label: `${base}~${base + 100}` },
      { min: base + 100, max: base + 200, label: `${base + 100}~${base + 200}` },
    ];
    options.sort(() => Math.random() - 0.5);
    const correctIdx = options.findIndex(o => exact >= o.min && exact <= o.max);
    return { exact, options, correctIdx };
  }

  /* Aji 估算消息（结构化）：推送区间选项，学生点选后以"用户气泡"落史，
     再追加一条揭晓消息——无对错审判，无阻断 */
  function m9BuildEstimateMsg() {
    const { exact, options, correctIdx } = m9EstimateData();
    if (!Number.isFinite(exact)) {
      return { type: 'estimate', title: '先估一估', content: '先心里有数，再动笔不容易错。' };
    }
    return {
      type: 'estimate',
      title: '先估一估',
      content: `<b>${M9.a} ${M9.op} ${M9.b}</b> 的得数大概是多少？选一个区间试试：`,
      actions: options.map((o, i) => ({
        text: o.label,
        onClick: () => {
          const picked = i === correctIdx;
          aji.sendMessage({
            type: 'estimate',
            title: picked ? '✓ 对！' : '精确结果在这里',
            content: picked
              ? `精确结果是 <b>${exact}</b>——和你想的一样吗？开始一步步计算吧！`
              : `精确结果是 <b>${exact}</b>，落在 <b>${options[correctIdx].label}</b> 之间。心里有数了就开始吧！`,
          });
        },
      })),
    };
  }

  /* ⭐ 统一点击心智（与 m1 一致，无「下一步」按钮）：
     点击竖式中的任意待填格 / 运算符 → 直接进入输入态（键盘弹起）。
     引擎按依赖链顺序提问并自动推进；估算只活在 Aji 里，开算绝不阻断。 */
  function onGridClick(e) {
    if (M9.submitting || M9.recheck) return;         // 回溯期的格子点击归 editable 管线
    if (grid && grid.kind === 'div' && !grid.meta.steps?.length) return;   // a<b 占位无过程
    if (M9.waitingFor) return;                        // 已在输入态：键盘已就位
    const maxSteps = m9GetMaxSteps();
    if (M9.step >= maxSteps) return;                  // 已完成
    M9.step = Math.max(0, M9.step);
    m9PromptCurrentStep();
  }

  function m9PromptCurrentStep() {
    _promptInner();
    m9Render();
    // ⭐ 场景驱动：等待填写 → 键盘弹出（持久）；否则收起
    if (M9.waitingFor) {
      M9.answerBuf = '';        // ⭐ 新目标新缓冲（否则上一格的数字会串进来）
      renderSlot();
      // ⭐ 键盘黑盒回调制接入：屏幕键与实体键统一由键盘组件路由到此；
      //    动态 maxlength（商1/乘积3…）是业务缓冲语义，留业务层截断（最终权威），
      //    键盘侧 maxLength 仅作发牌外护栏
      keypad.show({
        onDigit: (d) => {
          if (!M9.waitingFor || M9.submitting) return;
          const t = currentTarget();
          if (!t || M9.answerBuf.length >= t.maxlength || M9.answerBuf.length >= M9_BUF_MAX) return;
          M9.answerBuf += d;
          renderSlot();
        },
        onConfirm: () => submitBuffer(),
        onBackspace: () => {
          if (!M9.waitingFor || M9.submitting) return;
          M9.answerBuf = M9.answerBuf.slice(0, -1);
          renderSlot();
        },
        maxLength: M9_BUF_MAX,
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

  /* ---------- 终局回溯（探究式，无倒计时）────────────────────
     过程全程放行：错误值照常写入 M9.filled 并继续往下进位/相乘/求余，
     M9.history 记录每一步 expected/actual/isCorrect（界面绝不明示）。
     只有当"最后一步填完、最终得数与标准答案不符"时：
     ① 提示语平滑切换为柔声的一句（无 error 档 → 无红、无缩略条）；
     ② 系统静默等待：静置 45 秒（MOTION.recheckIdle，任何动作都重新起算）
        或用户点开 Aji 悬浮球求助 —— 才用主题暖黄 15%（SOFT_GLOW）
        包住 M9.history 里第一个 isCorrect:false 的格子；
     ③ 点击高亮格 → 级联重置：删掉该步及之后的所有键，重新填写；
        一直不改就不催、不判 0，只有主动换题/放弃才结算并记为错。 ---------- */
  const RECHECK_HINT = '最终的得数好像不对，我们一起回头看看？';

  // ---------- Aji 全站陪学助教（模块只报数据 + 本地规则，UI 全在 aji.js） ----------
  const AJI_HINT_CONTENT = '点击竖式中的待填格，直接输入。得数、进位、借位、商、余数都由你来填——系统不会替你判断对错，跟着竖式的节奏一步步来就好。';
  const AJI_TOAST_NORMAL = '做之前，要不要先估一估得数大概是多少？';   // 常规态（空闲 35s）→ 估算对话卡片
  const AJI_TOAST_RECHECK = '卡住了吗？需要我讲讲这一步吗？'; // 回溯期（空闲 20s）
  aji.registerModuleContext({
    moduleId: 'm9',
    topic: '竖式运算',
    knowledgeCards: [
      { title: '加减法竖式', content: '相同数位对齐，从个位算起。<b>满十进一</b>：哪一位相加满十，就向前一位进 1。' },
      { title: '减法借位', content: '哪一位不够减，就向前一位借 1 当 10。<b>借来的 1 要记得在前一位减去</b>，别忘了。' },
      { title: '乘法进位', content: '先用一位数去乘各位，个位起。<b>乘积满几十就向前进几</b>，下一位的积要加上进位的数。' },
      { title: '除法竖式四步', content: '一<b>商</b>（想除数乘几最接近）、二<b>乘</b>、三<b>减</b>、四<b>落</b>（把下一位落下来）。余数一定要比除数小。' },
      { title: '先估一估', content: '动笔前先估个大概范围，算完一眼就能看出得数是不是离谱——这是最省时间的检查法。' },
    ],
    // ⭐ 当前题目（无则空串 → Aji 判为"无题目上下文"场景）
    problemText: () => (M9.a && M9.b && M9.op ? `${M9.a} ${M9.op} ${M9.b}` : ''),
    // ⭐ 是否已动过手：场景一（刚进页面未做题 = 打招呼 + 核心法则）与场景二（做到一半）的分水岭
    isStarted: () => Object.keys(M9.history).length > 0,
    // ⭐ 当前步骤与错误记录
    progress: () => {
      const keys = Object.keys(M9.history);
      if (!keys.length) return '（尚未开始填写）';
      const wrong = keys.filter(k => !M9.history[k].isCorrect);
      const done = keys.map(k => `${k}=${M9.history[k].actual}`).join('，');
      return `已填第 ${M9.step} 步：${done}${wrong.length ? `；其中 ${wrong.length} 处填错` : '；暂无错误'}`;
    },
    // ⭐ 是否出错：过程有填错也算（任务书 §五.2 的 hasErrors 语义）
    isError: () => !!M9.recheck || m9HasAnyWrong(),
    /* ⭐ 当前作答步三件套（问哪答哪的地基）。
       m9 是探究式放行：填错也照样写入 filled 并推进，所以不能只看"当前等待格"——
       ① 还在填（waitingFor 有值）→ 报当前格的期望值 + 缓冲里已敲的数；
       ② 已填完某格但没在填（回溯/检查态）→ 报最近填过的那一格的标准答案与学生实际输入，
          这才是"我这一步错哪了"想问的那一步。 */
    stepCtx: () => {
      const t = currentTarget();
      if (t) {
        const exp = ANSWER[t.key];
        const label = M9_STEP_LABEL[M9.waitingFor] || '这一步';
        const shown = String(t.cellKey || '').replace(/-/g, ' ');
        return {
          currentStep: `第 ${M9.step + 1} 步（${label}，位置 ${shown}）`,
          studentInput: M9.answerBuf || '',
          standardAnswer: exp != null ? String(exp) : '',
        };
      }
      // 非填写态：回溯到最近一次提交的格子（含填错的），把"标准 vs 实际"如实报出
      const keys = Object.keys(M9.history);
      if (!keys.length) return null;
      const last = M9.history[keys[keys.length - 1]];
      const label = M9_STEP_LABEL[last.type] || '这一步';
      return {
        currentStep: `第 ${(last.step != null ? last.step : 0) + 1} 步（${label}）`,
        studentInput: last.actual != null ? String(last.actual) : '',
        standardAnswer: last.expected != null ? String(last.expected) : '',
      };
    },
    // ⭐ 本地规则优先（快思考）：常规态 = 先估一估（区间选项）；回溯/修复态 = 错误回顾 + 微光
    resolveLocal: (intent) => {
      M9.usedHint = true;   // ⭐ 用过 Aji 提示 → 随错题一起入库
      if (intent === 'review' || (M9.recheck && !M9.submitting)) {
        if (M9.recheck && !M9.submitting) m9ShowSoftGlow();   // 回溯期求助 → 微光轻照第一个错格
        return {
          type: 'error_review',
          title: '这一步怎么想？',
          content: AJI_HINT_CONTENT,
          actions: [{ text: '我懂了', type: 'close' }],
        };
      }
      return m9BuildEstimateMsg();
    },
  });
  let recheckTimer = null;
  let recheckActivityArmed = false;
  let recheckGlowEl = null;

  /* 逻辑 key → 所属 step（级联重置用：删除该步及之后的键） */
  function m9StepOfKey(key) {
    if (M9.op === '÷') {
      const m = key.match(/^(quotient|product|remainder)-(\d+)$/);
      return m ? +m[2] : -1;
    }
    const m = key.match(/^(result|carry)-(\d+)$/);
    if (!m) return -1;
    const i = +m[2];
    if (M9.op === '×') return i;                 // 乘：col 即 step
    return getAddSubMaxLen() - 1 - i;            // 加减：curI = maxLen-1-step
  }

  /* 第一个错误的历史项（含 key） */
  function m9FirstWrong() {
    for (const k of Object.keys(M9.history)) {
      if (!M9.history[k].isCorrect) return { key: k, ...M9.history[k] };
    }
    return null;
  }
  function m9HasAnyWrong() { return !!m9FirstWrong(); }

  /* ⭐ 记忆引擎结算（m9 的唯一调用点）。
     铁律：做对且过程无错 → 绝不写 Event Store，只喂聚合器。
     ⚠️ M9.filled/history 里存的是用户真实输入，错因必须说明"哪一步的哪个格"。 */
  const M9_STEP_LABEL = { quotient: '商', product: '乘积', remainder: '余数', carry: '进位', result: '结果', sum: '和', diff: '差' };
  function m9RecordLearner({ isCorrect, hasErrors, wrongKey, usedHint }) {
    try {
      const w = wrongKey && M9.history[wrongKey] ? M9.history[wrongKey] : null;
      const label = w ? (M9_STEP_LABEL[w.type] || w.type || '这一步') : '';
      learnerSettle({
        moduleId: 'm9',
        topic: meta.title || '竖式运算',
        problemText: `${M9.a} ${M9.op} ${M9.b}`,
        tags: M9.tags && M9.tags.length ? M9.tags : tagsForVertical({ a: M9.a, b: M9.b, op: M9.op }),
        isCorrect, hasErrors,
        correctAnswer: w ? String(w.expected) : String(calcFinalResult() ?? ''),
        studentAnswer: w ? String(w.actual) : '',
        errorStep: w ? `${label}填成了 ${w.actual}，应为 ${w.expected}` : '',
        usedHint: !!usedHint,
      });
    } catch (e) { /* 学情记录失败绝不阻断做题 */ }
  }

  function m9EnterRecheck() {
    const fw = m9FirstWrong();
    M9.recheck = { firstWrongKey: fw ? fw.key : null };
    setFeedback(RECHECK_HINT);   // ⭐ 直接柔声提示（此时 waitingFor=null，不能依赖 m9Render 分支）
    // ⭐ 状态 B（终局回溯）：Thumb Bar「去修改」+「看答案」（Aji 浮条绝不在此阶段出现）
    aji.hideToast();
    ctx.showThumbBar({
      text: RECHECK_HINT,
      ok: false,
      nextLabel: '去修改',
      onNext: () => m9GoFix(),
      retryLabel: '看答案',
      onRetry: () => m9GiveUp(),
    });
    armRecheckTimer();
    armRecheckActivity();
    m9ArmEditable();   // ⭐ 全盘可编辑：所有已填格子恢复可点击
  }

  function armRecheckTimer() {
    if (recheckTimer) clearTimeout(recheckTimer);
    recheckTimer = setTimeout(() => { recheckTimer = null; m9ShowSoftGlow(); }, MOTION.recheckIdle * 1000);
  }

  /* 静置守护：回溯未决期间，用户的任何动作都让 45 秒重新起算 */
  function onRecheckActivity() {
    if (!M9.recheck) { disarmRecheckActivity(); return; }
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

  /* 微光：只给第一个错误格子加视觉引导（点击行为由 editable 统一处理） */
  function m9ShowSoftGlow() {
    m9ClearSoftGlow();
    if (!M9.recheck) return;
    const fw = m9FirstWrong();
    const el = fw && grid?.cells.get(fw.cellKey);
    if (!el) return;
    el.classList.add('b9-glow');
    recheckGlowEl = el;
  }

  function m9ClearSoftGlow() {
    recheckGlowEl = null;
    container.querySelectorAll('.b9-glow').forEach(el => el.classList.remove('b9-glow'));
  }

  /* ⭐ 全盘可编辑：回溯期所有已填格子恢复可点击，点击任一步即级联重置到该步 */
  const m9EditableCells = [];
  function m9ArmEditable() {
    m9DisarmEditable();
    Object.keys(M9.history).forEach(k => {
      const h = M9.history[k];
      const el = grid?.cells.get(h.cellKey);
      if (!el) return;
      el.classList.add('b9-editable');
      const handler = () => m9ClickHistoryCell(h.cellKey);
      el._m9EditableHandler = handler;
      el.addEventListener('click', handler);
      m9EditableCells.push(el);
    });
  }
  function m9DisarmEditable() {
    m9EditableCells.forEach(el => {
      el.classList.remove('b9-editable');
      if (el._m9EditableHandler) el.removeEventListener('click', el._m9EditableHandler);
      el._m9EditableHandler = null;
    });
    m9EditableCells.length = 0;
  }
  function m9ClickHistoryCell(cellKey) {
    if (!M9.recheck || M9.submitting) return;
    let step = null;
    for (const k of Object.keys(M9.history)) {
      if (M9.history[k].cellKey === cellKey) { step = M9.history[k].step; break; }
    }
    if (step == null) return;
    m9SettleRecheck();
    m9RevertToStep(step);
    // ⭐ 回溯静默期：20s 计时从这里起算（点格/改错=有效操作，自动重置；一直没修好才浮条）
    aji.requestIdleToast(20000, AJI_TOAST_RECHECK, () => aji.handleAsk('', 'review'));   // 修复期求助 → 错误回顾
  }

  /* 「去修改」：平滑滚动到第一个错格并激活输入 */
  function m9GoFix() {
    if (!M9.recheck) return;
    const fw = m9FirstWrong();
    const el = fw && grid?.cells.get(fw.cellKey);
    if (el) { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
    if (fw) m9ClickHistoryCell(fw.cellKey);
  }

  /* 「看答案」：放弃 → 判错 + 展示正确答案 + 「下一题」 */
  function m9GiveUp() {
    const r = M9.recheck;
    const fw = m9FirstWrong();
    m9SettleRecheck();   // ⭐ 清光清计时清可编辑
    aji.hideToast();     // ⭐ Aji 浮条与计时一并退场
    if (!r) return;
    ctx.data?.historyAdd?.({
      problemText: `${M9.a} ${M9.op} ${M9.b}`, problemSource: 'm9', moduleId: 'm9',
      studentSteps: Object.keys(M9.filled).map(k => ({ rel: k, sub: '', res: M9.filled[k] })),
      studentAnswer: fw ? fw.actual : '（未完成）', isCorrect: false, correctAnswer: String(calcFinalResult()), aiFeedback: null,
    });
    ctx.data?.masteryRecord?.(`${M9.a} ${M9.op} ${M9.b}`, false);
    m9RecordLearner({ isCorrect: false, hasErrors: true, wrongKey: fw && fw.key, usedHint: M9.usedHint });
    const ans = String(calcFinalResult());
    if (fbEl) { fbEl.textContent = `正确答案是：${ans}。`; fbEl.className = 'feedback b1-hint'; }
    // ⭐ 状态 C（放弃看答案）：展示答案 + 「下一题」
    ctx.showThumbBar({
      text: `正确答案是：${ans}`,
      ok: false,
      hideRetry: true,
      nextLabel: '下一题',
      onNext: () => m9NextProblem(),
    });
  }

  /* ⭐ 级联重置：删掉 targetStep 及之后的所有键，回退到该步重新填。
     依赖链精准命中：step 以 M9.history[key].step（填写时的权威记录）为准——
     ⚠️ 不能按 key 语法反推（如 × 的 carry-K 在 step K-1 询问，反推成 K 会误删更早的进位）；
     修改后面的步骤，绝不回溯清空前面已填好的值。 */
  function m9RevertToStep(targetStep) {
    for (const k of Object.keys(M9.history)) {
      const st = M9.history[k].step != null ? M9.history[k].step : m9StepOfKey(k);
      if (st >= targetStep) { delete M9.filled[k]; delete M9.history[k]; }
    }
    M9.step = targetStep;
    M9.waitingFor = null;
    // 落位状态只清 targetStep 之后的（idx ≥ targetStep 的供数在重做时会重新摘取）；
    // 前面步骤的落位与工作值原样保留
    M9.broughtDown = new Set([...M9.broughtDown].filter(i => i < targetStep));
    m9Render();
    m9PromptCurrentStep();             // curStep = targetStep → 指向该步第一个未填格
  }

  /* 修正成功 / 换题 / 卸载：微光与守护无痕退场（recheck 相应清空或由结算方接管） */
  function m9SettleRecheck() {
    M9.recheck = null;
    if (recheckTimer) { clearTimeout(recheckTimer); recheckTimer = null; }
    disarmRecheckActivity();
    m9ClearSoftGlow();
    m9DisarmEditable();
  }

  /* 只有主动换题 / 放弃时才结束并记为错 —— 在此之前系统不催、不判 0 */
  function m9SettleAbandoned() {
    const r = M9.recheck;
    m9SettleRecheck();   // ⭐ 无论是否未决，微光/守护都无痕退场（求助微光也随换题消散）
    if (!r) return;
    const fw = m9FirstWrong();
    ctx.data?.historyAdd?.({
      problemText: `${M9.a} ${M9.op} ${M9.b}`, problemSource: 'm9', moduleId: 'm9',
      studentSteps: Object.keys(M9.filled).map(k => ({ rel: k, sub: '', res: M9.filled[k] })),
      studentAnswer: fw ? fw.actual : '（未完成）', isCorrect: false, correctAnswer: String(calcFinalResult()), aiFeedback: null,
    });
    ctx.data?.masteryRecord?.(`${M9.a} ${M9.op} ${M9.b}`, false);
    m9RecordLearner({ isCorrect: false, hasErrors: true, wrongKey: fw && fw.key, usedHint: M9.usedHint });
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
    const isCorrect = String(raw) === String(expected);

    // ⭐ 探究式放行：对错都写入 filled 并照常落位推进，界面绝不明示
    //    （过程零判定：不弹任何"正确"暗示，避免"上一格错了、这一格却被夸"的心流污染）
    M9.filled[key] = raw;
    M9.history[key] = { expected, actual: raw, isCorrect, cellKey: target.cellKey, step: M9.step, type: M9.waitingFor };
    M9.waitingFor = null;
    if (!isCorrect) emitUI('WRONG', { moduleId: 'm9' });   // ⭐ 隐形埋点：界面绝不亮红灯
    // ⭐ Brilliant 反馈：绿框消失，数字闪光落位（对错同款），随后平滑过渡到稳定档
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
          if (m9HasAnyWrong()) {
            // ⭐ 终局回溯：最终得数与标准答案不符 → 静默等待，不判错、不催促、无倒计时
            m9EnterRecheck();
          } else if (M9.op === '÷') {
            finishDivision();
          } else {
            aji.hideToast();    // ⭐ 终局：Aji 使命完成，退场
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
            // ⭐ 记忆引擎：非除法终局正确（过程已由 m9HasAnyWrong 保证全对）
            m9RecordLearner({ isCorrect: true, hasErrors: false, usedHint: M9.usedHint });
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
  }

  /* ⭐ 题设入口（原抽屉 input 的职责）：换题/改题一律经此，
     先夹紧到合法范围再落进 M9，避免脏值渗进判卷。 */
  function m9SetProblem(a, op, b) {
    let na = Math.floor(Number(a)); if (!Number.isFinite(na)) na = 0;
    let nb = Math.floor(Number(b)); if (!Number.isFinite(nb)) nb = 0;
    const nop = ['+', '−', '×', '÷'].includes(op) ? op : '+';
    M9.a = Math.max(0, Math.min(999, na));
    M9.op = nop;
    // 乘除法的第二个运算数必须是 1 位数（三年级竖式契约）
    M9.b = (nop === '×' || nop === '÷') ? Math.max(1, Math.min(9, nb)) : Math.max(0, Math.min(999, nb));
  }

  function m9Reset() {
    m9SettleAbandoned();   // ⭐ 主动换题/放弃/改题设：终局答错且未修正的尝试，此刻才结算为错
    ctx.ui?.hideThumbBar?.();   // ⭐ 契约化：保留原 window.__shell?.hideThumbBar 的可选链守卫语义
    document.getElementById('thumbBar')?.classList.remove('show', 'ok', 'err');

    // ⭐ 状态已在 M9.a/M9.b/M9.op（由 m9SetProblem 夹紧），这里不再从 DOM 读

    M9.step = -1; M9.waitingFor = null; M9.filled = {};
    M9.history = {};
    M9.recheck = null;
    // ⭐ 本次尝试复位（记忆引擎用）：标签按当前题实算，绝不沿用上一题
    M9.tags = tagsForVertical({ a: M9.a, b: M9.b, op: M9.op });
    M9.usedHint = false;
    M9.broughtDown = new Set();
    M9.submitting = false;
    M9.answerBuf = '';
    disarmOutsideConfirm();
    keypad.hide();
    ANSWER = computeAnswerMap();

    if (M9.op === '÷' && M9.a < M9.b) {
      rebuild();
      setFeedback(`💡 ${M9.a} ÷ ${M9.b} = 0 余 ${M9.a}（被除数比除数小）`, 'ok');
      aji.hideToast();
      return;
    }

    setFeedback('点击竖式中的待填格，开始计算 👆');
    rebuild();
    // ⭐ 常规态（初始/等待输入）：空闲 35s 才浮条；任何有效操作自动重置。
    //    浮条点击 → 估算对话卡片（先估一估下沉进 Aji，开算绝不阻断）
    aji.hideToast();
    // 点浮条 → 显式 'estimate' 场景：先估一估（本地规则，开算绝不阻断）
    aji.requestIdleToast(35000, AJI_TOAST_NORMAL, () => aji.handleAsk('', 'estimate'));
  }

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

  /* ---- 桌面物理键盘：已上收进键盘组件（onDigit/onConfirm/onBackspace 回调），业务零监听 ---- */

  /** ⭐ 无感定制生成：命中顽固短板 → 该运算类型的降维巩固题（必定抽中）。
      调用方只解构 { a, b }，所以兜底分支直接给普通题，无需再套一层 IIFE。 */
  function m9PickProblem(op) {
    const candidateTags = tagsForVertical({ a: 100, b: 10, op });
    const picked = pickProblem((g) => {
      const { a, b } = randomProblemByOp(op, g.mode);
      return { problemText: `${a} ${op} ${b}`, tags: tagsForVertical({ a, b, op }), a, b };
    }, { candidateTags, moduleId: 'm9' });
    return picked || randomProblemByOp(op, 'normal');
  }

  /* ⭐ 换一题（原 #m9random 按钮的职责）：层级有定向则用定向运算，
     否则四种运算随机。落题后统一走 m9Reset（内含 m9SettleAbandoned 的错题结算）。 */
  function m9NextProblem() {
    const level = localStorage.getItem('grade3_m9_level') || null;
    let op;
    if (level === 'add') op = '+';
    else if (level === 'sub') op = '−';
    else if (level === 'mul') op = '×';
    else if (level === 'div') op = '÷';
    else op = ['+', '−', '×', '÷'][Math.floor(Math.random() * 4)];

    const { a, b } = m9PickProblem(op);
    m9SetProblem(a, op, b);
    m9Reset();
  }

  // ⭐ 统一点击心智：点竖式任意待填格 → 直接进入输入态（替代原「下一步」按钮）
  display.addEventListener('click', onGridClick);

  m9Reset();
  requestAnimationFrame(m9CenterStage);   // ⭐ 布局就绪后舞台居中

  ctx.registerLevelHandler('m9', (levelId) => {
    let op = '+';
    if (levelId === 'sub') op = '−';
    else if (levelId === 'mul') op = '×';
    else if (levelId === 'div') op = '÷';

    const { a, b } = m9PickProblem(op);
    m9SetProblem(a, op, b);
    m9Reset();
  });

  /* ⭐ 对外接口（供 Aji 的本地路由调用）：
     nextProblem 换一题 / loadExpression 载入指定算式 / redo 错题本"去修改"入口。
     exampleHint 是给 Aji 拒答时用的示例 —— 必须是**本模块真正接受的形态**：
     m9 是竖式练习，只吃「两数一运算符」，写多步算式会误导学生。 */
  registerActiveModule('m9', {
    nextProblem: () => m9NextProblem(),
    exampleHint: '456 ÷ 8',
    redo: (text) => {
      const m = String(text || '').match(/^(\d+)\s*([+\-−×÷])\s*(\d+)$/);
      if (!m) return false;
      m9SetProblem(m[1], m[2], m[3]);
      m9Reset();
      return true;
    },
    loadExpression: (text) => {
      const m = String(text || '').match(/^(\d+)\s*([+\-−×÷])\s*(\d+)$/);
      if (!m) return false;
      m9SetProblem(m[1], m[2], m[3]);
      m9Reset();
      return true;
    },
  });

  return () => {
    unregisterActiveModule('m9');
    themeObserver.disconnect();
    disarmOutsideConfirm();
    m9SettleRecheck();   // ⭐ 心流守护（定时器/文档监听/微光）随卸载无痕退场
    aji.hideToast();     // ⭐ 防旧计时器在后台触发
    aji.clearStage('m9');   // ⭐ 释放让位接管（防旧模块的舞台对象滞留）
    window.visualViewport?.removeEventListener('resize', m9OnStageReflow);
    window.visualViewport?.removeEventListener('scroll', m9OnStageReflow);
    window.removeEventListener('resize', m9OnStageReflow);
    keypad.hide();
    unmountSlot();
    if (grid) grid.cells.forEach(el => gsap.killTweensOf(el));
    document.getElementById(STYLE_ID)?.remove();
    container.innerHTML = '';
  };
}
