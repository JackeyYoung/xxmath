/* grades/grade3/modules/m1.js
   混合运算模块，完整版
*/
import { parseExpression, tokensToString, cleanParens, tokensToMarkedHtml } from '../scoring/m1.js';
import { COMBO } from '../../../core/ui/celebrate.js';
import { getEncouragement } from '../../../core/ui/encourage.js';
import { registerActiveModule, unregisterActiveModule } from '../../../app/shell.js';
import { emitUI } from '../../../core/ui/bus-ui.js'; // 顶部引入

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

export default async function mount(container, ctx) {
  // 1. 挂载模板
  const tpl = document.getElementById('tpl-m1');
  if (!tpl) {
    console.error('[m1] 找不到 tpl-m1 模板');
    return;
  }
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));

  const $ = sel => container.querySelector(sel);
  
  // 2. 内部状态
  const M1 = {
    tokens: [], done: false, original: '', originalDisplay: '', steps: [],
    waitingOpIdx: -1, pendingResult: null, pendingLeft: null, pendingRight: null,
    pendingOp: null, pendingMarkedHtml: ''
  };

  const M1_PRIORITY = { passed: false, expectedOps: [] };
  let presets = [...M1_PRESETS];

  // 3. 工具函数
  const fmtNum = n => Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);

  // ⭐ 注册层级切换处理器
  ctx.registerLevelHandler('m1', (levelId) => {
    // 1. 找到当前层级配置
    const lv = meta.levels.find(x => x.id === levelId) || meta.levels[0];
    
    // 2. 根据 filter 过滤预设题目池
    const filteredPresets = M1_PRESETS.filter(lv.filter);
    const finalPresets = filteredPresets.length > 0 ? filteredPresets : M1_PRESETS;
    
    // 3. 更新下拉框和当前池子
    presets = finalPresets; 
    m1InitSelect(presets);

    // 4. 自动随机抽一题（原版切层级后会自动出一题）
    const randomIdx = Math.floor(Math.random() * presets.length);
    m1LoadExpression(presets[randomIdx].expr);
  });

  function m1SetFeedback(msg, type) {
    const fb = $('#m1fb');
    fb.textContent = msg;
    fb.className = 'feedback' + (type ? ' ' + type : '');
    
    // ⭐ 核心修复：唤醒底部拇指条
    if (type === 'ok' || type === 'error') {
      const isOk = type === 'ok';
      ctx.showThumbBar({
        text: msg.replace(/^[✓❌🎉]\s*/, ''),
        ok: isOk,
        onNext: () => {
          // 如果整题做完了，点继续出随机题
          if (M1.done) {
            $('#m1Random')?.click();
          } else {
            // 没做完，聚焦下一步
            const nextInp = $('#m1Input');
            if (nextInp) nextInp.focus();
          }
        }
      });
    }
  }

  // 4. 渲染逻辑
  function m1Render() {
    const el = $('#m1expr');
    if (!el) return;
    el.innerHTML = '';
    if (M1.tokens.length === 0) {
      el.innerHTML = '<span style="color:#cbd5e1;font-size:16px;">请在上方选择或输入算式</span>';
      m1RenderSteps();
      return;
    }
    M1.tokens.forEach((t, i) => {
      const s = document.createElement('span');
      if (t.type === 'lparen' || t.type === 'rparen') {
        s.className = 'token paren';
        s.textContent = t.val;
      } else {
        s.className = 'token ' + (t.type === 'op' ? 'op' : 'num');
        s.textContent = t.type === 'num' ? fmtNum(t.val) : t.val;
        if (t.type === 'op' && !M1.done) {
          s.title = '点我先算这一步';
          s.addEventListener('click', () => m1ClickOp(i));
        }
        if (t.type === 'op' && i === M1.waitingOpIdx) {
          s.classList.add('active');
          s.style.outline = '3px solid #fbbf24';
          s.style.outlineOffset = '2px';
        }
      }
      el.appendChild(s);
    });
    m1RenderSteps();
  }

  function m1RenderSteps() {
    const el = $('#m1steps');
    if (!el) return;

    if (M1.steps.length === 0 && M1.waitingOpIdx < 0) {
      el.innerHTML = '<div class="steps-empty">计算过程会在这里逐行显示 👇</div>';
      return;
    }

    let html = `<div class="step-row step-original"><span class="step-eq">原式</span><span class="step-content">${M1.originalDisplay}</span></div>`;

    M1.steps.forEach((step, idx) => {
      const isLast = (idx === M1.steps.length - 1);
      html += `<div class="step-row"><span class="step-eq"></span><span class="step-content">${step.markedHtml}</span><span class="step-tag">先算这步</span></div>`;
      if (isLast && M1.done) {
        html += `<div class="step-row"><span class="step-eq">=</span><span class="step-content"><span class="step-final">${step.resultStr}</span></span></div>`;
      } else {
        html += `<div class="step-row"><span class="step-eq">=</span><span class="step-content">${step.resultStr}</span></div>`;
      }
    });

    if (M1.waitingOpIdx >= 0) {
      const toks = M1.tokens;
      const i = M1.waitingOpIdx;
      const left = toks[i - 1], op = toks[i], right = toks[i + 1];
      html += `<div class="step-row step-input-row">
        <span class="step-eq">=</span>
        <span class="step-content">
          <span class="step-part">( ${fmtNum(left.val)} ${op.val} ${fmtNum(right.val)} )</span>
          <span style="margin: 0 8px; color: #94a3b8;">→</span>
          <input type="text" class="step-input" id="m1Input" inputmode="numeric" enterkeyhint="done" placeholder="?" autocomplete="off">
        </span>
      </div>`;
      html += `<div class="step-row" style="padding-left: 54px;"><span id="m1InputFeedback" class="calc-input-feedback"></span></div>`;
    }

    el.innerHTML = html;

    if (M1.waitingOpIdx >= 0) {
      const inp = $('#m1Input');
      if (inp) {
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); m1SubmitAnswer(); }
          else if (e.key === 'Escape') { m1CancelInput(); }
        });
        let blurTimeout = null;
        inp.addEventListener('blur', () => {
          blurTimeout = setTimeout(() => { if (inp.value.trim()) m1SubmitAnswer(); }, 150);
        });
        inp.addEventListener('focus', () => { if (blurTimeout) clearTimeout(blurTimeout); });
        if (ctx.focusWhenReady) ctx.focusWhenReady('m1Input');
      }
    }
  }

  // 5. 核心逻辑（优先步骤、点击、提交、合并）
  function m1LoadExpression(str) {
    M1.original = str;
    M1.tokens = parseExpression(str);
    M1.done = false;
    M1.steps = [];
    M1.waitingOpIdx = -1;
    M1.pendingResult = null;
    M1.pendingLeft = null;
    M1.pendingRight = null;
    M1.pendingOp = null;
    M1.pendingMarkedHtml = '';
    M1.originalDisplay = M1.tokens.length > 0 ? tokensToString(M1.tokens) : str;

    if (M1.tokens.length === 0) {
      m1SetFeedback('❌ 无法识别这道算式，请检查输入', 'error');
      m1Render();
      return;
    }
    m1Render();
    M1_PRIORITY.passed = false;
    M1_PRIORITY.expectedOps = [];
    m1HidePriorityBox();
    m1ShowPriorityBox();
    if (M1_PRIORITY.passed) m1SetFeedback('点击算式中的运算符，把它先算出来 👆', '');
    else m1SetFeedback('🤔 先选一选：这道题先算哪一步？', '');
  }

  function m1ShowPriorityBox() {
    const box = $('#m1PriorityBox');
    const opts = $('#m1PriorityOptions');
    const fb = $('#m1PriorityFeedback');
    if (!box || !opts) return;

    try {
      const d = new Date();
      const todayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (localStorage.getItem('grade3_priority_passed_date') === todayStr) {
        M1_PRIORITY.passed = true;
        box.style.display = 'none';
        m1SetFeedback('点击算式中的运算符，把它先算出来 👆', '');
        return;
      }
    } catch (e) {}

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
    opts.innerHTML = `
      <button class="priority-opt" data-key="muldiv">先算 乘除（× ÷）</button>
      <button class="priority-opt" data-key="addsub">先算 加减（+ −）</button>
    `;
    fb.textContent = '';
    fb.className = 'priority-feedback';

    opts.querySelectorAll('.priority-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const isCorrect = M1_PRIORITY.expectedOps.includes(key);
        opts.querySelectorAll('.priority-opt').forEach(b => b.classList.remove('chosen', 'wrong', 'correct'));
        btn.classList.add('chosen', isCorrect ? 'correct' : 'wrong');

        if (isCorrect) {
          fb.textContent = '✓ 对！先算乘除，再算加减。';
          fb.className = 'priority-feedback ok';
          M1_PRIORITY.passed = true;
          try {
            const d = new Date();
            const todayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            localStorage.setItem('grade3_priority_passed_date', todayStr);
          } catch (e) {}
          setTimeout(() => {
            box.style.display = 'none';
            m1SetFeedback('点击算式中的运算符，把它先算出来 👆', '');
          }, 800);
        }
      });
    });
    box.style.display = 'block';
  }

  function m1HidePriorityBox() {
    const box = $('#m1PriorityBox');
    if (box) box.style.display = 'none';
  }

  function m1ClickOp(i) {
    if (M1.done || !M1_PRIORITY.passed || M1.waitingOpIdx >= 0) return;

    const toks = M1.tokens;
    const op = toks[i].val;
    let depth = 0;
    for (let k = 0; k < i; k++) {
      if (toks[k].type === 'lparen') depth++;
      if (toks[k].type === 'rparen') depth--;
    }

    let maxDepth = 0, curDepth = 0;
    for (const t of toks) {
      if (t.type === 'lparen') { curDepth++; if (curDepth > maxDepth) maxDepth = curDepth; }
      if (t.type === 'rparen') curDepth--;
    }
    if (depth < maxDepth) {
      m1SetFeedback('❌ 先算括号里的哦！括号优先级最高。', 'error');
      return;
    }

    const hasMulDiv = toks.some((t, j) => {
      if (t.type !== 'op' || j === i) return false;
      if (t.val !== '×' && t.val !== '÷') return false;
      let d = 0;
      for (let k = 0; k < j; k++) {
        if (toks[k].type === 'lparen') d++;
        if (toks[k].type === 'rparen') d--;
      }
      return d === depth;
    });

    if ((op === '+' || op === '-') && hasMulDiv) {
      m1SetFeedback('❌ 先算乘除哦！', 'error');
      return;
    }

    const left = toks[i - 1], right = toks[i + 1];
    if (!left || !right || left.type !== 'num' || right.type !== 'num') return;

    M1.waitingOpIdx = i;
    M1.pendingOp = op;
    M1.pendingLeft = left.val;
    M1.pendingRight = right.val;
    M1.pendingMarkedHtml = tokensToMarkedHtml(toks, i - 1, i + 1);

    let val;
    if (op === '×') val = left.val * right.val;
    else if (op === '÷') {
      if (right.val === 0) { m1SetFeedback('❌ 不能除以 0 哦', 'error'); return; }
      val = left.val / right.val;
    } else if (op === '+') val = left.val + right.val;
    else if (op === '-') val = left.val - right.val;
    M1.pendingResult = val;

    m1Render();
    m1SetFeedback('✏️ 请算出这一步的得数', '');
  }

  function m1SubmitAnswer() {
    if (M1.waitingOpIdx < 0) return;
    const input = $('#m1Input');
    const fb = $('#m1InputFeedback');
    const raw = input.value.trim();

    let userVal;
    if (/^-?\d+(\.\d+)?$/.test(raw)) userVal = parseFloat(raw);
    else if (/^\d+\/\d+$/.test(raw)) {
      const [a, b] = raw.split('/').map(Number);
      if (b === 0) { m1ShowWrong(input, fb, '分母不能是 0 哦'); return; }
      userVal = a / b;
    } else { m1ShowWrong(input, fb, '请输入一个数字'); return; }

    if (Math.abs(userVal - M1.pendingResult) < 0.001) {
      input.classList.remove('wrong');
      input.classList.add('correct');
      fb.textContent = getEncouragement('m1', COMBO.count);
      fb.className = 'calc-input-feedback ok';
      input.blur();
      setTimeout(() => { m1CommitStep(); }, 500);
    } else {
      m1ShowWrong(input, fb, `❌ 再想想～ 提示：${M1.pendingOp === '÷' ? '用乘法验算一下' : '再算一遍'}`);
      emitUI('WRONG', { moduleId: 'm1' });
      input.focus();
      try { input.setSelectionRange(input.value.length, input.value.length); } catch(e) {}
    }
  }

  function m1ShowWrong(input, fb, msg) {
    input.classList.remove('correct');
    input.classList.add('wrong');
    fb.textContent = msg;
    fb.className = 'calc-input-feedback error';
    setTimeout(() => input.classList.remove('wrong'), 400);
  }

  function m1CommitStep() {
    const i = M1.waitingOpIdx;
    const val = M1.pendingResult;
    const toks = M1.tokens;

    const exprEl = $('#m1expr');
    const opEls = exprEl.querySelectorAll('.token');
    const leftEl = opEls[i - 1], opEl = opEls[i], rightEl = opEls[i + 1];
    if (leftEl && opEl && rightEl) {
      exprEl.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      const leftRect = leftEl.getBoundingClientRect();
      const rightRect = rightEl.getBoundingClientRect();
      const dx = rightRect.left - leftRect.right;
      leftEl.style.transform = `translateX(${dx / 2}px)`;
      rightEl.style.transform = `translateX(${-dx / 2}px)`;
      leftEl.style.transition = 'transform .28s cubic-bezier(.34,1.3,.64,1), opacity .28s';
      rightEl.style.transition = 'transform .28s cubic-bezier(.34,1.3,.64,1), opacity .28s';
      opEl.style.transition = 'opacity .2s, transform .2s';
      opEl.style.opacity = '0';
      opEl.style.transform = 'scale(0)';
    }

    setTimeout(() => {
      let newTokens = [...toks.slice(0, i - 1), { type: 'num', val }, ...toks.slice(i + 2)];
      newTokens = cleanParens(newTokens);
      const resultStr = tokensToString(newTokens);

      M1.steps.push({ markedHtml: M1.pendingMarkedHtml, resultStr });
      M1.tokens = newTokens;
      if (M1.tokens.length === 1) M1.done = true;

      M1.waitingOpIdx = -1;
      M1.pendingResult = null;
      M1.pendingOp = null;

      m1Render();
      // 在 commitStep 的 setTimeout 末尾：
      
      // ⭐ 提示下一个可点运算符
      setTimeout(() => {
        if (M1.done || M1.waitingOpIdx >= 0 || !M1_PRIORITY.passed) return;
        const toks = M1.tokens;
        const hasMulDiv = toks.some(t => t.type === 'op' && (t.val === '×' || t.val === '÷'));
        let targetIdx = -1;
        for (let i = 0; i < toks.length; i++) {
          const t = toks[i];
          if (t.type !== 'op') continue;
          if ((t.val === '+' || t.val === '-') && hasMulDiv) continue;
          targetIdx = i;
          break;
        }
        if (targetIdx < 0) return;
        
        let opCount = 0, domIdx = -1;
        for (let i = 0; i < toks.length; i++) {
          if (toks[i].type === 'op') {
            if (i === targetIdx) { domIdx = opCount; break; }
            opCount++;
          }
        }
        const opEls = container.querySelectorAll('.token.op');
        const el = opEls[domIdx];
        if (el) {
          el.classList.add('hint-pulse');
          setTimeout(() => el.classList.remove('hint-pulse'), 1600);
        }
      }, 620);

      if (M1.done) {
        const finalVal = M1.tokens[0].val;
        m1SetFeedback(`🎉 全部算完！结果是 ${fmtNum(finalVal)}。`, 'ok');
        emitUI('CORRECT', { moduleId: 'm1' });
        if (ctx.data && ctx.data.historyAdd) {
          ctx.data.historyAdd({
            problemText: M1.original, problemSource: 'm1', moduleId: 'm1',
            studentSteps: M1.steps.map((s, i) => ({ rel: `第 ${i + 1} 步`, sub: s.markedHtml, res: s.resultStr })),
            studentAnswer: fmtNum(finalVal), isCorrect: true, correctAnswer: fmtNum(finalVal), aiFeedback: null,
          });
        }
        if (ctx.data && ctx.data.masteryRecord) ctx.data.masteryRecord(M1.original, true);
      } else {
        const toks2 = M1.tokens;
        const hasMulDiv = toks2.some(t => t.type === 'op' && (t.val === '×' || t.val === '÷'));
        const hasAddSub = toks2.some(t => t.type === 'op' && (t.val === '+' || t.val === '-'));
        if (hasMulDiv && hasAddSub) {
          M1_PRIORITY.passed = false;
          m1ShowPriorityBox();
        } else {
          M1_PRIORITY.passed = true;
          m1SetFeedback('✅ 正确！继续点击下一步的运算符。', 'ok');
        }
      }
    }, 280);
  }

  function m1CancelInput() {
    M1.waitingOpIdx = -1;
    M1.pendingResult = null;
    M1.pendingOp = null;
    m1Render();
    m1SetFeedback('点击算式中的运算符，把它先算出来 👆', '');
  }

  // 6. 初始化下拉框和事件
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
    const level = localStorage.getItem('grade3_m1_level') || 'no-paren';
    const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    
    const GEN = {
      'no-paren': () => {
        const type = rnd(1, 6);
        if (type === 1) return `${rnd(2, 9)} × ${rnd(2, 9)} + ${rnd(10, 99)}`;
        if (type === 2) return `${rnd(30, 90)} - ${rnd(5, 15)} - ${rnd(5, 15)}`;
        if (type === 3) { const b = rnd(2, 9), q = rnd(2, 9); return `${b * q} ÷ ${b} + ${rnd(10, 50)}`; }
        if (type === 4) return `${rnd(2, 9)} × ${rnd(2, 9)} - ${rnd(2, 9)}`;
        if (type === 5) return `${rnd(2, 9)} × ${rnd(2, 9)} + ${rnd(2, 9)} × ${rnd(2, 9)}`;
        return `${rnd(10, 99)} - ${rnd(2, 9)} × ${rnd(2, 9)}`;
      },
      'with-paren': () => {
        const type = rnd(1, 3);
        if (type === 1) { const a = rnd(2, 9), b = rnd(2, 9), c = rnd(2, 9); return `(${a} + ${b}) × ${c}`; }
        if (type === 2) { const b = rnd(2, 9), q = rnd(2, 9), a = rnd(1, 5); return `(${b * q + a} - ${a}) ÷ ${b}`; }
        const a = rnd(2, 9), b = rnd(2, 9), c = rnd(2, 9), d = rnd(2, 9);
        return `(${a} + ${b}) × ${c} - ${d}`;
      },
      'mul-div': () => {
        const type = rnd(1, 3);
        if (type === 1) return `${rnd(2, 9)} × ${rnd(2, 9)} + ${rnd(10, 99)}`;
        if (type === 2) { const b = rnd(2, 9), q = rnd(2, 9); return `${b * q} ÷ ${b} + ${rnd(10, 50)}`; }
        return `${rnd(10, 99)} - ${rnd(2, 9)} × ${rnd(2, 9)}`;
      },
      'add-sub': () => {
        const type = rnd(1, 3);
        if (type === 1) return `${rnd(30, 90)} - ${rnd(5, 15)} - ${rnd(5, 15)}`;
        if (type === 2) return `${rnd(10, 50)} + ${rnd(10, 50)} - ${rnd(5, 30)}`;
        return `${rnd(10, 40)} + ${rnd(5, 30)} + ${rnd(5, 30)}`;
      },
    };
    const gen = GEN[level] || GEN['no-paren'];
    m1LoadExpression(gen());
  });

  $('#m1reset')?.addEventListener('click', () => {
    if (M1.original) m1LoadExpression(M1.original);
  });

  // 7. 启动
  m1InitSelect(presets);
  m1LoadExpression(presets[0].expr);

  // 向壳层注册“自定义载入”能力
  registerActiveModule('m1', {
    loadCustom: (text) => {
      const custom = $('#m1Custom');
      if (custom) {
        custom.value = text;
        $('#m1UseCustom')?.click();
      }
    }
  });

  return () => {
    unregisterActiveModule('m1');
    container.innerHTML = '';
  };
}