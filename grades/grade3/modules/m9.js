/* grades/grade3/modules/m9.js */
import * as M9Score from '../scoring/m9.js';
import { COMBO } from '../../../core/ui/celebrate.js';
import { getEncouragement } from '../../../core/ui/encourage.js';
import { takeawayLoad } from '../../../core/takeaway.js';
import { registerActiveModule, unregisterActiveModule } from '../../../app/shell.js';
import { emitUI } from '../../../core/ui/bus-ui.js';

export const meta = { title: '竖式运算', icon: '🔢' };

export default async function mount(container, ctx) {
  const tpl = document.getElementById('tpl-m9');
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
        html += `<div class="vc-cell carry">${filled}</div>`;
      } else {
        html += `<div class="vc-cell carry"></div>`;
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
        html += `<div class="vc-cell${hl}">${aD[i]}</div>`;
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
        html += `<div class="vc-cell${hl}">${bD[i]}</div>`;
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
        html += `<div class="vc-cell">${filled}</div>`;
      } else {
        html += `<div class="vc-cell"></div>`;
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
        html += `<div class="vc-cell carry">${filled}</div>`;
      } else {
        html += `<div class="vc-cell carry"></div>`;
      }
    }
    html += '</div>';

    html += '<div class="vc-row"><div class="vc-cell"></div>';
    for (let col = displayCols - 1; col >= 0; col--) {
      const hl = (col === M9.step && M9.step < aLen) ? ' highlight' : '';
      const val = (col < aLen) ? aRev[col] : '';
      html += `<div class="vc-cell${hl}">${val}</div>`;
    }
    html += '</div>';

    html += '<div class="vc-row"><div class="vc-cell op">×</div><div class="vc-cell"></div><div class="vc-cell"></div><div class="vc-cell"></div>';
    const hlB = (M9.step >= 0) ? ' highlight' : '';
    html += `<div class="vc-cell${hlB}">${b}</div></div>`;

    html += '<div class="vc-line"></div>';

    html += '<div class="vc-row"><div class="vc-cell"></div>';
    for (let col = displayCols - 1; col >= 0; col--) {
      const resultKey = `result-${col}`;
      const filled = M9.filled[resultKey];
      const isCurrent = M9.waitingFor === 'result' && col === M9.step;

      if (isCurrent) {
        html += `<div class="vc-cell input-cell"><input type="text" class="vc-input" id="m9InlineInput" inputmode="numeric" maxlength="1" autocomplete="off"></div>`;
      } else if (filled) {
        html += `<div class="vc-cell">${filled}</div>`;
      } else {
        html += `<div class="vc-cell"></div>`;
      }
    }
    html += '</div></div>';
    return html;
  }

  function renderDiv() {
    const a = M9.a, b = M9.b;
    if (b === 0) return '<div style="color:#b91c1c;font-size:18px;">除数不能为 0</div>';

    const aStr = String(a);
    const n = aStr.length;
    const aD = aStr.split('').map(Number);
    if (a < b) {
      return `<div class="vertical-calc" style="padding:20px;text-align:center;"><div style="font-size:24px;font-weight:800;color:#1e293b;margin-bottom:12px;">${a} ÷ ${b} = 0 余 ${a}</div><div style="font-size:14px;color:#64748b;">被除数比除数小，商是 0，余数就是被除数本身</div></div>`;
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

    steps.forEach((s, idx) => {
      const col = 2 + s.end + 1;
      const key = `quotient-${idx}`;
      const filled = M9.filled[key];
      const isCurrent = M9.waitingFor === 'quotient' && idx === curStep;

      if (isCurrent) cells.push({ row: 1, col, cls: 'input-cell', input: true });
      else if (filled) cells.push({ row: 1, col, text: filled, cls: 'vc-div-q' });
      else cells.push({ row: 1, col, text: '', cls: '' });
    });

    cells.push({ row: 2, col: 1, text: b, cls: 'vc-div-divisor' });
    cells.push({ row: 2, col: 2, text: '', cls: 'vc-div-sep' });
    for (let i = 0; i < n; i++) cells.push({ row: 2, col: 3 + i, text: aD[i], cls: '' });

    let curRow = 3;
    steps.forEach((s, idx) => {
      const prodStr = String(s.prod);
      const prodDigits = prodStr.split('').map(Number);
      const prodStartCol = 3 + s.end - (prodDigits.length - 1);
      const prodKey = `product-${idx}`;
      const prodFilled = M9.filled[prodKey];
      const isCurrentProd = M9.waitingFor === 'product' && idx === curStep;

      if (isCurrentProd) {
        for (let i = 0; i < prodDigits.length; i++) {
          if (i === prodDigits.length - 1) cells.push({ row: curRow, col: prodStartCol + i, cls: 'input-cell', input: true });
          else cells.push({ row: curRow, col: prodStartCol + i, text: '', cls: '' });
        }
      } else if (prodFilled) {
        for (let i = 0; i < prodDigits.length; i++) cells.push({ row: curRow, col: prodStartCol + i, text: prodDigits[i], cls: 'vc-div-highlight' });
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
          for (let i = 0; i < remDigits.length; i++) cells.push({ row: curRow, col: remStartCol + i, text: remDigits[i], cls: '' });
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
        for (let i = 0; i < digits.length; i++) cells.push({ row: curRow, col: startCol + i, text: digits[i], cls: 'vc-div-highlight' });
      }
    }

    let html = `<div class="vc-div-grid" style="grid-template-columns: 40px 24px ${'48px '.repeat(n)}; grid-auto-rows: 50px;">`;
    cells.forEach(c => {
      const inner = c.input ? `<input type="text" class="vc-input" id="m9InlineInput" inputmode="numeric" maxlength="${c.maxlength || 3}" enterkeyhint="next" autocomplete="off">` : (c.text !== undefined ? c.text : '');
      html += `<div style="grid-row:${c.row};grid-column:${c.col};" class="${c.cls || ''}">${inner}</div>`;
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
        setFeedback(`🎉 算出来啦！${M9.a} ${M9.op} ${M9.b} = <b>${calcFinalResult()}</b>`, 'ok');
        ctx.data.historyAdd({
            problemText: `${M9.a} ${M9.op} ${M9.b}`, problemSource: 'm9', moduleId: 'm9',
            studentSteps: Object.keys(M9.filled).map(k => ({ rel: k, sub: '', res: M9.filled[k] })),
            studentAnswer: String(calcFinalResult()), isCorrect: true, correctAnswer: String(calcFinalResult()), aiFeedback: null,
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
      input.classList.remove('wrong'); input.classList.add('correct');
      input.style.transition = 'transform .15s cubic-bezier(.34,1.5,.64,1)';
      input.style.transform = 'scale(1.15)';
      setTimeout(() => { input.style.transform = 'scale(1)'; }, 150);
      setFeedback(getEncouragement('m9', COMBO.count), 'ok');

      M9.filled[key] = raw;
      M9.waitingFor = null;
      input.blur();

      setTimeout(() => {
        M9.submitting = false;
        if (isStepComplete()) {
          M9.step++;
          if (M9.step > m9GetMaxSteps()) {
            M9.step--; M9.waitingFor = null; m9Render();
            setFeedback(`🎉 算出来啦！${M9.a} ${M9.op} ${M9.b} = <b>${calcFinalResult()}</b>`, 'ok');
            // 答对时：
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

    if (M9.op === '÷' && M9.a < M9.b) {
      aInput.value = M9.a; bInput.value = M9.b;
      M9.step = -1; M9.waitingFor = null; M9.filled = {};
      ANSWER = computeAnswerMap(); M9_ESTIMATE.passed = false; m9HideEstimateBox();
      setFeedback(`💡 ${M9.a} ÷ ${M9.b} = 0 余 ${M9.a}（被除数比除数小）`, 'ok');
      m9Render(); return;
    }

    aInput.value = M9.a; bInput.value = M9.b;
    M9.step = -1; M9.waitingFor = null; M9.filled = {};
    ANSWER = computeAnswerMap(); M9_ESTIMATE.passed = false; m9HideEstimateBox();
    setFeedback('点击「下一步」，开始计算');
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

  // 错题本注册重做
  registerActiveModule('m9', {
    redo: (text) => {
      const m = text.match(/^(\d+)\s*([+\-−×÷])\s*(\d+)$/);
      if (m) {
        aInput.value = m[1]; opInput.value = m[2]; bInput.value = m[3];
        aInput.dispatchEvent(new Event('input', { bubbles: true }));
        bInput.dispatchEvent(new Event('input', { bubbles: true }));
        opInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });

  return () => {
    unregisterActiveModule('m9');
    display.removeEventListener('keydown', onKeyDown);
    display.removeEventListener('blur', onBlur, true);
    display.removeEventListener('input', onInput);
    display.removeEventListener('click', onDisplayClick);
    $('#m9random')?.removeEventListener('click', handleM9Random);
    container.innerHTML = '';
  };
}