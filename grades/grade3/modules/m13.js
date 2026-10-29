/* grades/grade3/modules/m13.js
   解题思维模块，100% 原版还原（恢复状态联动、错题本、全链路缓存）
*/
import { escapeHtmlStrict } from '../../../core/html.js';
import { takeawayLoad, takeawaySave } from '../../../core/takeaway.js';
import { LLM_CONFIG, extractJson, normalizeAiFeedback, callLLM } from '../../../core/llm.js';
import { problemNumbers, isValidSubstitution, checkPassword, extractNums } from '../scoring/m13.js';
import { getEncouragement } from '../../../core/ui/encourage.js';
import { buildAiInsightHtml } from '../../../core/ui/ai-insight.js';
import { findCachedFeedback } from '../../../core/feedback-resolver.js';
import { showExplainModal } from '../../../core/ui/wrongbook-ui.js';

import { registerActiveModule, unregisterActiveModule } from '../../../app/shell.js';

const m13ExtractNums         = extractNums;
const m13ProblemNumbers      = problemNumbers;
const m13IsValidSubstitution = isValidSubstitution;
const m13CheckPassword       = checkPassword;

export const meta = {
  title: '解题思维训练',
  icon: '💡',
  levels: [
    { id: 'step-1', name: '一步', icon: '1️⃣', unlockAt: 0 },
    { id: 'step-2', name: '两步', icon: '2️⃣', unlockAt: 1 },
    { id: 'step-3', name: '三步', icon: '3️⃣', unlockAt: 2 },
    { id: 'step-4', name: '四步', icon: '4️⃣', unlockAt: 3 },
  ],
};

const M13_PROBLEMS = [
  { title:'两步减法：买东西找零', text:'小明有 15 元，买一支钢笔用去 8 元，又买一本本子用去 3 元。小明还剩多少元？', answer:'4元' },
  { title:'乘加两步：果园数树', text:'果园里有 4 排苹果树，每排 8 棵。还有 5 棵梨树。果园里一共有多少棵树？', answer:'37棵' },
  { title:'乘减两步：带钱购物', text:'张老师带了 100 元，买了 5 本同样的书，每本 12 元。张老师还剩多少元？', answer:'40元' },
  { title:'减除两步：剪绳子', text:'一根绳子长 20 米，剪下 5 米后，把剩下的平均分成 3 段。每段长多少米？', answer:'5米' },
  { title:'归一问题：走路', text:'小红 3 分钟走了 180 米。照这样的速度，她 7 分钟能走多少米？', answer:'420米' },
  { title:'面积周长：长方形花坛', text:'一个长方形花坛，长 8 米，宽 5 米。它的面积和周长各是多少？', answer:'面积40平方米，周长26米' },
  { title:'连减：卖皮球', text:'商店有 45 个皮球，上午卖出 18 个，下午卖出 15 个。还剩多少个？', answer:'12个' },
  { title:'一步乘法：买苹果', text:'学校买了 3 箱苹果，每箱 12 千克。一共买了多少千克？', answer:'36千克' },
  { title:'比较多少：两种花', text:'花坛里有 24 朵红花，黄花比红花少 9 朵。两种花一共有多少朵？', answer:'39朵' },
  { title:'求一倍：分糖果', text:'妈妈买了 36 颗糖果，平均分给 4 个小朋友。每个小朋友分到几颗？', answer:'9颗' }
];

