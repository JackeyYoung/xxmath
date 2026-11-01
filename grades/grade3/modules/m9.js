/* grades/grade3/modules/m9.js */
import { getTemplate } from '../../../core/ui/template.js';

import * as M9Score from '../scoring/m9.js';
import { COMBO } from '../../../core/ui/celebrate.js';
import { getEncouragement } from '../../../core/ui/encourage.js';
import { takeawayLoad } from '../../../core/takeaway.js';
import { registerActiveModule, unregisterActiveModule } from '../../../app/shell.js';
import { emitUI } from '../../../core/ui/bus-ui.js';
import { GOLDEN, EASE, DUR, cellStyle } from '../../../core/ui/golden-motion.js';
import { loadGsap } from '../../../js/vendor/gsap-esm.js';

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

export default async function mount(container, ctx) {
  const tpl = getTemplate('tpl-m9');
  if (!tpl) {
    console.error('找不到 tpl-m9 模板');
    return;
  }
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));

  // ⭐ 修复1：补齐正确的 ID 选择器
  const $ = sel => container.querySelector(sel);
  const display = $('#m9display');
  const aInput  = $('#m9a');
  const bInput  = $('#m9b');
  const opInput = $('#m9op');
  const stepBtn = $('#m9step');
  const resetBtn = $('#m9reset');
  const fbEl = $('#m9fb');
  if (!display || !aInput || !bInput || !opInput) return;

  // ⭐ 修复2：补齐遗漏的纯函数和工具函数
  const M9 = {
    a: 348, b: 176, op: '+', step: -1, waitingFor: null, filled: {}, submitting: false,
  };

  const getAddSubMaxLen = () => M9Score.getAddSubMaxLen(M9.a, M9.b, M9.op);
  const computeAnswerMap = () => M9Score.computeAnswerMap({ a: M9.a, b: M9.b, op: M9.op });
  const m9GetMaxSteps = () => M9Score.getMaxSteps({ a: M9.a, b: M9.b, op: M9.op });
  const calcFinalResult = () => M9Score.calcFinalResult({ a: M9.a, b: M9.b, op: M9.op });

  let ANSWER = computeAnswerMap();

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
    
    // ⭐ 核心修复：唤醒拇指条
    if (type === 'ok' || type === 'error') {
      const isOk = type === 'ok';
      ctx.showThumbBar({
        text: html.replace(/<[^>]+>/g, '').replace(/^[✓❌🎉]\s*/, ''), // 去标签和符号
        ok: isOk,
        onNext: () => {
          // 如果算完了，继续下一题
          if (M9.step >= m9GetMaxSteps()) {
            $('#m9random')?.click();
          } else {
            $('#m9step')?.click();
          }
        }
      });
    }
  }

  /* ===== 黄金视觉标准（第 1 步：仅视觉，不动 M9.step） ===== */
  let _gsap = null;
  loadGsap().then((g) => { _gsap = g || null; }).catch(() => { _gsap = null; });

  /** 状态 → 内联 style 串（m9 用字符串拼 HTML，只能这样注入） */
  function vcStyleAttr(state, extra = {}) {
    // dim = 整列「尚未轮到」：用中灰 + 0.6（0.4 在暗底上几乎消失）
    if (state === 'dim') {
      return ' style="color:' + GOLDEN.history + ';opacity:' + GOLDEN.opacityDimFar + ';"';
    }
    const st = cellStyle({ state, fromResult: !!extra.fromResult });
    const sh = (st.textShadow && st.textShadow !== 'none') ? 'text-shadow:' + st.textShadow + ';' : '';
    return ' style="color:' + st.color + ';opacity:' + st.opacity + ';' + sh + '"';
  }

  function vcKeyAttr(key) {
    return ' data-vc-key="' + key + '"';
  }

  /* 加减法：索引 i 从左往右，curI 是当前列（随 step 增大而左移）
     i > curI → 已算过（history）；i === curI → 当前（focus）；i < curI → 未轮到（dim） */
  function addState(i, curI) {
    if (M9.step < 0) return 'normal';
    if (i > curI) return 'history';
    if (i === curI) return 'focus';
    return 'dim';
  }

  /* 乘法：col 从右往左数，与 M9.step 同一坐标系 */
  function mulState(col) {
    if (M9.step < 0) return 'normal';
    if (col < M9.step) return 'history';
    if (col === M9.step) return 'focus';
    return 'dim';
  }

  /**
   * 落位动画（一次性）：让"落在余数右边的被除数位"从上方原位置砸下来。
   * **只动目标格**，不碰被除数那一格（它已被渲染成浅灰占位），
   * 因此不会和重绘打架。
   */
  /* 整个函数替换 */
  function m9BringDown(container) {
    if (!_gsap || !container) return;
    const landedEl = container.querySelector('[data-vc-key^="landed-"]');
    if (!landedEl) return;

    const idx = landedEl.getAttribute('data-vc-key').split('-')[1];
    if (M9._landedIdx === Number(idx)) return;   // 这一位已经飞过了

    const src = container.querySelector('[data-vc-key="dividend-' + idx + '"]');
    if (!src) return;

    const a = src.getBoundingClientRect();
    const b = landedEl.getBoundingClientRect();
    const dy = a.top - b.top;                   // 从上方原位出发（负值）

    _gsap.fromTo(landedEl,
      { y: dy, opacity: 0.85 },
      { y: 0, opacity: 1, duration: 0.42, ease: 'back.out(1.2)',
        onComplete: () => {
          _gsap.to(landedEl, { scale: 1.12, duration: 0.12, ease: 'power2.out',
            onComplete: () => _gsap.to(landedEl, { scale: 1, duration: 0.18, ease: 'back.out(2)' }) });
          M9._landedIdx = Number(idx);
        } });
  }

  /** 落地弹跳：数字砸进格子（重绘后调用，因此不改输入处理逻辑） */
  function m9LandPop(container) {
    if (!_gsap || !container || !M9._popKey) return;
    const key = M9._popKey;
    M9._popKey = null;
    const el = container.querySelector('[data-vc-key="' + key + '"]');
    if (!el) return;

    _gsap.fromTo(el,
      { y: -26, scale: 0.7, opacity: 1 },
      { y: 0, scale: 1, opacity: 1, duration: DUR.land, ease: EASE.absorb,
        onComplete: () => {
          // 落地微回弹
          _gsap.to(el, { y: -4, duration: 0.14, ease: EASE.land,
            onComplete: () => _gsap.set(el, { clearProps: 'transform' }) });

          // 纯白 + 白光「闪一下」，然后 0.3s 平滑退到历史灰
          _gsap.fromTo(el,
            { color: '#FFFFFF', textShadow: '0 0 8px #fff' },
            { color: GOLDEN.historyDeep, textShadow: '0 0 0 rgba(255,255,255,0)',
              duration: 0.30, ease: 'power2.inOut', delay: 0.18 });
        } });
  }

  /* ---------- 渲染（完整保留） ---------- */
  function renderAddSub() {
    const maxLen = getAddSubMaxLen();
    const aD = String(M9.a).padStart(maxLen, '0').split('').map(Number);
    const bD = String(M9.b).padStart(maxLen, '0').split('').map(Number);

    const curPos = M9.step;                  
    const curI = maxLen - 1 - curPos;        

    let html = '<div class="vertical-calc">';
    html += '<div class="vc-row"><div class="vc-cell carry"></div>';
    for (let i = 0; i < maxLen; i++) {
      const carryKey = `carry-${i + 1}`;
      const filled = M9.filled[carryKey];
      const hasCarryVal = ANSWER[carryKey];

      let needCarryKey = null;
      if (M9.waitingFor === 'carry') {
        const prevKey = `carry-${curI + 1}`;
        const curKey  = `carry-${curI}`;
        if (ANSWER[prevKey] && !M9.filled[prevKey]) needCarryKey = prevKey;
        else if (ANSWER[curKey] && !M9.filled[curKey]) needCarryKey = curKey;
      }

      const isCurrent = (needCarryKey === carryKey);

      if (hasCarryVal && isCurrent) {
        html += `<div class="vc-cell carry input-cell"><input type="text" class="vc-input vc-input-carry" id="m9InlineInput" inputmode="numeric" maxlength="1" autocomplete="off"></div>`;
      } else if (filled) {
        html += `<div class="vc-cell carry"${vcStyleAttr('history')}${vcKeyAttr(carryKey)}>${filled}</div>`;
      } else {
        html += `<div class="vc-cell carry"${vcStyleAttr('dim')}></div>`;
      }
    }
    html += '</div>';

    const aStr = String(M9.a);
    const bStr = String(M9.b);
    const aLen = aStr.length;
    const bLen = bStr.length;
    const aStartIdx = maxLen - aLen;
    const bStartIdx = maxLen - bLen;

    html += '<div class="vc-row"><div class="vc-cell"></div>';
    for (let i = 0; i < maxLen; i++) {
      if (i < aStartIdx) {
        html += `<div class="vc-cell"></div>`;
      } else {
        const hl = (curPos >= 0 && i === curI) ? ' highlight' : '';
        html += `<div class="vc-cell${hl}"${vcStyleAttr(addState(i, curI))}>${aD[i]}</div>`;
      }
    }
    html += '</div>';

    html += '<div class="vc-row">';
    html += `<div class="vc-cell op">${M9.op}</div>`;
    for (let i = 0; i < maxLen; i++) {
      if (i < bStartIdx) {
        html += `<div class="vc-cell"></div>`;
      } else {
        const hl = (curPos >= 0 && i === curI) ? ' highlight' : '';
        html += `<div class="vc-cell${hl}"${vcStyleAttr(addState(i, curI))}>${bD[i]}</div>`;
      }
    }
    html += '</div>';

    html += '<div class="vc-line"></div>';

    html += '<div class="vc-row"><div class="vc-cell"></div>';
    for (let i = 0; i < maxLen; i++) {
      const resultKey = `result-${i}`;
      const filled = M9.filled[resultKey];
      const isCurrent = M9.waitingFor === 'result' && i === curI;

      if (isCurrent) {
        html += `<div class="vc-cell input-cell"><input type="text" class="vc-input" id="m9InlineInput" inputmode="numeric" maxlength="1" autocomplete="off"></div>`;
      } else if (filled) {
        const isLatest = M9._lastFilledKey === resultKey; html += `<div class="vc-cell"${vcStyleAttr(isLatest ? 'focus' : 'history', { fromResult: isLatest })}${vcKeyAttr(resultKey)}>${filled}</div>`;
      } else {
        html += `<div class="vc-cell"${vcStyleAttr(addState(i, curI) === 'history' ? 'dim' : addState(i, curI))}></div>`;
      }
    }
    html += '</div></div>';
    return html;
  }

  function renderMul() {
    const aStr = String(M9.a);
    const aLen = aStr.length;
    const b = M9.b;
    const displayCols = 4;   
    const aRev = aStr.split('').reverse().map(Number);

    let html = '<div class="vertical-calc">';
    html += '<div class="vc-row"><div class="vc-cell"></div>';
    for (let col = displayCols - 1; col >= 0; col--) {
      const carryKey = `carry-${col}`;
      const filled = M9.filled[carryKey];
      const isCurrent = M9.waitingFor === 'carry' && col === M9.step + 1;
      const hasCarryVal = ANSWER[carryKey];

      if (hasCarryVal && isCurrent) {
        html += `<div class="vc-cell carry input-cell"><input type="text" class="vc-input vc-input-carry" id="m9InlineInput" inputmode="numeric" maxlength="1" autocomplete="off"></div>`;
      } else if (filled) {
        html += `<div class="vc-cell carry"${vcStyleAttr('history')}${vcKeyAttr(carryKey)}>${filled}</div>`;
      } else {
        html += `<div class="vc-cell carry"${vcStyleAttr('dim')}></div>`;
      }
    }
    html += '</div>';

    html += '<div class="vc-row"><div class="vc-cell"></div>';
    for (let col = displayCols - 1; col >= 0; col--) {
      const hl = (col === M9.step && M9.step < aLen) ? ' highlight' : '';
      const val = (col < aLen) ? aRev[col] : '';
      html += `<div class="vc-cell${hl}"${vcStyleAttr(mulState(col))}>${val}</div>`;
    }
    html += '</div>';

    html += '<div class="vc-row"><div class="vc-cell op">×</div><div class="vc-cell"></div><div class="vc-cell"></div><div class="vc-cell"></div>';
    const hlB = (M9.step >= 0) ? ' highlight' : '';
    html += `<div class="vc-cell${hlB}"${vcStyleAttr(M9.step >= 0 ? 'history' : 'normal')}>${b}</div></div>`;

    html += '<div class="vc-line"></div>';

    html += '<div class="vc-row"><div class="vc-cell"></div>';
    for (let col = displayCols - 1; col >= 0; col--) {
      const resultKey = `result-${col}`;
      const filled = M9.filled[resultKey];
      const isCurrent = M9.waitingFor === 'result' && col === M9.step;

      if (isCurrent) {
        html += `<div class="vc-cell input-cell"><input type="text" class="vc-input" id="m9InlineInput" inputmode="numeric" maxlength="1" autocomplete="off"></div>`;
      } else if (filled) {
        const isLatest = M9._lastFilledKey === resultKey; html += `<div class="vc-cell"${vcStyleAttr(isLatest ? 'focus' : 'history', { fromResult: isLatest })}${vcKeyAttr(resultKey)}>${filled}</div>`;
      } else {
        html += `<div class="vc-cell"${vcStyleAttr(mulState(col) === 'history' ? 'dim' : mulState(col))}></div>`;
      }
    }
    html += '</div></div>';
    return html;
  }

  /** 只返回 CSS 声明（不含 style=），用于已经存在 style 属性的元素 */
  function vcStyleInline(state, extra = {}) {
    if (state === 'dim') {
      return 'color:' + GOLDEN.history + ';opacity:' + GOLDEN.opacityDimFar + ';';
    }
    const st = cellStyle({ state, fromResult: !!extra.fromResult });
    const sh = (st.textShadow && st.textShadow !== 'none') ? 'text-shadow:' + st.textShadow + ';' : '';
    return 'color:' + st.color + ';opacity:' + st.opacity + ';' + sh;
  }

  /**
   * 除法的「商」列状态。
   * 注意：不能用 mulState(col) —— 商的 idx 是"第几个商位"（从 0 开始），
   * 不是列坐标；而且商位是**乱序填**的（先填高位），所以判据是 idx vs M9.step。
   *
   * @param {number} idx    第几个商位
   * @param {string} filled 该位已填的内容（未填为 undefined）
   */
  function divStateQuotient(idx, filled) {
    const cur = M9.step;
    if (cur < 0) return 'normal';
    if (filled || idx < cur) return 'history';   // 已填 = 已算过（优先于"当前"）
    if (idx === cur) return 'focus';             // 当前待填：黄字 + 黄光
    return 'dim';                                // 后面还没轮到：中灰 0.6
  }

  function renderDiv() {
    const a = M9.a, b = M9.b;
    if (b === 0) return '<div style="color:#b91c1c;font-size:18px;">除数不能为 0</div>';

    const aStr = String(a);
    const n = aStr.length;
    const aD = aStr.split('').map(Number);
    if (a < b) {
      return `<div class="vertical-calc" style="padding:20px;text-align:center;"><div style="font-size:24px;font-weight:800;color:var(--text);margin-bottom:12px;">${a} ÷ ${b} = 0 余 ${a}</div><div style="font-size:14px;color:var(--muted);">被除数比除数小，商是 0，余数就是被除数本身</div></div>`;
    }

    const steps = [];
    let rem = 0, startPos = 0, started = false;
    for (let i = 0; i < n; i++) {
      const curVal = rem * 10 + aD[i];
      const q = Math.floor(curVal / b);
      const prod = q * b;
      const newRem = curVal - prod;
      if (i === 0 && q === 0 && !started) { rem = curVal; continue; }
      if (!started) { startPos = i; started = true; }
      steps.push({ start: startPos, end: i, q, prod, rem: newRem });
      startPos = i + 1;
      rem = newRem;
    }

    const cells = [];
    const curStep = M9.step;
    // renderDiv 里，const curStep = M9.step; 的下面
    const maxSteps = m9GetMaxSteps();
    // 除法最后一步填完后 M9.step 不会再 +1，所以必须同时查 filled：三个 key 都有就是算完了
    const allDone = steps.every((_, i) =>
      M9.filled['quotient-' + i] !== undefined &&
      M9.filled['product-' + i] !== undefined &&
      M9.filled['remainder-' + i] !== undefined);
    const isFinale = (M9.step >= steps.length) || allDone;          // 终局：全部算完
    // 唯一活跃步：只有它能亮黄。为 -1 时谁都不亮。
    const activeStep = (M9.step < 0 || isFinale) ? -1 : M9.step; const workRow = activeStep - 1;

    // 只要当前步 > 0，说明这一步用的被除数位「刚刚从上面落下来」
    const landIdx = (curStep > 0 && steps[curStep]) ? steps[curStep].end : -1;
    console.log('[div] curStep=', curStep, '| steps=', steps.map(s => ({ start: s.start, end: s.end })), '| landIdx=', landIdx);

    steps.forEach((s, idx) => {
      const col = 2 + s.end + 1;
      const key = `quotient-${idx}`;
      const filled = M9.filled[key];
      const isCurrent = M9.waitingFor === 'quotient' && idx === curStep;

      if (isCurrent) cells.push({ row: 1, col, cls: 'input-cell', input: true, maxlength: 1 });
      else if (filled) cells.push({ row: 1, col, text: filled, cls: 'vc-div-q', st: 'historyMid' });
      else cells.push({ row: 1, col, text: '', cls: '' });
    });

    cells.push({ row: 2, col: 1, text: b, cls: 'vc-div-divisor' });
    cells.push({ row: 2, col: 2, text: '', cls: 'vc-div-sep' });
    /* 改成（只多一个 key 字段） */
    /* 再改成 */
    for (let i = 0; i < n; i++) {
      cells.push({
        row: 2, col: 3 + i, text: aD[i], cls: '',
        key: 'dividend-' + i,
        st: (i === landIdx) ? 'historyDeep' : undefined,   // 落下去 → 浅灰占位
      });
    }

    let curRow = 3;
    steps.forEach((s, idx) => {
      const prodStr = String(s.prod);
      const prodDigits = prodStr.split('').map(Number);
      const prodStartCol = 3 + s.end - (prodDigits.length - 1);
      const prodKey = `product-${idx}`;
      const prodFilled = M9.filled[prodKey];
      const isCurrentProd = M9.waitingFor === 'product' && idx === curStep;

      /* 改成 */
      if (isCurrentProd) {
        // 正在填：输入框就是高亮，同组其余格不设颜色
        for (let i = 0; i < prodDigits.length; i++) {
          if (i === prodDigits.length - 1) cells.push({ row: curRow, col: prodStartCol + i, cls: 'input-cell', input: true });
          else cells.push({ row: curRow, col: prodStartCol + i, text: '', cls: '' });
        }
      } else if (prodFilled) {
        // 当前工作行上方的乘积还在用 → 中灰；更早的 → 死亡褪色
        const st = (idx === workRow) ? 'historyMid' : 'historyDeep';
        for (let i = 0; i < prodDigits.length; i++) {
          cells.push({ row: curRow, col: prodStartCol + i, text: prodDigits[i], cls: '', st });
        }
      } else {
        for (let i = 0; i < prodDigits.length; i++) cells.push({ row: curRow, col: prodStartCol + i, text: '', cls: '' });
      }
      curRow++;

      const lineStartCol = 3 + s.start;
      const lineEndCol = 3 + s.end;
      for (let c = lineStartCol; c <= lineEndCol; c++) cells.push({ row: curRow, col: c, text: '', cls: idx <= curStep ? 'vc-div-line' : '' });
      curRow++;

      if (idx < steps.length - 1) {
        const remStr = String(s.rem);
        const remDigits = remStr.split('').map(Number);
        const remStartCol = 3 + s.end - (remDigits.length - 1);
        const remKey = `remainder-${idx}`;
        const remFilled = M9.filled[remKey];
        const isCurrentRem = M9.waitingFor === 'remainder' && idx === curStep;

        if (isCurrentRem) {
          const fullLen = remDigits.length;
          for (let i = 0; i < fullLen - 1; i++) cells.push({ row: curRow, col: remStartCol + i, text: '', cls: '' });
          cells.push({ row: curRow, col: remStartCol + fullLen - 1, cls: 'input-cell', input: true, maxlength: fullLen });
        } else if (remFilled) {
          const st = (idx === workRow) ? 'focus' : 'historyDeep';
          for (let i = 0; i < remDigits.length; i++) {
            cells.push({ row: curRow, col: remStartCol + i, text: remDigits[i], cls: '',
                         key: remKey + '-' + i, st });
          }
          // 落下来的被除数位：和这行的余数同属"当前工作数"，一起黄
          if (landIdx >= 0 && landIdx === s.end + 1) {   // 常驻：落下来的位一直留着
            cells.push({ row: curRow, col: 3 + landIdx, text: aD[landIdx], cls: '',
                         key: 'landed-' + landIdx, st: (idx === workRow) ? 'focus' : 'historyDeep' });
          }
        } else {
          for (let i = 0; i < remDigits.length; i++) cells.push({ row: curRow, col: remStartCol + i, text: '', cls: '' });
        }
        curRow++;
      }
    });

    const finalRem = steps[steps.length - 1].rem;
    const finalKey = `remainder-${steps.length - 1}`;
    const finalFilled = M9.filled[finalKey];
    const isCurrentFinal = M9.waitingFor === 'remainder' && curStep === steps.length - 1;
    if (steps.length > 1 || finalFilled || isCurrentFinal || curStep >= steps.length - 1) {
      const endPos = steps[steps.length - 1].end;
      const str = String(finalRem);
      const digits = str.split('').map(Number);
      const startCol = 3 + endPos - (digits.length - 1);

      if (isCurrentFinal) {
        for (let i = 0; i < digits.length; i++) {
          if (i === digits.length - 1) cells.push({ row: curRow, col: startCol + i, cls: 'input-cell', input: true });
          else cells.push({ row: curRow, col: startCol + i, text: '', cls: '' });
        }
      } else if (finalFilled) {
        // 终局：最后一个余数用纯白 + 绿色发光，其余全部保持最暗
        const st = isFinale ? 'result' : 'historyDeep';
        for (let i = 0; i < digits.length; i++) {
          cells.push({ row: curRow, col: startCol + i, text: digits[i], cls: '', st });
        }
      }
    }

    let html = `<div class="vc-div-grid" style="grid-template-columns: 40px 24px ${'48px '.repeat(n)}; grid-auto-rows: 50px;">`;
    cells.forEach(c => {
      const inner = c.input ? `<input type="text" class="vc-input" id="m9InlineInput" inputmode="numeric" maxlength="${c.maxlength || 3}" enterkeyhint="next" autocomplete="off">` : (c.text !== undefined ? c.text : '');
      const extraStyle = (!c.input && c.st) ? vcStyleInline(c.st) : '';
      /* 改成 */
      const keyAttr = c.key ? ' data-vc-key="' + c.key + '"' : '';
      html += `<div style="grid-row:${c.row};grid-column:${c.col};${extraStyle}"${keyAttr} class="${c.cls || ''}">${inner}</div>`;
    });
    html += '</div>';
    return html;
  }

  function m9Render() {
    let html = '';
    if (M9.op === '+' || M9.op === '−') html = renderAddSub();
    else if (M9.op === '×') html = renderMul();
    else html = renderDiv();

    display.innerHTML = html;
    m9LandPop(display);          // ← 加这一行

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

    m9LandPop(display);
    m9BringDown(display);       // ← 加这一行
  }

  /* ============ 竖式 · 先估算 ============ */
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
    const curStep = M9.step;
    const op = M9.op;

    if (op === '+' || op === '−') {
      const curI = getAddSubMaxLen() - 1 - curStep;
      const prevCarryKey = `carry-${curI + 1}`;
      if (ANSWER[prevCarryKey] && !M9.filled[prevCarryKey]) { M9.waitingFor = 'carry'; m9Render(); focusInlineInput(); return; }
      const curCarryKey = `carry-${curI}`;
      if (ANSWER[curCarryKey] && !M9.filled[curCarryKey]) { M9.waitingFor = 'carry'; m9Render(); focusInlineInput(); return; }
      const resultKey = `result-${curI}`;
      if (!M9.filled[resultKey]) { M9.waitingFor = 'result'; m9Render(); focusInlineInput(); return; }
      M9.waitingFor = null; m9Render(); return;
    }

    if (op === '×') {
      const curPos = curStep;
      const carryKey = `carry-${curPos + 1}`;
      if (ANSWER[carryKey] && !M9.filled[carryKey]) { M9.waitingFor = 'carry'; m9Render(); focusInlineInput(); return; }
      M9.waitingFor = 'result'; m9Render(); focusInlineInput(); return;
    }

    if (op === '÷') {
      const qKey = `quotient-${curStep}`;
      if (!M9.filled[qKey]) { M9.waitingFor = 'quotient'; m9Render(); focusInlineInput(); return; }
      const pKey = `product-${curStep}`;
      if (!M9.filled[pKey]) { M9.waitingFor = 'product'; m9Render(); focusInlineInput(); return; }
      const rKey = `remainder-${curStep}`;
      if (!M9.filled[rKey]) { M9.waitingFor = 'remainder'; m9Render(); focusInlineInput(); return; }
      
      M9.step++;
      if (M9.step > m9GetMaxSteps()) {
        M9.step--;
        // ⭐ 先算出最终结果，供下面的 historyAdd / 掌握度复用。
        // 旧实现直接引用 `final`，但它只在 submitInline 的回调作用域里声明过
        // → 这里必抛 ReferenceError，导致做题记录与掌握度静默丢失。
        const final = calcFinalResult();
        setFeedback(`🎉 算出来啦！${M9.a} ${M9.op} ${M9.b} = <b>${calcFinalResult()}</b>`, 'ok');
        ctx.data.historyAdd({
          problemText: `${M9.a} ${M9.op} ${M9.b}`,
          problemSource: 'm9',
          moduleId: 'm9',
          studentSteps: Object.keys(M9.filled).map(k => ({ rel: k, sub: '', res: M9.filled[k] })),
          studentAnswer: String(final),
          isCorrect: true,
          correctAnswer: String(final),
          aiFeedback: null
        });
        const mrec = ctx.data.masteryRecord(`${M9.a} ${M9.op} ${M9.b}`, true);
        if (mrec && mrec.state === 'mastered') {
          ctx.toast('🏆 这道题你掌握了！', 'success');
          setTimeout(() => ctx.showMasteryCard({ problemText: `${M9.a} ${M9.op} ${M9.b}`, correctAnswer: String(calcFinalResult()), takeaway: takeawayLoad(`${M9.a} ${M9.op} ${M9.b}`) }), 800);
        }
        return;
      }
      m9PromptCurrentStep();
      return;
    }
  }

  function focusInlineInput() {
    if (M9.submitting) return;
    if (!M9.waitingFor) return;
    ctx.focusWhenReady('m9InlineInput');
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
    container.querySelectorAll('#m9display .vc-cell.highlight').forEach(el => {
      el.classList.add('explore-highlight');
      setTimeout(() => el.classList.remove('explore-highlight'), 1200);
    });
    if (M9.op === '÷') {
      const divisor = container.querySelector('#m9display .vc-div-divisor');
      if (divisor) { divisor.classList.add('explore-highlight'); setTimeout(() => divisor.classList.remove('explore-highlight'), 1200); }
    }
  }

  function submitInline(input) {
    if (M9.submitting) return;
    const raw = input.value.trim();
    if (!raw) return;

    M9.submitting = true;   
    const curStep = M9.step;
    const op = M9.op;
    let key, expected;

    if (op === '+' || op === '−') {
      const curI = getAddSubMaxLen() - 1 - curStep;
      if (M9.waitingFor === 'carry') {
        if (ANSWER[`carry-${curI + 1}`] && !M9.filled[`carry-${curI + 1}`]) key = `carry-${curI + 1}`;
        else key = `carry-${curI}`;
      } else key = `result-${curI}`;
      expected = ANSWER[key];
    } else if (op === '×') {
      if (M9.waitingFor === 'carry') key = `carry-${curStep + 1}`;
      else key = `result-${curStep}`;
      expected = ANSWER[key];
    } else if (op === '÷') {
      if (M9.waitingFor === 'quotient') key = `quotient-${curStep}`;
      else if (M9.waitingFor === 'product') key = `product-${curStep}`;
      else key = `remainder-${curStep}`;
      expected = ANSWER[key];
    }

    if (String(raw) === String(expected)) {
      input.classList.remove('wrong'); 
      input.classList.add('correct');
      // ⭐ 加入打勾动画
      const parent = input.closest('.vc-cell.input-cell') || input.parentElement;
      if (parent) {
        parent.querySelectorAll('.m9-tick').forEach(x => x.remove());
        const tick = document.createElement('span');
        tick.className = 'm9-tick';
        tick.textContent = '✓';
        parent.appendChild(tick);
        setTimeout(() => tick.remove(), 800);
      }

      input.style.transition = 'transform .15s cubic-bezier(.34,1.5,.64,1)';
      input.style.transform = 'scale(1.15)';
      setTimeout(() => { input.style.transform = 'scale(1)'; }, 150);
      setFeedback(getEncouragement('m9', COMBO.count), 'ok');

      M9.filled[key] = raw;
      M9._popKey = key;          // 交给 m9LandPop 做落地弹跳
      M9._lastFilledKey = key;   // 供渲染判定「纯白 + 绿光」
      M9.waitingFor = null;
      input.blur();

      setTimeout(() => {
        M9.submitting = false;
        /* 改成 */
        if (isStepComplete()) {
          const justWasRemainder = (M9.waitingFor === 'remainder');
          M9.step++;
          if (justWasRemainder && M9.op === '÷') M9._bringDownNext = true;   // 下一步做落位
          if (M9.step > m9GetMaxSteps()) {
            M9.step--; M9.waitingFor = null; m9Render();
            setFeedback(`🎉 算出来啦！${M9.a} ${M9.op} ${M9.b} = <b>${calcFinalResult()}</b>`, 'ok');
            // 答对时：
// M10：改由壳层在 historyAdd 里统一发（带坐标），这里不再重复发
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
            return;
          }
          m9Render(); m9PromptCurrentStep();
        } else {
          m9Render(); m9PromptCurrentStep();
        }
      }, 400);
    } else {
      input.classList.add('wrong'); setFeedback('❌ 再想想', 'error');
      // 答错时：
      emitUI('WRONG', { moduleId: 'm9' });
      setTimeout(() => input.classList.remove('wrong'), 400);
      M9.submitting = false; input.focus();
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
      highlightM9WrongHint();
    }
  }

  function m9Reset() {
    if (window.__shell?.hideThumbBar) window.__shell.hideThumbBar();
    document.getElementById('thumbBar')?.classList.remove('show', 'ok', 'err');

    let a = +aInput.value, b = +bInput.value;
    if (!Number.isFinite(a)) a = 0; if (!Number.isFinite(b)) b = 0;
    a = Math.floor(a); b = Math.floor(b);
    M9.a = Math.max(0, Math.min(999, a)); M9.op = opInput.value;

    if (isMulDiv()) { b = Math.max(1, Math.min(9, b)); bInput.max = 9; bInput.min = 1; }
    else { b = Math.max(0, Math.min(999, b)); bInput.max = 999; bInput.min = 0; }
    M9.b = b;

    // ⭐ 修复：减法必须保证被减数 ≥ 减数，否则 computeAnswerMap 会按借位输出错位的「竖式」
    //    （如 100 − 999 会得到 result-0="9" 这类无意义列），等于教错学生。
    let adjustHint = '';
    if (M9.op === '−' && M9.b > M9.a) {
      M9.b = M9.a;
      adjustHint = `💡 被减数要 ≥ 减数，减数已调整为 ${M9.b}`;
    }

    if (M9.op === '÷' && M9.a < M9.b) {
      aInput.value = M9.a; bInput.value = M9.b;
      M9.step = -1; M9.waitingFor = null; M9.filled = {};
      M9.broughtDown = new Set();   // 预留：后续持久化用；本轮只创建，不参与渲染
      M9._bringDownNext = false;    // 一次性标记：下一步要不要做落位动画
      M9._landedIdx = -1;           // 一次性：刚落下来的被除数位索引（-1 = 无）
      ANSWER = computeAnswerMap(); M9_ESTIMATE.passed = false; m9HideEstimateBox();
      setFeedback(`💡 ${M9.a} ÷ ${M9.b} = 0 余 ${M9.a}（被除数比除数小）`, 'ok');
      m9Render(); return;
    }

    aInput.value = M9.a; bInput.value = M9.b;
    M9.step = -1; M9.waitingFor = null; M9.filled = {};
    M9.broughtDown = new Set();   // 预留：后续持久化用；本轮只创建，不参与渲染
    M9._bringDownNext = false;    // 一次性标记：下一步要不要做落位动画
    M9._landedIdx = -1;           // 一次性：刚落下来的被除数位索引（-1 = 无）
    ANSWER = computeAnswerMap(); M9_ESTIMATE.passed = false; m9HideEstimateBox();
    setFeedback(adjustHint || '点击「下一步」，开始计算');
    m9Render();
  }

  /* ⭐ 修复3：所有事件监听器统一挂载，并且确保在 return 时清理 */
  const onKeyDown = (e) => {
    if (e.target.id === 'm9InlineInput' && e.key === 'Enter') { e.preventDefault(); submitInline(e.target); }
  };
  const onBlur = (e) => {
    if (e.target.id !== 'm9InlineInput') return;
    setTimeout(() => {
      if (document.activeElement?.id === 'm9InlineInput') return;
      submitInline(e.target);
    }, 80);
  };
  const onInput = (e) => { if (e.target.id === 'm9InlineInput') e.target.classList.remove('wrong'); };
  const onDisplayClick = (e) => {
    if (M9.submitting || !M9.waitingFor) return;
    const input = $('#m9InlineInput');
    if (input && document.activeElement !== input) {
      input.focus(); try { input.setSelectionRange(input.value.length, input.value.length); } catch (err) {}
    }
  };

  display.addEventListener('keydown', onKeyDown);
  display.addEventListener('blur', onBlur, true);
  display.addEventListener('input', onInput);
  display.addEventListener('click', onDisplayClick);

  const handleM9Random = () => {
    const level = localStorage.getItem('grade3_m9_level') || window.__m9CurrentLevel || null;
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
  console.log('[模块9] ✅ 初始化完成（全互动版）');

  // ⭐ 核心修复：确保所有变量和函数就绪后再注册层级切换
  ctx.registerLevelHandler('m9', (levelId) => {
    if (!aInput || !bInput || !opInput) return;
    
    let op = '+';
    if (levelId === 'sub') op = '−';
    else if (levelId === 'mul') op = '×';
    else if (levelId === 'div') op = '÷';
    
    // 随机生成题目并填入
    const { a, b } = randomProblemByOp(op);
    aInput.value = a;
    bInput.value = b;
    opInput.value = op;
    
    // 触发重置，页面直接刷新
    m9Reset();
  });

  // 错题本注册重做
  registerActiveModule('m9', {
    redo: (text) => {
      const m = text.match(/^(\d+)\s*([+\-−×÷])\s*(\d+)$/);
      if (m) {
        aInput.value = m[1]; opInput.value = m[2]; bInput.value = m[3];
        m9Reset();
      }
    }
  });
}