export default async function mount(container, ctx) {
  const tpl = document.getElementById('tpl-m13');
  if (!tpl) return;
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));

  const $ = sel => container.querySelector(sel);
  const $$ = sel => [...container.querySelectorAll(sel)];

  /* ================= 状态 ================= */
  const M13_STEPS = { steps: [], minSteps: 1, maxSteps: 6, defaultSteps: 2, container: null };
  let M13_BANK = [];
  let M13_CurrentAnswer = null;
  let M13_ProblemSource = 'custom';
  let M13_CurrentProblem = null;
  let window_llmPwdOK = false;
  let hasUsedHighlight = false;

  let isBankReady = false;

  // ⭐ 快捷提示词
  const takeawayWrap = $('#pTakeaway')?.closest('.takeaway');
  if (takeawayWrap && !takeawayWrap.querySelector('.takeaway-quick')) {
    const hints = [
      { label: '还剩多少 → 减法', text: '遇到「还剩多少」用减法，先算一共用去多少，再减。' },
      { label: '一共 → 加法', text: '遇到「一共」用加法，把各部分加起来。' },
      { label: '平均分 → 除法', text: '遇到「平均分」用除法，总数 ÷ 份数 = 每份数。' },
      { label: '几倍 → 乘法', text: '遇到「是……的几倍」用乘法，一份数 × 倍数 = 总数。' },
      { label: '先算乘除后加减', text: '遇到混合运算，先算乘除，后算加减。' }
    ];
    const quick = document.createElement('div');
    quick.className = 'takeaway-quick';
    quick.innerHTML = hints.map(h => `<button type="button" class="takeaway-quick-btn">${h.label}</button>`).join('');
    takeawayWrap.appendChild(quick);
    
    quick.querySelectorAll('.takeaway-quick-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        const input = $('#pTakeaway');
        const cur = input.value.trim();
        input.value = cur ? cur + '；' + hints[i].text : hints[i].text;
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  }

  // ⭐ 修复：切换层级后，自动过滤题库、随机选题，并判断按钮文案
  // ================= 抽取层级切换逻辑 =================
  let _lastLevelLoadTime = 0;
  function handleLevelChange(levelId) {
    if (!isBankReady) return;

    const now = Date.now();
    if (now - _lastLevelLoadTime < 100) return;
    _lastLevelLoadTime = now;

    // 解析层级，如 step-3 提取出 3
    const stepCount = parseInt(levelId.replace('step-', ''), 10);
    
    // ⭐ 核心修复：从 FULL_BANK（全量题库）里过滤，绝对不丢步骤
    const filtered = FULL_BANK.filter(p => {
      let stepsNum = 2; // 默认两步
      if (p.steps && p.steps.length > 0) {
        stepsNum = p.steps.length;
      } else if (p.title && p.title.includes('一步')) {
        stepsNum = 1;
      } else if (p.title && p.title.includes('四步')) {
        stepsNum = 4;
      }
      
      if (levelId === 'step-4') return stepsNum >= 4;
      return stepsNum === stepCount;
    });

    // ⭐ 把过滤后的题库赋给 M13_BANK，用来渲染下拉框
    M13_BANK = filtered.length ? filtered : [...FULL_BANK];
    
    m13InitSelect();

    const sel = $('#pSelect');
    if (sel && sel.options.length > 1) {
      sel.selectedIndex = 1; // 默认选第一道
      
      const p = M13_BANK[1];
      if (p) {
        // 兼容性补齐 steps
        if (!p.steps || p.steps.length === 0) {
          const ansFull = typeof p.answer === 'string' ? p.answer : p.answer?.full;
          p.steps = [{ step: 1, relation: '根据题意计算得出结果', substitution: '——', result: ansFull || '见最终答案' }];
        }

        M13_ProblemSource = 'bank';
        M13_CurrentProblem = p;
        
        const ansFull = p.answer ? (typeof p.answer === 'string' ? p.answer : p.answer.full) : null;
        m13LoadProblem(p.text, ansFull, 'bank', p);
        m13InitSteps(p.steps.length);
        
        $('#m13StepsLocked').style.display = 'block';
        $('#m13UnlockBtn').textContent = '📖 查看标准解题过程';
        $('#m13StandardSteps').style.display = 'none';
        $('#m13StandardSteps')?.classList.remove('open');
      }
    }
  }

  // 注册给 shell.js
  ctx.registerLevelHandler('m13', handleLevelChange);

  // ================= 启动 =================
  m13InitSteps();
  resetAllSteps();
  
  //执行加载题库！
  loadBank(); 

  // 删掉这两行，已经移到 done 回调里了
  // window.M13_PROBLEMS_BANK = M13_BANK;
  // console.log('加载的问题', M13_BANK);

  registerActiveModule('m13', {
    redo: (text) => {
      // ⭐ 核心修复：在重做前，去全量题库里找一下这道题
      const bankItem = FULL_BANK.find(p => p.text === text);
      
      if (bankItem) {
        // 如果找到了，说明它是题库题，恢复题库身份和标准答案
        const ansFull = bankItem.answer ? (typeof bankItem.answer === 'string' ? bankItem.answer : bankItem.answer.full) : null;
        m13LoadProblem(bankItem.text, ansFull, 'bank', bankItem);
        $('#m13UnlockBtn').textContent = '📖 查看标准解题过程';
        } else {
        // 真正的自定义题
        m13LoadProblem(text, null, 'custom', null);
        
        // ⭐ 核心新增：判断以前是否存过这道题的 AI 讲解
        let hasHistory = false;
        try {
          const history = ctx.data.historyLoad ? ctx.data.historyLoad() : [];
          hasHistory = history.some(r => r.problemText === text && r.aiFeedback && r.aiFeedback.answer);
        } catch (e) {}
        
        if (hasHistory) {
          // 有缓存，不用花钱调 AI 了，直接让用户看历史
          $('#m13UnlockBtn').textContent = '📖 查看之前的 AI 讲解';
        } else {
          // 真没做过，只能调 AI 现算
          $('#m13UnlockBtn').textContent = '🤖 让 AI 现算标准解法';
        }
      }

      m13InitSteps();
      $('#m13StandardSteps').style.display = 'none';
      $('#m13StepsLocked').style.display = 'block';
      $('#m13StandardSteps')?.classList.remove('open');
    },
    showSolution: (text) => {
      // 这里保持你原来的逻辑不变...
      const cached = findCachedFeedback(text, M13_BANK);
      if (cached) {
        renderStandardSolution(cached.aiFeedback);
        $('#m13StepsLocked').style.display = 'none';
        $('#m13StandardSteps').style.display = 'block';
      } else {
        m13FetchStandardSolution();
      }
    }
  });

  /* ================= 工具函数 ================= */
  function m13ClearStepMarks() {
    $$('#formulaSteps input').forEach(inp => {
      inp.style.borderColor = '';
      inp.style.background = '';
      inp.title = '';
    });
  }

  function m13CollectSteps() {
    return M13_STEPS.steps.map(s => ({ rel: s.rel.trim(), sub: s.sub.trim(), res: s.res.trim() }));
  }

  function closeDrawer() {
    const mask = $('#problemPickerMask');
    if (mask) mask.style.display = 'none';
    document.body.classList.remove('modal-open');
  }

  function checkTakeawayBeforeChange() {
    const problemText = $('#problem-text')?.innerText.trim();
    if (!problemText) return true;
    const takeaway = $('#pTakeaway')?.value.trim();
    if (takeaway) return true;
    return confirm('💡 一题一得还没写哦！\n\n"这道题教会我什么？"记录一句心得，会让你印象更深。\n\n确定要跳过吗？');
  }

  /* ================= 步骤状态联动 ================= */
  function setStatus(stepNum, status) {
    const step = $(`.m13-step[data-step="${stepNum}"]`);
    if (!step) return;
    const el = step.querySelector('.m13-step-status');
    if (!el) return;

    const prev = el.dataset.status;
    el.dataset.status = status;
    step.classList.toggle('completed', status === 'done');

    // 只有当状态从未完成变成完成时，才自动操作下一步
    if (status === 'done' && prev !== 'done') {
      
      // ⭐ 延时 800ms 再收起当前面板，给用户留出看一眼的缓冲
      setTimeout(() => {
        // 如果此时用户还在当前步骤写东西，就不要收起来
        if (document.activeElement && step.contains(document.activeElement)) return;
        
        step.classList.remove('open');
        
        // 展开下一步
        const next = $(`.m13-step[data-step="${stepNum + 1}"]`);
        if (next && !next.classList.contains('open')) {
          setTimeout(() => {
            next.classList.add('open');
            // 平滑滚动到下一步
            next.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        }
      }, 800); 
    }
  }

  function resetAllSteps() {
    hasUsedHighlight = false;
    $$('.m13-step').forEach((step) => {
      step.classList.remove('open', 'completed');   // ⭐ 全部默认折叠
      const status = step.querySelector('.m13-step-status');
      if (status) status.dataset.status = 'pending';
    });
    updateAllSteps();
  }

  function updateAllSteps() {
    const problemText = $('#problem-text')?.innerText.trim() || '';
    
    // Step 1: 读题圈画
    setStatus(1, (problemText && hasUsedHighlight) ? 'done' : 'pending');
    
    // Step 2: 草稿纸（至少有 2 个格子写了内容才算完成）
    const scratch = $$('.scratch-cell textarea');
    const scratchFilled = scratch.filter(t => t.value.trim().length > 0).length;
    setStatus(2, scratchFilled >= 2 ? 'done' : 'pending');
    
    // Step 3: 关系式（至少有一组完整的「关系式」+「代入数字」+「得数」才算完成）
    const stepInputs = $$('#formulaSteps input');
    let completeFormulaCount = 0;
    $$('#formulaSteps .formula-step').forEach(step => {
      const rel = step.querySelector('input[data-field="rel"]')?.value.trim();
      const sub = step.querySelector('input[data-field="sub"]')?.value.trim();
      const res = step.querySelector('input[data-field="res"]')?.value.trim();
      if (rel && sub && res) completeFormulaCount++;
    });
    setStatus(3, completeFormulaCount > 0 ? 'done' : 'pending');
    
    // Step 4: 我的答案
    const pAnswer = $('#pAnswer');
    setStatus(4, pAnswer?.value.trim() ? 'done' : 'pending');
  }

  /* ================= 动态步骤管理 ================= */
  function m13InitSteps(stepCount) {
    M13_STEPS.container = $('#formulaSteps');
    if (!M13_STEPS.container) return;
    const n = Math.max(M13_STEPS.minSteps, Math.min(M13_STEPS.maxSteps, stepCount || M13_STEPS.defaultSteps));
    M13_STEPS.steps = [];
    for (let i = 0; i < n; i++) M13_STEPS.steps.push({ rel: '', sub: '', res: '' });
    m13RenderSteps();
    m13UpdateStepButtons();
  }

  function updateCheckBtnHint() {
    const btn = $('#pCheck');
    if (!btn) return;
    const problemText = $('#problem-text')?.innerText.trim() || '';
    const nums = m13ProblemNumbers(problemText);
    const steps = m13CollectSteps();
    const ok = steps.some(s => (s.rel || '').trim() && m13IsValidSubstitution(s.sub, nums));
    btn.classList.toggle('need-input', !ok);
    btn.title = ok ? '检查答案' : '请先写出「关系式」和含题目数字的「代入式」';
  }

  function m13RenderSteps() {
    const c = M13_STEPS.container;
    if (!c) return;
    const total = M13_STEPS.steps.length;

    c.innerHTML = M13_STEPS.steps.map((s, i) => `
      <div class="formula-step" data-step-idx="${i}">
        <div class="formula-step-hd">
          <span>第 ${i + 1} 步</span>
          ${total > 1 ? `<span style="font-size:12px;color:#94a3b8;font-weight:500;margin-left:6px;">（${i + 1} / ${total}）</span>` : ''}
        </div>
        <div class="formula-line"><label>关系式</label><input type="text" data-idx="${i}" data-field="rel" value="${escapeHtmlStrict(s.rel)}" autocomplete="off"></div>
        <div class="formula-line"><label>代入数字</label><input type="text" data-idx="${i}" data-field="sub" value="${escapeHtmlStrict(s.sub)}" autocomplete="off"></div>
        <div class="formula-line"><label>得数</label><input type="text" data-idx="${i}" data-field="res" value="${escapeHtmlStrict(s.res)}" autocomplete="off"></div>
      </div>
    `).join('');

    c.querySelectorAll('input[data-idx]').forEach(inp => {
      inp.addEventListener('input', e => {
        const idx = +e.target.dataset.idx;
        const field = e.target.dataset.field;
        if (M13_STEPS.steps[idx]) M13_STEPS.steps[idx][field] = e.target.value;
        updateCheckBtnHint();
        updateAllSteps();
      });
      inp.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const fields = ['rel', 'sub', 'res'];
        const curIdx = +inp.dataset.idx;
        const curField = inp.dataset.field;
        const nextFieldIdx = fields.indexOf(curField) + 1;
        let nextInput = null;
        if (nextFieldIdx < fields.length) nextInput = c.querySelector(`input[data-idx="${curIdx}"][data-field="${fields[nextFieldIdx]}"]`);
        else nextInput = c.querySelector(`input[data-idx="${curIdx + 1}"][data-field="rel"]`) || $('#pAnswer');
        if (nextInput) ctx.focusWhenReady(nextInput);
      });
    });
  }

  function m13AddStep() {
    if (M13_STEPS.steps.length >= M13_STEPS.maxSteps) return;
    M13_STEPS.steps.push({ rel: '', sub: '', res: '' });
    m13RenderSteps(); m13UpdateStepButtons();
    const cards = M13_STEPS.container.querySelectorAll('.formula-step');
    const lastCard = cards[cards.length - 1];
    const firstInput = lastCard?.querySelector('input[data-field="rel"]');
    if (firstInput) { firstInput.focus(); lastCard.scrollIntoView({ behavior: 'auto', block: 'nearest' }); }
  }

  function m13RemoveStep() {
    if (M13_STEPS.steps.length <= M13_STEPS.minSteps) return;
    M13_STEPS.steps.pop();
    m13RenderSteps(); m13UpdateStepButtons();
  }

  function m13UpdateStepButtons() {
    const addBtn = $('#addStepBtn');
    const remBtn = $('#removeStepBtn');
    if (addBtn) addBtn.disabled = M13_STEPS.steps.length >= M13_STEPS.maxSteps;
    if (remBtn) remBtn.disabled = M13_STEPS.steps.length <= M13_STEPS.minSteps;
  }

  /* ================= 题库与加载 ================= */
  let FULL_BANK = []; // ⭐ 核心修复：引入一个全量题库变量，绝不污染

  function loadBank() {
    const loadBtn = $('#pLoad');
    if (loadBtn) {
      loadBtn.disabled = true;
      loadBtn.dataset._origText = loadBtn.textContent;
      loadBtn.innerHTML = '<span class="btn-spinner"></span>题库加载中…';
    }

    const done = () => {
      if (loadBtn) { loadBtn.disabled = false; loadBtn.textContent = loadBtn.dataset._origText || '📥 载入'; }
      isBankReady = true;
      
      // ⭐ 核心修复 1：在题库加载完成后，再挂载给全局，供 Koji 和错题本使用
      window.M13_PROBLEMS_BANK = M13_BANK;
      //console.log('题库加载完成，已挂载到全局:', window.M13_PROBLEMS_BANK);

      // 如果 shell.js 提前触发了层级切换，这里补执行一次
      const savedLevel = localStorage.getItem('grade3_m13_level');
      if (savedLevel) {
        handleLevelChange(savedLevel);
      }
    };

    if (Array.isArray(window.PROBLEMS_BANK) && window.PROBLEMS_BANK.length > 0) {
      FULL_BANK = window.PROBLEMS_BANK;
      M13_BANK = [...FULL_BANK];
      m13InitSelect(); done(); return Promise.resolve();
    }
    if (location.protocol === 'file:') {
      FULL_BANK = M13_PROBLEMS.map((p, i) => ({ id: i + 1, type: '内置', text: p.text, answer: { full: p.answer } }));
      M13_BANK = [...FULL_BANK];
      m13InitSelect(); done(); return Promise.resolve();
    }
    return fetch('./data/problems.json')
      .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(data => { 
        FULL_BANK = data; 
        M13_BANK = [...FULL_BANK];
        m13InitSelect(); done(); 
      })
      .catch(e => {
        FULL_BANK = M13_PROBLEMS.map((p, i) => ({ id: i + 1, type: '内置', text: p.text, answer: { full: p.answer } }));
        M13_BANK = [...FULL_BANK];
        m13InitSelect(); done();
      });
  }

  function m13InitSelect() {
    // ⭐ 核心修复：不再重新去全局找题库，直接用传进来的 M13_BANK！
    const bank = M13_BANK;
    const groups = {};
    
    bank.forEach((p) => {
      const type = p.type || '内置题库';                 
      const origIdx = M13_BANK.indexOf(p);
      if (!groups[type]) groups[type] = [];
      groups[type].push({ p, i: origIdx });
    });

    let html = '<option value="">— 选择一道题目 —</option>';
    Object.keys(groups).forEach(type => {
      html += `<optgroup label="${type}">`;
      groups[type].forEach(({ p, i }) => {
        const label = p.title || p.text.slice(0, 22);
        html += `<option value="${i}">${label}</option>`;
      });
      html += '</optgroup>';
    });
    
    const sel = $('#pSelect');
    if (sel) sel.innerHTML = html;
  }

  function m13LoadProblem(text, answer, source, bankItem) {
    const el = $('#problem-text');
    el.textContent = text;
    M13_CurrentAnswer = answer || null;
    M13_ProblemSource = source || 'custom';
    M13_CurrentProblem = bankItem || null;
    $('#pResult').innerHTML = '';
    $('#pAnswer').value = '';
    window_llmPwdOK = false;

    m13ClearStepMarks();
    resetAllSteps();
    $$('.scratch-cell textarea').forEach(t => t.value = '');

    const savedTakeaway = takeawayLoad(text);
    const takeawayEl = $('#pTakeaway');
    if (takeawayEl) {
      takeawayEl.value = savedTakeaway;
      takeawayEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // ⭐ 打印当前执行后的真实状态
  }

  /* ================= 密码与 AI 求解 ================= */
  function showPasswordModal(onSuccess) {
    if (document.querySelector('.pwd-modal-mask')) return;
    const mask = document.createElement('div');
    mask.className = 'pwd-modal-mask';
    mask.innerHTML = `
      <div class="pwd-modal">
        <h3>🔒 请先独立思考</h3>
        <p>AI 现算需要密码</p>
        <input type="password" id="m13PwdInput" maxlength="8" autocomplete="off">
        <div class="pwd-error" id="m13PwdError"></div>
        <div class="pwd-btns">
          <button class="pwd-cancel" id="m13PwdCancel">取消</button>
          <button class="pwd-ok" id="m13PwdOk">解锁</button>
        </div>
      </div>
    `;
    document.body.appendChild(mask);
    document.body.classList.add('modal-open');

    const input = document.getElementById('m13PwdInput');
    setTimeout(() => input.focus(), 60);

    function tryUnlock() {
      if (m13CheckPassword(input.value.trim())) {
        document.body.classList.remove('modal-open');
        mask.remove();
        if (typeof onSuccess === 'function') onSuccess();
      } else {
        document.getElementById('m13PwdError').textContent = '密码不对，再想想～';
        input.value = ''; input.focus();
      }
    }
    document.getElementById('m13PwdOk').addEventListener('click', tryUnlock);
    document.getElementById('m13PwdCancel').addEventListener('click', () => { document.body.classList.remove('modal-open'); mask.remove(); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
  }

  async function callLLMStandardSolution(problemText) {
    if (!LLM_CONFIG.enabled) throw new Error('大模型未启用');
    const systemPrompt = `你是一位三年级数学老师，请为下面这道题写出标准的解题过程。\n\n请严格按以下 JSON 格式输出，不要添加任何多余文字、注释、markdown 代码块：\n\n{\n  "problem_understanding": "对题意的理解，1 句话",\n  "required_steps": 本题最合理的解题步数（数字，1~5）,\n  "answer": {\n    "value": 数字（只写数字，不带单位）,\n    "unit": "单位",\n    "full": "带单位的完整答案"\n  },\n  "steps": [\n    { "step": 1, "relation": "关系式", "substitution": "代入", "result": "得数" }\n  ],\n  "keywords": {\n    "known": "已知条件",\n    "unknown": "求什么",\n    "numbers": ["题中出现的数字"],\n    "units": ["题中的单位"]\n  }\n}\n\n要求：\n1. 学生是三年级，用加减乘除解决实际问题，不使用方程\n2. 解题步数由题目本身决定，可以是 1~3 步\n3. steps 数组是最少必要步骤\n4. 关系式用中文描述\n5. 输出必须是合法 JSON`;

    const headers = { 'Content-Type': 'application/json' };
    if (LLM_CONFIG.apiKey) headers['Authorization'] = `Bearer ${LLM_CONFIG.apiKey}`;
    const body = {
      model: LLM_CONFIG.model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `题目：${problemText}\n\n请写出标准解题过程。` }],
      response_format: { type: 'json_object' },
      temperature: 0.1, max_tokens: 4000, reasoning_effort: 'low'
    };

    const res = await fetch(LLM_CONFIG.apiUrl, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('模型未返回有效内容，请重试');
    const parsed = extractJson(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim());
    if (!parsed) throw new Error('模型返回格式异常，请再试一次');
    return parsed;
  }

  async function m13FetchStandardSolution() {
    const problemText = $('#problem-text')?.innerText.trim();
    if (!problemText) return ctx.toast('请先输入题目', 'info');

    const box = $('#m13StandardSteps');
    const body = $('#m13StandardStepsBody');
    const lock = $('#m13StepsLocked');
    if (!box || !body) return;

    lock.style.display = 'none';
    box.style.display = 'block';
    box.classList.remove('open');   // ⭐ 保持折叠，用户自己点开
    body.innerHTML = `<div class="ai-thinking"><span class="dots"><span></span><span></span><span></span></span><div><div class="think-text">🤖 AI 正在分析标准解法…</div></div><span class="think-time" id="stdTime">0.0s</span></div>`;

    const start = performance.now();
    const timeEl = document.getElementById('stdTime');
    const timer = setInterval(() => { if (timeEl) timeEl.textContent = ((performance.now() - start) / 1000).toFixed(1) + 's'; }, 100);

    try {
      const raw = await callLLMStandardSolution(problemText);
      clearInterval(timer);
      renderStandardSolution(normalizeAiFeedback(raw, null));
    } catch (e) {
      clearInterval(timer);
      body.innerHTML = `<div style="text-align:center;padding:24px 20px;"><div style="color:var(--red-text);font-weight:700;margin-bottom:12px;">❌ 获取标准解法失败：${e.message || '请稍后重试'}</div><button class="btn" id="m13RetryStdBtn">🔄 重新获取</button></div>`;
      document.getElementById('m13RetryStdBtn')?.addEventListener('click', () => m13FetchStandardSolution());
      lock.style.display = 'block';
    }
  }

  function renderStandardSolution(p) {
    const box = $('#m13StandardSteps');
    const body = $('#m13StandardStepsBody');
    if (!box || !body) return;

    const stepsHtml = (p.steps || []).map(s => `
      <div class="std-fold"><div class="std-fold-hd"><span>第 ${s.step} 步</span><span class="arrow">▶</span></div>
      <div class="std-fold-bd"><div class="std-line"><b>关系式：</b>${s.relation || '—'}</div><div class="std-line"><b>代入：</b>${s.substitution || '—'}</div><div class="std-line"><b>得数：</b>${s.result || '—'}</div></div></div>
    `).join('');
    const kwHtml = p.keywords ? `<div class="std-keywords"><div><b>已知：</b>${p.keywords.known || '—'}</div><div><b>求：</b>${p.keywords.unknown || '—'}</div><div><b>数字：</b>${(p.keywords.numbers || []).join('、')}</div><div><b>单位：</b>${(p.keywords.units || []).join('、')}</div></div>` : '';

    // ⭐ 写入 body，不再覆盖折叠头
    body.innerHTML = `${stepsHtml}<div class="std-fold"><div class="std-fold-hd"><span>✅ 最终答案</span><span class="arrow">▶</span></div><div class="std-fold-bd"><div class="std-answer">${p.answer?.full || '—'}</div></div></div>${kwHtml}`;

    box.style.display = 'block';
    box.classList.remove('open');   // ⭐ 默认折叠，用户自己点开

    // 内部 std-fold 独立折叠（这是子级，与标准答案外层折叠不冲突）
    body.querySelectorAll('.std-fold-hd').forEach(hd => {
      hd.addEventListener('click', (e) => {
        e.stopPropagation();   // 防止冒泡触发外层 standard-steps-hd
        hd.parentElement.classList.toggle('open');
      });
    });
  }

  /* ================= 判卷逻辑 ================= */
  async function handleCheck() {
    if ($('#pCheck').disabled) return;

    $('#pCheck').disabled = true; // ⭐ 加锁

    const user = $('#pAnswer').value.trim();
    const badge = $('#pResult');
    const problemText = $('#problem-text').innerText.trim();
    
    const setBadge = (type, text) => {
      badge.className = 'm13-result-badge' + (type ? ' ' + type : '');
      badge.textContent = text || '';
    };

    // 1. 前置校验
    if (!problemText) return setBadge('no', '请先选择或输入题目');
    if (!user) return setBadge('no', '✏ 请先写出答案');

    // 3. 校验步骤完整度
    const studentSteps = m13CollectSteps();
    const problemNums = m13ProblemNumbers(problemText);
    const completeSteps = studentSteps.filter(s => {
      return (s.rel || '').trim().length > 0 && (s.sub || '').trim().length > 0 && m13IsValidSubstitution(s.sub, problemNums);
    });

    const p = (M13_ProblemSource === 'bank') ? M13_CurrentProblem : null;
    const stdValue = p && p.answer && typeof p.answer === 'object' ? p.answer.value : null;
    const stdFull = p && p.answer ? (typeof p.answer === 'string' ? p.answer : p.answer.full) : null;

    if (completeSteps.length === 0) {
      const anyRel = studentSteps.some(s => (s.rel || '').trim());
      const anySub = studentSteps.some(s => (s.sub || '').trim());
      let tip = '✏ 请先写出「关系式」和「代入数字」，再点检查';
      if (anyRel && !anySub) tip = '✏ 有一步没写「代入数字」，补上再检查';
      else if (!anyRel && anySub) tip = '✏ 有一步没写「关系式」，补上再检查';
      else if (anySub) tip = '✏ 「代入数字」需要用到题目中的数字（如：15 − 8 − 3）';
      return setBadge('no', tip);
    }

    // 4. 题库题直接校验
    if (M13_ProblemSource === 'bank' && (stdValue != null || stdFull)) {
      const uNums = m13ExtractNums(user);
      const cNums = stdValue != null ? [stdValue] : m13ExtractNums(stdFull);
      const allMatch = cNums.length && cNums.every(v => uNums.some(x => Math.abs(x - v) < 0.001));

      if (allMatch) {
        setBadge('ok', '🎉 ' + getEncouragement('m13', 1) + ' 参考答案：' + stdFull);
        badge.style.animation = 'badgeBump .5s cubic-bezier(.34,1.5,.64,1)';
        setTimeout(() => { badge.style.animation = ''; }, 500);

        // ⭐ 核心新增：如果这次做对了，悄悄去错题本里把这条旧记录更新一下
        try {
          const wbList = ctx.data.wbLoad ? ctx.data.wbLoad() : [];
          const wbIdx = wbList.findIndex(w => w.text === problemText);
          if (wbIdx >= 0) {
            // 如果错题本里有这道题，就用最新的正确答案和解析覆盖它
            wbList[wbIdx].studentAnswer = user;
            wbList[wbIdx].correctAnswer = stdFull;
            ctx.data.wbSave(wbList);
          }
        } catch (e) {
          console.warn('同步更新错题本失败', e);
        }

        //if (ctx.data.handleRedoSuccess) ctx.data.handleRedoSuccess(problemText);
        
        // ⭐ 防止重复提交产生大量相同记录
        const isDuplicate = ctx.data.historyLoad().some(r => 
          r.problemText === problemText && 
          r.studentAnswer === user && 
          JSON.stringify(r.studentSteps) === JSON.stringify(studentSteps) &&
          r.isCorrect === allMatch
        );
        
        if (!isDuplicate) {
          ctx.data.historyAdd({
            problemText, problemSource: '题库', moduleId: 'm13', studentSteps: studentSteps, studentAnswer: user, isCorrect: true, correctAnswer: stdFull,
            aiFeedback: p && p.steps ? { answer: { full: stdFull }, steps: p.steps, judgement: { answer_correct: true, student_answer_issue: '无', step_issues: [], step_count_comment: '' }, _source: 'bank' } : null
          });
          ctx.data.masteryRecord(problemText, true);
        }

        // ⭐ 核心修复：调用全局重做成功逻辑
        if (ctx.handleRedoSuccess) ctx.handleRedoSuccess(problemText);
        else if (window.__handleRedoSuccess) window.__handleRedoSuccess(problemText);

      } else {
        setBadge('no', `❌ 再检查一下。提示：答案中应出现的数字有 ${cNums.join('、')}`);
        const stdSteps = $$('#m13StandardSteps .std-fold');
        if (stdSteps.length > 0) { stdSteps[0].classList.add('open'); $('#m13StandardSteps').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
        
        // ⭐ 防止重复提交产生大量相同记录
        const isDuplicate = ctx.data.historyLoad().some(r => 
          r.problemText === problemText && 
          r.studentAnswer === user && 
          JSON.stringify(r.studentSteps) === JSON.stringify(studentSteps) &&
          r.isCorrect === allMatch
        );
        
        if (!isDuplicate) {
          ctx.data.historyAdd({
            problemText, problemSource: '题库', moduleId: 'm13', studentSteps: studentSteps, studentAnswer: user, isCorrect: false, correctAnswer: stdFull,
            aiFeedback: p && p.steps ? { answer: { full: stdFull }, steps: p.steps, judgement: { answer_correct: false, student_answer_issue: '答案有误', step_issues: [], step_count_comment: '' }, _source: 'bank' } : null
          });
          ctx.data.masteryRecord(problemText, false);
        }
                
        // ⭐ 题库题错误，写入错题本
        if (ctx.data.wbAdd) {
          ctx.data.wbAdd({ 
            id: p ? p.id : 'bank', type: p ? p.type : '题库', moduleId: 'm13', text: problemText, studentAnswer: user, correctAnswer: stdFull, studentSteps: studentSteps, steps: p?.steps || null, 
            aiFeedback: p?.steps ? normalizeAiFeedback({ answer: { full: stdFull }, steps: p.steps, judgement: { answer_correct: false }, _source: 'bank' }, stdFull) : null 
          });
        }
      }
      return;
    }

    // 4. 自定义题：查历史解析 (⭐ 核心优化：放宽条件，只要有解析就拿来对比)
    const cachedRecord = (function findCached() {
      try {
        const list = ctx.data.historyLoad ? ctx.data.historyLoad() : [];
        // 只要能找到这道题的 aiFeedback 就行，不管上次的答案和步骤是什么
        return list.find(r => 
          r.problemText === problemText && 
          r.aiFeedback && 
          r.aiFeedback.answer
        ) || null;
      } catch (e) { return null; }
    })();

    if (cachedRecord && cachedRecord.aiFeedback) {
      const fb = cachedRecord.aiFeedback;
      const uNums = m13ExtractNums(user);
      const cNums = (typeof fb.answer?.value === 'number') ? [fb.answer.value] : m13ExtractNums(fb.answer?.full || cachedRecord.correctAnswer || '');
      const allMatch = cNums.length && cNums.every(v => uNums.some(x => Math.abs(x - v) < 0.001));

      if (allMatch) {
        setBadge('ok', '🎉 ' + getEncouragement('m13', 1) + ` （复用历史解析）参考答案：${fb.answer?.full || cachedRecord.correctAnswer || '—'}`);
        badge.style.animation = 'badgeBump .5s cubic-bezier(.34,1.5,.64,1)';
        setTimeout(() => { badge.style.animation = ''; }, 500);

        // ⭐ 核心新增：如果这次做对了，悄悄去错题本里把这条旧记录更新一下
        try {
          const wbList = ctx.data.wbLoad ? ctx.data.wbLoad() : [];
          const wbIdx = wbList.findIndex(w => w.text === problemText);
          if (wbIdx >= 0) {
            // 如果错题本里有这道题，就用最新的正确答案和解析覆盖它
            wbList[wbIdx].studentAnswer = user;
            wbList[wbIdx].correctAnswer = fb.answer?.full || cachedRecord.correctAnswer || '';
            wbList[wbIdx].aiFeedback = fb;
            ctx.data.wbSave(wbList);
          }
        } catch (e) {
          console.warn('同步更新错题本失败', e);
        }
        
        //if (ctx.data.handleRedoSuccess) ctx.data.handleRedoSuccess(problemText); // 原版用于联动分享
        ctx.data.masteryRecord(problemText, true);

        // ⭐ 核心修复：调用全局重做成功逻辑
        if (ctx.handleRedoSuccess) ctx.handleRedoSuccess(problemText);
        else if (window.__handleRedoSuccess) window.__handleRedoSuccess(problemText);
      } else {
        setBadge('no', `❌ 再检查一下。提示：答案中应出现的数字有 ${cNums.join('、')}`);
        ctx.data.masteryRecord(problemText, false);
        // 展开第一步标准解法
        const stdSteps = $$('#m13StandardSteps .std-fold');
        if (stdSteps.length > 0) { stdSteps[0].classList.add('open'); $('#m13StandardSteps').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      }

      // 渲染缓存讲解内容
      try {
        if (typeof buildAiInsightHtml === 'function' && fb.steps && fb.steps.length) {
          // 这里如果原版有 renderLLMFeedback，就直接在页面上渲染出来
        }
      } catch (e) { console.warn('[缓存渲染失败]', e); }

      // ⭐ 防止重复提交产生大量相同记录
      const isDuplicate = ctx.data.historyLoad().some(r => 
        r.problemText === problemText && 
        r.studentAnswer === user && 
        JSON.stringify(r.studentSteps) === JSON.stringify(studentSteps) &&
        r.isCorrect === allMatch
      );
      
      if (!isDuplicate) {
        // ⭐ 写入历史
        ctx.data.historyAdd({ problemText, problemSource: cachedRecord.problemSource || '题库', moduleId: cachedRecord.moduleId || 'm13', studentSteps: m13CollectSteps(), studentAnswer: user, isCorrect: allMatch, correctAnswer: fb.answer?.full || cachedRecord.correctAnswer || '', aiFeedback: fb });
      }
      
      // ⭐ 错误则写入错题本
      if (!allMatch && ctx.data.wbAdd) {
        ctx.data.wbAdd({ id: 'cached', type: cachedRecord.problemSource || '题库', text: problemText, studentAnswer: user, correctAnswer: fb.answer?.full || cachedRecord.correctAnswer || '', studentSteps: m13CollectSteps(), steps: fb.steps || null, aiFeedback: fb });
      }
      return; // 命中缓存直接结束
    }

    // 5. 大模型批改
    if (!LLM_CONFIG.enabled) return setBadge('info', '📝 自定义题目无标准答案，请对照题意自查（未启用大模型）');

    if (!window_llmPwdOK) {
      $('#pCheck').disabled = false; // 解锁，等待密码验证
      showPasswordModal(() => { window_llmPwdOK = true; handleCheck(); });
      return;
    }

    $('#pCheck').disabled = true;
    $('#pCheck').innerHTML = '<span class="btn-spinner"></span>AI 批改中…';
    setBadge('info', '');

    try {
      const raw = await callLLM({ problem: problemText, studentAnswer: user, steps: studentSteps });
      const result = normalizeAiFeedback(raw, null);
      const ok = result.judgement.answer_correct;

      setBadge(ok ? 'ok' : 'no', ok ? `🎉 ${getEncouragement('m13', 1)} 参考答案：${result.answer.full}` : `❌ ${result.judgement.student_answer_issue || '再检查一下'}`);
      if (ok) { badge.style.animation = 'badgeBump .5s cubic-bezier(.34,1.5,.64,1)'; 
        setTimeout(() => { badge.style.animation = ''; }, 500); 
        
        // ⭐ 核心新增：如果这次做对了，悄悄去错题本里把这条旧记录更新一下
        try {
          const wbList = ctx.data.wbLoad ? ctx.data.wbLoad() : [];
          const wbIdx = wbList.findIndex(w => w.text === problemText);
          if (wbIdx >= 0) {
            // 如果错题本里有这道题，就用最新的正确答案和解析覆盖它
            wbList[wbIdx].studentAnswer = user;
            wbList[wbIdx].correctAnswer = result.answer.full;
            wbList[wbIdx].aiFeedback = result; 
            ctx.data.wbSave(wbList);
          }
        } catch (e) {
          console.warn('同步更新错题本失败', e);
        }
      }

      // 渲染 AI 反馈
      // 由于原版这里有 renderLLMFeedback(result)，模块化后请确保有类似展示，如果没有可以直接调用你原来的。

      // ⭐ 防止重复提交产生大量相同记录
      const isDuplicate = ctx.data.historyLoad().some(r => 
        r.problemText === problemText && 
        r.studentAnswer === user && 
        JSON.stringify(r.studentSteps) === JSON.stringify(studentSteps) &&
        r.isCorrect === allMatch
      );
      
      if (!isDuplicate) {
        ctx.data.historyAdd({ problemText, problemSource: '自定义', moduleId: 'm13', studentSteps, studentAnswer: user, isCorrect: ok, correctAnswer: result.answer.full, aiFeedback: result });
        ctx.data.masteryRecord(problemText, ok);
      } 

      // ⭐ 自定义题错误，写入错题本
      if (!ok && ctx.data.wbAdd) {
        ctx.data.wbAdd({ id: 'llm', type: '自定义', text: problemText, studentAnswer: user, correctAnswer: result.answer.full, studentSteps: studentSteps, steps: result.steps || null, aiFeedback: result });
      } else {
        //if (ctx.data.handleRedoSuccess) ctx.data.handleRedoSuccess(problemText);
        // ⭐ 核心修复：调用全局重做成功逻辑
        if (ctx.handleRedoSuccess) ctx.handleRedoSuccess(problemText);
        else if (window.__handleRedoSuccess) window.__handleRedoSuccess(problemText);
      }
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('超时')) setBadge('no', '⏰ 网络有点慢（300 秒未响应），请检查网络后重试');
      else if (msg.includes('401') || msg.includes('403')) setBadge('no', '🔑 API 密钥无效，请联系老师');
      else if (msg.includes('429')) setBadge('no', '🚦 请求太频繁，稍后再试');
      else if (msg.includes('格式异常')) setBadge('no', '🤖 模型返回异常，请再点一次试试');
      else setBadge('no', '⚠️ 网络异常：' + (msg || '请稍后重试'));
    } finally {
      $('#pCheck').disabled = false;
      $('#pCheck').textContent = '✔ 检查';
    }
  }

  /* ================= 事件绑定 ================= */
  $('#pLoad')?.addEventListener('click', () => {
    if (!checkTakeawayBeforeChange()) return;
    if (!M13_BANK.length) return ctx.toast('题库还在加载中', 'info');
    
    const idx = $('#pSelect').value;
    if (idx === '') return ctx.toast('请先从下拉框选择一道题目', 'info');
    
    const p = M13_BANK[+idx];
    if (!p) return;
    
    // 1. 解析答案
    const ansFull = p.answer ? (typeof p.answer === 'string' ? p.answer : p.answer.full) : null;

    // 2. 加载题目并重置步骤
    m13LoadProblem(p.text, ansFull, 'bank', p);
    m13InitSteps(p.stepsCount || (p.steps ? p.steps.length : 2));
    
    // 3. ⭐ 核心修复：精准控制按钮的文字和状态
    $('#m13StepsLocked').style.display = 'block';
    
    if (p.steps && p.steps.length > 0) {
      $('#m13UnlockBtn').textContent = '📖 查看标准解题过程';
    } else {
      $('#m13UnlockBtn').textContent = '🤖 让 AI 现算标准解法';
    }
    
    // 4. 隐藏上一次的标准解法面板
    $('#m13StandardSteps').style.display = 'none';
    $('#m13StandardSteps')?.classList.remove('open');
    
    // 5. 关闭抽屉
    closeDrawer();
  });

  $('#pRandomBtn')?.addEventListener('click', () => {
    const select = $('#pSelect');
    if (!select || select.options.length <= 1) return ctx.toast('题库暂不可用', 'error');
    const validOptions = Array.from(select.options).filter(opt => opt.value !== '');
    if (!validOptions.length) return ctx.toast('当前层级下没有题目', 'info');
    const randomOpt = validOptions[Math.floor(Math.random() * validOptions.length)];
    select.value = randomOpt.value;
    $('#pLoad').click();
  });

  $('#pUseCustom')?.addEventListener('click', () => {
    if (!checkTakeawayBeforeChange()) return;
    const t = $('#pCustom').value.trim();
    if (!t) return;
    $('#pSelect').value = '';
    m13LoadProblem(t, null, 'custom', null);
    $('#pCustom').value = '';
    $('#m13StandardSteps').style.display = 'none';
    $('#m13StepsLocked').style.display = 'block';
    $('#m13StandardSteps')?.classList.remove('open');
    $('#m13UnlockBtn').textContent = '🤖 让 AI 现算标准解法';
    m13InitSteps();
    closeDrawer();
  });
  $('#pCustom')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('#pUseCustom').click(); });

  $('#pUpload')?.addEventListener('change', e => {
    if (!checkTakeawayBeforeChange()) { e.target.value = ''; return; }
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      $('#pSelect').value = '';
      m13LoadProblem(ev.target.result.trim(), null, 'custom', null);
      $('#m13StandardSteps').style.display = 'none';
      $('#m13StepsLocked').style.display = 'block';
      $('#m13StandardSteps')?.classList.remove('open');
      $('#m13UnlockBtn').textContent = '🔒 查看标准解题过程（需要密码）';
      m13InitSteps();
      closeDrawer();
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  });

  $('#problemChangeBtn')?.addEventListener('click', () => {
    const mask = $('#problemPickerMask');
    if (mask) mask.style.display = 'flex';
    document.body.classList.add('modal-open');
  });
  $('#problemPickerClose')?.addEventListener('click', closeDrawer);
  $('#problemPickerMask')?.addEventListener('click', (e) => {
    if (e.target.id === 'problemPickerMask') closeDrawer();
  });

  // 状态监听
  $('.hl-toolbar')?.addEventListener('click', (e) => {
    if (e.target.closest('.hl-btn') && !e.target.closest('.hl-clear')) {
      hasUsedHighlight = true;
      updateAllSteps();
    }
  });
  container.addEventListener('input', e => {
    if (e.target.closest('.m13-step') || e.target.id === 'problem-text') updateAllSteps();
    if (e.target.closest('#formulaSteps')) updateCheckBtnHint();
  });

  /* ================= 折叠：统一事件委托（挂一次，永不丢失） ================= */
  if (container.dataset.m13CollapseBound !== '1') {
    container.dataset.m13CollapseBound = '1';
    container.addEventListener('click', (e) => {
      // 1) 步骤卡折叠
      const stepHd = e.target.closest('.m13-step-hd');
      if (stepHd && container.contains(stepHd)) {
        const card = stepHd.closest('.m13-step');
        if (card) card.classList.toggle('open');
        return;
      }
      // 2) 标准答案折叠
      const stdHd = e.target.closest('.standard-steps-hd');
      if (stdHd && container.contains(stdHd)) {
        const wrap = stdHd.closest('.standard-steps');
        if (wrap) wrap.classList.toggle('open');
        return;
      }
    });
  }

  $('#addStepBtn')?.addEventListener('click', m13AddStep);
  $('#removeStepBtn')?.addEventListener('click', m13RemoveStep);
  $('#pCheck')?.addEventListener('click', handleCheck);
  $('#pAnswer')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('#pCheck').click(); });

  // 高亮
  $$('.hl-btn').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      const problemEl = $('#problem-text');
      if (!problemEl.contains(range.commonAncestorContainer)) return;
      try {
        document.execCommand('styleWithCSS', false, true);
        if (!document.execCommand('hiliteColor', false, color)) document.execCommand('backColor', false, color);
      } catch (e) {}
      sel.removeAllRanges();
    });
  });

  // 一题一得保存
  const takeawayInput = $('#pTakeaway');
  const takeawayBtn = $('#pTakeawaySave');
  const takeawayHint = $('#pTakeawayHint');
  let saveTimer = null, savedValue = '', savedFromProblem = '';

  function updateTakeawayBtnState() {
    const cur = takeawayInput.value.trim();
    const problem = $('#problem-text')?.innerText.trim() || '';
    if (!problem || !cur) {
      takeawayBtn.disabled = true; takeawayBtn.classList.remove('dirty', 'saved'); takeawayBtn.textContent = '💾 保存';
      takeawayHint.textContent = ''; takeawayHint.classList.remove('dirty', 'saved'); return;
    }
    takeawayBtn.disabled = false;
    const isDirty = (cur !== savedValue) || (problem !== savedFromProblem);
    if (isDirty) {
      takeawayBtn.classList.remove('saved'); takeawayBtn.classList.add('dirty'); takeawayBtn.textContent = '💾 保存修改';
      takeawayHint.textContent = '有未保存的修改'; takeawayHint.classList.add('dirty');
    } else {
      takeawayBtn.classList.remove('dirty', 'saved'); takeawayBtn.textContent = '💾 保存';
      takeawayHint.textContent = ''; takeawayHint.classList.remove('dirty');
    }
  }

  function doSaveTakeaway(silent) {
    const problem = $('#problem-text')?.innerText.trim();
    if (!problem) return;
    const cur = takeawayInput.value.trim();
    takeawaySave(problem, cur);
    savedValue = cur; savedFromProblem = problem;
    if (!silent) {
      takeawayBtn.classList.remove('dirty'); takeawayBtn.classList.add('saved'); takeawayBtn.textContent = '✅ 已保存';
      takeawayHint.textContent = '已保存到本地'; takeawayHint.classList.remove('dirty'); takeawayHint.classList.add('saved');
      setTimeout(() => { takeawayBtn.classList.remove('saved'); takeawayHint.classList.remove('saved'); updateTakeawayBtnState(); }, 1500);
    }
  }

  takeawayInput?.addEventListener('input', () => {
    updateTakeawayBtnState();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const problem = $('#problem-text')?.innerText.trim();
      const cur = takeawayInput.value.trim();
      if (problem && cur) { takeawaySave(problem, cur); savedValue = cur; savedFromProblem = problem; updateTakeawayBtnState(); }
    }, 500);
  });
  takeawayInput?.addEventListener('blur', () => {
    clearTimeout(saveTimer);
    const problem = $('#problem-text')?.innerText.trim();
    const cur = takeawayInput.value.trim();
    if (problem && cur && (cur !== savedValue || problem !== savedFromProblem)) doSaveTakeaway(true);
  });
  takeawayBtn?.addEventListener('click', () => { clearTimeout(saveTimer); doSaveTakeaway(false); });

  // ⭐ 查看标准解法（真正的降级链路：题库自带 -> 本地缓存 -> AI）
  $('#m13UnlockBtn')?.addEventListener('click', async () => {
    const problemText = $('#problem-text')?.innerText.trim();
    if (!problemText) return ctx.toast('请先输入题目', 'info');

    // 降级 1：如果是题库题，且自带 steps，直接渲染在下方（免密秒出）
    if (M13_ProblemSource === 'bank' && M13_CurrentProblem?.steps?.length) {
      renderStandardSolution({
        steps: M13_CurrentProblem.steps,
        answer: { full: M13_CurrentProblem.answer?.full || M13_CurrentProblem.answer }
      });
      $('#m13StepsLocked').style.display = 'none';
      return;
    }

    // ⭐ 降级 2：对于自定义题，先尝试从历史记录里找最新的一条 AI 解析
    let cachedFeedback = null;
    try {
      const history = ctx.data.historyLoad ? ctx.data.historyLoad() : [];
      const hit = history.find(r => r.problemText === problemText && r.aiFeedback && r.aiFeedback.answer);
      if (hit) {
        cachedFeedback = hit.aiFeedback;
      }
    } catch (e) {}

    if (cachedFeedback) {
      // 命中历史缓存，直接在当前页面下方渲染标准解法（不需要弹窗，体验极佳）
      renderStandardSolution(cachedFeedback);
      $('#m13StepsLocked').style.display = 'none';
      return;
    }

    // ⭐ 降级 3：真没有缓存，才调起 AI 现算弹窗
    try {
      const { showExplainModal } = await import('../../../core/ui/wrongbook-ui.js');
      showExplainModal(problemText);
    } catch (err) {
      console.error('加载讲解组件失败', err);
      ctx.toast('加载讲解失败，请重试', 'error');
    }
  });

  // AI 生成同类题
  $('#pickerAiBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const currentText = $('#problem-text')?.innerText.trim();
    if (!currentText) return ctx.toast('请先载入题目，AI 才能参考出题', 'info');

    const bodyEl = $('#problemPickerDrawer').querySelector('.problem-picker-body');
    const loadingEl = $('#pickerAiLoading');
    const subText = document.getElementById('pickerAiSub');
    if (bodyEl) bodyEl.style.display = 'none';
    if (loadingEl) loadingEl.style.display = 'block';
    if (subText) subText.textContent = `正在参考「${currentText.slice(0, 10)}...」生成同类题`;

    try {
      const systemPrompt = `你是一位三年级数学老师。\n请参考下面这道题的知识点和难度，出【一道】全新的同类题目。\n要求：\n1. 必须是三年级水平，数字合理，能用加减乘除解决。\n2. 题目描述要生活化、有趣。\n3. 必须严格按以下 JSON 格式输出，不要包含任何多余文字：\n{\n  "text": "题目文本（带单位）",\n  "answer": "最终答案（带单位）"\n}`;
      const res = await fetch(LLM_CONFIG.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: LLM_CONFIG.model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `原题：${currentText}\n\n请出 1 道同类新题。` }], response_format: { type: 'json_object' }, temperature: 0.7, max_tokens: 500 })
      });
      if (!res.ok) throw new Error(`API 报错：${res.status}`);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('模型未返回内容');
      const parsed = extractJson(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, ''));
      if (!parsed || !parsed.text) throw new Error('模型返回格式异常');

      $('#pCustom').value = parsed.text;
      $('#pUseCustom').click();
      ctx.toast('✅ AI 新题生成成功！', 'success');
    } catch (err) {
      ctx.toast('AI 生成失败：' + err.message, 'error');
    } finally {
      if (bodyEl) bodyEl.style.display = 'flex';
      if (loadingEl) loadingEl.style.display = 'none';
    }
  });

  /* ================= 启动 ================= */
  m13InitSteps();
  resetAllSteps();
  /*
  loadBank().then(() => {
    const sel = $('#pSelect');
    if (sel && sel.options.length > 1) {
      sel.selectedIndex = 1; 
      $('#pLoad')?.click();
    }
  });
  */

  registerActiveModule('m13', {
    redo: async (text) => { 
      // 1. 等待题库加载完毕（防止时序冲突）
      if (!isBankReady) {
        await loadBank(); 
      }

      // 2. 清洗文本，去题库里找源数据
      const cleanText = (str) => str.replace(/[\s\p{P}]/gu, '');
      const targetText = cleanText(text);
      let bankItem = FULL_BANK.find(p => cleanText(p.text) === targetText);

      // 3. 先去历史记录里找，有没有这道题以前的 AI 解析
      let hasHistory = false;
      try {
        const history = ctx.data.historyLoad ? ctx.data.historyLoad() : [];
        hasHistory = history.some(r => r.problemText === text && r.aiFeedback && r.aiFeedback.answer);
      } catch (e) {}

      // 4. 装载题目
      if (bankItem) {
        // 题库里有这题，恢复身份
        const ansFull = bankItem.answer ? (typeof bankItem.answer === 'string' ? bankItem.answer : bankItem.answer.full) : null;
        m13LoadProblem(bankItem.text, ansFull, 'bank', bankItem);
      } else {
        // 题库里没有，当成自定义题加载
        m13LoadProblem(text, null, 'custom', null);
      }

      // 5. 智能决定按钮文案
      if (bankItem && bankItem.steps && bankItem.steps.length > 0) {
        // 有题库标准步骤，直接显示查看
        $('#m13UnlockBtn').textContent = '📖 查看标准解题过程';
      } else if (hasHistory) {
        // 没标准步骤，但有历史 AI 解析，显示查看历史
        $('#m13UnlockBtn').textContent = '📖 查看之前的 AI 讲解';
      } else {
        // 啥也没有，只能 AI 现算
        $('#m13UnlockBtn').textContent = '🤖 让 AI 现算标准解法';
      }

      // 6. 重置 UI
      m13InitSteps();
      $('#m13StandardSteps').style.display = 'none';
      $('#m13StepsLocked').style.display = 'block';
      $('#m13StandardSteps')?.classList.remove('open');
    },

    showSolution: (text) => {
      // 这里保持你原来的逻辑不变...
      const cached = findCachedFeedback(text, M13_BANK);
      if (cached) {
        renderStandardSolution(cached.aiFeedback);
        $('#m13StepsLocked').style.display = 'none';
        $('#m13StandardSteps').style.display = 'block';
      } else {
        m13FetchStandardSolution();
      }
    }
  });

  return () => {
    unregisterActiveModule('m13');
    document.body.classList.remove('modal-open');
    container.innerHTML = '';
  };
}