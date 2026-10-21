/* app/main.js —— 一个完整的 ES module 文件，没有任何 <script> 标签 */

// ========== 1. import 全部放最顶部 ==========
/* app/main.js 顶部 */
import {
lsGet, lsSet, lsRemove, lsKeysByPrefix,
initStorage, migrateFromLocalStorage,
flushStorage, onStorageError, getStorageHealth,
} from '../core/storage.js';

import {
STUDENT_KEY, REASON_KEY, PRIORITY_DATE_KEY, DAILY_CHEER_KEY,
TIMER_CHALLENGE_KEY, SOUND_ON_KEY, SESSION_BACKUP_KEY,
getGradeKey, getWrongBookKey, getHistoryKey,
isPersistKey, TAKEAWAY_KEY_PREFIX,
} from '../core/keys.js';

import {
escapeHtmlStrict, escapeHtml, raw, html, escapeAttr,
} from '../core/html.js';

import {
logError, getErrorLog, installGlobalErrorHandlers,
} from '../core/errors.js';

import { on, off, emit, EVT } from '../core/events.js';

import {
historyLoad, historySave, historyAdd, historyRemove, historyClear,
} from '../core/history.js';

import {
wbLoad, wbSave, wbAdd, wbRemove, wbClear, markRedoSuccess,
} from '../core/wrongbook.js';

import {
takeawayKey, takeawaySave, takeawayLoad, takeawayListAll,
} from '../core/takeaway.js';

import {
LLM_CONFIG, LLM_SYSTEM_PROMPT, extractJson,
normalizeAiFeedback, callLLM, callLLMWithRetry,
} from '../core/llm.js';

import * as M1Score from '../grades/grade3/scoring/m1.js';
import * as M9Score from '../grades/grade3/scoring/m9.js';
import * as M13Score from '../grades/grade3/scoring/m13.js';

import {
  initSync, pullFromCloud, forceSync, onSyncStateChange,
  getSyncState, SyncState,
} from '../core/sync/sync-manager.js';
import { mergeCloudIntoLocal } from '../core/sync/merge.js';
import { getLocalUpdatedAt, applyCloudValue} from '../core/storage.js';

import { isCloudBaseConfigured } from '../core/sync/cloudbase-client.js';

import { initSyncUI } from './sync-ui.js';

// app/main.js 末尾追加
import { initShell, showThumbBar, hideThumbBar, navigate } from './shell.js';
// ========== 3.5. 拇指区浮球联动 ==========
// 包装 showThumbBar / hideThumbBar，让浮球随之上移
const _origShowThumbBar = showThumbBar;
const _origHideThumbBar = hideThumbBar;
// ⚠️ 但 ES module 的 import 是只读绑定，不能重新赋值
// 所以改用：在挂到 window.__shell 时包装

import { activityAdd, activityStatsByModule } from '../core/activity.js';

import { masteryRecord } from '../core/mastery.js';
import { masteryLoad } from '../core/mastery.js';

import { targetLoad, targetSave, targetReset } from '../core/target.js';
import { msgAdd, msgUnread, msgLoad, msgReply, msgMarkAllRead } from '../core/parent-message.js';
// main.js 顶部
import { showToast } from '../core/toast.js';

import { focusInput, focusInputWhenReady } from '../core/input-focus.js';

// ========== 2. 全局工具 ==========
const _actTimer = {};
const _actPending = {};   // ⭐ 存最后一次的参数

function recordActivity(moduleId, label, detail, delay = 2000) {
  clearTimeout(_actTimer[moduleId]);
  _actPending[moduleId] = { label, detail };   // ⭐ 存起来
  _actTimer[moduleId] = setTimeout(() => {
    activityAdd(moduleId, _actPending[moduleId]);
    delete _actPending[moduleId];
  }, delay);
}

// ⭐ 立即 flush 所有挂起的
window.__flushActivity = function () {
  Object.keys(_actPending).forEach(mid => {
    clearTimeout(_actTimer[mid]);
    activityAdd(mid, _actPending[mid]);
    delete _actPending[mid];
  });
};

// ========== 2. 全局初始化 ==========
installGlobalErrorHandlers();

// ========== 3. 兼容层（旧名 → 新函数） ==========
/* 兼容层：旧代码里调 m1ParseExpression 等，改成新名字 */
const m1ParseExpression = M1Score.parseExpression;
const m1TokensToString  = M1Score.tokensToString;
const m1ComputePriority = M1Score.computePriorityOps;
const m1CleanParens     = M1Score.cleanParens;
const m1TokensToMarkedHtml = M1Score.tokensToMarkedHtml;
// 注意：m1ClickOp / m1CommitStep 里的 DOM 操作保留在原位，
// 只把内部调用的纯函数替换成 M1Score.xxx

/* ============ 兼容层：把纯函数包成旧签名 ============ */
let _M9Ref = null;

const getAddSubMaxLen = () =>
  _M9Ref ? M9Score.getAddSubMaxLen(_M9Ref.a, _M9Ref.b, _M9Ref.op) : 1;

const computeAnswerMap = () =>
  _M9Ref ? M9Score.computeAnswerMap({ a: _M9Ref.a, b: _M9Ref.b, op: _M9Ref.op }) : {};

const m9GetMaxSteps = () =>
  _M9Ref ? M9Score.getMaxSteps({ a: _M9Ref.a, b: _M9Ref.b, op: _M9Ref.op }) : 0;

const calcFinalResult = () =>
  _M9Ref ? M9Score.calcFinalResult({ a: _M9Ref.a, b: _M9Ref.b, op: _M9Ref.op }) : '?';

const m13ExtractNums        = M13Score.extractNums;
const m13ProblemNumbers     = M13Score.problemNumbers;
const m13IsValidSubstitution = M13Score.isValidSubstitution;
const m13CheckPassword      = M13Score.checkPassword;

/* 存 key 相关的旧名 → 新函数 */
const getWrongBookKeyOld = getWrongBookKey;
const getHistoryKeyOld   = getHistoryKey;


/* ⭐ 全局常量：提前声明，避免 TDZ */
const REASONS = ['计算粗心', '读题不细', '方法不会', '单位漏写'];

const $  = (s, r = document) => r.querySelector(s);

const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ⭐ 锁 body 滚动 */
function lockBodyScroll(lock) {
  if (lock) document.body.classList.add('modal-open');
  else document.body.classList.remove('modal-open');
}

/* ============ 模块1：混合运算 · 步步为营 ============ */
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

window.__M1_PRESETS = M1_PRESETS;

const M1 = {
  tokens: [],
  done: false,
  original: '',
  originalDisplay: '',
  steps: [],
  // ⭐ 新增：交互状态
  waitingOpIdx: -1,      // 正在等待输入的运算符下标
  pendingResult: null,    // 正确的得数
  pendingLeft: null,      // 左操作数
  pendingRight: null,     // 右操作数
  pendingOp: null,        // 运算符
  pendingMarkedHtml: '',  // 括号标记版 HTML（用于记录步骤）
};

/* ⭐ 做完一题的鼓励语 */
function getEncouragement(moduleId, streak = 1) {
  const byModule = {
    m1: ['算对了！先乘除后加减，你掌握了 👏', '这一步很关键，继续！', '又对一步，思路很清晰'],
    m9: ['进位没丢，漂亮！', '这一位算得准，继续保持', '竖式就是这样一步步来的'],
    m13: ['思路对上了，真棒！', '这道题你抓住关键了', '解题四步法你用得越来越顺了'],
  };
  const generic = ['做对了！', '很好，继续！', '思路对上了', '这一步稳了'];
  const pool = byModule[moduleId] || generic;

  if (streak >= 5) return `连对 ${streak} 题，状态很好 🔥`;
  if (streak >= 3) return `连对 ${streak} 题，保持住！`;
  return pool[Math.floor(Math.random() * pool.length)];
}

// M13 的鼓励语也反映“连对”
function getM13Streak() {
  const history = historyLoad().filter(r => r.moduleId === 'm13');
  let streak = 0;
  for (const r of history) {
    if (r.isCorrect) streak++;
    else break;
  }
  return streak;
}

function fmtNum(n) {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function m1SetFeedback(msg, type) {
  const fb = $('#m1fb');
  fb.textContent = msg;
  fb.className = 'feedback' + (type ? ' ' + type : '');
}

function m1Render() {
  const el = $('#m1expr');
  el.innerHTML = '';
  if (M1.tokens.length === 0) {
    el.innerHTML = '<span style="color:#cbd5e1;font-size:16px;">请在上方选择或输入算式</span>';
    m1RenderSteps();
    return;
  }
  M1.tokens.forEach((t, i) => {
    const s = document.createElement('span');
    if (t.type === 'lparen' || t.type === 'rparen') {
      // ⭐ 括号单独样式
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

/* 新增：渲染递等式过程 */
function m1RenderSteps() {
  const el = $('#m1steps');
  if (!el) return;

  if (M1.steps.length === 0 && M1.waitingOpIdx < 0) {
    el.innerHTML = '<div class="steps-empty">计算过程会在这里逐行显示 👇</div>';
    return;
  }

  let html = '';

  // 原式
  html += `<div class="step-row step-original">
    <span class="step-eq">原式</span>
    <span class="step-content">${M1.originalDisplay}</span>
  </div>`;

  // 遍历每一步
  M1.steps.forEach((step, idx) => {
    const isLast = (idx === M1.steps.length - 1);
    // 括号标记版（显示"先算这步"）
    html += `<div class="step-row">
      <span class="step-eq"></span>
      <span class="step-content">${step.markedHtml}</span>
      <span class="step-tag">先算这步</span>
    </div>`;
    // 结果版
    if (isLast && M1.done) {
      html += `<div class="step-row">
        <span class="step-eq">=</span>
        <span class="step-content"><span class="step-final">${step.resultStr}</span></span>
      </div>`;
    } else {
      html += `<div class="step-row">
        <span class="step-eq">=</span>
        <span class="step-content">${step.resultStr}</span>
      </div>`;
    }
  });

  // ⭐ 如果有等待输入的运算符，显示"当前步的输入框"
  if (M1.waitingOpIdx >= 0) {
    const toks = M1.tokens;
    const i = M1.waitingOpIdx;
    const left = toks[i - 1];
    const op = toks[i];
    const right = toks[i + 1];

    // 构建议题："4 × 3 = ?"
    const question = `<b>${fmtNum(left.val)}</b> ${op.val} <b>${fmtNum(right.val)}</b> = ?`;

    html += `<div class="step-row step-input-row">
      <span class="step-eq">=</span>
      <span class="step-content">
        <span class="step-part">( ${fmtNum(left.val)} ${op.val} ${fmtNum(right.val)} )</span>
        <span style="margin: 0 8px; color: #94a3b8;">→</span>
        <input type="text" class="step-input" id="m1Input" inputmode="numeric" enterkeyhint="done" placeholder="?" autocomplete="off">
      </span>
    </div>`;

    // 反馈行
    html += `<div class="step-row" style="padding-left: 54px;">
      <span id="m1InputFeedback" class="calc-input-feedback"></span>
    </div>`;
  }

  el.innerHTML = html;

  // 绑定输入框事件（每次重绘都要重新绑定）
  if (M1.waitingOpIdx >= 0) {
    const inp = document.getElementById('m1Input');
    if (inp) {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); m1SubmitAnswer(); }
        else if (e.key === 'Escape') { m1CancelInput(); }
      });

      // ⭐ 失焦提交（点击屏幕空白处时触发）
      let blurTimeout = null;
      inp.addEventListener('blur', () => {
        // 延迟一点点，防止点击确认按钮时先触发了 blur 导致重复提交
        blurTimeout = setTimeout(() => {
          if (inp.value.trim()) {
            m1SubmitAnswer();
          }
        }, 150);
      });

      // 如果重新聚焦，取消刚才的 blur 提交
      inp.addEventListener('focus', () => {
        if (blurTimeout) clearTimeout(blurTimeout);
      });

      // ⭐ 统一聚焦
      focusInputWhenReady('m1Input');
    }
  }
}

function m1LoadExpression(str) {
  M1.original = str;
  M1.tokens = m1ParseExpression(str);
  M1.done = false;
  M1.steps = [];
  // ⭐ 重置交互状态
  M1.waitingOpIdx = -1;
  M1.pendingResult = null;
  M1.pendingLeft = null;
  M1.pendingRight = null;
  M1.pendingOp = null;
  M1.pendingMarkedHtml = '';

  M1.originalDisplay = M1.tokens.length > 0 ? m1TokensToString(M1.tokens) : str;

  if (M1.tokens.length === 0) {
    m1SetFeedback('❌ 无法识别这道算式，请检查输入', 'error');
    m1Render();
    return;
  }
  m1Render();

  // ⭐ 重置优先级选择
  M1_PRIORITY.passed = false;
  M1_PRIORITY.expectedOps = [];
  m1HidePriorityBox();

  // ⭐ 如果是混合运算，弹出"先算哪步"
  m1ShowPriorityBox();

  if (M1_PRIORITY.passed) {
    m1SetFeedback('点击算式中的运算符，把它先算出来 👆', '');
  } else {
    m1SetFeedback('🤔 先选一选：这道题先算哪一步？', '');
  }
}

/* ============ 混合运算 · 先算哪步 ============ */
const M1_PRIORITY = {
  passed: false,        // 是否已经选对
  expectedOps: [],      // 应该先算的运算符（可能多个）
};

/* 判断 a op b 是否产生进位/借位 */
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

function m1ShowPriorityBox() {
  const box = document.getElementById('m1PriorityBox');
  const opts = document.getElementById('m1PriorityOptions');
  const fb = document.getElementById('m1PriorityFeedback');
  if (!box || !opts) return;

  // ⭐ 今天已通过 → 直接跳过，不弹选项
  try {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (lsGet('grade3_priority_passed_date') === todayStr) {
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

  // ⭐ 有括号 → 直接问"先算括号"（不显示选项，直接通过）
  if (hasParen) {
    M1_PRIORITY.passed = true;
    box.style.display = 'none';
    m1SetFeedback('✏️ 有括号，先算括号里的！', '');
    return;
  }

  // 只有混合运算才显示
  if (!hasMulDiv || !hasAddSub) {
    M1_PRIORITY.passed = true;
    box.style.display = 'none';
    return;
  }

  // 期望：有括号先算括号，否则先算乘除
  M1_PRIORITY.expectedOps = hasParen ? ['paren'] : ['muldiv'];

  const options = [];
  if (hasParen) {
    options.push({ key: 'paren', label: '先算 括号里的（( )）' });
    options.push({ key: 'muldiv', label: '先算 乘除（× ÷）' });
  } else {
    options.push({ key: 'muldiv', label: '先算 乘除（× ÷）' });
    options.push({ key: 'addsub', label: '先算 加减（+ −）' });
  }
  opts.innerHTML = options.map(o =>
    `<button class="priority-opt" data-key="${o.key}">${o.label}</button>`
  ).join('');
  fb.textContent = '';
  fb.className = 'priority-feedback';

  // 绑定
  opts.querySelectorAll('.priority-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const isCorrect = M1_PRIORITY.expectedOps.includes(key);

      opts.querySelectorAll('.priority-opt').forEach(b => {
        b.classList.remove('chosen', 'wrong', 'correct');
      });
      btn.classList.add('chosen');
      btn.classList.add(isCorrect ? 'correct' : 'wrong');

      if (isCorrect) {
        fb.textContent = '✓ 对！先算乘除，再算加减。现在点击算式中的运算符。';
        fb.className = 'priority-feedback ok';
        M1_PRIORITY.passed = true;

        // ⭐ 当天选对 → 标记今天已通过，后续不再弹
        try {
          const d = new Date();
          const todayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          lsSet('grade3_priority_passed_date', todayStr, { skipSync: true });
        } catch (e) {}

        setTimeout(() => {
          box.style.display = 'none';
          m1SetFeedback('点击算式中的运算符，把它先算出来 👆', '');
        }, 800);
      }
    });
  });

  box.style.display = 'block';

  // ⭐ 弹出后滚到可见（移动端）
  setTimeout(() => {
    try {
      box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (e) {}
  }, 60);
}

function m1HidePriorityBox() {
  const box = document.getElementById('m1PriorityBox');
  if (box) box.style.display = 'none';
}

function m1ClickOp(i) {
  if (M1.done) return;
  if (!M1_PRIORITY.passed) {
    m1SetFeedback('🤔 先选一选：这道题先算哪一步？', 'error');
    return;
  }
  if (M1.waitingOpIdx >= 0) {
    return;
  }

  const toks = M1.tokens;
  const op = toks[i].val;

  // ⭐ 找到运算符所在的"括号层级"
  // depth = 该运算符左侧还没闭合的 '(' 数量
  let depth = 0;
  for (let k = 0; k < i; k++) {
    if (toks[k].type === 'lparen') depth++;
    if (toks[k].type === 'rparen') depth--;
  }

  // ⭐ 找出"最内层"的括号深度（全局最深的括号层级）
  // 只有处于最深层的运算符才能被点
  let maxDepth = 0;
  let curDepth = 0;
  for (const t of toks) {
    if (t.type === 'lparen') { curDepth++; if (curDepth > maxDepth) maxDepth = curDepth; }
    if (t.type === 'rparen') curDepth--;
  }

  // 如果这个运算符不在最深层，不允许点
  if (depth < maxDepth) {
    m1SetFeedback('❌ 先算括号里的哦！括号优先级最高。', 'error');
    return;
  }

  // ⭐ 在最深层里，判断是否可以先算这个运算符
  // 规则：
  //   - 如果这一层有 × ÷，则必须先算 × ÷
  //   - 如果没有 × ÷，可以算 + -
  //   - 且要确保左右都是数字（或者已经算成数字）
  const hasMulDiv = toks.some((t, j) => {
    if (t.type !== 'op' || j === i) return false;
    if (t.val !== '×' && t.val !== '÷') return false;
    // 检查 j 是否也在最深层
    let d = 0;
    for (let k = 0; k < j; k++) {
      if (toks[k].type === 'lparen') d++;
      if (toks[k].type === 'rparen') d--;
    }
    return d === depth;
  });

  if ((op === '+' || op === '-') && hasMulDiv) {
    m1SetFeedback('❌ 先算乘除哦！算式里还有乘除没算呢。', 'error');
    return;
  }

  const left = toks[i - 1], right = toks[i + 1];
  if (!left || !right || left.type !== 'num' || right.type !== 'num') return;

  // ⭐ 不再自动算，改为等待学生输入
  M1.waitingOpIdx = i;
  M1.pendingOp = op;
  M1.pendingLeft = left.val;
  M1.pendingRight = right.val;
  M1.pendingMarkedHtml = m1TokensToMarkedHtml(toks, i - 1, i + 1);

  // 计算正确答案（用于验证）
  let val;
  if (op === '×')      val = left.val * right.val;
  else if (op === '÷') {
    if (right.val === 0) { m1SetFeedback('❌ 不能除以 0 哦', 'error'); return; }
    val = left.val / right.val;
  }
  else if (op === '+') val = left.val + right.val;
  else if (op === '-') val = left.val - right.val;
  M1.pendingResult = val;

  // 重绘：把当前运算符高亮
  m1Render();

  m1SetFeedback('✏️ 请算出这一步的得数', '');
}

// ⭐ 当前 M1 层级（由 shell.js 的 __m1LoadPresets 或 level 选择器写入）
// 读 localStorage，因为 shell 里点击层级时会 setItem
function m1CurrentLevel() {
  try {
    return localStorage.getItem('grade3_m1_level') || 'no-paren';
  } catch (e) {
    return 'no-paren';
  }
}

/* 提交答案 */
function m1SubmitAnswer() {
  if (M1.waitingOpIdx < 0) return;

  const input = document.getElementById('m1Input');
  const fb = document.getElementById('m1InputFeedback');
  const raw = input.value.trim();

  // 支持分数和负数
  let userVal;
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    userVal = parseFloat(raw);
  } else if (/^\d+\/\d+$/.test(raw)) {
    const [a, b] = raw.split('/').map(Number);
    if (b === 0) { m1ShowWrong(input, fb, '分母不能是 0 哦'); return; }
    userVal = a / b;
  } else {
    m1ShowWrong(input, fb, '请输入一个数字');
    return;
  }

  // 验证（允许小数误差）
  const correct = M1.pendingResult;
  if (Math.abs(userVal - correct) < 0.001) {
    input.classList.remove('wrong');
    input.classList.add('correct');
    fb.textContent = getEncouragement('m1', COMBO.count);
    fb.className = 'calc-input-feedback ok';

    /* ⭐ 移动端：主动 blur 收起软键盘，避免重绘后键盘错位 */
    input.blur();

    setTimeout(() => { m1CommitStep(); }, 500);
  } else {
    m1ShowWrong(input, fb, `❌ 再想想～ 提示：${M1.pendingOp === '÷' ? '用乘法验算一下' : '再算一遍'}`);
    /* ⭐ 答错保持焦点，方便直接修改 */
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

  // ⭐ 高亮当前运算符两侧的数字，让用户看到"这两个数在做什么"
  const exprEl = document.getElementById('m1expr');
  if (exprEl && M1.waitingOpIdx >= 0) {
    const tokens = exprEl.querySelectorAll('.token');
    const i = M1.waitingOpIdx;
    const left = tokens[i - 1];
    const right = tokens[i + 1];
    if (left) left.classList.add('explore-highlight');
    if (right) right.classList.add('explore-highlight');
    setTimeout(() => {
      left?.classList.remove('explore-highlight');
      right?.classList.remove('explore-highlight');
    }, 1200);
  }
}

/* 确认正确，推进到下一步 */
function m1CommitStep() {
  const i = M1.waitingOpIdx;
  const val = M1.pendingResult;
  const toks = M1.tokens;

  // ⭐ 合并动画：当前运算符两侧的数字块向中间滑动
  const exprEl = document.getElementById('m1expr');
  const opEls = exprEl.querySelectorAll('.token');
  const leftEl = opEls[i - 1];
  const opEl = opEls[i];
  const rightEl = opEls[i + 1];
  if (leftEl && opEl && rightEl) {
    // m1CommitStep 里，动画前
    exprEl.scrollIntoView({ block: 'nearest', behavior: 'auto' });

    // 然后用相对位移
    const leftRect = leftEl.getBoundingClientRect();
    const rightRect = rightEl.getBoundingClientRect();
    const dx = rightRect.left - leftRect.right;  // 右块左移的距离
    leftEl.style.transform = `translateX(${dx / 2}px)`;
    rightEl.style.transform = `translateX(${-dx / 2}px)`;

    leftEl.style.transition = 'transform .28s cubic-bezier(.34,1.3,.64,1), opacity .28s';
    rightEl.style.transition = 'transform .28s cubic-bezier(.34,1.3,.64,1), opacity .28s';
    opEl.style.transition = 'opacity .2s, transform .2s';

    opEl.style.opacity = '0';
    opEl.style.transform = 'scale(0)';
  }

  // 延迟 280ms 再重绘，让动画播完
  setTimeout(() => {
    // ...原来的 m1CommitStep 逻辑（newTokens、steps.push、m1Render 等）
    const markedHtml = M1.pendingMarkedHtml;
    let newTokens = [...toks.slice(0, i - 1), { type: 'num', val }, ...toks.slice(i + 2)];

    // ⭐ 去掉"孤立的括号"：如果 ( 或 ) 旁边已经没有运算符了，就删掉
    newTokens = m1CleanParens(newTokens);

    const resultStr = m1TokensToString(newTokens);

    M1.steps.push({ markedHtml, resultStr });
    M1.tokens = newTokens;
    if (M1.tokens.length === 1) M1.done = true;

    // 清除等待状态
    M1.waitingOpIdx = -1;
    M1.pendingResult = null;
    M1.pendingLeft = null;
    M1.pendingRight = null;
    M1.pendingOp = null;
    M1.pendingMarkedHtml = '';

    m1Render();
    /* ⭐ 移动端：重绘后若没有等待输入，主动 blur，避免键盘悬空 */
    if (M1.waitingOpIdx < 0 && document.activeElement && document.activeElement.tagName === 'INPUT') {
      document.activeElement.blur();
    }

    if (M1.done) {
      m1SetFeedback('🎉 全部算完！结果是 ' + fmtNum(M1.tokens[0].val) + '。', 'ok');
      // ⭐ 新增：写做题记录
        const finalVal = M1.tokens[0].val;
        historyAdd({
          problemText: M1.original,
          problemSource: 'm1',
          moduleId: 'm1',                          // ⭐ 关键
          studentSteps: M1.steps.map((s, i) => ({
            rel: `第 ${i + 1} 步`,
            sub: s.markedHtml,
            res: s.resultStr,
          })),
          studentAnswer: fmtNum(finalVal),
          isCorrect: true,                         // M1 是逐步验证，走到 done 必正确
          correctAnswer: fmtNum(finalVal),
          aiFeedback: null,
        });
        // ⭐ 新增 掌握度
        const mrec = masteryRecord(M1.original, true);
        if (mrec && mrec.state === 'mastered') {
          showToast('🏆 这道题你掌握了！', 'success');
          setTimeout(() => {
            showMasteryCard({
              problemText: M1.original,
              correctAnswer: fmtNum(M1.tokens[0].val),
              takeaway: takeawayLoad(M1.original),
            });
          }, 800);
        }
        // ⭐ 可选：触发拇指区反馈
        // showThumbBar({ text: `🎉 全部算完！${fmtNum(finalVal)}`, ok: true });

    } else {
      // ⭐ 检查下一步是否还有"先算哪步"的问题
      const toks = M1.tokens;
      const hasMulDiv = toks.some(t => t.type === 'op' && (t.val === '×' || t.val === '÷'));
      const hasAddSub = toks.some(t => t.type === 'op' && (t.val === '+' || t.val === '-'));
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

/* 取消输入 */
function m1CancelInput() {
  M1.waitingOpIdx = -1;
  M1.pendingResult = null;
  M1.pendingLeft = null;
  M1.pendingRight = null;
  M1.pendingOp = null;
  M1.pendingMarkedHtml = '';
  m1Render();
  m1SetFeedback('点击算式中的运算符，把它先算出来 👆', '');
}

/* 初始化下拉框 */
function m1InitSelect(items) {
  $('#m1Select').innerHTML = items.map((p, i) =>
    `<option value="${i}">${p.name}：${p.expr}</option>`
  ).join('');
}

// ⭐ 按层级切换 M1 的预设池（供 shell.js 调用）
window.__m1LoadPresets = function (presets) {
  if (!Array.isArray(presets) || presets.length === 0) return;
  M1_PRESETS.length = 0;
  presets.forEach(p => M1_PRESETS.push(p));
  m1InitSelect(M1_PRESETS);

  // ⭐ 从当前层级的池里随机挑一条载入，而不是永远第一条
  const idx = Math.floor(Math.random() * M1_PRESETS.length);
  m1LoadExpression(M1_PRESETS[idx].expr);
};

/* 载入按钮 */
$('#m1Load').addEventListener('click', () => {
  const idx = +$('#m1Select').value;
  const p = M1_PRESETS[idx];
  if (p) m1LoadExpression(p.expr);
});

/* 手动输入 */
$('#m1UseCustom').addEventListener('click', () => {
  const t = $('#m1Custom').value.trim();
  if (!t) return;
  m1LoadExpression(t);
  $('#m1Custom').value = '';
});
$('#m1Custom').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('#m1UseCustom').click();
});

/* 上传 txt：每行一个算式 */
$('#m1Upload').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const lines = ev.target.result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) { m1SetFeedback('❌ 文件为空', 'error'); return; }
    M1_PRESETS.length = 0;
    lines.forEach((line, i) => {
      M1_PRESETS.push({ name: '第' + (i + 1) + '题', expr: line });
    });
    m1InitSelect(M1_PRESETS);
    m1LoadExpression(lines[0]);
  };
  reader.readAsText(file, 'UTF-8');
  e.target.value = '';
});

/* 随机出题 */
function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
/* ============ ⭐ M1 按层级随机出题 ============ */
$('#m1Random').addEventListener('click', () => {
  const level = m1CurrentLevel();

  // 每个层级一个生成器
  const GEN = {
    // 1️⃣ 无括号：乘加/乘减/除加/连减/连乘 等，绝不出现括号
    'no-paren': () => {
      const type = rnd(1, 6);
      if (type === 1) return `${rnd(2, 9)} × ${rnd(2, 9)} + ${rnd(10, 99)}`;
      if (type === 2) return `${rnd(30, 90)} - ${rnd(5, 15)} - ${rnd(5, 15)}`;
      if (type === 3) {
        const b = rnd(2, 9), q = rnd(2, 9);
        return `${b * q} ÷ ${b} + ${rnd(10, 50)}`;
      }
      if (type === 4) return `${rnd(2, 9)} × ${rnd(2, 9)} - ${rnd(2, 9)}`;
      if (type === 5) return `${rnd(2, 9)} × ${rnd(2, 9)} + ${rnd(2, 9)} × ${rnd(2, 9)}`;
      return `${rnd(10, 99)} - ${rnd(2, 9)} × ${rnd(2, 9)}`;
    },

    // 2️⃣ 有括号：必须有 ()
    'with-paren': () => {
      const type = rnd(1, 3);
      if (type === 1) {
        const a = rnd(2, 9), b = rnd(2, 9), c = rnd(2, 9);
        return `(${a} + ${b}) × ${c}`;
      }
      if (type === 2) {
        const b = rnd(2, 9), q = rnd(2, 9), a = rnd(1, 5);
        return `(${b * q + a} - ${a}) ÷ ${b}`;
      }
      const a = rnd(2, 9), b = rnd(2, 9), c = rnd(2, 9), d = rnd(2, 9);
      return `(${a} + ${b}) × ${c} - ${d}`;
    },

    // 3️⃣ 乘除混合：含 ×÷ 且含 +-
    'mul-div': () => {
      const type = rnd(1, 3);
      if (type === 1) return `${rnd(2, 9)} × ${rnd(2, 9)} + ${rnd(10, 99)}`;
      if (type === 2) {
        const b = rnd(2, 9), q = rnd(2, 9);
        return `${b * q} ÷ ${b} + ${rnd(10, 50)}`;
      }
      return `${rnd(10, 99)} - ${rnd(2, 9)} × ${rnd(2, 9)}`;
    },

    // 4️⃣ 加减混合：只有 +-，多步，不含 ×÷()
    'add-sub': () => {
      const type = rnd(1, 3);
      if (type === 1) return `${rnd(30, 90)} - ${rnd(5, 15)} - ${rnd(5, 15)}`;
      if (type === 2) return `${rnd(10, 50)} + ${rnd(10, 50)} - ${rnd(5, 30)}`;
      return `${rnd(10, 40)} + ${rnd(5, 30)} + ${rnd(5, 30)}`;
    },
  };

  const gen = GEN[level] || GEN['no-paren'];
  const expr = gen();
  m1LoadExpression(expr);
});

/* 重来一次 */
$('#m1reset').addEventListener('click', () => {
  if (M1.original) m1LoadExpression(M1.original);
});

/* 启动 */
m1InitSelect(M1_PRESETS);
m1LoadExpression(M1_PRESETS[0].expr);

/* ============ 模块2：面积模型 ============ */
const M2 = { a:12, b:3, filled:0, split:false, busy:false };
function m2Draw() {
  const c = $('#m2canvas'), ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  const { a, b, filled, split } = M2;
  const padL=70, padT=56, padR=44, padB=52;
  const availW = W - padL - padR, availH = H - padT - padB;
  const cw = Math.min(availW / a, 44), ch = Math.min(availH / b, 44);
  const gw = cw * a, gh = ch * b;
  const ox = padL + (availW - gw) / 2, oy = padT + (availH - gh) / 2;
  const splitAt = Math.floor(a / 10) * 10;
  for (let r = 0; r < b; r++) for (let col = 0; col < a; col++) {
    const idx = r * a + col;
    const x = ox + col * cw, y = oy + r * ch;
    if (idx < filled) {
      ctx.fillStyle = split ? (col < splitAt ? '#60a5fa' : '#fbbf24') : '#60a5fa';
    } else ctx.fillStyle = '#f8fafc';
    ctx.fillRect(x, y, cw, ch);
    ctx.strokeStyle = idx < filled ? 'rgba(255,255,255,0.75)' : '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + .5, y + .5, cw - 1, ch - 1);
  }
  ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, gw, gh);
  ctx.fillStyle = '#475569'; ctx.font = 'bold 15px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(a + ' 块', ox + gw/2, oy - 18);
  ctx.save(); ctx.translate(ox - 26, oy + gh/2); ctx.rotate(-Math.PI/2);
  ctx.fillText(b + ' 行', 0, 0); ctx.restore();
  if (split && a > splitAt) {
    ctx.textAlign = 'center'; ctx.font = 'bold 13px system-ui,sans-serif';
    ctx.fillStyle = '#2563eb';
    ctx.fillText('10', ox + splitAt * cw / 2, oy + gh + 24);
    ctx.fillStyle = '#d97706';
    ctx.fillText(String(a - splitAt), ox + splitAt * cw + (a - splitAt) * cw / 2, oy + gh + 24);
  }
}
function m2Calc() {
  const el = $('#m2calc');
  const { a, b, filled, split } = M2;
  const total = a * b;
  if (filled === 0) { el.innerHTML = `<span class="calc-hint">点击「铺一行」，看看 <b>${a} × ${b}</b> 到底是多少</span>`; return; }
  if (filled < total) { el.innerHTML = `<span class="calc-hint">已经铺了 <b>${filled}</b> 块，还剩 <b>${total - filled}</b> 块没铺</span>`; return; }
  if (!split) { el.innerHTML = `<span class="calc-final">${a} × ${b} = <b>${total}</b></span>`; }
  else {
    const splitAt = Math.floor(a / 10) * 10;
    const p1 = splitAt * b, p2 = (a - splitAt) * b;
    el.innerHTML = `<div class="calc-line"><span class="tag blue">10 × ${b} = ${p1}</span><span class="tag amber">${a - splitAt} × ${b} = ${p2}</span></div><div class="calc-final">${p1} + ${p2} = <b>${total}</b></div>`;
  }
}
async function m2FillRow() {
  if (M2.busy) return;
  const total = M2.a * M2.b;
  if (M2.filled >= total) return;

  M2.busy = true;
  const start = M2.filled, end = Math.min(total, start + M2.a);
  for (let i = start; i < end; i++) {
    M2.filled = i + 1;
    m2Draw();
    await new Promise(r => setTimeout(r, 26));
  }
  M2.busy = false;
  m2Calc();

  // ⭐ 铺满时才记
  if (M2.filled >= total) {
    recordActivity('m2', `${M2.a} × ${M2.b}`, `铺满 ${total} 块`);
  }
}

function m2Sync() {
  M2.a = +$('#m2a').value; M2.b = +$('#m2b').value;
  $('#m2aval').textContent = M2.a; $('#m2bval').textContent = M2.b;
  M2.filled = 0; m2Draw(); m2Calc();
}
$('#m2a').addEventListener('input', m2Sync);
$('#m2b').addEventListener('input', m2Sync);
$('#m2fill').addEventListener('click', m2FillRow);
$('#m2split').addEventListener('click', () => {
  M2.split = !M2.split;
  $('#m2split').classList.toggle('on', M2.split);
  m2Draw(); m2Calc();
});
$('#m2clear').addEventListener('click', () => { M2.filled = 0; m2Draw(); m2Calc(); });
m2Draw(); m2Calc();

/* ============ 模块3：分数披萨 ============ */
const M3 = { den:4, selected:[], geom:{} };
function m3Geometry() {
  const c = $('#m3canvas');
  return { cx:c.width/2, cy:c.height/2, r:Math.min(c.width, c.height)/2 - 26 };
}
function m3Draw() {
  const c = $('#m3canvas'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  const { cx, cy, r } = M3.geom, n = M3.den;
  const step = Math.PI*2/n, start = -Math.PI/2;
  for (let i = 0; i < n; i++) {
    const a0 = start + i*step, a1 = a0 + step;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a1); ctx.closePath();
    if (M3.selected[i]) {
      const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, r);
      g.addColorStop(0, '#fcd34d'); g.addColorStop(1, '#f59e0b');
      ctx.fillStyle = g;
    } else ctx.fillStyle = '#f1f5f9';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3; ctx.stroke();
}
const CN_NUM = ['零','一','二','三','四','五','六','七','八','九','十','十一','十二'];
function m3Update() {
  const num = M3.selected.filter(Boolean).length, den = M3.den;
  $('#m3num').textContent = num;
  $('#m3denText').textContent = den;
  const t = $('#m3text');
  if (num === 0) { t.textContent = '还没有选任何一份'; t.style.color = '#94a3b8'; }
  else if (num === den) { t.textContent = `取了全部 ${den} 份，就是 1 个整体`; t.style.color = '#15803d';
                            recordActivity('m3', `分数披萨 ${num}/${den}`, `分成 ${den} 份`);}
  else { t.textContent = `${CN_NUM[den]}分之${CN_NUM[num]}`; t.style.color = '#334155'; }
}
function m3Reset() {
  M3.den = +$('#m3denRange').value;
  $('#m3denval').textContent = M3.den;
  M3.selected = Array(M3.den).fill(false);
  M3.geom = m3Geometry();
  m3Draw(); m3Update();
}

/* ============ 分数扩展练习 ============ */
let M3_EXTRA = { mode: 'compare', quiz: null };

document.querySelectorAll('.frac-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.frac-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    M3_EXTRA.mode = tab.dataset.fracMode;
    m3RenderExtra();
  });
});

function m3RenderExtra() {
  const el = document.getElementById('fracExtraContent');
  if (!el) return;
  const mode = M3_EXTRA.mode;
  if (mode === 'compare') m3RenderCompare(el);
  else if (mode === 'add') m3RenderAddSub(el, '+');
  else if (mode === 'sub') m3RenderAddSub(el, '−');
  else if (mode === 'equiv') m3RenderEquiv(el);
}

/* 分数显示 HTML */
function fracHtml(num, den) {
  return `<span class="frac-inline"><span>${num}</span><span class="frac-line"></span><span>${den}</span></span>`;
}

/* ---- 比大小 ---- */
function m3RenderCompare(el) {
  const d1 = 2 + Math.floor(Math.random() * 6);   // 2~7
  const d2 = 2 + Math.floor(Math.random() * 6);
  const n1 = 1 + Math.floor(Math.random() * (d1 - 1));
  const n2 = 1 + Math.floor(Math.random() * (d2 - 1));

  const v1 = n1 / d1, v2 = n2 / d2;
  const correct = Math.abs(v1 - v2) < 1e-9 ? 'eq' : (v1 > v2 ? 'gt' : 'lt');

  el.innerHTML = `
    <div style="text-align:center;">
      <div style="font-size:15px;color:#64748b;font-weight:700;margin-bottom:16px;">
        ⚖️ 比较两个分数的大小
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap;">
        ${fracHtml(n1, d1)}
        <span style="font-size:28px;color:#94a3b8;font-weight:800;">?</span>
        ${fracHtml(n2, d2)}
      </div>
      <div class="frac-cmp-options">
        <button class="frac-cmp-btn" data-cmp="gt">&gt;</button>
        <button class="frac-cmp-btn" data-cmp="eq">=</button>
        <button class="frac-cmp-btn" data-cmp="lt">&lt;</button>
      </div>
      <div id="fracCmpFb" class="priority-feedback" style="margin-top:14px;"></div>
      <div style="margin-top:16px;">
        <button class="btn-secondary" id="fracCmpNext">🎲 下一题</button>
      </div>
    </div>
  `;

  const fb = document.getElementById('fracCmpFb');
  el.querySelectorAll('.frac-cmp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const user = btn.dataset.cmp;
      el.querySelectorAll('.frac-cmp-btn').forEach(b => b.classList.remove('correct', 'wrong'));
      if (user === correct) {
        btn.classList.add('correct');
        fb.textContent = `✓ 对！${n1}/${d1} ${correct === 'gt' ? '>' : correct === 'lt' ? '<' : '='} ${n2}/${d2}`;
        fb.className = 'priority-feedback ok';
      } else {
        btn.classList.add('wrong');
        const hint = `提示：可以先通分再比较——${n1}/${d1} ≈ ${v1.toFixed(3)}，${n2}/${d2} ≈ ${v2.toFixed(3)}`;
        fb.textContent = '❌ ' + hint;
        fb.className = 'priority-feedback error';
      }
    });
  });
  document.getElementById('fracCmpNext').addEventListener('click', () => m3RenderCompare(el));
}

/* ---- 分数加减 ---- */
function m3RenderAddSub(el, op) {
  // 同分母（三年级只学同分母加减）
  const den = 3 + Math.floor(Math.random() * 6);   // 3~8
  let n1, n2, resultNum;

  if (op === '+') {
    n1 = 1 + Math.floor(Math.random() * (den - 2));
    n2 = 1 + Math.floor(Math.random() * (den - n1));   // 保证和 <= den
    resultNum = n1 + n2;
  } else {
    n1 = 2 + Math.floor(Math.random() * (den - 1));
    n2 = 1 + Math.floor(Math.random() * (n1 - 1));   // 保证 n2 < n1
    resultNum = n1 - n2;
  }

  const opSymbol = op === '+' ? '+' : '−';

  el.innerHTML = `
    <div style="text-align:center;">
      <div style="font-size:15px;color:#64748b;font-weight:700;margin-bottom:16px;">
        ${op === '+' ? '➕ 同分母分数加法' : '➖ 同分母分数减法'}
      </div>
      <div class="frac-calc-row">
        ${fracHtml(n1, den)}
        <span style="font-size:28px;color:#64748b;font-weight:800;">${opSymbol}</span>
        ${fracHtml(n2, den)}
        <span style="font-size:28px;color:#64748b;font-weight:800;">=</span>
        <div style="display:inline-flex;flex-direction:column;align-items:center;">
          <input type="text" inputmode="decimal" class="frac-calc-input" id="fracNum" placeholder="?" min="0" max="20">
          <span style="width:60px;height:2.5px;background:var(--primary-d);margin:4px 0;border-radius:1px;"></span>
          <input type="text" inputmode="decimal" class="frac-calc-input" id="fracDen" placeholder="?" min="1" max="20" style="font-size:16px;padding:6px;">
        </div>
      </div>
      <div style="text-align:center;margin:12px 0;">
        <button class="btn" id="fracCalcSubmit">✓ 确认</button>
      </div>
      <div id="fracCalcFb" class="priority-feedback"></div>
      <div style="margin-top:16px;">
        <button class="btn-secondary" id="fracCalcNext">🎲 下一题</button>
      </div>
    </div>
  `;

  const fb = document.getElementById('fracCalcFb');
  const numInput = document.getElementById('fracNum');
  const denInput = document.getElementById('fracDen');

  function submit() {
    const userNum = parseInt(numInput.value, 10);
    const userDen = parseInt(denInput.value, 10);

    if (isNaN(userNum) || isNaN(userDen)) {
      fb.textContent = '❌ 请填写分子和分母';
      fb.className = 'priority-feedback error';
      return;
    }

    // 严格判断：分子对且分母对
    if (userNum === resultNum && userDen === den) {
      numInput.classList.add('correct');
      denInput.classList.add('correct');
      fb.textContent = `✓ 对！${n1}/${den} ${opSymbol} ${n2}/${den} = ${resultNum}/${den}`;
      fb.className = 'priority-feedback ok';
    } else {
      numInput.classList.add('wrong');
      denInput.classList.add('wrong');
      // 提示
      let hint = '';
      if (userDen !== den) {
        hint = `同分母分数${op === '+' ? '加' : '减'}，分母不变，还是 ${den}`;
      } else {
        hint = `分子${op === '+' ? '相加' : '相减'}：${n1} ${opSymbol} ${n2} = ${resultNum}`;
      }
      fb.textContent = '❌ 再想想～ ' + hint;
      fb.className = 'priority-feedback error';
      setTimeout(() => {
        numInput.classList.remove('wrong');
        denInput.classList.remove('wrong');
      }, 800);
    }
  }

  document.getElementById('fracCalcSubmit').addEventListener('click', submit);
  numInput.addEventListener('keydown', e => { if (e.key === 'Enter') denInput.focus(); });
  denInput.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  document.getElementById('fracCalcNext').addEventListener('click', () => m3RenderAddSub(el, op));
}

/* ---- 等值分数 ---- */
function m3RenderEquiv(el) {
  // 选一个基准分数，如 1/2
  const baseNum = 1;
  const baseDen = 2 + Math.floor(Math.random() * 3);   // 2~4
  const multiplier = 2 + Math.floor(Math.random() * 3); // 2~4

  const eqNum = baseNum * multiplier;
  const eqDen = baseDen * multiplier;

  // 渲染两个条形图，每段代表一个分数单位
  const baseBar = Array(baseDen).fill(false).map((_, i) =>
    `<div class="equiv-seg ${i < baseNum ? 'filled' : ''}">${i + 1}</div>`
  ).join('');
  const eqBar = Array(eqDen).fill(false).map((_, i) =>
    `<div class="equiv-seg ${i < eqNum ? 'filled' : ''}">${i + 1}</div>`
  ).join('');

  el.innerHTML = `
    <div style="text-align:center;">
      <div style="font-size:15px;color:#64748b;font-weight:700;margin-bottom:16px;">
        🟰 等值分数：观察两个分数是否相等
      </div>
        <div class="equiv-row">
        <div class="equiv-item">
          <div class="equiv-bar" style="width:360px;">${baseBar}</div>
          <div class="equiv-label">${fracHtml(baseNum, baseDen)}</div>
        </div>
        <div class="equiv-item">
          <div class="equiv-bar" style="width:360px;">${eqBar}</div>
          <div class="equiv-label">${fracHtml(eqNum, eqDen)}</div>
        </div>
      </div>
      <div style="background:#fffbeb;padding:12px 16px;border-radius:10px;display:inline-block;margin:12px 0;font-size:14px;color:#92400e;font-weight:600;">
        💡 观察：${baseNum}/${baseDen} 的每一份 = ${eqNum}/${eqDen} 的两份吗？
      </div>
      <div style="margin-top:12px;">
        <button class="btn" id="equivReveal">🤔 它们相等吗？点我看答案</button>
      </div>
      <div id="equivFb" class="priority-feedback" style="margin-top:12px;"></div>
      <div style="margin-top:16px;">
        <button class="btn-secondary" id="equivNext">🎲 下一题</button>
      </div>
    </div>
  `;

  document.getElementById('equivReveal').addEventListener('click', () => {
    const fb = document.getElementById('equivFb');
    fb.innerHTML = `
      <div style="text-align:left;background:#f0f9ff;padding:14px 18px;border-radius:10px;line-height:1.9;">
        <div style="font-weight:800;color:#2563eb;margin-bottom:8px;">✓ 它们是等值的！</div>
        <div><b>${baseNum}/${baseDen}</b> 就是把整体平均分成 ${baseDen} 份，取 ${baseNum} 份</div>
        <div><b>${eqNum}/${eqDen}</b> 就是把整体平均分成 ${eqDen} 份（每份更小），取 ${eqNum} 份</div>
        <div>但 <b>${eqDen} ÷ ${baseDen} = ${multiplier}</b>，所以 1 个 ${baseNum}/${baseDen} = ${multiplier} 个 ${eqNum}/${eqDen}</div>
        <div style="color:#15803d;font-weight:800;margin-top:6px;">
          ${baseNum}/${baseDen} = (${baseNum} × ${multiplier}) / (${baseDen} × ${multiplier}) = ${eqNum}/${eqDen}
        </div>
      </div>
    `;
    fb.className = 'priority-feedback ok';
  });
  document.getElementById('equivNext').addEventListener('click', () => m3RenderEquiv(el));
}

/* 初始化扩展练习 */
m3RenderExtra();

$('#m3canvas').addEventListener('click', e => {
  const c = e.currentTarget, rect = c.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (c.width / rect.width);
  const y = (e.clientY - rect.top) * (c.height / rect.height);
  const { cx, cy, r } = M3.geom;
  const dx = x - cx, dy = y - cy;
  if (Math.hypot(dx, dy) > r) return;
  let ang = Math.atan2(dy, dx) + Math.PI/2;
  if (ang < 0) ang += Math.PI*2;
  const idx = Math.floor(ang / (Math.PI*2/M3.den)) % M3.den;
  M3.selected[idx] = !M3.selected[idx];
  m3Draw(); m3Update();
});
$('#m3denRange').addEventListener('input', m3Reset);
$('#m3clear').addEventListener('click', () => {
  M3.selected = Array(M3.den).fill(false);
  m3Draw(); m3Update();
});
m3Reset();

/* ============ 模块4：长度单位 ============ */
const UNITS = [
  { key:'km', name:'千米', toM:1000 }, { key:'m', name:'米', toM:1 },
  { key:'dm', name:'分米', toM:0.1 }, { key:'cm', name:'厘米', toM:0.01 },
  { key:'mm', name:'毫米', toM:0.001 }
];
function fmt(n) {
  if (!isFinite(n)) return '—';
  if (n === 0) return '0';
  return n.toFixed(6).replace(/\.?0+$/, '');
}
function m4Update() {
  const val = parseFloat($('#m4val').value), unit = $('#m4unit').value;
  const wrap = $('#m4results');
  if (isNaN(val)) { wrap.innerHTML = '<div class="result-item"><span class="k">请输入一个数字</span></div>'; return; }
  const u = UNITS.find(x => x.key === unit);
  const inMeters = val * u.toM;
  wrap.innerHTML = UNITS.map(x => {
    const v = inMeters / x.toM;
    const hl = x.key === unit ? ' hl' : '';
    return `<div class="result-item${hl}"><span class="k">${x.name} ${x.key}</span><span class="v">${fmt(v)}</span></div>`;
  }).join('');
  // ⭐ 新增：体验记录（防抖 2 秒）
  recordActivity('m4', `${val} ${u.name}`, '');
}
$('#m4val').addEventListener('input', m4Update);
$('#m4unit').addEventListener('change', m4Update);
let m4Quiz = null;
function m4NewQuiz() {
  const i = Math.floor(Math.random() * (UNITS.length - 1));
  const j = i + 1 + Math.floor(Math.random() * (UNITS.length - i - 1));
  const from = UNITS[i], to = UNITS[j];
  const val = 1 + Math.floor(Math.random() * 9);
  const ans = (val * from.toM) / to.toM;
  m4Quiz = { from, to, val, ans };
  $('#m4quizq').innerHTML = `${val} ${from.name} = ( <b>?</b> ) ${to.name}`;
  $('#m4answer').value = '';
  $('#m4fb').style.display = 'none';
}
$('#m4newq').addEventListener('click', m4NewQuiz);
$('#m4check').addEventListener('click', () => {
  if (!m4Quiz) return;
  const user = parseFloat($('#m4answer').value);
  const fb = $('#m4fb'); fb.style.display = 'block';
  if (isNaN(user)) { fb.className = 'feedback error'; fb.textContent = '请先输入答案～'; return; }
  if (Math.abs(user - m4Quiz.ans) < 1e-9) {
    fb.className = 'feedback ok';
    fb.textContent = `🎉 完全正确！${m4Quiz.val} ${m4Quiz.from.name} = ${fmt(m4Quiz.ans)} ${m4Quiz.to.name}`;
     // ⭐ 新增：小测做对
    recordActivity('m4', `小测：${m4Quiz.val} ${m4Quiz.from.name}`, '答对', 0);
  } else {
    fb.className = 'feedback error';
    fb.textContent = `再想想～ 提示：${m4Quiz.from.name}换成${m4Quiz.to.name}要 ${fmt(m4Quiz.from.toM / m4Quiz.to.toM)} 倍`;
  }
});
$('#m4answer').addEventListener('keydown', e => { if (e.key === 'Enter') $('#m4check').click(); });
m4Update();

/* ============ 模块5：面积与周长 ============ */
let m5RecordIdx = 0;
function m5Render() {
  const w = +$('#m5w').value, h = +$('#m5h').value;
  $('#m5wval').textContent = w; $('#m5hval').textContent = h;
  let html = '';
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
    const inRect = r < h && c < w;
    const isEdge = inRect && (r === 0 || c === 0 || r === h-1 || c === w-1);
    html += `<div class="cell${inRect ? ' on' : ''}${isEdge ? ' edge' : ''}"></div>`;
  }
  $('#m5grid').innerHTML = html;
  $('#m5area').textContent = w * h;
  $('#m5perim').textContent = (w + h) * 2;

  // ⭐ 新增：拖滑块也算体验
  recordActivity('m5', `长方形 ${w}×${h}`, `面积 ${w*h}`);
}

/* ============ 面积周长 · 逆向挑战 ============ */
const M5_CHAL_TYPES = [
  {
    key: 'findW',
    label: '已知面积和长，求宽',
    gen: () => {
      const w = 2 + Math.floor(Math.random() * 8);   // 2~9
      const h = 2 + Math.floor(Math.random() * 8);
      const area = w * h;
      return {
        question: `长方形花坛，面积是 <b>${area}</b> 平方米，长是 <b>${w}</b> 米，宽是多少米？`,
        answer: h,
        unit: '米',
        hint: `宽 = 面积 ÷ 长 = ${area} ÷ ${w} = ?`,
      };
    }
  },
  {
    key: 'findH',
    label: '已知面积和宽，求长',
    gen: () => {
      const w = 2 + Math.floor(Math.random() * 8);
      const h = 2 + Math.floor(Math.random() * 8);
      const area = w * h;
      return {
        question: `长方形花坛，面积是 <b>${area}</b> 平方米，宽是 <b>${h}</b> 米，长是多少米？`,
        answer: w,
        unit: '米',
        hint: `长 = 面积 ÷ 宽 = ${area} ÷ ${h} = ?`,
      };
    }
  },
  {
    key: 'perimToLW',
    label: '已知周长，反推长宽',
    gen: () => {
      const w = 2 + Math.floor(Math.random() * 8);
      const h = 2 + Math.floor(Math.random() * 8);
      const perim = (w + h) * 2;
      return {
        question: `长方形花坛，周长是 <b>${perim}</b> 米，长和宽之和是多少米？`,
        answer: w + h,
        unit: '米',
        hint: `长 + 宽 = 周长 ÷ 2 = ${perim} ÷ 2 = ?`,
      };
    }
  },
  {
    key: 'squareArea',
    label: '已知正方形面积，求边长',
    gen: () => {
      const side = 2 + Math.floor(Math.random() * 8);   // 2~9
      const area = side * side;
      return {
        question: `正方形花坛，面积是 <b>${area}</b> 平方米，边长是多少米？`,
        answer: side,
        unit: '米',
        hint: `边长 × 边长 = ${area}，想一想几乘几等于 ${area}？`,
      };
    }
  },
  {
    key: 'squarePerim',
    label: '已知正方形周长，求边长',
    gen: () => {
      const side = 2 + Math.floor(Math.random() * 8);
      const perim = side * 4;
      return {
        question: `正方形花坛，周长是 <b>${perim}</b> 米，边长是多少米？`,
        answer: side,
        unit: '米',
        hint: `边长 = 周长 ÷ 4 = ${perim} ÷ 4 = ?`,
      };
    }
  },
  {
    key: 'areaOptions',
    label: '给定面积，选出可能的长宽（选择）',
    gen: () => {
      // 随机一个面积（完全平方数或其他）
      const targetArea = [12, 16, 20, 24, 36][Math.floor(Math.random() * 5)];
      // 找出所有整数因子对
      const pairs = [];
      for (let w = 1; w <= targetArea; w++) {
        if (targetArea % w === 0 && w <= targetArea / w) {
          pairs.push([w, targetArea / w]);
        }
      }
      // 随机选一对作为正确答案
      const [cw, ch] = pairs[Math.floor(Math.random() * pairs.length)];
      // 生成 3 个错误选项（和不为目标面积，或乘积不为目标面积）
      const options = [[cw, ch]];
      while (options.length < 4) {
        const ow = 1 + Math.floor(Math.random() * 12);
        const oh = 1 + Math.floor(Math.random() * 12);
        if (ow * oh !== targetArea && !options.some(([a,b]) => a===ow && b===oh)) {
          options.push([ow, oh]);
        }
      }
      // 打乱
      options.sort(() => Math.random() - 0.5);

      return {
        type: 'choice',
        question: `面积是 <b>${targetArea}</b> 平方米的长方形，可能是下列哪一组长和宽？`,
        options: options.map(([w, h]) => `${w} × ${h}`),
        correctIndex: options.findIndex(([w, h]) => w === cw && h === ch),
        hint: `长方形的面积 = 长 × 宽，哪一组长 × 宽 = ${targetArea}？`,
        answerText: `${cw} 米 × ${ch} 米`,
      };
    }
  }
];

function m5NewChallenge() {
  const el = document.getElementById('m5Challenge');
  if (!el) return;

  const type = M5_CHAL_TYPES[Math.floor(Math.random() * M5_CHAL_TYPES.length)];
  const q = type.gen();

  if (q.type === 'choice') {
    el.innerHTML = `
      <div class="m5-chal-question">${q.question}</div>
      <div class="m5-chal-options">
        ${q.options.map((opt, i) =>
          `<button class="m5-chal-opt" data-idx="${i}">${opt}</button>`
        ).join('')}
      </div>
      <div class="m5-chal-fb" id="m5ChalFb"></div>
    `;
    const fb = document.getElementById('m5ChalFb');
    el.querySelectorAll('.m5-chal-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.idx;
        el.querySelectorAll('.m5-chal-opt').forEach(b => b.classList.remove('correct', 'wrong'));
        if (idx === q.correctIndex) {
          btn.classList.add('correct');
          fb.innerHTML = `✓ 对！${q.answerText}，${q.answerText.split(' × ').map(s => parseInt(s)).reduce((a,b) => a * b)} 平方米`;
          fb.className = 'm5-chal-fb ok';
        } else {
          btn.classList.add('wrong');
          fb.innerHTML = '❌ 再想想～ ' + q.hint;
          fb.className = 'm5-chal-fb error';
          setTimeout(() => btn.classList.remove('wrong'), 800);
        }
      });
    });
  } else {
    el.innerHTML = `
      <div class="m5-chal-question">${q.question}</div>
      <div class="m5-chal-input-row">
        <input type="text" inputmode="decimal" class="m5-chal-input" id="m5ChalInput" placeholder="?" autocomplete="off">
        <span style="font-size:18px;font-weight:700;color:#64748b;">${q.unit}</span>
        <button class="btn" id="m5ChalSubmit">✓ 确认</button>
      </div>
      <div class="m5-chal-fb" id="m5ChalFb"></div>
    `;
    const input = document.getElementById('m5ChalInput');
    const fb = document.getElementById('m5ChalFb');
    const submit = () => {
      const val = parseFloat(input.value);
      if (isNaN(val)) {
        fb.textContent = '❌ 请输入一个数字';
        fb.className = 'm5-chal-fb error';
        return;
      }
      if (Math.abs(val - q.answer) < 0.001) {
        input.classList.add('correct');
        fb.innerHTML = `✓ 对！答案是 ${q.answer} ${q.unit}`;
        fb.className = 'm5-chal-fb ok';
        // ⭐ 新增
        recordActivity('m5', `逆向挑战`, `答对 ${q.answer} ${q.unit}`, 0);
      } else {
        input.classList.add('wrong');
        fb.innerHTML = '❌ 再想想～ ' + q.hint;
        fb.className = 'm5-chal-fb error';
        setTimeout(() => input.classList.remove('wrong'), 800);
      }
    };
    document.getElementById('m5ChalSubmit').addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    input.focus();
  }
}

document.getElementById('m5NewChallenge')?.addEventListener('click', m5NewChallenge);

/* 初始化：进模块时生成一题 */
m5NewChallenge();

$('#m5w').addEventListener('input', m5Render);
$('#m5h').addEventListener('input', m5Render);
$('#m5record').addEventListener('click', () => {
  const w = +$('#m5w').value, h = +$('#m5h').value;
  m5RecordIdx++;
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${m5RecordIdx}</td><td>${w}</td><td>${h}</td><td>${w} × ${h} = <b style="color:#2563eb">${w*h}</b></td><td>(${w} + ${h}) × 2 = <b style="color:#d97706">${(w+h)*2}</b></td>`;
  $('#m5table tbody').appendChild(tr);
   recordActivity('m5', `长方形 ${w}×${h}`, `面积 ${w*h}`, 500);

});
$('#m5cleartable').addEventListener('click', () => {
  $('#m5table tbody').innerHTML = '';
  m5RecordIdx = 0;
});
m5Render();

/* ============ 模块6：小数 ============ */
const M6 = { yuan:0, jiao:0, fen:0 };
const COIN_DEF = [
  { key:'yuan', label:'1 元', cls:'yuan' },
  { key:'jiao', label:'1 角', cls:'jiao' },
  { key:'fen', label:'1 分', cls:'fen' }
];
function m6RenderCoins() {
  $('#m6coins').innerHTML = COIN_DEF.map(c => {
    const max = c.key === 'yuan' ? 1000 : 9;
    return `
      <div class="coin-item">
        <div class="coin ${c.cls}">${c.label}</div>
        <div class="qty-ctrl">
          <button data-coin="${c.key}" data-d="-1">−</button>
          <input type="text" inputmode="numeric" data-coin="${c.key}" value="${M6[c.key]}">
          <button data-coin="${c.key}" data-d="1">+</button>
        </div>
      </div>`;
  }).join('');
}

/* 数轴总长：以 10 为单位向上取整（0~9 → 10，10~19 → 20，以此类推） */
function m6PickScale(value) {
  const v = Math.max(value, 0);
  if (v <= 10) return 10;
  return Math.ceil(v / 10) * 10;
}

/* 刻度标签格式：根据主刻度间距决定小数位，避免四舍五入后重复 */
function m6FmtLabel(v, majorStep) {
  if (v === 0) return '0';
  if (majorStep >= 1)      return String(Math.round(v));
  if (majorStep >= 0.1)    return v.toFixed(1);
  if (majorStep >= 0.01)   return v.toFixed(2);
  return v.toFixed(3);
}

function m6RenderNumline() {
  const line = $('#m6numline');
  const value = M6.yuan + M6.jiao / 10 + M6.fen / 100;
  const scale = m6PickScale(value);

  const majorSteps = 10;                          // 10 大格
  const subPerMajor = 10;                          // 每大格分 10 小格
  const totalSub = majorSteps * subPerMajor;      // 共 100 小格
  const stepPerSub = scale / totalSub;            // 每小格代表的值
  const majorStep = scale / majorSteps;           // 每大格代表的值

  let html = '';
  for (let i = 0; i <= totalSub; i++) {
    const pct = (i / totalSub) * 100;
    const isMajor = (i % subPerMajor === 0);
    html += `<div class="nl-tick${isMajor ? ' major' : ''}" style="left:${pct}%"></div>`;
    if (isMajor) {
      const val = i * stepPerSub;
      html += `<div class="nl-label" style="left:${pct}%">${m6FmtLabel(val, majorStep)}</div>`;
    }
  }

  if (value > 0) {
    const pct = Math.min((value / scale) * 100, 99.5);
    html += `<div class="nl-marker" style="left:${pct}%" data-label="${value.toFixed(2)}"></div>`;
  }

  line.innerHTML = html;
}

function m6Update() {
  const { yuan, jiao, fen } = M6;
  const total = yuan + jiao/10 + fen/100;
  $('#m6total').innerHTML = total.toFixed(2) + '<small>元</small>';
  const sub = $('#m6sub');
  if (total === 0) sub.textContent = '还没有放硬币';
  else {
    const parts = [`<b>${yuan}</b> 元`];
    if (jiao) parts.push(`<b>${jiao}</b> 角`);
    if (fen) parts.push(`<b>${fen}</b> 分`);
    let detail = '';
    if (jiao) detail += `<br>${jiao} 角 = ${jiao}/10 元 = ${(jiao/10).toFixed(1)} 元`;
    if (fen) detail += `<br>${fen} 分 = ${fen}/100 元 = ${(fen/100).toFixed(2)} 元`;
    sub.innerHTML = parts.join(' + ') + ' = ' + total.toFixed(2) + ' 元' + detail;
    // M6：放硬币（total > 0）
    recordActivity('m6', `钱包 ${total.toFixed(2)} 元`, `${yuan}元${jiao}角${fen}分`);
  }
  m6RenderNumline();
}
/* 加减按钮 */
$('#m6coins').addEventListener('click', e => {
  const btn = e.target.closest('button[data-coin]');
  if (!btn) return;
  const key = btn.dataset.coin, d = +btn.dataset.d;
  const max = key === 'yuan' ? 1000 : 9;
  M6[key] = Math.max(0, Math.min(max, M6[key] + d));
  const input = document.querySelector(`#m6coins input[data-coin="${key}"]`);
  if (input) input.value = M6[key];
  m6Update();
});

/* 数字直接输入 */
$('#m6coins').addEventListener('input', e => {
  const input = e.target.closest('input[data-coin]');
  if (!input) return;
  const key = input.dataset.coin;
  const max = key === 'yuan' ? 1000 : 9;
  let v = parseInt(input.value, 10);
  if (isNaN(v)) v = 0;
  v = Math.max(0, Math.min(max, v));
  M6[key] = v;
  m6Update();
});

/* 失焦时回写规范化后的值 */
$('#m6coins').addEventListener('blur', e => {
  const input = e.target.closest('input[data-coin]');
  if (!input) return;
  input.value = M6[input.dataset.coin];
}, true);
$('#m6clear').addEventListener('click', () => {
  M6.yuan = M6.jiao = M6.fen = 0;
  m6RenderCoins(); m6Update();
});
m6RenderCoins(); m6Update();

/* ============ 模块7：时钟 + 秒表 ============ */
const M7 = {
  hour: 3, minute: 0, second: 0,
  running: true,
  soundOn: false,
  mode: 'clock',
  swElapsed: 0,
  swRunning: false,
  swTarget: 60000,
  swLastFrame: 0,
  swLastTickSec: -1,
  _lastDangerState: null,   // ⭐ 缓存
};
const CN_HOUR = ['十二','一','二','三','四','五','六','七','八','九','十','十一'];

/* ---------- 音效 ---------- */
let m7AudioCtx = null;
function m7InitAudio() {
  if (!m7AudioCtx) {
    try { m7AudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  if (m7AudioCtx && m7AudioCtx.state === 'suspended') m7AudioCtx.resume();
}
function m7PlayTick(isLast) {
  if (!M7.soundOn) return;
  m7InitAudio();
  if (!m7AudioCtx) return;
  const t = m7AudioCtx.currentTime;
  const osc = m7AudioCtx.createOscillator();
  const gain = m7AudioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = isLast ? 1600 : 1000;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(isLast ? 0.18 : 0.10, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + (isLast ? 0.25 : 0.06));
  osc.connect(gain); gain.connect(m7AudioCtx.destination);
  osc.start(t); osc.stop(t + 0.3);
}

/* ---------- 时钟绘制 ---------- */
function m7Draw() {
  const c = $('#m7canvas'), ctx = c.getContext('2d');
  const W = c.width, H = c.height, cx = W/2, cy = H/2, r = Math.min(W, H)/2 - 16;
  ctx.clearRect(0, 0, W, H);

  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = '#f8fafc'; ctx.fill();
  ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 4; ctx.stroke();

  for (let i = 0; i < 60; i++) {
    const ang = (i/60)*Math.PI*2 - Math.PI/2;
    const isHour = i % 5 === 0;
    const r1 = isHour ? r - 16 : r - 9, r2 = r - 5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang)*r1, cy + Math.sin(ang)*r1);
    ctx.lineTo(cx + Math.cos(ang)*r2, cy + Math.sin(ang)*r2);
    ctx.strokeStyle = isHour ? '#334155' : '#cbd5e1';
    ctx.lineWidth = isHour ? 3 : 1;
    ctx.stroke();
  }

  ctx.fillStyle = '#1e293b'; ctx.font = 'bold 22px system-ui,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) {
    const ang = (i/12)*Math.PI*2 - Math.PI/2;
    ctx.fillText(i, cx + Math.cos(ang)*(r-32), cy + Math.sin(ang)*(r-32));
  }

  const hAng = ((M7.hour % 12) + M7.minute/60 + M7.second/3600)/12*Math.PI*2 - Math.PI/2;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(hAng)*14, cy - Math.sin(hAng)*14);
  ctx.lineTo(cx + Math.cos(hAng)*(r*0.48), cy + Math.sin(hAng)*(r*0.48));
  ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke();

  const mAng = (M7.minute/60 + M7.second/3600)*Math.PI*2 - Math.PI/2;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(mAng)*18, cy - Math.sin(mAng)*18);
  ctx.lineTo(cx + Math.cos(mAng)*(r*0.78), cy + Math.sin(mAng)*(r*0.78));
  ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke();

  const sAng = (M7.second/60)*Math.PI*2 - Math.PI/2;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(sAng)*26, cy - Math.sin(sAng)*26);
  ctx.lineTo(cx + Math.cos(sAng)*(r*0.88), cy + Math.sin(sAng)*(r*0.88));
  ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - Math.cos(sAng)*26, cy - Math.sin(sAng)*26, 4, 0, Math.PI*2);
  ctx.fillStyle = '#ef4444'; ctx.fill();

  ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI*2); ctx.fillStyle = '#1e293b'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI*2); ctx.fillStyle = '#fff'; ctx.fill();
}

function m7UpdateDigital() {
  const h = M7.hour % 12 || 12, m = M7.minute, s = M7.second;
  $('#m7digital').textContent = `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  let mt;
  if (m === 0) mt = '整';
  else if (m === 15) mt = '一刻';
  else if (m === 30) mt = '半';
  else if (m === 45) mt = '三刻';
  else mt = m + ' 分';
  $('#m7chinese').textContent = `${CN_HOUR[h % 12]}时${mt}`;
}

/* ============ 时间推算挑战 ============ */
const M7_CALC_TYPES = [
  {
    label: '经过时间（同一天，分钟不进位）',
    gen: () => {
      const h1 = 6 + Math.floor(Math.random() * 6);    // 6~11
      const m1 = Math.floor(Math.random() * 6) * 10;   // 0,10,...,50
      const addMin = 10 + Math.floor(Math.random() * 5) * 10; // 10,20,...,50
      const m2 = m1 + addMin;
      // 保证不跨小时
      if (m2 >= 60) return null;   // 重来
      return {
        question: `从 <b>${h1}:${String(m1).padStart(2,'0')}</b> 到 <b>${h1}:${String(m2).padStart(2,'0')}</b>，经过了多少分钟？`,
        answer: addMin,
        unit: '分钟',
        hint: `${m2} − ${m1} = ?`,
      };
    }
  },
  {
    label: '经过时间（跨小时）',
    gen: () => {
      const h1 = 6 + Math.floor(Math.random() * 4);   // 6~9
      const m1 = 30 + Math.floor(Math.random() * 3) * 10;  // 30,40,50
      const totalMin = (60 - m1) + 10 + Math.floor(Math.random() * 5) * 10;
      // 结果应该在 10~50 分钟
      if (totalMin > 60) return null;
      const h2 = h1 + 1;
      const m2 = totalMin - (60 - m1);
      return {
        question: `从 <b>${h1}:${String(m1).padStart(2,'0')}</b> 到 <b>${h2}:${String(m2).padStart(2,'0')}</b>，经过了多少分钟？`,
        answer: totalMin,
        unit: '分钟',
        hint: `先算到整点：${60} − ${m1} = ${60 - m1} 分钟；再加上 ${m2} 分钟`,
      };
    }
  },
  {
    label: '推算未来时间',
    gen: () => {
      const h = 6 + Math.floor(Math.random() * 8);   // 6~13
      const m = Math.floor(Math.random() * 6) * 10;   // 0,10,...,50
      const addMin = 20 + Math.floor(Math.random() * 5) * 10;   // 20~60
      const totalMin = h * 60 + m + addMin;
      const newH = Math.floor(totalMin / 60) % 24;
      const newM = totalMin % 60;
      return {
        question: `现在是 <b>${h}:${String(m).padStart(2,'0')}</b>，再过 <b>${addMin}</b> 分钟是几点几分？`,
        answer: { h: newH, m: newM },
        type: 'time',
        hint: `${m} + ${addMin} = ${m + addMin} 分钟；${m + addMin >= 60 ? `${m + addMin} − 60 = ${m + addMin - 60} 分，同时进 1 小时` : ''}`,
      };
    }
  },
  {
    label: '推算过去时间',
    gen: () => {
      const h = 12 + Math.floor(Math.random() * 6);   // 12~17
      const m = 10 + Math.floor(Math.random() * 5) * 10;   // 10~50
      const subMin = 20 + Math.floor(Math.random() * 5) * 10;
      let totalMin = h * 60 + m - subMin;
      if (totalMin < 0) return null;
      const newH = Math.floor(totalMin / 60);
      const newM = totalMin % 60;
      return {
        question: `现在是 <b>${h}:${String(m).padStart(2,'0')}</b>，<b>${subMin}</b> 分钟前是几点几分？`,
        answer: { h: newH, m: newM },
        type: 'time',
        hint: `${m} − ${subMin} = ${m - subMin} 分钟；${m - subMin < 0 ? `${m} + 60 − ${subMin} = ${m + 60 - subMin} 分，同时退 1 小时` : ''}`,
      };
    }
  }
];

function m7NewCalcChallenge() {
  const el = document.getElementById('m7CalcChallenge');
  if (!el) return;

  // 最多尝试 20 次生成有效题
  let q = null;
  for (let tries = 0; tries < 20; tries++) {
    const type = M7_CALC_TYPES[Math.floor(Math.random() * M7_CALC_TYPES.length)];
    q = type.gen();
    if (q) break;
  }
  if (!q) { el.innerHTML = '<div style="text-align:center;color:#94a3b8;">生成失败，请再点"出新题"</div>'; return; }

  if (q.type === 'time') {
    // 答案是"几点几分"
    el.innerHTML = `
      <div class="m7-calc-question">${q.question}</div>
      <div class="m7-calc-input-row">
        <input type="text" inputmode="decimal" class="m7-calc-input" id="m7CalcH" placeholder="时" min="0" max="23" autocomplete="off">
        <span class="m7-calc-unit">时</span>
        <input type="text" inputmode="decimal" class="m7-calc-input" id="m7CalcM" placeholder="分" min="0" max="59" autocomplete="off">
        <span class="m7-calc-unit">分</span>
        <button class="btn" id="m7CalcSubmit">✓ 确认</button>
      </div>
      <div class="m7-calc-fb" id="m7CalcFb"></div>
    `;
    const hIn = document.getElementById('m7CalcH');
    const mIn = document.getElementById('m7CalcM');
    const fb = document.getElementById('m7CalcFb');
    const submit = () => {
      const uh = parseInt(hIn.value, 10);
      const um = parseInt(mIn.value, 10);
      if (isNaN(uh) || isNaN(um)) {
        fb.textContent = '❌ 请填写小时和分钟';
        fb.className = 'm7-calc-fb error';
        return;
      }
      if (uh === q.answer.h && um === q.answer.m) {
        hIn.classList.add('correct');
        mIn.classList.add('correct');
        fb.innerHTML = `✓ 对！${q.answer.h} 时 ${q.answer.m} 分`;
        fb.className = 'm7-calc-fb ok';
        // ⭐ 新增
        recordActivity('m7', `时间推算`, `答对 ${q.answer.h}时${q.answer.m}分`, 0);
      } else {
        hIn.classList.add('wrong');
        mIn.classList.add('wrong');
        fb.innerHTML = '❌ 再想想～ ' + q.hint;
        fb.className = 'm7-calc-fb error';
        setTimeout(() => {
          hIn.classList.remove('wrong');
          mIn.classList.remove('wrong');
        }, 800);
      }
    };
    document.getElementById('m7CalcSubmit').addEventListener('click', submit);
    hIn.addEventListener('keydown', e => { if (e.key === 'Enter') mIn.focus(); });
    mIn.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    hIn.focus();
  } else {
    // 答案是分钟数
    el.innerHTML = `
      <div class="m7-calc-question">${q.question}</div>
      <div class="m7-calc-input-row">
        <input type="text" inputmode="decimal" class="m7-calc-input" id="m7CalcAns" placeholder="?" min="0" max="600" autocomplete="off">
        <span class="m7-calc-unit">${q.unit}</span>
        <button class="btn" id="m7CalcSubmit">✓ 确认</button>
      </div>
      <div class="m7-calc-fb" id="m7CalcFb"></div>
    `;
    const inp = document.getElementById('m7CalcAns');
    const fb = document.getElementById('m7CalcFb');
    const submit = () => {
      const v = parseInt(inp.value, 10);
      if (isNaN(v)) {
        fb.textContent = '❌ 请输入一个数字';
        fb.className = 'm7-calc-fb error';
        return;
      }
      if (v === q.answer) {
        inp.classList.add('correct');
        fb.innerHTML = `✓ 对！答案是 ${q.answer} ${q.unit}`;
        fb.className = 'm7-calc-fb ok';
      } else {
        inp.classList.add('wrong');
        fb.innerHTML = '❌ 再想想～ ' + q.hint;
        fb.className = 'm7-calc-fb error';
        setTimeout(() => inp.classList.remove('wrong'), 800);
      }
    };
    document.getElementById('m7CalcSubmit').addEventListener('click', submit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    inp.focus();
  }
}

document.getElementById('m7NewCalcChallenge')?.addEventListener('click', m7NewCalcChallenge);

/* 初始化 */
m7NewCalcChallenge();

function m7ClockTick() {
  if (M7.mode !== 'clock' || !M7.running) return;
  M7.second++;
  if (M7.second >= 60) {
    M7.second = 0; M7.minute++;
    if (M7.minute >= 60) { M7.minute = 0; M7.hour = (M7.hour % 12) + 1; }
  }
  m7Draw(); m7UpdateDigital();
  // M7：拖分针 / 秒表结束
  // ⭐ 整分钟时记一次（防抖 5 秒，避免秒表模式下高频触发）
  if (M7.second === 0) {
    recordActivity('m7', `时钟 ${M7.hour}:${String(M7.minute).padStart(2,'0')}`, '', 5000);
  }

  m7PlayTick(false);
}

/* ---------- 秒表 ---------- */
function m7FmtStopwatch(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60), s = totalSec % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return { main: `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`, dec: `.${tenths}` };
}

function m7UpdateSwDisplay() {
  const el = $('#swDisplay');
  if (!el) return;

  if (M7.mode === 'up') {
    el.classList.remove('warn','danger');
    const t = m7FmtStopwatch(M7.swElapsed);
    el.innerHTML = `${t.main}<small>${t.dec}</small>`;
    return;
  }

  if (M7.mode === 'down') {
    const remain = M7.swTarget - M7.swElapsed;
    const t = m7FmtStopwatch(remain);
    el.innerHTML = `${t.main}<small>${t.dec}</small>`;

    // ⭐ 用 _lastDangerState 缓存，避免每帧 DOM 操作
    let newState = 'normal';
    if (remain <= 10000) newState = 'danger';
    else if (remain <= 30000) newState = 'warn';

    if (M7._lastDangerState !== newState) {
      M7._lastDangerState = newState;
      el.classList.toggle('danger', newState === 'danger');
      el.classList.toggle('warn', newState === 'warn');
    }
    return;
  }

  // clock 模式
  el.classList.remove('warn','danger');
  el.innerHTML = `00:00<small>.0</small>`;
}

function m7SwFrame(now) {
  if (M7.mode === 'clock' || !M7.swRunning) { M7.swLastFrame = now; return; }
  const dt = now - M7.swLastFrame;
  M7.swLastFrame = now;
  M7.swElapsed += dt;

  if (M7.mode === 'down' && M7.swElapsed >= M7.swTarget) {
    M7.swElapsed = M7.swTarget;
    M7.swRunning = false;
    $('#swToggle').textContent = '▶ 开始';
    m7PlayTick(true);
    m7UpdateSwDisplay();
    $('#swHint').innerHTML = '⏰ <b style="color:#dc2626;">时间到！</b> 点击「归零」可重新开始。';
    // ⭐ 新增
    recordActivity('m7', `倒计时 ${M7.swTarget/1000} 秒`, '完成', 0);
    return;
  }

  const curSec = Math.floor(M7.swElapsed / 1000);
  if (curSec !== M7.swLastTickSec) {
    M7.swLastTickSec = curSec;
    m7PlayTick(false);
  }
  m7UpdateSwDisplay();
  requestAnimationFrame(m7SwFrame);
}

function m7SwStart() {
  M7.swRunning = true;
  M7.swLastFrame = performance.now();
  M7.swLastTickSec = Math.floor(M7.swElapsed / 1000);
  $('#swToggle').textContent = '⏸ 暂停';
  $('#swHint').innerHTML = M7.mode === 'up'
    ? '⏱ 正在计时…每秒响一次滴答声。'
    : '⏳ 倒计时进行中…';
  requestAnimationFrame(m7SwFrame);
}

function m7SwReset() {
  M7.swRunning = false;
  M7.swElapsed = 0;
  M7.swLastTickSec = -1;
  $('#swToggle').textContent = '▶ 开始';
  if (M7.mode === 'down') {
    const m = +$('#swMin').value || 0;
    const s = +$('#swSec').value || 0;
    M7.swTarget = (m * 60 + s) * 1000;
    if (M7.swTarget <= 0) M7.swTarget = 60000;
  }
  m7UpdateSwDisplay();
  if (M7.mode === 'up') {
    $('#swHint').innerHTML = '💡 点击「开始」，秒表从 0 往上计时。';
  } else if (M7.mode === 'down') {
    $('#swHint').innerHTML = `💡 倒计时目标：${Math.floor(M7.swTarget/60000)} 分 ${Math.floor((M7.swTarget%60000)/1000)} 秒。`;
  }
}

/* 模式切换 */
$$('.sw-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.sw-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    M7.mode = tab.dataset.mode;
    M7.swRunning = false;
    M7.swElapsed = 0;
    M7.swLastTickSec = -1;
    $('#swToggle').textContent = '▶ 开始';

    const setup = $('#swSetup');
    if (M7.mode === 'clock') {
      setup.style.display = 'none';
      $('#swDisplay').innerHTML = '00:00<small>.0</small>';
      $('#swDisplay').classList.remove('warn','danger');
      $('#swHint').innerHTML = '🕐 时钟模式下，秒针每秒走一格（上方可开启「滴答声」）。';
    } else if (M7.mode === 'up') {
      setup.style.display = 'none';
      m7UpdateSwDisplay();
      $('#swHint').innerHTML = '💡 点击「开始」，秒表从 0 往上计时。';
    } else {
      setup.style.display = 'inline-flex';
      const m = +$('#swMin').value || 0;
      const s = +$('#swSec').value || 0;
      M7.swTarget = (m * 60 + s) * 1000;
      if (M7.swTarget <= 0) M7.swTarget = 60000;
      m7UpdateSwDisplay();
      $('#swHint').innerHTML = `💡 倒计时目标：${m} 分 ${s} 秒，点击「开始」倒计时。`;
    }
  });
});

$('#swToggle').addEventListener('click', () => {
  if (M7.mode === 'clock') return;
  if (M7.swRunning) {
    M7.swRunning = false;
    $('#swToggle').textContent = '▶ 继续';
  } else {
    if (M7.mode === 'down' && M7.swElapsed >= M7.swTarget) M7.swElapsed = 0;
    m7SwStart();
  }
});

$('#swReset').addEventListener('click', () => {
  if (M7.mode === 'clock') {
    M7.hour = 3; M7.minute = 0; M7.second = 0;
    M7.running = true;
    $('#m7toggle').textContent = '⏸ 暂停';
    m7Draw(); m7UpdateDigital();
    return;
  }
  m7SwReset();
});

['swMin','swSec'].forEach(id => {
  $('#' + id).addEventListener('input', () => {
    if (M7.mode !== 'down' || M7.swRunning) return;
    const m = +$('#swMin').value || 0;
    const s = +$('#swSec').value || 0;
    M7.swTarget = (m * 60 + s) * 1000;
    if (M7.swTarget <= 0) M7.swTarget = 60000;
    M7.swElapsed = 0;
    m7UpdateSwDisplay();
  });
});

/* ---------- 拖分针 ---------- */
function m7FromPoint(clientX, clientY) {
  const c = $('#m7canvas'), rect = c.getBoundingClientRect();
  const x = (clientX - rect.left) * (c.width / rect.width);
  const y = (clientY - rect.top) * (c.height / rect.height);
  const cx = c.width/2, cy = c.height/2;
  let ang = Math.atan2(y - cy, x - cx) + Math.PI/2;
  if (ang < 0) ang += Math.PI*2;
  return Math.round(ang / (Math.PI*2) * 60) % 60;
}
let m7Dragging = false;
$('#m7canvas').addEventListener('mousedown', e => {
  m7Dragging = true;
  M7.minute = m7FromPoint(e.clientX, e.clientY);
  M7.second = 0;
  m7Draw(); m7UpdateDigital();

  // ⭐ 新增：拖分针
  recordActivity('m7', `拖分针到 ${M7.minute} 分`, '', 1000);
});
window.addEventListener('mousemove', e => {
  if (!m7Dragging) return;
  const newMin = m7FromPoint(e.clientX, e.clientY);
  if (M7.minute > 45 && newMin < 15) M7.hour = (M7.hour % 12) + 1;
  else if (M7.minute < 15 && newMin > 45) M7.hour = ((M7.hour - 2 + 12) % 12) + 1;
  M7.minute = newMin; M7.second = 0;
  m7Draw(); m7UpdateDigital();
});
window.addEventListener('mouseup', () => { m7Dragging = false; });
$('#m7canvas').addEventListener('touchstart', e => {
  e.preventDefault(); m7Dragging = true;
  const t = e.touches[0];
  M7.minute = m7FromPoint(t.clientX, t.clientY);
  M7.second = 0;
  m7Draw(); m7UpdateDigital();
}, { passive:false });
$('#m7canvas').addEventListener('touchmove', e => {
  e.preventDefault();
  if (!m7Dragging) return;
  const t = e.touches[0];
  const newMin = m7FromPoint(t.clientX, t.clientY);
  if (M7.minute > 45 && newMin < 15) M7.hour = (M7.hour % 12) + 1;
  else if (M7.minute < 15 && newMin > 45) M7.hour = ((M7.hour - 2 + 12) % 12) + 1;
  M7.minute = newMin; M7.second = 0;
  m7Draw(); m7UpdateDigital();
}, { passive:false });
$('#m7canvas').addEventListener('touchend', () => { m7Dragging = false; });

/* 暂停/开始时钟 */
$('#m7toggle').addEventListener('click', () => {
  M7.running = !M7.running;
  $('#m7toggle').textContent = M7.running ? '⏸ 暂停' : '▶ 开始';
});

/* 滴答声开关 */
$('#m7sound').addEventListener('click', () => {
  M7.soundOn = !M7.soundOn;
  $('#m7sound').textContent = M7.soundOn ? '🔊 滴答声' : '🔇 滴答声';
  $('#m7sound').classList.toggle('on', M7.soundOn);
  if (M7.soundOn) { m7InitAudio(); m7PlayTick(false); }
});

/* 重置时钟 */
$('#m7reset').addEventListener('click', () => {
  M7.hour = 3; M7.minute = 0; M7.second = 0;
  M7.running = true;
  $('#m7toggle').textContent = '⏸ 暂停';
  m7Draw(); m7UpdateDigital();
});

/* ⭐ 切到后台时暂停时钟和秒表，节省电量 */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    M7._wasRunning = M7.running;
    M7.running = false;
    M7._swWasRunning = M7.swRunning;
    M7.swRunning = false;
  } else {
    if (M7._wasRunning) M7.running = true;
    if (M7._swWasRunning && M7.mode !== 'clock') m7SwStart();
  }
});

/* 启动 */
setInterval(m7ClockTick, 1000);
m7Draw(); m7UpdateDigital();

/* ============ 模块8：倍的认识 ============ */
const M8 = { base: 3, times: 3, maxBase: 5, maxTimes: 20 };

function m8Render() {
  const { base, times } = M8;
  const total = base * times;
  // M8：滑块变化
  recordActivity('m8', `${base} 的 ${times} 倍`, `共 ${base*times} 个`);


  // 第一行
  $('#m8row1').innerHTML = Array(base).fill('<span class="bei-shape">🍎</span>').join('');

  // 第二行：times 个虚线框，每个框里 base 个
  let row2 = '';
  for (let g = 0; g < times; g++) {
    row2 += '<div class="bei-group">';
    for (let i = 0; i < base; i++) {
      row2 += '<span class="bei-shape">🍎</span>';
    }
    row2 += '</div>';
  }
  $('#m8row2').innerHTML = row2;

  $('#m8result').innerHTML = `
    <div style="font-size:17px;font-weight:700;color:#334155;margin-bottom:16px;">
      第二行有 <b style="color:var(--primary-d);">${total}</b> 个，是第一行 <b style="color:var(--primary-d);">${base}</b> 个的
      <b style="color:#b45309;">${times}</b> 倍
    </div>
    <div class="div-demo">
      <div class="div-row mul">
        <span class="op-badge">📐 乘法求第二行</span>
        ${base} × ${times} = <b>${total}</b>
      </div>
      <div class="div-row div">
        <span class="op-badge">➗ 除法求倍数</span>
        ${total} ÷ ${base} = <b>${times}</b>
      </div>
    </div>
  `;
}

$('#m8base').addEventListener('input', () => {
  M8.base = +$('#m8base').value;
  $('#m8baseval').textContent = M8.base;
  m8Render();
});

$('#m8times').addEventListener('input', () => {
  M8.times = +$('#m8times').value;
  $('#m8timesval').textContent = M8.times;
  m8Render();
});

/* 可配置第一行上限 */
$('#m8baseMax').addEventListener('input', () => {
  let v = +$('#m8baseMax').value;
  if (isNaN(v)) return;
  v = Math.max(1, Math.min(20, v));
  M8.maxBase = v;

  const slider = $('#m8base');
  slider.max = v;
  if (M8.base > v) {
    M8.base = v;
    slider.value = v;
    $('#m8baseval').textContent = v;
  }
  m8Render();
});

/* 可配置倍的上限 */
$('#m8max').addEventListener('input', () => {
  let v = +$('#m8max').value;
  if (isNaN(v)) return;
  v = Math.max(2, Math.min(50, v));
  M8.maxTimes = v;

  const slider = $('#m8times');
  slider.max = v;
  if (M8.times > v) {
    M8.times = v;
    slider.value = v;
    $('#m8timesval').textContent = v;
  }
  m8Render();
});

m8Render();

/* ============ 模块9：竖式运算（加减乘除）· 全互动版 ============ */
(function () {
  'use strict';

  const section = document.getElementById('m9');
  if (!section) return;

  const display = document.getElementById('m9display');
  const aInput  = document.getElementById('m9a');
  const bInput  = document.getElementById('m9b');
  const opInput = document.getElementById('m9op');
  const stepBtn = document.getElementById('m9step');
  const resetBtn = document.getElementById('m9reset');
  const fbEl = document.getElementById('m9fb');
  if (!display || !aInput || !bInput || !opInput) return;

  const M9 = {
    a: 348, b: 176, op: '+',
    step: -1,                 // 0=个位, 1=十位, 2=百位...；除法表示第几步
    // 交互状态
    waitingFor: null,         // null | 'carry' | 'result' | 'quotient' | 'product' | 'remainder'
    expects: {},              // { carry: '1', result: '2', ... } 每个位置的期望答案
    // 已完成的数据
    filled: {},               // { 'carry-1': '1', 'result-0': '4', ... }
    submitting: false,   // ⭐ 新增：防止 blur + Enter 重复提交
  };
  /* ⭐ 调试用：暴露到全局 */
  window.M9 = M9;
  /* ⭐ 关键修复：把 M9 引用注入给兼容层的 computeAnswerMap */
  _M9Ref = M9;

  /* ---------- 工具 ---------- */
  function isMulDiv() { return M9.op === '×' || M9.op === '÷'; }
  function setFeedback(html, type) {
    if (!fbEl) return;
    fbEl.innerHTML = html;
    fbEl.className = 'feedback' + (type ? ' ' + type : '');
  }

  window.computeAnswerMap = computeAnswerMap;

  let ANSWER = {};   // 缓存
  window.setM9Answer = (v) => { ANSWER = v; };
  window.getM9Answer = () => ANSWER;

  /* ---------- 渲染 ---------- */
    function renderAddSub() {
    const maxLen = getAddSubMaxLen();
    const aD = String(M9.a).padStart(maxLen, '0').split('').map(Number);
    const bD = String(M9.b).padStart(maxLen, '0').split('').map(Number);

    const curPos = M9.step;                  // 0=个位, 1=十位...
    const curI = maxLen - 1 - curPos;        // 当前位在数组中的索引（-1 表示未开始）

    let html = '<div class="vertical-calc">';

    // ① 进位行
    html += '<div class="vc-row"><div class="vc-cell carry"></div>';
    for (let i = 0; i < maxLen; i++) {
      const carryKey = `carry-${i + 1}`;
      const filled = M9.filled[carryKey];
      const hasCarry = ANSWER[carryKey];

      // 计算"当前需要填的进位 key"
      let needCarryKey = null;
      if (M9.waitingFor === 'carry') {
        const prevKey = `carry-${curI + 1}`;
        const curKey  = `carry-${curI}`;
        if (ANSWER[prevKey] && !M9.filled[prevKey]) needCarryKey = prevKey;
        else if (ANSWER[curKey] && !M9.filled[curKey]) needCarryKey = curKey;
      }

      const isCurrent = (needCarryKey === carryKey);

      if (hasCarry && isCurrent) {
        html += `<div class="vc-cell carry input-cell"><input type="text" class="vc-input vc-input-carry" id="m9InlineInput" inputmode="numeric" maxlength="1" autocomplete="off"></div>`;
      } else if (filled) {
        html += `<div class="vc-cell carry">${filled}</div>`;
      } else {
        html += `<div class="vc-cell carry"></div>`;
      }
    }
    html += '</div>';

    // ⭐ a、b 独立右对齐：短数前面留空
    const aStr = String(M9.a);
    const bStr = String(M9.b);
    const aLen = aStr.length;
    const bLen = bStr.length;
    // a 的最低位（个位）在 maxLen 的索引位置：maxLen-1
    // a 的最高位在索引 maxLen - aLen
    const aStartIdx = maxLen - aLen;
    const bStartIdx = maxLen - bLen;

    // ② a 行
    html += '<div class="vc-row"><div class="vc-cell"></div>';
    for (let i = 0; i < maxLen; i++) {
      if (i < aStartIdx) {
        // a 的高位留空
        html += `<div class="vc-cell"></div>`;
      } else {
        const hl = (curPos >= 0 && i === curI) ? ' highlight' : '';
        html += `<div class="vc-cell${hl}">${aD[i]}</div>`;
      }
    }
    html += '</div>';

    // ③ 运算符 + b 行
    html += '<div class="vc-row">';
    html += `<div class="vc-cell op">${M9.op}</div>`;
    for (let i = 0; i < maxLen; i++) {
      if (i < bStartIdx) {
        // b 的高位留空
        html += `<div class="vc-cell"></div>`;
      } else {
        const hl = (curPos >= 0 && i === curI) ? ' highlight' : '';
        html += `<div class="vc-cell${hl}">${bD[i]}</div>`;
      }
    }
    html += '</div>';

    // ④ 横线
    html += '<div class="vc-line"></div>';

    // ⑤ 结果行
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
    html += '</div>';

    html += '</div>';
    return html;
  }

  function renderMul() {
    const aStr = String(M9.a);
    const aLen = aStr.length;
    const b = M9.b;
    const displayCols = 4;   // 千、百、十、个
    const aRev = aStr.split('').reverse().map(Number);

    let html = '<div class="vertical-calc">';

    // ① 进位行
    html += '<div class="vc-row"><div class="vc-cell"></div>';
    for (let col = displayCols - 1; col >= 0; col--) {
      // col=0 个位, 1=十位, 2=百位, 3=千位
      const carryKey = `carry-${col}`;
      const filled = M9.filled[carryKey];
      const isCurrent = M9.waitingFor === 'carry' && col === M9.step + 1;
      const hasCarry = ANSWER[carryKey];

      if (hasCarry && isCurrent) {
        html += `<div class="vc-cell carry input-cell"><input type="text" class="vc-input vc-input-carry" id="m9InlineInput" inputmode="numeric" maxlength="1" autocomplete="off"></div>`;
      } else if (filled) {
        html += `<div class="vc-cell carry">${filled}</div>`;
      } else {
        html += `<div class="vc-cell carry"></div>`;
      }
    }
    html += '</div>';

    // ② a 行
    html += '<div class="vc-row"><div class="vc-cell"></div>';
    for (let col = displayCols - 1; col >= 0; col--) {
      const hl = (col === M9.step && M9.step < aLen) ? ' highlight' : '';
      const val = (col < aLen) ? aRev[col] : '';
      html += `<div class="vc-cell${hl}">${val}</div>`;
    }
    html += '</div>';

    // ③ 运算符 + b 行
    html += '<div class="vc-row">';
    html += '<div class="vc-cell op">×</div>';
    html += '<div class="vc-cell"></div>';
    html += '<div class="vc-cell"></div>';
    html += '<div class="vc-cell"></div>';
    const hlB = (M9.step >= 0) ? ' highlight' : '';
    html += `<div class="vc-cell${hlB}">${b}</div>`;
    html += '</div>';

    // ④ 横线
    html += '<div class="vc-line"></div>';

    // ⑤ 结果行
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
    html += '</div>';

    html += '</div>';
    return html;
  }

  function renderDiv() {
    const a = M9.a, b = M9.b;
    if (b === 0) return '<div style="color:#b91c1c;font-size:18px;">除数不能为 0</div>';

    const aStr = String(a);
    const n = aStr.length;
    const aD = aStr.split('').map(Number);
    // ⭐ 被除数小于除数 → 无法分步，直接显示结果
    if (a < b) {
      return `
        <div class="vertical-calc" style="padding:20px;text-align:center;">
          <div style="font-size:24px;font-weight:800;color:#1e293b;margin-bottom:12px;">
            ${a} ÷ ${b} = 0 余 ${a}
          </div>
          <div style="font-size:14px;color:#64748b;">
            被除数比除数小，商是 0，余数就是被除数本身
          </div>
        </div>
      `;
    }

    // ⭐ 逐步计算（与 computeAnswerMap 完全一致：跳过前导 0）
    const steps = [];
    let rem = 0;
    let startPos = 0;
    let started = false;
    for (let i = 0; i < n; i++) {
      const curVal = rem * 10 + aD[i];
      const q = Math.floor(curVal / b);
      const prod = q * b;
      const newRem = curVal - prod;

      // ⭐ 跳过前导 0
      if (i === 0 && q === 0 && !started) {
        rem = curVal;
        continue;
      }

      if (!started) {
        startPos = i;
        started = true;
      }

      steps.push({ start: startPos, end: i, q, prod, rem: newRem });

      // ⭐ 每一步结束后，startPos 更新为下一步的开始位置
      startPos = i + 1;

      rem = newRem;
    }

    const cells = [];
    const curStep = M9.step;   // 当前处理第几步

    // 商行（row 1）
    steps.forEach((s, idx) => {
      const col = 2 + s.end + 1;
      const key = `quotient-${idx}`;
      const filled = M9.filled[key];
      const isCurrent = M9.waitingFor === 'quotient' && idx === curStep;

      if (isCurrent) {
        cells.push({ row: 1, col, cls: 'input-cell', input: true });
      } else if (filled) {
        cells.push({ row: 1, col, text: filled, cls: 'vc-div-q' });
      } else {
        cells.push({ row: 1, col, text: '', cls: '' });
      }
    });

    // 被除数行（row 2）
    cells.push({ row: 2, col: 1, text: b, cls: 'vc-div-divisor' });
    cells.push({ row: 2, col: 2, text: '', cls: 'vc-div-sep' });
    for (let i = 0; i < n; i++) {
      cells.push({ row: 2, col: 3 + i, text: aD[i], cls: '' });
    }

    // 各步
    let curRow = 3;
    steps.forEach((s, idx) => {
      // 乘积行
      // ⭐ 乘积的位数直接由 prod 决定，不用 s.end - s.start
      const prodStr = String(s.prod);
      const prodDigits = prodStr.split('').map(Number);
      const prodStartCol = 3 + s.end - (prodDigits.length - 1);

      const isCurStep = (idx === curStep);
      const prodKey = `product-${idx}`;
      const prodFilled = M9.filled[prodKey];
      const isCurrentProd = M9.waitingFor === 'product' && idx === curStep;

      if (isCurrentProd) {
        // 乘积：学生填一个格子（简化：一个 input 覆盖整个乘积）
        // 这里为了简单，在整个乘积范围最右一格放 input
        for (let i = 0; i < prodDigits.length; i++) {
          if (i === prodDigits.length - 1) {
            cells.push({ row: curRow, col: prodStartCol + i, cls: 'input-cell', input: true });
          } else {
            cells.push({ row: curRow, col: prodStartCol + i, text: '', cls: '' });
          }
        }
      } else if (prodFilled) {
        for (let i = 0; i < prodDigits.length; i++) {
          cells.push({ row: curRow, col: prodStartCol + i, text: prodDigits[i], cls: 'vc-div-highlight' });
        }
      } else {
        for (let i = 0; i < prodDigits.length; i++) {
          cells.push({ row: curRow, col: prodStartCol + i, text: '', cls: '' });
        }
      }
      curRow++;

      // 横线行
      const lineStartCol = 3 + s.start;
      const lineEndCol = 3 + s.end;
      for (let c = lineStartCol; c <= lineEndCol; c++) {
        cells.push({ row: curRow, col: c, text: '', cls: idx <= curStep ? 'vc-div-line' : '' });
      }
      curRow++;

      // 余数行（最后一步不显示中间余数）
      if (idx < steps.length - 1) {
        const remStr = String(s.rem);
        const remDigits = remStr.split('').map(Number);
        const remStartCol = 3 + s.end - (remDigits.length - 1);

        const remKey = `remainder-${idx}`;
        const remFilled = M9.filled[remKey];
        const isCurrentRem = M9.waitingFor === 'remainder' && idx === curStep;

        if (isCurrentRem) {
          // ⭐ 多位数余数：整块用一个输入框，maxlength 按实际位数
          const fullLen = remDigits.length;
          // 前面留空
          for (let i = 0; i < fullLen - 1; i++) {
            cells.push({ row: curRow, col: remStartCol + i, text: '', cls: '' });
          }
          // 最后一位放输入框，maxlength = 位数
          cells.push({
            row: curRow,
            col: remStartCol + fullLen - 1,
            cls: 'input-cell',
            input: true,
            maxlength: fullLen
          });
        } else if (remFilled) {
          for (let i = 0; i < remDigits.length; i++) {
            cells.push({ row: curRow, col: remStartCol + i, text: remDigits[i], cls: '' });
          }
        } else {
          for (let i = 0; i < remDigits.length; i++) {
            cells.push({ row: curRow, col: remStartCol + i, text: '', cls: '' });
          }
        }
        curRow++;
      }
    });

    // 最终余数
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
          if (i === digits.length - 1) {
            cells.push({ row: curRow, col: startCol + i, cls: 'input-cell', input: true });
          } else {
            cells.push({ row: curRow, col: startCol + i, text: '', cls: '' });
          }
        }
      } else if (finalFilled) {
        for (let i = 0; i < digits.length; i++) {
          cells.push({ row: curRow, col: startCol + i, text: digits[i], cls: 'vc-div-highlight' });
        }
      }
    }

    // 组装
    let html = `<div class="vc-div-grid" style="grid-template-columns: 40px 24px ${'48px '.repeat(n)}; grid-auto-rows: 50px;">`;
    cells.forEach(c => {
      const inner = c.input
        ? `<input type="text" class="vc-input" id="m9InlineInput" inputmode="numeric" maxlength="${c.maxlength || 3}" enterkeyhint="next" autocomplete="off">`
        : (c.text !== undefined ? c.text : '');
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

    // 反馈
    if (M9.step < 0) {
      setFeedback('点击「下一步」，开始计算');
    } else if (M9.waitingFor) {
      const label = {
        carry: '✏️ 请填写进位/借位',
        result: '✏️ 请填写这一位的得数',
        quotient: '✏️ 请填写这一位的商',
        product: '✏️ 请填写乘积',
        remainder: '✏️ 请填写余数',
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
  const M9_ESTIMATE = {
    passed: false,
    expected: null,     // 'around100' | 'around500' 等
    range: null,        // { min, max } 正确范围
  };

  function m9ShowEstimateBox() {
    const box = document.getElementById('m9EstimateBox');
    const opts = document.getElementById('m9EstimateOptions');
    const fb = document.getElementById('m9EstimateFeedback');
    if (!box || !opts) return;

    // 计算结果
    const a = M9.a, b = M9.b, op = M9.op;
    let exact;
    if (op === '+') exact = a + b;
    else if (op === '−') exact = a - b;
    else if (op === '×') exact = a * b;
    else exact = Math.floor(a / b);

    // 生成范围选项（取整到最近的百位）
    const roundTo = 100;
    const base = Math.floor(exact / roundTo) * roundTo;
    const options = [
      { min: base - 100, max: base, label: `${base - 100}~${base}` },
      { min: base, max: base + 100, label: `${base}~${base + 100}` },
      { min: base + 100, max: base + 200, label: `${base + 100}~${base + 200}` },
    ];
    // 打乱顺序
    options.sort(() => Math.random() - 0.5);

    // 正确选项是"包含 exact"的那个
    const correctIdx = options.findIndex(o => exact >= o.min && exact <= o.max);

    opts.innerHTML = options.map((o, i) =>
      `<button class="priority-opt" data-idx="${i}">${o.label}</button>`
    ).join('');
    fb.textContent = '';
    fb.className = 'priority-feedback';

    opts.querySelectorAll('.priority-opt').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        const isCorrect = (i === correctIdx);
        opts.querySelectorAll('.priority-opt').forEach(b => {
          b.classList.remove('chosen', 'wrong', 'correct');
        });
        btn.classList.add('chosen', isCorrect ? 'correct' : 'wrong');

        if (isCorrect) {
          fb.textContent = `✓ 对！精确结果是 ${exact}。开始一步步计算吧！`;
          fb.className = 'priority-feedback ok';
          M9_ESTIMATE.passed = true;
          setTimeout(() => {
            box.style.display = 'none';
            m9Render();
            setFeedback('✅ 估算正确！「下一步」开始计算。', 'ok');
            // ⭐ 估算通过后，直接进输入状态
            M9.step = 0;
            m9PromptCurrentStep();
          }, 800);
        } else {
          fb.textContent = `❌ 再想想——精确结果在 ${options[correctIdx].label} 之间`;
          fb.className = 'priority-feedback error';
          setTimeout(() => {
            btn.classList.remove('chosen', 'wrong');
          }, 1200);
        }
      });
    });

    box.style.display = 'block';
  }

  function m9HideEstimateBox() {
    const box = document.getElementById('m9EstimateBox');
    if (box) box.style.display = 'none';
  }

  /* ---------- 下一步 ---------- */
  function m9NextStep() {
    if (M9.waitingFor) {
      setFeedback('请先填写当前格子哦', 'error');
      return;
    }

    // ⭐ 第一次点击"下一步"时，先弹出估算
    if (M9.step === -1 && !M9_ESTIMATE.passed) {
      m9ShowEstimateBox();
      return;
    }

    const maxSteps = m9GetMaxSteps();
    if (M9.step >= maxSteps) return;

    M9.step++;
    m9PromptCurrentStep();
  }

  /* ---------- 让当前步进入"等待输入"状态 ---------- */
  function m9PromptCurrentStep() {
    const curStep = M9.step;
    const op = M9.op;

    if (op === '+' || op === '−') {
      const curI = getAddSubMaxLen() - 1 - curStep;

      // ① 上一位产生的进位
      const prevCarryKey = `carry-${curI + 1}`;
      if (ANSWER[prevCarryKey] && !M9.filled[prevCarryKey]) {
        M9.waitingFor = 'carry';
        m9Render();
        focusInlineInput();
        return;
      }

      // ② ⭐ 当前位产生的进位（提前到结果之前）
      const curCarryKey = `carry-${curI}`;
      if (ANSWER[curCarryKey] && !M9.filled[curCarryKey]) {
        M9.waitingFor = 'carry';
        m9Render();
        focusInlineInput();
        return;
      }

      // ③ 当前位结果（放最后）
      const resultKey = `result-${curI}`;
      if (!M9.filled[resultKey]) {
        M9.waitingFor = 'result';
        m9Render();
        focusInlineInput();
        return;
      }

      M9.waitingFor = null;
      m9Render();
      return;
    }

    if (op === '×') {
      const curPos = curStep;

      // ⭐ 先看有没有进位要填
      const carryKey = `carry-${curPos + 1}`;
      if (ANSWER[carryKey] && !M9.filled[carryKey]) {
        M9.waitingFor = 'carry';
        m9Render();
        focusInlineInput();
        return;
      }

      // 再填结果
      M9.waitingFor = 'result';
      m9Render();
      focusInlineInput();
      return;
    }

    if (op === '÷') {
      // 商 → 乘积 → 余数
      const qKey = `quotient-${curStep}`;
      if (!M9.filled[qKey]) {
        M9.waitingFor = 'quotient';
        m9Render(); focusInlineInput(); return;
      }
      const pKey = `product-${curStep}`;
      if (!M9.filled[pKey]) {
        M9.waitingFor = 'product';
        m9Render(); focusInlineInput(); return;
      }
      const rKey = `remainder-${curStep}`;
      if (!M9.filled[rKey]) {
        M9.waitingFor = 'remainder';
        m9Render(); focusInlineInput(); return;
      }
      // 都填了，自动进下一步
      M9.step++;
      if (M9.step > m9GetMaxSteps()) {
        M9.step--;
        setFeedback(`🎉 算出来啦！${M9.a} ${M9.op} ${M9.b} = <b>${calcFinalResult()}</b>`, 'ok');

        // ⭐ 新增
        historyAdd({
            problemText: `${M9.a} ${M9.op} ${M9.b}`,
            problemSource: 'm9',
            moduleId: 'm9',
            studentSteps: Object.keys(M9.filled).map(k => ({
              rel: k, sub: '', res: M9.filled[k],
            })),
            studentAnswer: String(calcFinalResult()),
            isCorrect: true,
            correctAnswer: String(calcFinalResult()),
            aiFeedback: null,
        });

        // ⭐ 新增 掌握度
        const mrec = masteryRecord(`${M9.a} ${M9.op} ${M9.b}`, true);
        if (mrec && mrec.state === 'mastered') {
          showToast('🏆 这道题你掌握了！', 'success');
          setTimeout(() => {
            showMasteryCard({
              problemText: `${M9.a} ${M9.op} ${M9.b}`,
              correctAnswer: String(calcFinalResult()),
              takeaway: takeawayLoad(`${M9.a} ${M9.op} ${M9.b}`),
            });
          }, 800);
        }

        return;
      }
      m9PromptCurrentStep();
      return;
    }
  }

  let _m9FocusTimer = null;
  let _m9FocusToken = 0;   // ⭐ 令牌，防止过期定时器乱聚焦

  function focusInlineInput() {
    if (M9.submitting) return;
    if (!M9.waitingFor) return;
    focusInputWhenReady('m9InlineInput');
  }

  /* ---------- 检查当前步是否完成 ---------- */
  function isStepComplete() {
    const curStep = M9.step;
    const op = M9.op;

    if (op === '+' || op === '−') {
      const curI = getAddSubMaxLen() - 1 - curStep;
      // ① 上一位的进位
      const prevCarryKey = `carry-${curI + 1}`;
      if (ANSWER[prevCarryKey] && !M9.filled[prevCarryKey]) return false;
      // ② 当前位结果
      const resultKey = `result-${curI}`;
      if (!M9.filled[resultKey]) return false;
      // ③ 当前位产生的进位
      const curCarryKey = `carry-${curI}`;
      if (ANSWER[curCarryKey] && !M9.filled[curCarryKey]) return false;
      return true;
    }

    if (op === '×') {
      const curPos = curStep;
      const carryKey = `carry-${curPos + 1}`;
      const resultKey = `result-${curPos}`;
      if (ANSWER[carryKey] && !M9.filled[carryKey]) return false;
      if (!M9.filled[resultKey]) return false;
      return true;
    }

    if (op === '÷') {
      const qKey = `quotient-${curStep}`;
      const pKey = `product-${curStep}`;
      const rKey = `remainder-${curStep}`;
      if (!M9.filled[qKey]) return false;
      if (!M9.filled[pKey]) return false;
      if (!M9.filled[rKey]) return false;
      return true;
    }

    return true;
  }

  function highlightM9WrongHint() {
    // 找到当前 step 对应的"该看哪里"
    if (M9.op === '+' || M9.op === '−') {
      const curI = getAddSubMaxLen() - 1 - M9.step;
      // 高亮当前位的两个数字
      const cells = document.querySelectorAll('#m9display .vc-row .vc-cell');
      // 简单做法：给当前高亮的格子加脉冲
      document.querySelectorAll('#m9display .vc-cell.highlight').forEach(el => {
        el.classList.add('explore-highlight');
        setTimeout(() => el.classList.remove('explore-highlight'), 1200);
      });
    } else if (M9.op === '×') {
      // 高亮乘数 b 和当前位
      document.querySelectorAll('#m9display .vc-cell.highlight').forEach(el => {
        el.classList.add('explore-highlight');
        setTimeout(() => el.classList.remove('explore-highlight'), 1200);
      });
    } else if (M9.op === '÷') {
      // 高亮除数
      const divisor = document.querySelector('#m9display .vc-div-divisor');
      if (divisor) {
        divisor.classList.add('explore-highlight');
        setTimeout(() => divisor.classList.remove('explore-highlight'), 1200);
      }
    }
  }

  /* ---------- 提交当前输入 ---------- */
  function submitInline(input) {
    // ⭐ 防重入：一次输入只提交一次
    if (M9.submitting) return;
    const raw = input.value.trim();
    if (!raw) return;

    M9.submitting = true;   // 上锁

    const curStep = M9.step;
    const op = M9.op;
    let key, expected;

    if (op === '+' || op === '−') {
      const curI = getAddSubMaxLen() - 1 - curStep;
      if (M9.waitingFor === 'carry') {
        const prevCarryKey = `carry-${curI + 1}`;
        const curCarryKey = `carry-${curI}`;
        if (ANSWER[prevCarryKey] && !M9.filled[prevCarryKey]) {
          key = prevCarryKey;
        } else {
          key = curCarryKey;
        }
        expected = ANSWER[key];
      } else {
        key = `result-${curI}`;
        expected = ANSWER[key];
      }
    } else if (op === '×') {
      if (M9.waitingFor === 'carry') {
        key = `carry-${curStep + 1}`;
        expected = ANSWER[key];
      } else {
        key = `result-${curStep}`;
        expected = ANSWER[key];
      }
    } else if (op === '÷') {
      if (M9.waitingFor === 'quotient') {
        key = `quotient-${curStep}`;
      } else if (M9.waitingFor === 'product') {
        key = `product-${curStep}`;
      } else {
        key = `remainder-${curStep}`;
      }
      expected = ANSWER[key];
    }

    // 校验
    if (String(raw) === String(expected)) {
      input.classList.remove('wrong');
      input.classList.add('correct');
      // ⭐ 弹一下
      input.style.transition = 'transform .15s cubic-bezier(.34,1.5,.64,1)';
      input.style.transform = 'scale(1.15)';
      setTimeout(() => {
        input.style.transform = 'scale(1)';
      }, 150);
      setFeedback(getEncouragement('m9', COMBO.count), 'ok');

      M9.filled[key] = raw;
      M9.waitingFor = null;

      /* ⭐ 先 blur 旧输入框（会触发一次 blur，但 submitting=true 已被拦截） */
      input.blur();

      setTimeout(() => {
        M9.submitting = false;   // 解锁
        if (isStepComplete()) {
          M9.step++;
          if (M9.step > m9GetMaxSteps()) {
            M9.step--;
            M9.waitingFor = null;
            m9Render();
            setFeedback(`🎉 算出来啦！${M9.a} ${M9.op} ${M9.b} = <b>${calcFinalResult()}</b>`, 'ok');
            // ⭐ 新增：写做题记录
            const final = calcFinalResult();
            historyAdd({
            problemText: `${M9.a} ${M9.op} ${M9.b}`,
            problemSource: 'm9',
            moduleId: 'm9',                          // ⭐ 关键
            studentSteps: Object.keys(M9.filled).map(k => ({
              rel: k,                                // 'carry-1' / 'result-0' 等
              sub: '',
              res: M9.filled[k],
            })),
            studentAnswer: String(final),
            isCorrect: true,
            correctAnswer: String(final),
            aiFeedback: null,
            });

            // ⭐ 新增 掌握度
            const mrec = masteryRecord(`${M9.a} ${M9.op} ${M9.b}`, true);
            if (mrec && mrec.state === 'mastered') {
              showToast('🏆 这道题你掌握了！', 'success');
              setTimeout(() => {
                showMasteryCard({
                  problemText: `${M9.a} ${M9.op} ${M9.b}`,
                  correctAnswer: String(calcFinalResult()),
                  takeaway: takeawayLoad(`${M9.a} ${M9.op} ${M9.b}`),
                });
              }, 800);
            }
            return;
          }
          m9Render();
          m9PromptCurrentStep();
        } else {
          m9Render();
          m9PromptCurrentStep();
        }
      }, 400);
    } else {
      input.classList.add('wrong');
      setFeedback('❌ 再想想', 'error');
      setTimeout(() => input.classList.remove('wrong'), 400);
      M9.submitting = false;   // ⭐ 答错立即解锁
      input.focus();
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
      // ⭐ 高亮"该看哪里"
      highlightM9WrongHint();
    }
  }

  /* ============================================================
   ⭐ 竖式进位：随机出题
   ============================================================ */
  (function patchM9Random() {
    const btn = document.getElementById('m9random');
    if (!btn) return;

    function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    function randomProblem() {
      // 随机运算类型
      const opIdx = Math.floor(Math.random() * 4);
      const ops = ['+', '−', '×', '÷'];
      const op = ops[opIdx];

      let a, b;

      if (op === '+') {
        // 加法：保证有进位（否则意义不大）
        // 个位、十位至少一位相加 ≥ 10
        do {
          a = rnd(100, 999);
          b = rnd(100, 999);
        } while (!hasCarry(a, b, '+'));
      } else if (op === '−') {
        // 减法：保证有退位
        do {
          a = rnd(200, 999);
          b = rnd(100, a - 1);
        } while (!hasCarry(a, b, '−'));
      } else if (op === '×') {
        // 乘法：多位数 × 一位数（2~9）
        // 保证进位或结果为多位数
        do {
          a = rnd(12, 99);
          b = rnd(2, 9);
        } while (a * b < 100 && rnd(0, 1) === 0);
      } else {
        // 除法：被除数 2~3 位，除数 2~9，且不能整除（有练习价值）
        // 或者整除以练习竖式
        do {
          b = rnd(2, 9);
          const q = rnd(2, Math.floor(999 / b));
          a = q * b + rnd(0, b - 1);   // 加个随机余数
        } while (a > 999 || a < b * 2);
      }

      return { a, b, op };
    }

    /* m9完全随机
    btn.addEventListener('click', () => {
      const { a, b, op } = randomProblem();
      const aInput = document.getElementById('m9a');
      const bInput = document.getElementById('m9b');
      const opInput = document.getElementById('m9op');

      // 调整 b 的 max（乘除时 ≤ 9）
      if (op === '×' || op === '÷') {
        bInput.max = 9;
      } else {
        bInput.max = 999;
      }
      bInput.min = op === '÷' ? 1 : 0;

      aInput.value = a;
      bInput.value = b;
      opInput.value = op;

      // 触发原逻辑的 reset（M9 内部监听了 input 和 change）
      aInput.dispatchEvent(new Event('input', { bubbles: true }));
      bInput.dispatchEvent(new Event('input', { bubbles: true }));
      opInput.dispatchEvent(new Event('change', { bubbles: true }));

      // 提示
      const fb = document.getElementById('m9fb');
      if (fb) {
        fb.className = 'feedback ok';
        fb.innerHTML = `🎲 已生成：${a} ${op} ${b}，点击「下一步」开始计算`;
      }
    });
    */

    // ⭐ M9 按层级出题
    window.__m9SetLevel = function(levelId) {
      window.__m9CurrentLevel = levelId;
    };

    // m9random 的点击逻辑改（找到 `$('#m9random')` 那段）：
    $('#m9random').addEventListener('click', () => {
      const level = window.__m9CurrentLevel || null;
      // 按层级生成
      let op;
      if (level === 'add') op = '+';
      else if (level === 'sub') op = '−';
      else if (level === 'mul') op = '×';
      else if (level === 'div') op = '÷';
      else op = ['+', '−', '×', '÷'][Math.floor(Math.random() * 4)];
      
      // 用原来的 randomProblem，但锁定 op
      // 这里需要改 randomProblem 让它接收 op
      const { a, b } = randomProblemByOp(op);
      document.getElementById('m9a').value = a;
      document.getElementById('m9b').value = b;
      document.getElementById('m9op').value = op;
      aInput.dispatchEvent(new Event('input', { bubbles: true }));
      bInput.dispatchEvent(new Event('input', { bubbles: true }));
      opInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
  })();

  /* ---------- 重置 ---------- */
  function m9Reset() {
    // ⭐ 新增：清除上一题的反馈条
    if (window.__shell && typeof window.__shell.hideThumbBar === 'function') {
      window.__shell.hideThumbBar();
    }
    // 兜底直接移除类名
    document.getElementById('thumbBar')?.classList.remove('show', 'ok', 'err');

    let a = +aInput.value, b = +bInput.value;

    // ⭐ 洗数据：NaN → 0；小数 → 整数；超范围 → 裁剪
    if (!Number.isFinite(a)) a = 0;
    if (!Number.isFinite(b)) b = 0;
    a = Math.floor(a);
    b = Math.floor(b);

    M9.a = Math.max(0, Math.min(999, a));
    M9.op = opInput.value;

    if (isMulDiv()) {
      // 乘除：b 范围 1~9（除数不能为 0）
      b = Math.max(1, Math.min(9, b));
      bInput.max = 9;
      bInput.min = 1;
    } else {
      // 加减：b 范围 0~999
      b = Math.max(0, Math.min(999, b));
      bInput.max = 999;
      bInput.min = 0;
    }
    M9.b = b;

    // ⭐ 除法：被除数小于除数 → 直接反馈提示
    if (M9.op === '÷' && M9.a < M9.b) {
      aInput.value = M9.a;
      bInput.value = M9.b;
      M9.step = -1;
      M9.waitingFor = null;
      M9.filled = {};
      ANSWER = computeAnswerMap();
      M9_ESTIMATE.passed = false;
      m9HideEstimateBox();
      setFeedback(`💡 ${M9.a} ÷ ${M9.b} = 0 余 ${M9.a}（被除数比除数小）`, 'ok');
      m9Render();
      return;
    }

    aInput.value = M9.a;
    bInput.value = M9.b;

    M9.step = -1;
    M9.waitingFor = null;
    M9.filled = {};
    ANSWER = computeAnswerMap();

    // ⭐ 重置估算状态
    M9_ESTIMATE.passed = false;
    m9HideEstimateBox();

    setFeedback('点击「下一步」，开始计算');
    m9Render();
  }

  /* ⭐ 移动端：事件委托统一处理 Enter 和 input（避免每次重绘重复绑定） */
  display.addEventListener('keydown', e => {
    if (e.target.id === 'm9InlineInput' && e.key === 'Enter') {
      e.preventDefault();
      submitInline(e.target);
    }
  });
  /* ⭐ 移动端：失焦即提交（点击页面其他地方 / 切换输入法 / 键盘收起 都算） */
  display.addEventListener('blur', e => {
    if (e.target.id !== 'm9InlineInput') return;
    // 用 setTimeout 让 blur 之后的 focus 优先（比如点击了另一个输入框）
    setTimeout(() => {
      // 如果焦点已经转移到别处（比如用户点了下一个格子），让那个先处理
      if (document.activeElement && document.activeElement.id === 'm9InlineInput') return;
      submitInline(e.target);
    }, 80);
  }, true);   // ⭐ 用捕获阶段，确保拿到

  display.addEventListener('input', e => {
    if (e.target.id === 'm9InlineInput') {
      e.target.classList.remove('wrong');
    }
  });

  /* ⭐ 点击竖式区域时，如果还有等待输入的格子，聚焦它；
        但用户如果先点了别处，blur 会先提交，这里只是兜底 */
  display.addEventListener('click', e => {
    if (M9.submitting) return;
    if (!M9.waitingFor) return;
    const input = document.getElementById('m9InlineInput');
    if (!input) return;
    if (document.activeElement !== input) {
      input.focus();
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
    }
  });

  /* ---------- 事件 ---------- */
  stepBtn.addEventListener('click', m9NextStep);
  resetBtn.addEventListener('click', m9Reset);
  aInput.addEventListener('input', m9Reset);
  bInput.addEventListener('input', m9Reset);
  opInput.addEventListener('change', m9Reset);

  m9Reset();
  console.log('[模块9] ✅ 初始化完成（全互动版）');

  /* ⭐ 调试用：暴露更多内部函数 */
  window.m9Render = m9Render;
  window.m9PromptCurrentStep = m9PromptCurrentStep;
  window.m9Reset = m9Reset;
  window.m9GetMaxSteps = m9GetMaxSteps;
  window.calcFinalResult = calcFinalResult;
})();

/* ============ 模块10：年月日 ============ */
function m10IsLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
function m10DaysInMonth(y, m) { return [31, m10IsLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m-1]; }
function m10Render() {
  let y = +$('#m10year').value;
  const m = +$('#m10month').value;
  if (isNaN(y)) y = 2026;
  const days = m10DaysInMonth(y, m);
  $('#m10title').textContent = `${y} 年 ${m} 月`;
  const firstDay = new Date(y, m - 1, 1).getDay();
  const wd = ['日', '一', '二', '三', '四', '五', '六'];
  let html = '<thead><tr>';
  wd.forEach(w => html += `<th>${w}</th>`);
  html += '</tr></thead><tbody><tr>';
  for (let i = 0; i < firstDay; i++) html += '<td class="empty"></td>';
  for (let d = 1; d <= days; d++) {
    const dow = (firstDay + d - 1) % 7;
    const isWeekend = (dow === 0 || dow === 6);
    html += `<td class="${isWeekend ? 'weekend' : ''}">${d}</td>`;
    if ((firstDay + d) % 7 === 0 && d < days) html += '</tr><tr>';
  }
  html += '</tr></tbody>';
  $('#m10calendar').innerHTML = html;
  const isLeap = m10IsLeap(y);
  $('#m10info').innerHTML = `${y} 年是<b>${isLeap ? '闰' : '平'}年</b>，2 月有 <b>${isLeap ? 29 : 28}</b> 天；${m} 月有 <b>${days}</b> 天。`;
  // M10：切月份
  recordActivity('m10', `${y} 年 ${m} 月`, `${days} 天`);
}
$('#m10year').addEventListener('input', m10Render);
$('#m10month').addEventListener('change', m10Render);
m10Render();

/* ============ 模块11：位置方向 ============ */
const M11 = { cols:6, rows:5, selected:null };
const M11_ICONS = ['🍎','🍌','🍇','🍓','🍊','🍒','🐶','🐱','🐰','🐼','🦊','🐸','🚗','🚀','✈️','🚢','⚽','🏀','🎈','🎁','📚','✏️','🎨','🌻','🌈','⭐','🍕','🍰','🍦','🍩'];
function m11Render() {
  const { cols, rows } = M11;
  let html = `<div class="coord-grid" style="grid-template-columns:40px repeat(${cols},52px);">`;
  html += '<div></div>';
  for (let c = 1; c <= cols; c++) html += `<div class="coord-axis">第${c}列</div>`;
  for (let r = 1; r <= rows; r++) {
    html += `<div class="coord-axis">第${r}行</div>`;
    for (let c = 1; c <= cols; c++) {
      const idx = (r-1)*cols + (c-1);
      const icon = M11_ICONS[idx % M11_ICONS.length];
      const sel = (M11.selected && M11.selected.c === c && M11.selected.r === r) ? ' selected' : '';
      html += `<div class="coord-cell${sel}" data-c="${c}" data-r="${r}">${icon}</div>`;
    }
  }
  html += '</div>';
  $('#m11grid-wrap').innerHTML = html;
  if (M11.selected) {
    $('#m11result').innerHTML = `你选的是 <b>第 ${M11.selected.c} 列，第 ${M11.selected.r} 行</b>`;
    recordActivity('m11', `第 ${M11.selected.c} 列 第 ${M11.selected.r} 行`, '');
  } else {
    $('#m11result').textContent = '还没有选位置';
  }
}
$('#m11grid-wrap').addEventListener('click', e => {
  const cell = e.target.closest('.coord-cell');
  if (!cell) return;
  M11.selected = { c:+cell.dataset.c, r:+cell.dataset.r };
  m11Render();
});
m11Render();

/* ============ 模块12：吨 ============ */
const MASS_UNITS = [
  { key:'t', name:'吨', toG:1000000 },
  { key:'kg', name:'千克', toG:1000 },
  { key:'g', name:'克', toG:1 }
];
function m12Update() {
  const val = parseFloat($('#m12val').value), unit = $('#m12unit').value;
  const wrap = $('#m12results');
  if (isNaN(val)) { wrap.innerHTML = '<div class="result-item"><span class="k">请输入一个数字</span></div>'; return; }
  const u = MASS_UNITS.find(x => x.key === unit);
  const inG = val * u.toG;
  // M12：换算变化
  recordActivity('m12', `${val} ${unit}`, '');
  wrap.innerHTML = MASS_UNITS.map(x => {
    const v = inG / x.toG;
    const hl = x.key === unit ? ' hl' : '';
    return `<div class="result-item${hl}"><span class="k">${x.name} ${x.key}</span><span class="v">${fmt(v)}</span></div>`;
  }).join('');
}
$('#m12val').addEventListener('input', m12Update);
$('#m12unit').addEventListener('change', m12Update);
m12Update();

/* ============ 模块13：解题思维训练 ============ */
/* ============ 模块13 · 动态步骤管理 ============ */
const M13_STEPS = {
  steps: [],          // [{ rel, sub, res }]
  minSteps: 1,
  maxSteps: 6,        // 三年级应用题一般不超过 3 步，6 是宽松上限
  defaultSteps: 2,    // 默认显示 2 步（三年级最常见）
  container: null
};

function m13InitSteps(stepCount) {
  M13_STEPS.container = document.getElementById('formulaSteps');
  if (!M13_STEPS.container) return;

  const n = Math.max(
    M13_STEPS.minSteps,
    Math.min(M13_STEPS.maxSteps, stepCount || M13_STEPS.defaultSteps)
  );

  M13_STEPS.steps = [];
  for (let i = 0; i < n; i++) {
    M13_STEPS.steps.push({ rel: '', sub: '', res: '' });
  }
  m13RenderSteps();
  m13UpdateStepButtons();
}

/* 新增函数（放在 m13RenderSteps 附近） */
function updateCheckBtnHint() {
  const btn = document.getElementById('pCheck');
  if (!btn) return;

  const problemText = document.getElementById('problem-text')?.innerText.trim() || '';
  const nums = m13ProblemNumbers(problemText);
  const steps = m13CollectSteps();

  const ok = steps.some(s =>
    (s.rel || '').trim() &&
    m13IsValidSubstitution(s.sub, nums)
  );

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
      
      <div class="formula-line">
        <label>关系式</label>
        <input type="text" data-idx="${i}" data-field="rel"
               value="${escapeHtmlStrict(s.rel)}"
               placeholder="${i === 0 ? '例：还剩的钱 = 总钱数 − 用去的钱' : '例：总棵树 = 苹果树 + 梨树'}"
               autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
      </div>
      
      <div class="formula-line">
        <label>代入数字</label>
        <input type="text" data-idx="${i}" data-field="sub"
               value="${escapeHtmlStrict(s.sub)}"
               placeholder="${i === 0 ? '例：15 − 8 − 3' : '例：32 + 5'}"
               autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
      </div>
      
      <div class="formula-line">
        <label>得数</label>
        <input type="text" data-idx="${i}" data-field="res"
               value="${escapeHtmlStrict(s.res)}"
               placeholder="${i === 0 ? '例：4' : '例：37'}"
               autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
      </div>
    </div>
  `).join('');

  // 绑定输入事件
  c.querySelectorAll('input[data-idx]').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = +e.target.dataset.idx;
      const field = e.target.dataset.field;
      if (M13_STEPS.steps[idx]) {
        M13_STEPS.steps[idx][field] = e.target.value;
      }
    });

    // ⭐ 新增：回车跳到下一个输入框
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();

      const fields = ['rel', 'sub', 'res'];
      const curIdx = +inp.dataset.idx;
      const curField = inp.dataset.field;
      const nextFieldIdx = fields.indexOf(curField) + 1;

      let nextInput = null;
      if (nextFieldIdx < fields.length) {
        // 同一张卡片的下一个字段
        nextInput = c.querySelector(
          `input[data-idx="${curIdx}"][data-field="${fields[nextFieldIdx]}"]`
        );
      } else {
        // 跳到下一张卡片的"关系式"
        nextInput = c.querySelector(
          `input[data-idx="${curIdx + 1}"][data-field="rel"]`
        );
        // 如果下一张卡片不存在，就跳到"我的答案"输入框
        if (!nextInput) {
          nextInput = document.getElementById('pAnswer');
        }
      }

      // ⭐ 新增：回车跳到下一个输入框
      if (nextInput) focusInput(nextInput);
    });
  });
}

function m13AddStep() {
  if (M13_STEPS.steps.length >= M13_STEPS.maxSteps) return;
  M13_STEPS.steps.push({ rel: '', sub: '', res: '' });
  m13RenderSteps();
  m13UpdateStepButtons();

  // ⭐ 聚焦新步骤的"关系式"输入框
  const cards = M13_STEPS.container.querySelectorAll('.formula-step');
  const lastCard = cards[cards.length - 1];
  const firstInput = lastCard?.querySelector('input[data-field="rel"]');
  if (firstInput) {
    firstInput.focus();
    // 平滑滚动
    lastCard.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }
}

function m13RemoveStep() {
  if (M13_STEPS.steps.length <= M13_STEPS.minSteps) return;
  M13_STEPS.steps.pop();
  m13RenderSteps();
  m13UpdateStepButtons();
}

function m13UpdateStepButtons() {
  const addBtn = document.getElementById('addStepBtn');
  const remBtn = document.getElementById('removeStepBtn');
  if (addBtn) addBtn.disabled = M13_STEPS.steps.length >= M13_STEPS.maxSteps;
  if (remBtn) remBtn.disabled = M13_STEPS.steps.length <= M13_STEPS.minSteps;
}

/* 收集所有步骤（给 AI 用） */
function m13CollectSteps() {
  return M13_STEPS.steps.map(s => ({
    rel: s.rel.trim(),
    sub: s.sub.trim(),
    res: s.res.trim()
  }));
}

/* 清空所有步骤的输入 */
function m13ClearSteps() {
  M13_STEPS.steps.forEach(s => { s.rel = ''; s.sub = ''; s.res = ''; });
  m13RenderSteps();
}

/* 清除红色标错样式 */
function m13ClearStepMarks() {
  document.querySelectorAll('#formulaSteps input').forEach(inp => {
    inp.style.borderColor = '';
    inp.style.background = '';
    inp.title = '';
  });
}

/* 绑定按钮 */
document.getElementById('addStepBtn')?.addEventListener('click', m13AddStep);
document.getElementById('removeStepBtn')?.addEventListener('click', m13RemoveStep);

/* 初始化（默认 2 步） */
m13InitSteps();

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



/* ============ 加载题库：兼容双击 / 部署 ============ */
let M13_BANK = [];

window.__findCachedFeedback = findCachedFeedback;

function loadBank() {
  // ⭐ 加载期间禁用「载入」按钮，避免拿到空题库
  const loadBtn = document.getElementById('pLoad');
  if (loadBtn) {
    loadBtn.disabled = true;
    loadBtn.dataset._origText = loadBtn.textContent;
    loadBtn.innerHTML = '<span class="btn-spinner"></span>题库加载中…';
  }

  const done = () => {
    if (loadBtn) {
      loadBtn.disabled = false;
      loadBtn.textContent = loadBtn.dataset._origText || '📥 载入';
    }
  };

  // ===== 优先 ①：problems.js 注入的全局变量 =====
  if (Array.isArray(window.PROBLEMS_BANK) && window.PROBLEMS_BANK.length > 0) {
    M13_BANK = window.PROBLEMS_BANK;
    console.log(`[题库] 已加载 ${M13_BANK.length} 道题（来自 problems.js）`);
    m13InitSelect();
    done();
    return Promise.resolve();
  }

  // ===== 兜底 ②：fetch problems.json（⭐ file:// 协议下跳过，避免报错）=====
  if (location.protocol === 'file:') {
    console.warn('[题库] 当前为 file:// 协议，跳过 fetch，使用内置题库');
    M13_BANK = M13_PROBLEMS.map((p, i) => ({
      id: i + 1,
      type: '内置',
      text: p.text,
      answer: { full: p.answer }
    }));
    m13InitSelect();
    done();
    return Promise.resolve();
  }

  return fetch('./data/problems.json')
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(data => {
      M13_BANK = data;
      console.log(`[题库] 已加载 ${M13_BANK.length} 道题（来自 problems.json）`);
      m13InitSelect();
      done();
    })
    .catch(e => {
      console.warn('[题库] 加载失败，使用内置 10 道题', e);
      M13_BANK = M13_PROBLEMS.map((p, i) => ({
        id: i + 1,
        type: '内置',
        text: p.text,
        answer: { full: p.answer }
      }));
      m13InitSelect();
      done();
    });
}

/* ============ 渲染标准解题步骤 ============ */

/* 渲染标准解题过程（每一步都是折叠面板） */
function renderStandardSteps(p) {
  const box = $('#m13StandardSteps');
  const lock = $('#m13StepsLocked');
  const btn = $('#m13UnlockBtn');
  if (!box || !lock) return;

  // ⭐ 情况 A：题库题有预存 steps → 直接展示按钮，点击后无需密码
  if (p && p.steps && p.steps.length) {
    box.dataset.pendingProblem = JSON.stringify(p);
    box.style.display = 'none';
    box.innerHTML = '';
    lock.style.display = 'block';
    if (btn) btn.textContent = '📖 查看标准解题过程';
    return;
  }

  // ⭐ 情况 B：题库题无 steps（或自定义题）→ 显示按钮，点击后要密码 + AI 现算
  box.removeAttribute('data-pending-problem');
  box.dataset.pendingProblem = '';   // 清空，让点击时走 AI 分支
  box.style.display = 'none';
  box.innerHTML = '';
  lock.style.display = 'block';
  if (btn) btn.textContent = '🤖 让 AI 现算标准解法（需密码）';
}

/* 密码验证成功后，真正渲染步骤 */
function renderStandardStepsContent(p) {
  const box = $('#m13StandardSteps');
  if (!p || !Array.isArray(p.steps)) {
    console.warn('[标准解法] 缺少 steps 数据', p);
    return;
  }

  const stepsHtml = p.steps.map((s, i) => `
    <div class="std-fold" data-step="${i}">
      <div class="std-fold-hd">
        <span>第 ${s.step} 步</span>
        <span class="arrow">▶</span>
      </div>
      <div class="std-fold-bd">
        <div class="std-line"><b>关系式：</b>${s.relation}</div>
        <div class="std-line"><b>代入：</b>${s.substitution}</div>
        <div class="std-line"><b>得数：</b>${s.result}</div>
      </div>
    </div>
  `).join('');

  const kwHtml = p.keywords ? `
    <div class="std-keywords">
      <div><b>已知：</b>${p.keywords.known || '—'}</div>
      <div><b>求：</b>${p.keywords.unknown || '—'}</div>
      <div><b>数字：</b>${(p.keywords.numbers || []).join('、')}</div>
      <div><b>单位：</b>${(p.keywords.units || []).join('、')}</div>
    </div>
  ` : '';

  box.innerHTML = `
    <h4>📖 标准解题过程</h4>
    ${stepsHtml}
    <div class="std-fold" data-step="final">
      <div class="std-fold-hd">
        <span>✅ 最终答案</span>
        <span class="arrow">▶</span>
      </div>
      <div class="std-fold-bd">
        <div class="std-answer">${p.answer.full}</div>
      </div>
    </div>
    ${kwHtml}
    <button class="steps-hide-btn" id="m13HideSteps">🔒 重新隐藏</button>
  `;

  box.style.display = 'block';

  // 绑定每个折叠面板的展开/收起
  box.querySelectorAll('.std-fold').forEach(fold => {
    const hd = fold.querySelector('.std-fold-hd');
    hd.addEventListener('click', () => {
      fold.classList.toggle('open');
    });
  });

  // 绑定"重新隐藏"
  $('#m13HideSteps').addEventListener('click', () => {
    box.style.display = 'none';
    $('#m13StepsLocked').style.display = 'block';
  });
}

/* 弹出密码框 */
function showPasswordModal(onSuccess) {
  if (document.querySelector('.pwd-modal-mask')) return;

  const mask = document.createElement('div');
  mask.className = 'pwd-modal-mask';
  mask.innerHTML = `
    <div class="pwd-modal">
      <h3>🔒 请先独立思考</h3>
      <p>AI 现算需要密码</p>
      <input type="password" id="m13PwdInput" maxlength="8" placeholder="" autocomplete="off" inputmode="text">
      <div class="pwd-error" id="m13PwdError"></div>
      <div class="pwd-btns">
        <button class="pwd-cancel" id="m13PwdCancel">取消</button>
        <button class="pwd-ok" id="m13PwdOk">解锁</button>
      </div>
    </div>
  `;
  document.body.appendChild(mask);
  lockBodyScroll(true);

  const input = $('#m13PwdInput');
  const error = $('#m13PwdError');
  setTimeout(() => input.focus(), 60);

  function tryUnlock() {
    const val = input.value.trim();
    if (m13CheckPassword(val)) {
      lockBodyScroll(false);
      mask.remove();
      if (typeof onSuccess === 'function') onSuccess();
    } else {
      error.textContent = '密码不对，再想想～';
      input.value = '';
      input.focus();
    }
  }

  $('#m13PwdOk').addEventListener('click', tryUnlock);
  $('#m13PwdCancel').addEventListener('click', () => {
    lockBodyScroll(false);
    mask.remove();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') tryUnlock();
    if (e.key === 'Escape') { lockBodyScroll(false); mask.remove(); }
  });
  mask.addEventListener('click', e => {
    if (e.target === mask) {
      lockBodyScroll(false);
      mask.remove();
    }
  });
}

/* 绑定"查看标准解题过程"按钮 */
document.addEventListener('click', e => {
  const btn = e.target.closest('#m13UnlockBtn');
  if (!btn) return;

  const pending = $('#m13StandardSteps').dataset.pendingProblem;
  const problemText = $('#problem-text')?.innerText.trim();

  // ⭐ 场景 1：题库题 + 有预存 steps → 不需要密码，直接展示
  if (pending && pending.length > 2) {
    try {
      const p = JSON.parse(pending);
      if (p && p.steps && p.steps.length) {
        renderStandardStepsContent(p);
        $('#m13StepsLocked').style.display = 'none';
        return;
      }
    } catch (err) {
      console.warn('[解锁] pending 解析失败，走 AI 现算', err);
    }
  }

  // ⭐ 场景 2：需要 AI 现算 → 才要密码
  if (!problemText) {
    alert('请先载入或输入一道题目');
    return;
  }

  // ⭐ 若本次会话已解锁，直接调 AI
  if (window._llmPwdOK) {
    m13FetchStandardSolution();
    return;
  }

  // 弹出密码框，验证通过后调 AI
  showPasswordModal(() => {
    window._llmPwdOK = true;   // ⭐ 记住本次会话已解锁
    m13FetchStandardSolution();
  });
});

let M13_CurrentAnswer = null;

// ⭐ M13 按层级筛选题库
window.__m13SetLevel = function (levelId) {
  window.__m13CurrentLevel = levelId;
  m13InitSelect();
  // 自动选第一道
  const sel = $('#pSelect');
  if (sel && sel.options.length > 1) {
    sel.selectedIndex = 1;                // 第一个是"选择一道题目"
    document.getElementById('pLoad')?.click();
  }
};

function m13InitSelect() {
  let bank = M13_BANK;
  const level = window.__m13CurrentLevel;
  if (level) {
    const stepCount = parseInt(level.replace('step-', ''), 10);
    bank = bank.filter(p => {
      const steps = p.stepsCount || (p.steps ? p.steps.length : 2);
      return steps === stepCount || (level === 'step-4' && steps >= 4);
    });
  }

  const groups = {};
  bank.forEach((p) => {
    const type = p.type || '其他';                 // ✅ 补回来
    const origIdx = M13_BANK.indexOf(p);   // 或预先 map 保留原 idx
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
  $('#pSelect').innerHTML = html;
}

/* ⭐ 换题前检查"一题一得" */
function checkTakeawayBeforeChange() {
  const problemText = $('#problem-text')?.innerText.trim();
  if (!problemText) return true;   // 没题，直接通过

  const takeaway = $('#pTakeaway')?.value.trim();
  if (takeaway) return true;       // 已填，通过

  // ⭐ 未填，弹窗提示
  return confirm('💡 一题一得还没写哦！\n\n"这道题教会我什么？"记录一句心得，会让你印象更深。\n\n确定要跳过吗？');
}

/* 当前题目的来源：'bank'（题库）或 'custom'（自定义/上传） */
let M13_ProblemSource = 'custom';
let M13_CurrentProblem = null;   // 当前题库对象（如果是题库题）

function m13LoadProblem(text, answer, source, bankItem) {
  const el = $('#problem-text');
  el.textContent = text;
  M13_CurrentAnswer = answer || null;
  M13_ProblemSource = source || 'custom';    // ⭐ 记录来源
  M13_CurrentProblem = bankItem || null;     // ⭐ 题库对象
  $('#pResult').innerHTML = '';
  $('#pAnswer').value = '';

  /* ⭐ 换题时重置"AI 密码已通过"标记，下次调 AI 要重新输密码 */
  window._llmPwdOK = false;

  // 通知"一题一得"模块切换题目
  if (typeof window._takeawayOnProblemChange === 'function') {
    window._takeawayOnProblemChange(text);
  } else {
    const savedTakeaway = takeawayLoad(text);
    const takeawayEl = $('#pTakeaway');
    if (takeawayEl) takeawayEl.value = savedTakeaway;
  }
}

/* ============ 一题一得 · 自动保存 + 保存按钮 ============ */
(function initTakeawaySave() {
  const input = document.getElementById('pTakeaway');
  const btn   = document.getElementById('pTakeawaySave');
  const hint  = document.getElementById('pTakeawayHint');
  if (!input || !btn) return;

  let saveTimer = null;
  let savedValue = '';       // 上次成功保存的内容
  let savedFromProblem = ''; // 上次保存时对应的题目文本

  /* 当前题目文本 */
  function currentProblem() {
    return document.getElementById('problem-text')?.innerText.trim() || '';
  }

  /* 更新按钮状态 */
  function updateBtnState() {
    const cur = input.value.trim();
    const problem = currentProblem();

    // 没有题目 → 按钮禁用
    if (!problem) {
      btn.disabled = true;
      btn.classList.remove('dirty', 'saved');
      btn.textContent = '💾 保存';
      hint.textContent = '';
      hint.classList.remove('dirty', 'saved');
      return;
    }

    // 心得为空 → 按钮禁用（不允许保存空内容）
    if (!cur) {
      btn.disabled = true;
      btn.classList.remove('dirty', 'saved');
      btn.textContent = '💾 保存';
      hint.textContent = '';
      hint.classList.remove('dirty', 'saved');
      return;
    }

    btn.disabled = false;

    // 是否有未保存的改动
    const isDirty = (cur !== savedValue) || (problem !== savedFromProblem);
    if (isDirty) {
      btn.classList.remove('saved');
      btn.classList.add('dirty');
      btn.textContent = '💾 保存修改';
      hint.textContent = '有未保存的修改';
      hint.classList.add('dirty');
      hint.classList.remove('saved');
    } else {
      btn.classList.remove('dirty');
      btn.classList.remove('saved');
      btn.textContent = '💾 保存';
      hint.textContent = '';
      hint.classList.remove('dirty', 'saved');
    }
  }

  /* 真正执行保存 */
  function doSave(silent) {
    const problem = currentProblem();
    if (!problem) return;

    const cur = input.value.trim();
    takeawaySave(problem, cur);
    savedValue = cur;
    savedFromProblem = problem;

    if (!silent) {
      // 视觉反馈
      btn.classList.remove('dirty');
      btn.classList.add('saved');
      btn.textContent = '✅ 已保存';
      hint.textContent = '已保存到本地（刷新不丢）';
      hint.classList.remove('dirty');
      hint.classList.add('saved');

      setTimeout(() => {
        btn.classList.remove('saved');
        hint.classList.remove('saved');
        updateBtnState();
      }, 1500);
    }
  }

  /* 外部切换题目时，通知这个模块刷新状态 */
  window._takeawayOnProblemChange = function (problemText) {
    // 先把当前未保存的内容静默保存（如果题目变了，保存旧题目的）
    if (savedFromProblem && savedFromProblem !== problemText) {
      // 旧题目的内容已经在 savedValue 里，无需再存
    }
    savedValue = takeawayLoad(problemText);
    savedFromProblem = problemText;
    input.value = savedValue;
    updateBtnState();
  };

  /* 输入：500ms 防抖自动保存 + 更新按钮状态 */
  input.addEventListener('input', () => {
    updateBtnState();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const problem = currentProblem();
      if (!problem) return;
      const cur = input.value.trim();
      // 静默保存（不显示"已保存"动画）
      if (cur) {
        takeawaySave(problem, cur);
        savedValue = cur;
        savedFromProblem = problem;
        updateBtnState();
      }
    }, 500);
  });

  /* 失焦：立即保存 */
  input.addEventListener('blur', () => {
    clearTimeout(saveTimer);
    const problem = currentProblem();
    if (!problem) return;
    const cur = input.value.trim();
    if (cur && (cur !== savedValue || problem !== savedFromProblem)) {
      doSave(true);   // 静默保存
    }
  });

  /* 回车：立即保存（但不提交表单，因为这个 input 不在 form 里）
     同时如果按住 Ctrl/Cmd 回车，也是保存 */
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      clearTimeout(saveTimer);
      if (!btn.disabled) doSave(false);
    }
  });

  /* 点击保存按钮 */
  btn.addEventListener('click', () => {
    clearTimeout(saveTimer);
    doSave(false);
  });

  /* 页面即将关闭：兜底保存 */
  window.addEventListener('beforeunload', () => {
    const problem = currentProblem();
    if (!problem) return;
    const cur = input.value.trim();
    if (cur && (cur !== savedValue || problem !== savedFromProblem)) {
      takeawaySave(problem, cur);
    }
  });

  /* 初始化状态 */
  updateBtnState();
})();

/* 高亮工具 */
document.querySelectorAll('#m13 .hl-btn').forEach(btn => {
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
      if (!document.execCommand('hiliteColor', false, color)) {
        document.execCommand('backColor', false, color);
      }
    } catch (e) {
      try {
        const span = document.createElement('span');
        span.style.backgroundColor = color;
        span.style.borderRadius = '4px';
        span.style.padding = '0 2px';
        span.appendChild(range.extractContents());
        range.insertNode(span);
      } catch (err) {}
    }
    sel.removeAllRanges();
  });
});

$('#pLoad').addEventListener('click', () => {
  if (!M13_BANK.length) {
    alert('题库还在加载中，请稍候…');
    return;
  }
  if (!checkTakeawayBeforeChange()) return;
  const idx = $('#pSelect').value;
  if (idx === '') {
    alert('请先从下拉框选择一道题目，或手动输入自定义题目');
    return;
  }
  const p = M13_BANK[+idx];
  if (!p) return;

  const ansFull = p.answer
    ? (typeof p.answer === 'string' ? p.answer : p.answer.full)
    : null;

  // ⭐ 明确标记来源为"题库"
  m13LoadProblem(p.text, ansFull, 'bank', p);

  const stepCount = p.stepsCount || (p.steps ? p.steps.length : M13_STEPS.defaultSteps);
  m13InitSteps(stepCount);

  /* ============================================================
     ⭐ 关键修复：统一调用 renderStandardSteps
     - 有 steps → 按钮显示"📖 查看标准解题过程"，点击无需密码
     - 无 steps → 按钮显示"🤖 让 AI 现算标准解法（需密码）"
     ============================================================ */
  renderStandardSteps(p);
});

$('#pUseCustom').addEventListener('click', () => {
  const t = $('#pCustom').value.trim();
  if (!t) return;
  // ⭐ 自定义题目：清空下拉框，明确标记为 custom
  $('#pSelect').value = '';
  m13LoadProblem(t, null, 'custom', null);
  $('#pCustom').value = '';

  // 自定义题没有标准答案，隐藏标准解题过程区域
  $('#m13StandardSteps').style.display = 'none';
  $('#m13StepsLocked').style.display = 'none';

  // 重置步骤
  m13InitSteps();

  // 在 pUseCustom 里
  $('#m13StepsLocked').style.display = 'block';
  $('#m13UnlockBtn').textContent = '🤖 让 AI 现算标准解法';
});

$('#pCustom').addEventListener('keydown', e => { if (e.key === 'Enter') $('#pUseCustom').click(); });

$('#pUpload').addEventListener('change', e => {
  if (!checkTakeawayBeforeChange()) return;   // ⭐ 新增一题一得检查
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    // ⭐ 上传的题也按自定义处理
    $('#pSelect').value = '';
    m13LoadProblem(ev.target.result.trim(), null, 'custom', null);

    $('#m13StandardSteps').style.display = 'none';
    $('#m13StepsLocked').style.display = 'none';

    m13InitSteps();

    // 在 pLoad 里
    $('#m13StepsLocked').style.display = 'block';
    $('#m13UnlockBtn').textContent = '🔒 查看标准解题过程（需要密码）';

  };
  reader.readAsText(file, 'UTF-8');
  e.target.value = '';
});

$('#pClear').addEventListener('click', () => {
  if (!checkTakeawayBeforeChange()) return;   // ⭐ 换题前检查"一题一得"
  $('#problem-text').innerHTML = '';
  $('#pCustom').value = '';
  $('#pAnswer').value = '';
  $('#pResult').innerHTML = '';
  $('#pTakeaway').value = '';
  document.querySelectorAll('.scratch-cell textarea').forEach(t => t.value = '');
  m13ClearSteps();          // 清空动态步骤内容
  m13ClearStepMarks();      // 清除红色标错
  M13_CurrentAnswer = null;
  M13_ProblemSource = 'custom';
  M13_CurrentProblem = null;
  const sel = $('#pSelect');
  if (sel) sel.value = '';
});

/* ============ AI 加载状态 ============ */
let _aiTimer = null;

function showAiThinking(subText) {
  const box = document.getElementById('aiThinking');
  const sub = document.getElementById('aiThinkingSub');
  const timeEl = document.getElementById('aiThinkingTime');
  if (!box) return;

  box.style.display = 'flex';
  if (sub) sub.textContent = subText || '正在分析你的解题过程';
  if (timeEl) timeEl.textContent = '0.0s';

  // 计时器
  const start = performance.now();
  if (_aiTimer) clearInterval(_aiTimer);
  _aiTimer = setInterval(() => {
    const t = (performance.now() - start) / 1000;
    if (timeEl) timeEl.textContent = t.toFixed(1) + 's';
  }, 100);
}

function hideAiThinking() {
  const box = document.getElementById('aiThinking');
  if (box) box.style.display = 'none';
  const sub = document.getElementById('aiThinkingSub');
  if (sub) sub.textContent = '';   // ✅ 清空，避免下次残留
  if (_aiTimer) {
    clearInterval(_aiTimer);
    _aiTimer = null;
  }
}

/* 按钮进入/退出加载态 */
function setCheckBtnLoading(loading) {
  const btn = document.getElementById('pCheck');
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.dataset._origText = btn.textContent;
    btn.innerHTML = '<span class="btn-spinner"></span>AI 批改中…';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset._origText || '✔ 检查';
  }
}

/* ============ 让 AI 现算标准解法（自定义题按需调用） ============ */
async function m13FetchStandardSolution() {
  const problemText = $('#problem-text')?.innerText.trim();
  if (!problemText) {
    alert('请先载入或输入一道题目');
    return;
  }

  const box = $('#m13StandardSteps');
  const lock = $('#m13StepsLocked');

  // 显示加载态
  lock.style.display = 'none';
  box.style.display = 'block';
  box.innerHTML = `
    <div class="ai-thinking">
      <span class="dots"><span></span><span></span><span></span></span>
      <div>
        <div class="think-text">🤖 AI 正在分析标准解法…</div>
        <div class="think-sub">只分析题目，不批改学生的作答</div>
      </div>
      <span class="think-time" id="stdTime">0.0s</span>
    </div>
  `;

  const start = performance.now();
  const timeEl = document.getElementById('stdTime');
  const timer = setInterval(() => {
    if (timeEl) timeEl.textContent = ((performance.now() - start) / 1000).toFixed(1) + 's';
  }, 100);

  try {
    const raw = await callLLMStandardSolution(problemText);
    clearInterval(timer);
    // ✅ 统一结构
    const result = normalizeAiFeedback(raw, null);
    result._source = 'llm';
    renderStandardSolution(result);
  } catch (e) {
    clearInterval(timer);
    // ✅ 失败时：恢复 lock 按钮 + 提供重试
    box.innerHTML = `
      <div style="text-align:center;padding:24px 20px;">
        <div style="color:#b91c1c;font-weight:700;margin-bottom:12px;">
          ❌ 获取标准解法失败：${e.message || '请稍后重试'}
        </div>
        <button class="btn" id="m13RetryStdBtn">🔄 重新获取</button>
      </div>
    `;
    const retryBtn = document.getElementById('m13RetryStdBtn');
    if (retryBtn) retryBtn.addEventListener('click', () => m13FetchStandardSolution());
    // 让用户能再次点击解锁按钮
    lock.style.display = 'block';
  }
}

/* 只求标准解法，不批改 */
/* 只求标准解法，不批改 */
async function callLLMStandardSolution(problemText) {
  if (!LLM_CONFIG.enabled) throw new Error('大模型未启用');

  const systemPrompt = `你是一位三年级数学老师，请为下面这道题写出标准的解题过程。

请严格按以下 JSON 格式输出，不要添加任何多余文字、注释、markdown 代码块：

{
  "problem_understanding": "对题意的理解，1 句话",
  "required_steps": 本题最合理的解题步数（数字，1~5）,
  "answer": {
    "value": 数字（只写数字，不带单位）,
    "unit": "单位",
    "full": "带单位的完整答案"
  },
  "steps": [
    { "step": 1, "relation": "关系式", "substitution": "代入", "result": "得数" }
  ],
  "keywords": {
    "known": "已知条件",
    "unknown": "求什么",
    "numbers": ["题中出现的数字"],
    "units": ["题中的单位"]
  }
}

要求：
1. 学生是三年级，用加减乘除解决实际问题，不使用方程
2. 解题步数由题目本身决定，可以是 1~3 步
3. steps 数组是最少必要步骤
4. 关系式用中文描述
5. 输出必须是合法 JSON`;

  const userPrompt = `题目：${problemText}\n\n请写出标准解题过程。`;

  const headers = { 'Content-Type': 'application/json' };
  if (LLM_CONFIG.apiKey) headers['Authorization'] = `Bearer ${LLM_CONFIG.apiKey}`;

  // ✅ 统一：无论有无 key，都带 response_format
  const body = {
    model: LLM_CONFIG.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 4000,
    reasoning_effort: 'low'
  };

  // ✅ 超时统一
  const TIMEOUT_MS = 300000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(LLM_CONFIG.apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`请求超时（${TIMEOUT_MS / 1000} 秒未响应），请检查网络后重试`);
    }
    // ✅ 保留 cause
    throw new Error('网络请求失败：' + e.message, { cause: e });
  } finally {
    clearTimeout(timeoutId);
  }

  // ✅ 读错误响应体
  if (!res.ok) {
    let errText = '';
    try { errText = await res.text(); } catch (_) {}
    const snippet = errText.slice(0, 300);
    throw new Error(
      `API ${res.status}（${res.statusText}）${snippet ? '：' + snippet : ''}`
    );
  }

  // ✅ 解析响应 JSON（防 HTML）
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('服务端返回的不是合法 JSON，请检查接口地址或网关配置', { cause: e });
  }

  // ✅ 显式校验
  const content = data && data.choices && data.choices[0]
    && data.choices[0].message && data.choices[0].message.content;

  if (typeof content !== 'string' || !content.trim()) {
    console.error('模型返回结构异常：', data);
    throw new Error('模型未返回有效内容，请重试');
  }

  const clean = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const parsed = extractJson(clean);
  if (!parsed) {
    console.error('JSON 解析失败，原始内容：', content);
    throw new Error('模型返回格式异常，请再试一次');
  }
  return parsed;
}

/* 渲染标准解法 */
function renderStandardSolution(p) {
  const box = $('#m13StandardSteps');

  const stepsHtml = (p.steps || []).map(s => `
    <div class="std-fold open">
      <div class="std-fold-hd">
        <span>第 ${s.step} 步</span>
        <span class="arrow">▶</span>
      </div>
      <div class="std-fold-bd">
        <div class="std-line"><b>关系式：</b>${s.relation || '—'}</div>
        <div class="std-line"><b>代入：</b>${s.substitution || '—'}</div>
        <div class="std-line"><b>得数：</b>${s.result || '—'}</div>
      </div>
    </div>
  `).join('');

  const kwHtml = p.keywords ? `
    <div class="std-keywords">
      <div><b>已知：</b>${p.keywords.known || '—'}</div>
      <div><b>求：</b>${p.keywords.unknown || '—'}</div>
      <div><b>数字：</b>${(p.keywords.numbers || []).join('、')}</div>
      <div><b>单位：</b>${(p.keywords.units || []).join('、')}</div>
    </div>
  ` : '';

  box.innerHTML = `
    <h4>📖 标准解题过程（AI 现算）</h4>
    ${stepsHtml}
    <div class="std-fold open">
      <div class="std-fold-hd">
        <span>✅ 最终答案</span>
        <span class="arrow">▶</span>
      </div>
      <div class="std-fold-bd">
        <div class="std-answer">${p.answer?.full || '—'}</div>
      </div>
    </div>
    ${kwHtml}
  `;
  box.style.display = 'block';

  box.querySelectorAll('.std-fold-hd').forEach(hd => {
    hd.addEventListener('click', () => {
      hd.parentElement.classList.toggle('open');
    });
  });
}

/* ============ 通用：4 类 AI 反馈（strengths/gaps/walkthrough/judgement） ============ */
function buildAiInsightHtml(r, opts = {}) {
  const esc = (s) => escapeHtmlStrict(String(s || ''));
  const openClass = opts.open ? ' open' : '';   // 默认是否展开

  // ---------- 👍 你做对了什么 ----------
  const strengthsHtml = (r.strengths && r.strengths.length) ? `
    <div class="std-fold${openClass}" data-insight="strengths">
      <div class="std-fold-hd">
        <span>👍 你做对了什么</span><span class="arrow">▶</span>
      </div>
      <div class="std-fold-bd">
        <ul style="margin:0;padding-left:18px;">
          ${r.strengths.map(s => `<li>${esc(s)}</li>`).join('')}
        </ul>
      </div>
    </div>
  ` : '';

  // ---------- 🔍 哪个环节没想到 ----------
  const gapsHtml = (r.gaps && r.gaps.length) ? `
    <div class="std-fold${openClass}" data-insight="gaps">
      <div class="std-fold-hd">
        <span>🔍 哪个环节还没想到</span><span class="arrow">▶</span>
      </div>
      <div class="std-fold-bd">
        <ul style="margin:0;padding-left:18px;">
          ${r.gaps.map(s => `<li>${esc(s)}</li>`).join('')}
        </ul>
      </div>
    </div>
  ` : '';

  // ---------- 🧠 AI 怎么分析这道题 ----------
  const walkHtml = r.reasoning_walkthrough ? `
    <div class="std-fold${openClass}" data-insight="walk">
      <div class="std-fold-hd">
        <span>🧠 AI 是怎么分析这道题的</span><span class="arrow">▶</span>
      </div>
      <div class="std-fold-bd">
        <div class="std-line">${esc(r.reasoning_walkthrough).replace(/\n/g, '<br>')}</div>
      </div>
    </div>
  ` : '';

  // ---------- 📊 大模型批改结果 ----------
  const j = r.judgement || {};
  const judgementHtml = `
    <div class="std-fold${openClass}" data-insight="judgement">
      <div class="std-fold-hd">
        <span>📊 大模型批改结果</span><span class="arrow">▶</span>
      </div>
      <div class="std-fold-bd">
        <div class="std-line">
          <b>答案判定：</b>
          ${j.answer_correct
            ? '<span style="color:#15803d;font-weight:800;">✓ 正确</span>'
            : '<span style="color:#b91c1c;font-weight:800;">✗ 有误</span>'}
        </div>
        ${j.student_answer_issue && j.student_answer_issue !== '无'
          ? `<div class="std-line"><b>答案问题：</b>${esc(j.student_answer_issue)}</div>` : ''}
        ${j.step_count_comment
          ? `<div class="std-line"><b>步数评价：</b>${esc(j.step_count_comment)}</div>` : ''}
        ${(j.step_issues && j.step_issues.length)
          ? `<div class="std-line"><b>步骤问题：</b>
              <ul style="margin:4px 0 0 18px;">
                ${j.step_issues.map(it =>
                  `<li>第 ${it.step} 步 · ${esc(it.field)}：${esc(it.issue)}</li>`
                ).join('')}
              </ul>
             </div>` : ''}
      </div>
    </div>
  `;

  return { strengthsHtml, gapsHtml, walkHtml, judgementHtml };
}

/* 渲染大模型反馈（每步折叠、最终答案折叠、提示折叠） */
function renderLLMFeedback(r) {
  const box = document.getElementById('m13StandardSteps');
  if (!box) return;

  // ⭐ 防御：补齐缺失字段
  if (!r || typeof r !== 'object') return;
  r.judgement = r.judgement || {};
  r.answer = r.answer || { full: '—', value: null, unit: '' };
  r.steps = Array.isArray(r.steps) ? r.steps : [];

  // judgement 内部字段也补
  r.judgement.answer_correct = !!r.judgement.answer_correct;
  r.judgement.student_answer_issue = r.judgement.student_answer_issue || '无';
  r.judgement.step_issues = Array.isArray(r.judgement.step_issues) ? r.judgement.step_issues : [];
  r.judgement.step_count_comment = r.judgement.step_count_comment || '';

  const ok = r.judgement.answer_correct;

  // 步骤问题标注（对应动态生成的输入框）
  m13ClearStepMarks();
  if (r.judgement.step_issues && r.judgement.step_issues.length) {
    r.judgement.step_issues.forEach(issue => {
      const field = issue.field === 'relation' ? 'rel'
                  : issue.field === 'substitution' ? 'sub' : 'res';
      const input = document.querySelector(
        `#formulaSteps input[data-idx="${issue.step - 1}"][data-field="${field}"]`
      );
      if (input) {
        input.style.borderColor = '#ef4444';
        input.style.background = '#fef2f2';
        input.title = issue.issue;
      }
    });
  }

  // ✅ 4 类 AI 反馈（共用）
  const insight = buildAiInsightHtml(r, { open: true });
  const strengthsHtml   = insight.strengthsHtml;
  const gapsHtml        = insight.gapsHtml;
  const walkHtml        = insight.walkHtml;
  const judgementHtml   = insight.judgementHtml;

  // 步骤折叠面板
  const stepsHtml = (r.steps || []).map(s => `
    <div class="std-fold" data-step="${s.step}">
      <div class="std-fold-hd">
        <span>第 ${s.step} 步${r.required_steps ? ` / 共 ${r.required_steps} 步` : ''}</span>
        <span class="arrow">▶</span>
      </div>
      <div class="std-fold-bd">
        <div class="std-line"><b>关系式：</b>${s.relation}</div>
        <div class="std-line"><b>代入：</b>${s.substitution}</div>
        <div class="std-line"><b>得数：</b>${s.result}</div>
      </div>
    </div>
  `).join('');

  const hintHtml = (!ok && r.hint) ? `
    <div class="std-fold" data-step="hint">
      <div class="std-fold-hd">
        <span>💡 提示（先自己想想再看）</span>
        <span class="arrow">▶</span>
      </div>
      <div class="std-fold-bd">
        <div class="std-keywords" style="background:#fef3c7;color:#92400e;">
          ${r.hint}
        </div>
      </div>
    </div>
  ` : '';

  const understandingHtml = r.problem_understanding ? `
    <div class="std-fold" data-step="understanding">
      <div class="std-fold-hd">
        <span>📝 题意理解</span>
        <span class="arrow">▶</span>
      </div>
      <div class="std-fold-bd">
        <div class="std-line">${String(r.problem_understanding || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>
      </div>
    </div>
  ` : '';

  box.innerHTML = `
    <h4>${ok ? '🎉 大模型批改结果：答对了！' : '📖 大模型批改结果：答错了/没答完'}</h4>
    ${judgementHtml}     <!-- ⭐ 新增 -->
    ${understandingHtml}
    ${strengthsHtml}
    ${gapsHtml}
    ${walkHtml}
    ${stepsHtml}
    <div class="std-fold" data-step="final">
      <div class="std-fold-hd">
        <span>✅ 最终答案（点击展开）</span>
        <span class="arrow">▶</span>
      </div>
      <div class="std-fold-bd">
        <div class="std-answer">${r.answer.full}</div>
      </div>
    </div>
    ${hintHtml}
  `;
  box.style.display = 'block';

  box.querySelectorAll('.std-fold').forEach(fold => {
    fold.querySelector('.std-fold-hd').addEventListener('click', () => {
      fold.classList.toggle('open');
    });
  });

  setTimeout(() => {
    box.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, 100);
}

// 把判卷逻辑接入错题本
$('#pCheck').addEventListener('click', async () => {
  if ($('#pCheck').disabled) return;

  const user = $('#pAnswer').value.trim();
  const badge = $('#pResult');

  // ⭐ 新版 #pResult 用 .m13-result-badge
  const setBadge = (type, text) => {
    badge.className = 'm13-result-badge' + (type ? ' ' + type : '');
    badge.textContent = text || '';
  };
  
  const problemText = $('#problem-text').innerText.trim();

  // ⭐ 判断依据改为 M13_ProblemSource，而不是下拉框当前值
  const p = (M13_ProblemSource === 'bank') ? M13_CurrentProblem : null;
  const stdValue = p && p.answer && typeof p.answer === 'object' ? p.answer.value : null;
  const stdFull  = p && p.answer
    ? (typeof p.answer === 'string' ? p.answer : p.answer.full)
    : null;

  // ---- 前置校验（不占用按钮状态）----
  if (!problemText) {
    badge.className = 'm13-result-badge no';
    badge.textContent = '请先选择或输入题目';
    return;
  }
    if (!user) {
      badge.className = 'm13-result-badge no';
      badge.textContent = '✏ 请先写出答案';
      return;
    }

      /* ============================================================
     ⭐ 新增：优先查历史缓存
     - 找这道题最近一次做题记录
     - 如果缓存里有 aiFeedback（大模型算过 / 题库自带）→ 直接用
     - 完全跳过 AI 调用
     ============================================================ */
    const cachedRecord = (function findCached() {
      try {
        const list = historyLoad();   // 已按时间倒序（unshift 存）
        return list.find(r => r.problemText === problemText) || null;
      } catch (e) { return null; }
    })();

    if (cachedRecord && cachedRecord.aiFeedback) {
      const fb = cachedRecord.aiFeedback;

      // 判定：用户答案里出现的数字，是否覆盖缓存答案的数字
      const uNums = m13ExtractNums(user);
      const cNums = (typeof fb.answer?.value === 'number')
        ? [fb.answer.value]
        : m13ExtractNums(fb.answer?.full || cachedRecord.correctAnswer || '');
      const allMatch = cNums.length && cNums.every(v =>
        uNums.some(x => Math.abs(x - v) < 0.001)
      );

      // 展示结果
      if (allMatch) {
        badge.className = 'm13-result-badge ok';
        badge.textContent = '🎉 ' + getEncouragement('m13', getM13Streak()) + ` （历史缓存）参考答案：${fb.answer?.full || cachedRecord.correctAnswer || '—'}`;
        // ⭐ 跳一下
        badge.style.animation = 'badgeBump .5s cubic-bezier(.34,1.5,.64,1)';
        setTimeout(() => { badge.style.animation = ''; }, 500);
        handleRedoSuccess(problemText);

        const mrec = masteryRecord(problemText, true);   // ⭐掌握度
        if (mrec && mrec.state === 'mastered') {
          showToast('🏆 这道题你掌握了！', 'success');
          setTimeout(() => {
            showMasteryCard({
              problemText,
              correctAnswer: stdFull || fb.answer.full,
              takeaway: takeawayLoad(problemText),
            });
          }, 800);
        }
      } else {
        badge.className = 'm13-result-badge no';
        badge.textContent = `❌ 再检查一下。提示：答案中应出现的数字有 ${cNums.join('、')}`;

        masteryRecord(problemText, false);  // ⭐掌握度

        // ⭐ 如果标准解法有，展开第一步"关系式"，让用户对比
        const stdSteps = document.querySelectorAll('#m13StandardSteps .std-fold');
        if (stdSteps.length > 0) {
          // 展开第一步
          const firstStep = stdSteps[0];
          firstStep.classList.add('open');
          // 滚动到标准解法
          setTimeout(() => {
            document.getElementById('m13StandardSteps')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 300);
        }

        // ⭐ 触发拇指条
        if (typeof window.__shell?.showThumbBar === 'function') {
          window.__shell.showThumbBar({
            text: '答案还不对，想看看标准解法吗？',
            ok: false,
            onNext: () => {
              // 滚动到标准解法按钮
              document.getElementById('m13UnlockBtn')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            },
          });
        }
      }

      // 显示缓存讲解
      try {
        if (typeof renderLLMFeedback === 'function' && fb.steps && fb.steps.length) {
          renderLLMFeedback(fb);
        }
      } catch (e) { console.warn('[缓存渲染失败]', e); }

      // ⭐ 记录本次作答（保留历史统计）
      historyAdd({
        problemText,
        problemSource: cachedRecord.problemSource || '题库',
        moduleId: cachedRecord.moduleId || 'm13',   // ⭐ 继承缓存记录的模块归属
        studentSteps: m13CollectSteps(),
        studentAnswer: user,
        isCorrect: allMatch,
        correctAnswer: fb.answer?.full || cachedRecord.correctAnswer || '',
        aiFeedback: fb
      });

      // 答错时加入错题本
      if (!allMatch) {
        wbAdd({
          id: 'cached',
          type: cachedRecord.problemSource || '题库',
          text: problemText,
          studentAnswer: user,
          correctAnswer: fb.answer?.full || cachedRecord.correctAnswer || '',
          studentSteps: m13CollectSteps(),
          steps: fb.steps || null,
          aiFeedback: fb
        });
      }

      // ⭐ 到此结束，不再走下面任何 AI 调用
      return;
    }

    // ⭐ 至少写一步计算过程（关系式 + 代入式，且代入式必须含题目数字）
    const studentSteps = m13CollectSteps();
    const problemNums = m13ProblemNumbers(problemText);

    // 找出"完整"的步骤
    const completeSteps = studentSteps.filter(s => {
      const hasRel = (s.rel || '').trim().length > 0;
      const hasSub = (s.sub || '').trim().length > 0;
      const subValid = m13IsValidSubstitution(s.sub, problemNums);
      return hasRel && hasSub && subValid;
    });

    if (completeSteps.length === 0) {
      badge.className = 'm13-result-badge no';
      // 给更具体的提示
      const anyRel = studentSteps.some(s => (s.rel || '').trim());
      const anySub = studentSteps.some(s => (s.sub || '').trim());
      let tip = '✏ 请先写出「关系式」和「代入数字」，再点检查';
      if (anyRel && !anySub) tip = '✏ 有一步没写「代入数字」，补上再检查';
      else if (!anyRel && anySub) tip = '✏ 有一步没写「关系式」，补上再检查';
      else if (anySub) tip = '✏ 「代入数字」需要用到题目中的数字（如：15 − 8 − 3）';
      badge.textContent = tip;
      return;
    }

  // ========== ① 题库内的题：本地比对 ==========
  if (M13_ProblemSource === 'bank' && (stdValue != null || stdFull)) {
    const uNums = m13ExtractNums(user);
    const cNums = stdValue != null ? [stdValue] : m13ExtractNums(stdFull);
    const allMatch = cNums.length && cNums.every(v =>
      uNums.some(x => Math.abs(x - v) < 0.001)
    );

      if (allMatch) {
      badge.className = 'm13-result-badge ok';
      badge.textContent = '🎉 ' + getEncouragement('m13', getM13Streak()) + ' 参考答案：' + stdFull;
      // ⭐ 跳一下
      badge.style.animation = 'badgeBump .5s cubic-bezier(.34,1.5,.64,1)';
      setTimeout(() => { badge.style.animation = ''; }, 500);
      // ⭐ 做对了：如果正在重做错题，累计掌握进度
      handleRedoSuccess(problemText);

      // ⭐ 记录做题历史
      historyAdd({
        problemText,
        problemSource: '题库',
        moduleId: 'm13',                          // ⭐ 题库题固定归 m13
        studentSteps,
        studentAnswer: user,
        isCorrect: true,
        correctAnswer: stdFull,
        aiFeedback: p && p.steps ? {
          answer: { full: stdFull },
          steps: p.steps.map(s => ({
            step: s.step,
            relation: s.relation,
            substitution: s.substitution,
            result: s.result
          })),
          judgement: {
            answer_correct: allMatch,   // ⭐ 补上
            student_answer_issue: allMatch ? '无' : '答案有误',
            step_issues: [],
            step_count_comment: '',
          },
          _source: 'bank',
        } : null
      });

      const mrec = masteryRecord(problemText, true);   // ⭐ 掌握度
      if (mrec && mrec.state === 'mastered') {
        showToast('🏆 这道题你掌握了！', 'success');
        setTimeout(() => {
          showMasteryCard({
            problemText,
            correctAnswer: stdFull || result.answer.full,
            takeaway: takeawayLoad(problemText),
          });
        }, 800);
      }
    } else {
      badge.className = 'm13-result-badge no';
      badge.textContent = `❌ 再检查一下。提示：答案中应出现的数字有 ${cNums.join('、')}`;

      // ⭐ 如果标准解法有，展开第一步"关系式"，让用户对比
      const stdSteps = document.querySelectorAll('#m13StandardSteps .std-fold');
      if (stdSteps.length > 0) {
        // 展开第一步
        const firstStep = stdSteps[0];
        firstStep.classList.add('open');
        // 滚动到标准解法
        setTimeout(() => {
          document.getElementById('m13StandardSteps')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 300);
      }

      // ⭐ 记录做题历史
      historyAdd({
        problemText,
        problemSource: '题库',
        moduleId: 'm13',                          // ⭐ 题库题固定归 m13
        studentSteps,
        studentAnswer: user,
        isCorrect: false,
        correctAnswer: stdFull,
        aiFeedback: p && p.steps ? {
          answer: { full: stdFull },
          steps: p.steps.map(s => ({
            step: s.step,
            relation: s.relation,
            substitution: s.substitution,
            result: s.result
          })),
          judgement: {
            answer_correct: allMatch,   // ⭐ 补上
            student_answer_issue: allMatch ? '无' : '答案有误',
            step_issues: [],
            step_count_comment: '',
          },
          _source: 'bank',
        } : null
      });

      masteryRecord(problemText, false);  // ⭐掌握度

      wbAdd({
        id: p ? p.id : 'bank',
        type: p ? p.type : '题库',
        moduleId: 'm13',   // ⭐ 加这个
        text: problemText,
        studentAnswer: user,
        correctAnswer: stdFull,
        studentSteps: studentSteps,   // ✅ 补：保留学生步骤
        steps: p && p.steps ? p.steps : null,
        // ✅ 用本地 steps 包装成 aiFeedback，避免错题本点「讲解」时白调 AI
        aiFeedback: p && p.steps ? normalizeAiFeedback({
          answer: { full: stdFull },
          steps: p.steps.map(s => ({
            step: s.step,
            relation: s.relation,
            substitution: s.substitution,
            result: s.result
          })),
          judgement: { answer_correct: false },
          _source: 'bank'
        }, stdFull) : null
      });
    }
    return;
  }

  // ========== ② 题库外的题：大模型批改（异步，进入加载态）==========
  if (!LLM_CONFIG.enabled) {
    badge.className = 'm13-result-badge info';
    badge.textContent = '📝 自定义题目无标准答案，请对照题意自查（未启用大模型）';
    return;
  }

  /* ⭐⭐⭐ 关键：调 AI 前先要密码 ⭐⭐⭐ */
  if (!window._llmPwdOK) {
    // 弹密码框，验证通过后设置 _llmPwdOK = true，再重放一次检查
    const okCallback = () => {
      window._llmPwdOK = true;
      // 重新触发一次检查（此时 _llmPwdOK 已为 true，不会再弹密码）
      $('#pCheck').click();
    };
    showPasswordModal(okCallback);
    return;
  }

  // 👇 进入加载态
  setCheckBtnLoading(true);
  showAiThinking('正在分析你的解题过程…');
  badge.className = 'm13-result-badge info';
  badge.textContent = '';

  try {
      const raw = await callLLM({
      problem: problemText,
      studentAnswer: user,
      steps: studentSteps
    });

    // ✅ 统一结构
    const result = normalizeAiFeedback(raw, null);
    result._source = 'llm';

    const ok = result.judgement.answer_correct;
    // 先设基础样式
    badge.className = 'm13-result-badge ' + (ok ? 'ok' : 'no');
 
    if (ok) {
      badge.textContent = '🎉 ' + getEncouragement('m13', getM13Streak()) + ' 参考答案：' + result.answer.full;
      // ⭐ 跳一下
      badge.style.animation = 'badgeBump .5s cubic-bezier(.34,1.5,.64,1)';
      setTimeout(() => { badge.style.animation = ''; }, 500);
      const mrec = masteryRecord(problemText, true);   // ⭐掌握度
      if (mrec && mrec.state === 'mastered') {
        showToast('🏆 这道题你掌握了！', 'success');
        setTimeout(() => {
          showMasteryCard({
            problemText,
            correctAnswer: stdFull || result.answer.full,
            takeaway: takeawayLoad(problemText),
          });
        }, 800);
      }
    }else{
      badge.textContent = `❌ ${result.judgement.student_answer_issue || '再检查一下'}`;
      masteryRecord(problemText, false);  // ⭐掌握度

      // ⭐ 如果标准解法有，展开第一步"关系式"，让用户对比
      const stdSteps = document.querySelectorAll('#m13StandardSteps .std-fold');
      if (stdSteps.length > 0) {
        // 展开第一步
        const firstStep = stdSteps[0];
        firstStep.classList.add('open');
        // 滚动到标准解法
        setTimeout(() => {
          document.getElementById('m13StandardSteps')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 300);
      }
    }

    renderLLMFeedback(result);

    historyAdd({
      problemText,
      problemSource: '自定义',
      moduleId: 'm13',                          // ⭐ 题库题固定归 m13
      studentSteps,
      studentAnswer: user,
      isCorrect: ok,
      correctAnswer: result.answer.full,
      aiFeedback: result
    });

      if (!ok) {
      wbAdd({
        id: 'llm',
        type: '自定义',
        text: problemText,
        studentAnswer: user,
        correctAnswer: result.answer.full,
        studentSteps: studentSteps,
        steps: result.steps || null,
        aiFeedback: result
      });
    } else {
      // ⭐ 做对了：如果正在重做错题，累计掌握进度
      handleRedoSuccess(problemText);
    }

  } catch (e) {
    console.error('[大模型] 调用失败', e);
    badge.className = 'm13-result-badge no';
    const msg = e.message || '';
    if (msg.includes('超时')) {
      badge.textContent = '⏰ 网络有点慢（300 秒未响应），请检查网络后重试';
    } else if (msg.includes('401') || msg.includes('403')) {
      badge.textContent = '🔑 API 密钥无效，请联系老师';
    } else if (msg.includes('429')) {
      badge.textContent = '🚦 请求太频繁，稍后再试';
    } else if (msg.includes('格式异常')) {
      badge.textContent = '🤖 模型返回异常，请再点一次试试';
    } else {
      badge.textContent = '⚠️ 网络异常：' + (msg || '请稍后重试');
    }

  } finally {
    // 👇 退出加载态
    hideAiThinking();
    setCheckBtnLoading(false);
  }
});


$('#pAnswer').addEventListener('keydown', e => { if (e.key === 'Enter') $('#pCheck').click(); });
loadBank().then(() => {
  // 不自动载入任何题，保持"选择一道题目"的初始状态
  m13InitSteps();     // 默认 2 步
  // 清空题目区
  const el = $('#problem-text');
  if (el) el.textContent = '';
});

/* ============ 错题本 · UI 逻辑 ============ */
(function () {
  const btn    = document.getElementById('wrongBookBtn');
  const drawer = document.getElementById('wrongBookDrawer');
  const mask   = document.getElementById('wrongBookMask');
  const close  = document.getElementById('wrongBookClose');
  if (!btn || !drawer) return;

   btn.addEventListener('click', () => {
    const willOpen = !drawer.classList.contains('open');
    drawer.classList.toggle('open');
    mask.classList.toggle('open');
    lockBodyScroll(willOpen);
    /* ⭐ 打开时刷新智能推荐 */
    if (willOpen && typeof wbRenderRecommend === 'function') {
      wbRenderRecommend();
    }
  });
  close.addEventListener('click', () => {
    drawer.classList.remove('open');
    mask.classList.remove('open');
    lockBodyScroll(false);
  });
  mask.addEventListener('click', () => {
    drawer.classList.remove('open');
    mask.classList.remove('open');
    lockBodyScroll(false);
  });
})();

/* ============ 错题本 · 核心 ============ */

const HISTORY_MAX = 1000;   // 最多保留 1000 条

/* ⭐ 下载工具函数 */
function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ⭐ 做对后，累计错题本"掌握进度" */
function handleRedoSuccess(problemText) {
  const result = markRedoSuccess(problemText);   // ⭐ 调用 wrongbook.js 的新逻辑

  if (result.removed) {
    showToast('🎉 太棒了！这道题隔天再做对，已从错题本移除！', 'success');
    document.getElementById('redoBanner')?.remove();

    // ⭐ 弹成就卡
    const wb = wbLoad();
    // 已经从错题本移除了，从 history 找答案
    const history = historyLoad();
    const rec = history.find(r => r.problemText === problemText && r.isCorrect);
    if (rec) {
      setTimeout(() => {
        showMasteryCard({
          problemText,
          correctAnswer: rec.correctAnswer || rec.studentAnswer || '—',
          takeaway: takeawayLoad(problemText),
        });
      }, 800);
    }
  } else if (result.tooSoon) {
    const nextDate = new Date(result.nextReviewAt).toLocaleDateString('zh-CN');
    showToast(`✅ 做对了！明天（${nextDate}）再来做对一次，就能从错题本移除`, 'info');
  } else {
    showToast(`✅ 做对了！明天再来做对一次，就能从错题本移除`, 'info');
  }
}

function wbRender() {
  const listEl = document.getElementById('wrongBookList');
  const badge  = document.getElementById('wrongBookBadge');
  if (!listEl) return;

  // ⭐ 从做题记录统计每道题的"错误次数"
  const history = historyLoad();
  const wrongCountMap = {};
  const totalCountMap = {};
  history.forEach(r => {
    const t = r.problemText;
    if (!totalCountMap[t]) {
      totalCountMap[t] = 0;
      wrongCountMap[t] = 0;
    }
    totalCountMap[t]++;
    if (!r.isCorrect) wrongCountMap[t]++;
  });

  const list = wbLoad();
  const now = Date.now();

  // ⭐ 到期统计（在列表前）
  const dueCount = list.filter(r => r.nextReviewAt && r.nextReviewAt <= now).length;

  // ⭐ 排序
  list.sort((a, b) => {
    const aWrong = wrongCountMap[a.text] || 0;
    const bWrong = wrongCountMap[b.text] || 0;
    const aMastered = a.masteredCount || 0;
    const bMastered = b.masteredCount || 0;
    const aScore = aWrong * 10 - aMastered * 5;
    const bScore = bWrong * 10 - bMastered * 5;
    if (aScore !== bScore) return bScore - aScore;
    return b.timestamp - a.timestamp;
  });

  // 角标
  if (badge) {
    if (list.length) {
      badge.textContent = list.length > 99 ? '99+' : list.length;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // 空状态
  if (!list.length) {
    listEl.innerHTML = '<div class="wrong-book-empty">还没有错题，继续加油 💪</div>';
    return;
  }

  // ⭐ 到期提示条（在列表最前）
  const dueBanner = dueCount > 0
    ? `<div style="padding:10px 14px;margin-bottom:10px;background:#fef3c7;border:2px solid #fcd34d;border-radius:10px;font-size:13px;font-weight:700;color:#b45309;">
        🔔 今天有 <b>${dueCount}</b> 道错题到期，复习一下吧
      </div>`
    : '';

  // ⭐ 渲染每条错题
  listEl.innerHTML = dueBanner + list.map(r => {
    const d = new Date(r.timestamp);
    const date = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const enc = encodeURIComponent(r.text);
    const takeaway = takeawayLoad(r.text);
    const takeawayHtml = takeaway ? `
      <div style="margin-top:8px;padding:8px 12px;background:#f0f9ff;border-left:3px solid #3b82f6;border-radius:6px;font-size:12px;color:#334155;line-height:1.6;">
        <b style="color:#2563eb;">💡 一题一得：</b>${escapeHtmlStrict(takeaway)}
      </div>
    ` : '';

    const masteredCount = r.masteredCount || 0;
    const progressHtml = masteredCount > 0 ? `
      <div style="margin-top:6px;font-size:11.5px;color:#10b981;font-weight:700;">
        ✅ 已做对 ${masteredCount}/2 次（再做对 ${2 - masteredCount} 次就移除）
      </div>
    ` : '';

    // ⭐ 每道题的"到期状态"
    const due = r.nextReviewAt && r.nextReviewAt <= now;
    const upcoming = r.nextReviewAt && r.nextReviewAt > now;
    const reviewBadge = due
      ? `<span style="background:#fef3c7;color:#b45309;font-size:11px;font-weight:800;padding:2px 8px;border-radius:6px;">🔔 今天复习</span>`
      : upcoming
        ? `<span style="background:#e0e7ff;color:#3730a3;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;">📅 ${new Date(r.nextReviewAt).toLocaleDateString('zh-CN')} 复习</span>`
        : '';

    return `
      <div class="wrong-item">
        <button class="wrong-item-remove" data-text="${enc}">×</button>
        <div class="wrong-item-text">${escapeHtmlStrict(r.text)}</div>
        <div class="wrong-item-meta">
          <span>你的答案：${escapeHtmlStrict(r.studentAnswer || '（空）')}</span>
          <span>正确：${escapeHtmlStrict(r.correctAnswer || '—')}</span>
          <span>${date}</span>
          ${reviewBadge}
          ${wrongCountMap[r.text] ? `<span style="background:#fee2e2;color:#b91c1c;font-weight:800;">❌ 错过 ${wrongCountMap[r.text]} 次</span>` : ''}
          ${totalCountMap[r.text] ? `<span style="background:#e0e7ff;color:#3730a3;">📝 共做 ${totalCountMap[r.text]} 次</span>` : ''}
        </div>
        ${takeawayHtml}
        ${progressHtml}
        <button class="wrong-item-explain" data-text="${enc}">🧠 讲解</button>
        <button class="wrong-item-redo" data-text="${enc}">🔁 重做</button>
      </div>
    `;
  }).join('');

  if (typeof window._refreshGrowthCards === 'function') {
    setTimeout(window._refreshGrowthCards, 50);
  }
}

/* 底部按钮 */
document.addEventListener('click', e => {
  if (e.target.id === 'wrongBookClear') wbClear();
  if (e.target.id === 'wrongBookExport') {
    const list = wbLoad();
    const name = getStudentName();
    const data = {
      student: name || '未命名',
      exportAt: new Date().toISOString(),
      records: list,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const namepart = name ? `_${name}` : '';
    a.download = `错题本${namepart}_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
});

/* ============================================================
   ⭐ 错题本 · 智能推荐
   ============================================================ */
function wbRenderRecommend() {
  const el = document.getElementById('wbRecommend');
  if (!el) return;

  const list = wbLoad();
  if (!list.length) {
    el.style.display = 'none';
    return;
  }

  // 1. 按知识标签统计错题次数
  const tagCount = {};
  list.forEach(r => {
    autoTagsFor(r.text).forEach(t => {
      tagCount[t] = (tagCount[t] || 0) + 1;
    });
  });
  const tagArr = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);

  if (!tagArr.length) {
    el.style.display = 'none';
    return;
  }

  const top3 = tagArr.slice(0, 3);
  const topTag = top3[0];

  // 2. 生成推荐文案
  const tagsHtml = top3.map(([t, c]) =>
    `<span class="wb-recommend-tag" data-tag="${t}">${t}<span class="tag-count">${c}</span></span>`
  ).join('');

  const bodyHtml = `
    你在「<b>${topTag[0]}</b>」类错题上累计 <b>${topTag[1]}</b> 次，
    建议先集中练这一类。点击下方按钮，我会自动筛选出该类的错题。
  `;

  el.innerHTML = `
    <div class="wb-recommend-title">🤖 智能推荐</div>
    <div class="wb-recommend-tags">${tagsHtml}</div>
    <div class="wb-recommend-body">${bodyHtml}</div>
    <div class="wb-recommend-actions">
      <button class="wb-recommend-skip">忽略</button>
      <button class="wb-recommend-go">🎯 筛选「${topTag[0]}」错题</button>
    </div>
  `;
  el.style.display = 'block';

  // 3. 点击标签 → 筛选错题列表
  el.querySelectorAll('.wb-recommend-tag').forEach(tagEl => {
    tagEl.addEventListener('click', () => {
      const tag = tagEl.dataset.tag;
      filterWrongListByTag(tag);
      updateRecommendGoBtn(tag);
    });
  });

  // 4. 点击"筛选"按钮 → 用 topTag 筛选
  el.querySelector('.wb-recommend-go').addEventListener('click', () => {
    filterWrongListByTag(topTag[0]);
  });

  // 5. 忽略
  el.querySelector('.wb-recommend-skip').addEventListener('click', () => {
    el.style.display = 'none';
    // 重置筛选
    filterWrongListByTag(null);
  });

  // 6. 允许切换推荐 tag
  function updateRecommendGoBtn(tag) {
    const btn = el.querySelector('.wb-recommend-go');
    if (btn) btn.textContent = `🎯 筛选「${tag}」错题`;
  }
}

/* 按标签筛选错题列表 */
function filterWrongListByTag(tag) {
  const listEl = document.getElementById('wrongBookList');
  if (!listEl) return;

  const items = listEl.querySelectorAll('.wrong-item');
  if (!tag) {
    items.forEach(item => { item.style.display = ''; });
    return;
  }

  items.forEach(item => {
    const textEl = item.querySelector('.wrong-item-text');
    const text = textEl ? textEl.textContent.trim() : '';
    const tags = autoTagsFor(text);
    item.style.display = tags.includes(tag) ? '' : 'none';
  });

  // 加个提示（在列表顶部）
  let hint = document.getElementById('wbFilterHint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'wbFilterHint';
    hint.style.cssText = 'padding:10px 14px;margin-bottom:8px;background:#eff6ff;border-radius:8px;font-size:13px;font-weight:700;color:#2563eb;display:flex;align-items:center;justify-content:space-between;';
    listEl.insertBefore(hint, listEl.firstChild);
  }
  hint.innerHTML = `
    <span>🔍 已筛选：${tag}</span>
    <button style="padding:3px 10px;border:none;border-radius:6px;background:#2563eb;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">✕ 清除</button>
  `;
  hint.querySelector('button').addEventListener('click', () => {
    filterWrongListByTag(null);
    hint.remove();
  });
}

/* 每次 wbRender 后刷新推荐 */
(function patchWbRecommendRender() {
  if (typeof wbRender !== 'function') return;
  const orig = wbRender;
  window.wbRender = function () {
    orig.apply(this, arguments);
    wbRenderRecommend();
  };
  // 首次渲染
  setTimeout(wbRenderRecommend, 200);
})();

/* ============ 做题记录 · 导出 ============ */
/* ============ 做题记录 · 导出（带筛选 + 按题目勾选） ============ */
function historyExport() {
  const allRecords = historyLoad();
  if (!allRecords.length) {
    showToast('还没有做题记录，先做一道题吧 📝', 'info');
    return;
  }

  if (document.querySelector('.export-modal-mask')) return;

  // ⭐ 保存"按题目"的勾选状态（key = 题目文本）
  const selectedProblems = new Set();
  // 初始化：全选
  const allProblems = new Set(allRecords.map(r => r.problemText));
  allProblems.forEach(t => selectedProblems.add(t));

  const mask = document.createElement('div');
  mask.className = 'export-modal-mask';
  mask.innerHTML = `
    <div class="export-modal">
      <h3>📤 导出做题记录</h3>

      <div class="export-section">
        <div class="export-label">时间范围</div>
        <div class="export-radios">
          <label><input type="radio" name="exportRange" value="all" checked> 全部</label>
          <label><input type="radio" name="exportRange" value="today"> 今天</label>
          <label><input type="radio" name="exportRange" value="week"> 近 7 天</label>
          <label><input type="radio" name="exportRange" value="month"> 近 30 天</label>
        </div>
      </div>

      <div class="export-section">
        <div class="export-label">对错</div>
        <div class="export-checkboxes">
          <label><input type="checkbox" id="exportCorrect" checked> ✅ 做对的</label>
          <label><input type="checkbox" id="exportWrong" checked> ❌ 做错的</label>
        </div>
      </div>

      <div class="export-section">
        <div class="export-label">题目来源</div>
        <div class="export-checkboxes">
          <label><input type="checkbox" id="exportBank" checked> 📚 题库</label>
          <label><input type="checkbox" id="exportCustom" checked> ✏️ 自定义</label>
        </div>
      </div>

      <details class="export-section export-problems-fold" open>
        <summary>
          <span>📋 按题目勾选</span>
          <span class="fold-hint" id="exportProblemCount">（已选 0 题）</span>
        </summary>
        <div class="export-problem-toolbar">
          <button type="button" class="exp-tool" data-action="all">☑ 全选</button>
          <button type="button" class="exp-tool" data-action="none">☐ 全不选</button>
          <button type="button" class="exp-tool" data-action="invert">🔄 反选</button>
        </div>
        <div class="export-problem-list" id="exportProblemList"></div>
      </details>

      <div class="export-preview" id="exportPreview">
        共 <b>${allRecords.length}</b> 条记录将被导出
      </div>

      <div class="export-btns">
        <button class="export-cancel" id="exportCancel">取消</button>
        <button class="export-ok" id="exportJson">📄 导出 JSON</button>
        <button class="export-ok" id="exportHtml" style="background:#8b5cf6;box-shadow:0 3px 0 #6d28d9;">📋 导出 HTML</button>
      </div>
    </div>
  `;
  document.body.appendChild(mask);

  /* ============ 筛选逻辑 ============ */
  function getFilteredByTopFilters() {
    const rangeVal = mask.querySelector('input[name="exportRange"]:checked').value;
    const includeCorrect = document.getElementById('exportCorrect').checked;
    const includeWrong = document.getElementById('exportWrong').checked;
    const includeBank = document.getElementById('exportBank').checked;
    const includeCustom = document.getElementById('exportCustom').checked;

    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = now - 7 * 24 * 60 * 60 * 1000;
    const monthStart = now - 30 * 24 * 60 * 60 * 1000;

    return allRecords.filter(r => {
      if (rangeVal === 'today' && r.timestamp < todayStart.getTime()) return false;
      if (rangeVal === 'week' && r.timestamp < weekStart) return false;
      if (rangeVal === 'month' && r.timestamp < monthStart) return false;

      if (r.isCorrect && !includeCorrect) return false;
      if (!r.isCorrect && !includeWrong) return false;

      const src = r.problemSource || '';
      const isBank = src.includes('题库') || src.includes('内置');
      const isCustom = src.includes('自定义');
      if (isBank && !includeBank) return false;
      if (isCustom && !includeCustom) return false;
      if (!isBank && !isCustom && !includeBank && !includeCustom) return false;

      return true;
    });
  }

  /* ============ 渲染"按题目"列表 ============ */
  function renderProblemList() {
    const filtered = getFilteredByTopFilters();

    // 按题目聚合
    const map = {};
    filtered.forEach(r => {
      if (!map[r.problemText]) map[r.problemText] = [];
      map[r.problemText].push(r);
    });

    const listEl = document.getElementById('exportProblemList');
    const keys = Object.keys(map);

    if (!keys.length) {
      listEl.innerHTML = '<div class="exp-empty">没有符合条件的题目</div>';
      return;
    }

    listEl.innerHTML = keys.map((text, i) => {
      const records = map[text];
      const correct = records.filter(r => r.isCorrect).length;
      const wrong = records.length - correct;
      const checked = selectedProblems.has(text);
      const shortText = text.length > 32 ? text.slice(0, 32) + '…' : text;
      return `
        <label class="exp-prob-item">
          <input type="checkbox" data-problem="${encodeURIComponent(text)}" ${checked ? 'checked' : ''}>
          <span class="exp-prob-text">${escapeHtmlStrict(shortText)}</span>
          <span class="exp-prob-meta">
            <span class="exp-meta-ok">✓ ${correct}</span>
            <span class="exp-meta-no">✗ ${wrong}</span>
            <span class="exp-meta-total">${records.length} 次</span>
          </span>
        </label>
      `;
    }).join('');

    // 绑定勾选
    listEl.querySelectorAll('input[type="checkbox"]').forEach(inp => {
      inp.addEventListener('change', () => {
        const text = decodeURIComponent(inp.dataset.problem);
        if (inp.checked) selectedProblems.add(text);
        else selectedProblems.delete(text);
        updatePreview();
      });
    });
  }

  /* ============ 最终导出内容 ============ */
  function getExportRecords() {
    const filtered = getFilteredByTopFilters();
    return filtered.filter(r => selectedProblems.has(r.problemText));
  }

  /* ============ 更新预览 ============ */
  function updatePreview() {
    const records = getExportRecords();
    const el = document.getElementById('exportPreview');
    const countEl = document.getElementById('exportProblemCount');

    // 已选题目数
    const filtered = getFilteredByTopFilters();
    const filteredProblems = new Set(filtered.map(r => r.problemText));
    let selectedCount = 0;
    filteredProblems.forEach(t => { if (selectedProblems.has(t)) selectedCount++; });
    if (countEl) countEl.textContent = `（已选 ${selectedCount} / ${filteredProblems.size} 题）`;

    if (records.length === 0) {
      el.innerHTML = '<span style="color:#b91c1c;">没有符合条件的记录</span>';
    } else {
      const correct = records.filter(r => r.isCorrect).length;
      const wrong = records.length - correct;
      el.innerHTML = `共 <b>${records.length}</b> 条记录将被导出（✅ 对 ${correct} · ❌ 错 ${wrong}）`;
    }
  }

  /* ============ 顶部筛选变化 → 重新渲染题目列表 ============ */
  mask.querySelectorAll('input[name="exportRange"], #exportCorrect, #exportWrong, #exportBank, #exportCustom').forEach(inp => {
    inp.addEventListener('change', () => {
      // ⭐ 新出现的题目默认勾选
      const filtered = getFilteredByTopFilters();
      const filteredProblems = new Set(filtered.map(r => r.problemText));
      filteredProblems.forEach(t => {
        if (!selectedProblems.has(t)) {
          // 只有从未在本弹窗出现过（通过 _touched 标记），才默认勾选
          // 简单做法：全部默认勾选
          selectedProblems.add(t);
        }
      });

      // ⭐ 移除已不在筛选结果里的题目
      [...selectedProblems].forEach(t => {
        if (!filteredProblems.has(t)) selectedProblems.delete(t);
      });

      renderProblemList();
      updatePreview();
    });
  });

  /* ============ 工具栏：全选/全不选/反选 ============ */
  mask.querySelectorAll('.exp-tool').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const filtered = getFilteredByTopFilters();
      const filteredProblems = new Set(filtered.map(r => r.problemText));

      if (action === 'all') {
        filteredProblems.forEach(t => selectedProblems.add(t));
      } else if (action === 'none') {
        filteredProblems.forEach(t => selectedProblems.delete(t));
      } else if (action === 'invert') {
        filteredProblems.forEach(t => {
          if (selectedProblems.has(t)) selectedProblems.delete(t);
          else selectedProblems.add(t);
        });
      }
      renderProblemList();
      updatePreview();
    });
  });

  /* ============ 取消 ============ */
  document.getElementById('exportCancel').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', e => {
    if (e.target === mask) mask.remove();
  });

  /* ============ 导出 JSON ============ */
  document.getElementById('exportJson').addEventListener('click', () => {
    const records = getExportRecords();
    if (records.length === 0) {
      alert('没有符合条件的记录');
      return;
    }
    const name = (typeof getStudentName === 'function' && getStudentName()) || '未命名';
    const data = {
      student: name,
      exportAt: new Date().toISOString(),
      exportAtLocal: new Date().toLocaleString('zh-CN'),
      filter: {
        range: mask.querySelector('input[name="exportRange"]:checked').value,
        includeCorrect: document.getElementById('exportCorrect').checked,
        includeWrong: document.getElementById('exportWrong').checked,
        includeBank: document.getElementById('exportBank').checked,
        includeCustom: document.getElementById('exportCustom').checked,
        selectedProblemsCount: selectedProblems.size,
      },
      totalRecords: records.length,
      correctCount: records.filter(r => r.isCorrect).length,
      wrongCount: records.filter(r => !r.isCorrect).length,
      records,
    };

    downloadBlob(
      JSON.stringify(data, null, 2),
      `做题记录_${name}_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.json`,
      'application/json'
    );
    mask.remove();
    showToast(`✅ 已导出 ${records.length} 条记录`, 'success');
  });

  /* ============ 导出 HTML ============ */
  document.getElementById('exportHtml').addEventListener('click', () => {
    const records = getExportRecords();
    if (records.length === 0) {
      alert('没有符合条件的记录');
      return;
    }
    const name = (typeof getStudentName === 'function' && getStudentName()) || '未命名';
    const html = buildExportHtml(records, name);
    downloadBlob(
      html,
      `做题记录_${name}_${new Date().toISOString().slice(0, 10)}.html`,
      'text/html'
    );
    mask.remove();
    showToast(`✅ 已导出 ${records.length} 条记录（HTML）`, 'success');
  });

  /* ============ 初始化 ============ */
  renderProblemList();
  updatePreview();
}

/* ============ 导出 HTML（可阅读性强 + 打印支持） ============ */
function buildExportHtml(records, studentName) {
  const correct = records.filter(r => r.isCorrect).length;
  const wrong = records.length - correct;
  const rate = records.length ? Math.round(correct / records.length * 100) : 0;
  const now = new Date();

  // 转义
  const esc = s => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // 卡片
  const cardsHtml = records.map((r, idx) => {
    const d = new Date(r.timestamp);
    const timeStr = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

    const stepsHtml = (r.studentSteps || []).length
      ? r.studentSteps.map((s, i) => `
          <div class="step">
            <span class="step-no">第 ${i+1} 步</span>
            ${s.rel ? `<div><b>关系式：</b>${esc(s.rel)}</div>` : ''}
            ${s.sub ? `<div><b>代入：</b>${esc(s.sub)}</div>` : ''}
            ${s.res ? `<div><b>得数：</b>${esc(s.res)}</div>` : ''}
          </div>
        `).join('')
      : '<div class="empty">未填写步骤</div>';

    // AI 反馈
    let feedbackHtml = '';
    if (r.aiFeedback) {
      const fb = r.aiFeedback;
      const stdSteps = (fb.steps || []).map(s => `
        <div class="step">
          <span class="step-no">第 ${s.step} 步</span>
          ${s.relation ? `<div><b>关系式：</b>${esc(s.relation)}</div>` : ''}
          ${s.substitution ? `<div><b>代入：</b>${esc(s.substitution)}</div>` : ''}
          ${s.result ? `<div><b>得数：</b>${esc(s.result)}</div>` : ''}
        </div>
      `).join('');
      const comment = (fb.judgement && fb.judgement.step_count_comment)
        ? `<div class="comment"><b>📐 步数评价：</b>${esc(fb.judgement.step_count_comment)}</div>` : '';
      const hint = fb.hint ? `<div class="hint"><b>💡 提示：</b>${esc(fb.hint)}</div>` : '';
      feedbackHtml = `
        <details class="fold">
          <summary>📖 标准解法（点击展开）</summary>
          <div class="fold-body">
            ${comment}
            ${stdSteps || '<div class="empty">暂无标准步骤</div>'}
            <div class="answer-box">✅ 最终答案：${esc(fb.answer?.full || r.correctAnswer || '—')}</div>
            ${hint}
          </div>
        </details>
      `;
    } else {
      feedbackHtml = `
        <details class="fold">
          <summary>📖 参考答案（点击展开）</summary>
          <div class="fold-body">
            <div class="answer-box">✅ ${esc(r.correctAnswer || '—')}</div>
          </div>
        </details>
      `;
    }

    return `
      <div class="record ${r.isCorrect ? 'correct' : 'wrong'}">
        <div class="record-hd">
          <span class="badge ${r.isCorrect ? 'badge-ok' : 'badge-no'}">${r.isCorrect ? '✓ 对' : '✗ 错'}</span>
          <span class="record-idx">#${idx + 1}</span>
          <span class="record-time">${timeStr}</span>
          ${r.problemSource ? `<span class="record-src">${esc(r.problemSource)}</span>` : ''}
        </div>
        <div class="record-title">题目</div>
        <div class="record-text">${esc(r.problemText)}</div>

        <div class="record-title">我的解答</div>
        <div class="steps">${stepsHtml}</div>
        <div class="my-answer">我的答案：<b>${esc(r.studentAnswer || '（空）')}</b></div>

        ${feedbackHtml}
      </div>
    `;
  }).join('');

  // 完整 HTML
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>做题记录 · ${esc(studentName)} · ${now.toLocaleDateString('zh-CN')}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  background: #eef3f9;
  color: #1e293b;
  padding: 20px;
  line-height: 1.7;
}
.container {
  max-width: 800px;
  margin: 0 auto;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 6px 24px rgba(15, 23, 42, .08);
  padding: 24px 28px 32px;
}
h1 {
  font-size: 22px;
  font-weight: 800;
  color: #2563eb;
  margin-bottom: 8px;
  text-align: center;
}
.sub {
  text-align: center;
  color: #64748b;
  font-size: 13px;
  margin-bottom: 20px;
}
.stats {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 24px;
  padding: 16px;
  background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
  border-radius: 12px;
}
.stat {
  text-align: center;
  padding: 0 16px;
}
.stat-label { font-size: 12px; color: #64748b; margin-bottom: 2px; }
.stat-value { font-size: 22px; font-weight: 800; color: #2563eb; font-family: ui-monospace, monospace; }
.record {
  background: #f8fafc;
  border-radius: 12px;
  padding: 16px 18px;
  margin-bottom: 16px;
  border-left: 5px solid;
}
.record.correct { border-left-color: #10b981; }
.record.wrong { border-left-color: #ef4444; }
.record-hd {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  font-size: 12px;
}
.badge {
  padding: 3px 10px;
  border-radius: 6px;
  font-weight: 800;
  font-size: 12px;
  color: #fff;
}
.badge-ok { background: #10b981; }
.badge-no { background: #ef4444; }
.record-idx { color: #94a3b8; font-family: ui-monospace, monospace; font-weight: 700; }
.record-time { color: #64748b; font-family: ui-monospace, monospace; }
.record-src {
  background: #e0e7ff;
  color: #3730a3;
  padding: 2px 8px;
  border-radius: 5px;
  font-weight: 700;
  margin-left: auto;
}
.record-title {
  font-size: 12px;
  font-weight: 800;
  color: #2563eb;
  margin: 14px 0 6px;
  padding-left: 8px;
  border-left: 3px solid #2563eb;
}
.record-text {
  background: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14.5px;
  line-height: 1.8;
  color: #334155;
  margin-bottom: 8px;
}
.steps { display: flex; flex-direction: column; gap: 6px; }
.step {
  background: #fff;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13.5px;
  line-height: 1.7;
  color: #334155;
}
.step-no {
  display: inline-block;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 5px;
  margin-right: 6px;
}
.step b { color: #64748b; font-weight: 700; }
.empty { color: #94a3b8; font-size: 13px; font-style: italic; padding: 8px 0; }
.my-answer {
  margin-top: 10px;
  padding: 10px 14px;
  background: #fffbeb;
  border-radius: 8px;
  font-size: 14px;
  color: #b45309;
}
.my-answer b { font-size: 16px; }
.fold {
  margin-top: 12px;
  background: #f0f9ff;
  border-radius: 10px;
  overflow: hidden;
}
.fold summary {
  padding: 10px 16px;
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 800;
  color: #2563eb;
  background: #e0f2fe;
  user-select: none;
}
.fold summary:hover { background: #bae6fd; }
.fold-body { padding: 12px 16px; }
.fold-body .step {
  background: #fff;
  border-left: 3px solid #3b82f6;
  margin-bottom: 8px;
}
.comment {
  background: #e0e7ff;
  color: #3730a3;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 10px;
  line-height: 1.7;
}
.hint {
  background: #fef3c7;
  color: #92400e;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  margin-top: 10px;
  line-height: 1.7;
}
.answer-box {
  background: #dcfce7;
  color: #15803d;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 800;
  text-align: center;
  margin-top: 10px;
}
.footer {
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px dashed #e2e8f0;
}

/* ⭐ 打印按钮 */
.print-bar {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 100;
}
.print-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(59, 130, 246, .35);
  transition: all .15s;
}
.print-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, .45);
}
.print-btn:active {
  transform: translateY(0);
}

/* ⭐ 打印样式 */
@media print {
  body { background: #fff; padding: 0; }
  .container {
    box-shadow: none;
    border-radius: 0;
    padding: 10px;
    max-width: 100%;
  }
  .print-bar { display: none !important; }
  .record {
    page-break-inside: avoid;
    break-inside: avoid;
    border: 1px solid #e2e8f0;
    border-left-width: 5px;
    margin-bottom: 12px;
  }
  .fold {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .fold > summary { display: none; }
  .fold-body { display: block !important; }
  details > summary { list-style: none; }
  details > summary::-webkit-details-marker { display: none; }
  details > summary::before { content: ''; }
  details { page-break-inside: avoid; }
  /* 强制展开 details */
  details:not([open]) > *:not(summary) { display: block !important; }
  .stats { background: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .badge, .record-src, .answer-box, .comment, .hint, .my-answer, .step-no {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page {
    margin: 12mm;
  }
}

.home-tasks {
  background: #fff;
  border: 2px solid #e5e7eb;
  border-radius: 16px;
  padding: 16px 18px;
  margin-bottom: 20px;
}
.home-tasks-hd {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 15px; font-weight: 800; color: #1e293b;
  margin-bottom: 12px;
}
.home-tasks-count {
  font-size: 13px; font-weight: 700; color: #2563eb;
  background: #eff6ff; padding: 3px 10px; border-radius: 8px;
}
.home-tasks-list { display: flex; flex-direction: column; gap: 8px; }
.home-task {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  background: #f8fafc;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  transition: all .15s;
}
.home-task:hover { border-color: #c7d5e6; background: #fff; }
.home-task.done { background: #f0fdf4; border-color: #86efac; }
.home-task-icon { font-size: 24px; flex-shrink: 0; }
.home-task-body { flex: 1; min-width: 0; }
.home-task-title { font-size: 14px; font-weight: 800; color: #1e293b; }
.home-task.done .home-task-title { color: #15803d; }
.home-task-desc { font-size: 12px; color: #64748b; margin: 2px 0 6px; }
.home-task-progress { height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden; }
.home-task-progress span { display: block; height: 100%; background: #2563eb; border-radius: 2px; transition: width .4s; }
.home-task.done .home-task-progress span { background: #10b981; }
.home-task-arrow { font-size: 18px; color: #94a3b8; flex-shrink: 0; font-weight: 700; }
.home-task.done .home-task-arrow { color: #10b981; }

.weekly-summary-wrap {
  max-width: 1200px;
  margin: 16px auto 0;
  padding: 0 16px;
}
.weekly-summary {
  background: linear-gradient(135deg, #f5f3ff, #ede9fe);
  border: 2px solid #c4b5fd;
  border-radius: 16px;
  padding: 18px 20px;
}
.weekly-summary-hd {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 15px; font-weight: 800; color: #5b21b6;
  margin-bottom: 14px;
}
.weekly-summary-range { font-size: 11.5px; color: #7c3aed; font-weight: 600; }
.weekly-summary-stats {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
  margin-bottom: 14px;
}
.weekly-stat {
  background: #fff; border-radius: 10px; padding: 10px;
  text-align: center;
}
.weekly-stat-value {
  font-size: 22px; font-weight: 800; font-family: ui-monospace, monospace;
  color: #7c3aed;
}
.weekly-stat-label { font-size: 11.5px; color: #64748b; font-weight: 600; margin-top: 2px; }
.weekly-summary-section { margin-bottom: 12px; }
.weekly-summary-section-title {
  font-size: 12.5px; font-weight: 800; color: #6d28d9;
  margin-bottom: 6px;
}
.weekly-summary-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.weekly-summary-tag {
  background: #fff; border: 1.5px solid #ddd6fe;
  padding: 4px 10px; border-radius: 999px;
  font-size: 12px; font-weight: 700; color: #5b21b6;
}
.weekly-summary-tip {
  background: #fff; border-radius: 10px; padding: 10px 14px;
  font-size: 13px; color: #5b21b6; line-height: 1.7;
}
.weekly-summary-tip b { color: #7c3aed; }
.weekly-summary-actions {
  display: flex; gap: 8px; margin-top: 14px;
}
.weekly-summary-actions button {
  flex: 1; padding: 10px; border-radius: 10px; font-size: 13.5px;
  font-weight: 700; font-family: inherit; cursor: pointer; border: none;
}
#weeklyExportBtn { background: #fff; color: #6d28d9; border: 2px solid #ddd6fe; }
#weeklyGoWrongBtn { background: #7c3aed; color: #fff; box-shadow: 0 3px 0 #6d28d9; }

@media (max-width: 600px) {
  .weekly-summary-stats { grid-template-columns: repeat(2, 1fr); }
}

</style>
</head>
<body>

<!-- ⭐ 打印按钮 -->
<div class="print-bar">
  <button class="print-btn" onclick="window.print()">
    🖨️ 打印 / 保存 PDF
  </button>
</div>

<div class="container">
  <h1>📚 ${esc(studentName)} 的做题记录</h1>
  <div class="sub">导出时间：${now.toLocaleString('zh-CN')}</div>

  <div class="stats">
    <div class="stat">
      <div class="stat-label">总记录</div>
      <div class="stat-value">${records.length}</div>
    </div>
    <div class="stat">
      <div class="stat-label">做对</div>
      <div class="stat-value" style="color:#10b981;">${correct}</div>
    </div>
    <div class="stat">
      <div class="stat-label">做错</div>
      <div class="stat-value" style="color:#ef4444;">${wrong}</div>
    </div>
    <div class="stat">
      <div class="stat-label">正确率</div>
      <div class="stat-value">${rate}%</div>
    </div>
  </div>

  ${cardsHtml}

  <div class="footer">
    📖 由"三年级数学互动课堂"导出 · 点"🖨️ 打印 / 保存 PDF"可打印
  </div>
</div>

<script>
/* ⭐ 打印前自动展开所有折叠面板 */
window.addEventListener('beforeprint', () => {
  document.querySelectorAll('details').forEach(d => {
    d.dataset._wasOpen = d.open ? '1' : '0';
    d.open = true;
  });
});
window.addEventListener('afterprint', () => {
  document.querySelectorAll('details').forEach(d => {
    if (d.dataset._wasOpen === '0') d.open = false;
  });
});
<\/script>     // ⭐ 用 <\/script> 代替
</body>
</html>`;
}

function historyRender() {
  const listEl = document.getElementById('historyList');
  const countEl = document.getElementById('historyCount');
  if (!listEl) return;

  const list = historyLoad();

  // ⭐ 按题目文本聚合
  const groups = {};   // { text: [records...] }
  list.forEach(r => {
    if (!groups[r.problemText]) groups[r.problemText] = [];
    groups[r.problemText].push(r);
  });

  // 转数组，按最近一次时间倒序
  const groupArr = Object.keys(groups).map(text => {
    const records = groups[text].sort((a, b) => b.timestamp - a.timestamp);
    const correctCount = records.filter(r => r.isCorrect).length;
    const wrongCount = records.length - correctCount;
    const latest = records[0];
    return {
      text,
      records,
      correctCount,
      wrongCount,
      total: records.length,
      latestTime: latest.timestamp,
      latestIsCorrect: latest.isCorrect,
    };
  }).sort((a, b) => b.latestTime - a.latestTime);

  if (countEl) countEl.textContent = `共 ${groupArr.length} 道题 / ${list.length} 次记录`;

  if (!groupArr.length) {
    listEl.innerHTML = '<div class="history-empty">还没有做题记录，做完一道题会自动保存 📝</div>';
    return;
  }

  listEl.innerHTML = groupArr.map((g, gIdx) => {
    const dLatest = new Date(g.latestTime);
    const latestTimeStr = `${dLatest.getMonth() + 1}/${dLatest.getDate()} ${String(dLatest.getHours()).padStart(2, '0')}:${String(dLatest.getMinutes()).padStart(2, '0')}`;

    // 汇总头部的状态图标
    let statusIcon, statusCls;
    if (g.correctCount === 0) {
      statusIcon = '✗'; statusCls = 'wrong';
    } else if (g.wrongCount === 0) {
      statusIcon = '✓'; statusCls = 'correct';
    } else {
      statusIcon = '◐'; statusCls = 'mixed';
    }

    // 汇总统计
    const statsHtml = `
      <span style="display:inline-block;padding:1px 8px;background:#dcfce7;color:#15803d;border-radius:5px;font-size:11px;font-weight:700;margin-right:4px;">对 ${g.correctCount} 次</span>
      <span style="display:inline-block;padding:1px 8px;background:#fee2e2;color:#b91c1c;border-radius:5px;font-size:11px;font-weight:700;">错 ${g.wrongCount} 次</span>
    `;

    // 每条历史记录
    const recordsHtml = g.records.map((r, rIdx) => {
      const d = new Date(r.timestamp);
      const timeStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

      // 学生步骤
      const stepsHtml = (r.studentSteps || []).length
        ? r.studentSteps.map((s, i) => `
            <div class="history-step">
              <span class="history-step-num">第 ${i + 1} 步</span>
              <span class="history-step-content">
                ${s.rel ? `<span class="field"><b>关系式：</b>${escapeHtmlStrict(s.rel)}</span>` : ''}
                ${s.sub ? `<span class="field"><b>代入：</b>${escapeHtmlStrict(s.sub)}</span>` : ''}
                ${s.res ? `<span class="field"><b>得数：</b>${escapeHtmlStrict(s.res)}</span>` : ''}
              </span>
            </div>
          `).join('')
        : '<div style="color:#94a3b8;font-size:13px;font-style:italic;">未填写步骤</div>';

      // 答案讲解
      const fb = r.aiFeedback;
      let explainHtml = '';
      if (fb) {
        const stdStepsHtml = (fb.steps || []).map(s => `
          <div class="history-explain-step">
            <b>第 ${s.step} 步：</b>
            ${s.relation ? `<div><b>关系式：</b>${escapeHtmlStrict(s.relation)}</div>` : ''}
            ${s.substitution ? `<div><b>代入：</b>${escapeHtmlStrict(s.substitution)}</div>` : ''}
            ${s.result ? `<div><b>得数：</b>${escapeHtmlStrict(s.result)}</div>` : ''}
          </div>
        `).join('');

        // ⭐ 4 类 AI 反馈
        const insight = buildAiInsightHtml(fb, { open: false });

        const commentHtml = (fb.judgement && fb.judgement.step_count_comment)
          ? `<div class="history-explain-comment"><b>📐 步数评价：</b>${escapeHtmlStrict(fb.judgement.step_count_comment)}</div>`
          : '';
        const hintHtml = fb.hint
          ? `<div class="history-explain-hint"><b>💡 提示：</b>${escapeHtmlStrict(fb.hint)}</div>`
          : '';

        // ⭐ 把 4 类反馈包进"答案讲解"折叠里
        explainHtml = `
          <div class="history-explain-fold">
            <div class="history-explain-hd">
              <span>📖 答案讲解（点击展开）</span>
              <span class="arrow">▶</span>
            </div>
            <div class="history-explain-bd">
              ${commentHtml}
              <!-- ⭐ 4 类 AI 反馈 -->
              ${insight.strengthsHtml}
              ${insight.gapsHtml}
              ${insight.judgementHtml}
              ${insight.walkHtml}
              ${stdStepsHtml || '<div style="color:#94a3b8;font-size:13px;">暂无标准步骤</div>'}
              <div class="history-explain-answer">✅ ${escapeHtmlStrict(fb.answer?.full || r.correctAnswer || '—')}</div>
              ${hintHtml}
            </div>
          </div>
        `;
      } else {
        explainHtml = `
          <div class="history-explain-fold">
            <div class="history-explain-hd">
              <span>📖 答案讲解（点击展开）</span>
              <span class="arrow">▶</span>
            </div>
            <div class="history-explain-bd">
              <div class="history-explain-answer">✅ ${escapeHtmlStrict(r.correctAnswer || '—')}</div>
            </div>
          </div>
        `;
      }

      const rStatusIcon = r.isCorrect ? '✓' : '✗';
      const rStatusCls = r.isCorrect ? 'correct' : 'wrong';

      return `
        <div class="history-item ${rStatusCls}" data-id="${r.id}" style="margin-left:16px;margin-top:10px;">
          <div class="history-hd">
            <span class="history-status">${rStatusIcon}</span>
            <div class="history-problem" style="font-size:13px;color:#64748b;font-weight:600;">第 ${g.records.length - rIdx} 次 · ${timeStr}</div>
            <div class="history-meta">${r.problemSource || ''}</div>
            <span class="history-arrow">▶</span>
          </div>
          <div class="history-bd">
            <div class="history-section">
              <div class="history-section-title">✏️ 我的解题过程</div>
              <div class="history-steps">${stepsHtml}</div>
              <div class="history-answer-line">我的答案：${escapeHtmlStrict(r.studentAnswer || '（空）')}</div>
            </div>
            ${explainHtml}
            <button class="history-remove" data-remove-id="${r.id}">🗑 删除这条记录</button>
          </div>
        </div>
      `;
    }).join('');

    // 分组容器
    return `
      <div class="history-group" data-group-idx="${gIdx}">
        <!-- 汇总头部 -->
        <div class="history-group-hd" style="
          background: #f8fafc;
          border: 2px solid var(--border);
          border-left: 4px solid ${statusIcon === '✓' ? 'var(--green)' : statusIcon === '✗' ? 'var(--red)' : '#f59e0b'};
          border-radius: 12px;
          padding: 12px 16px;
          margin-bottom: 4px;
          cursor: pointer;
        ">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            <span style="
              width:24px;height:24px;border-radius:50%;
              background:${statusIcon === '✓' ? 'var(--green)' : statusIcon === '✗' ? 'var(--red)' : '#f59e0b'};
              color:#fff;font-size:13px;font-weight:800;
              display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;
            ">${statusIcon}</span>
            <div style="flex:1;font-size:14.5px;line-height:1.6;color:#334155;font-weight:700;">
              ${escapeHtmlStrict(g.text)}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-left:34px;">
            <span style="background:#e0e7ff;color:#3730a3;padding:2px 10px;border-radius:6px;font-size:11.5px;font-weight:700;">
              共 ${g.total} 次
            </span>
            ${statsHtml}
            <span style="font-size:11.5px;color:#94a3b8;margin-left:auto;">
              最近：${latestTimeStr}
            </span>
            <span class="history-group-arrow" style="font-size:12px;color:#94a3b8;transition:transform .22s;">▶</span>
          </div>
        </div>
        <!-- 历史记录列表（默认折叠） -->
        <div class="history-group-bd" style="display:none;padding:0 4px 12px;">
          ${recordsHtml}
        </div>
      </div>
    `;
  }).join('');
  // ⭐ 刷新成长卡片统计
  if (typeof window._refreshGrowthCards === 'function') {
    setTimeout(window._refreshGrowthCards, 50);
  }
}

/* 事件委托（一次性绑定） */
(function initHistoryDelegation() {
  const listEl = document.getElementById('historyList');
  if (!listEl) return;

  listEl.addEventListener('click', e => {
    // 删除按钮
    const removeBtn = e.target.closest('.history-remove');
    if (removeBtn) {
      e.stopPropagation();
      const id = removeBtn.dataset.removeId;
      if (id) historyRemove(id);
      return;
    }

    // ⭐ 通用 std-fold 折叠（用于做题记录里的 4 类反馈）
    const stdFoldHd = e.target.closest('.std-fold-hd');
    if (stdFoldHd && listEl.contains(stdFoldHd)) {
      e.stopPropagation();
      stdFoldHd.parentElement.classList.toggle('open');
      return;
    }

    // 答案讲解折叠
    const explainHd = e.target.closest('.history-explain-hd');
    if (explainHd) {
      e.stopPropagation();
      const fold = explainHd.parentElement;
      const willOpen = !fold.classList.contains('open');
      fold.classList.toggle('open');

      // 展开后确保答案部分可见
      if (willOpen) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            const answerEl = fold.querySelector('.history-explain-answer');
            if (answerEl) {
              answerEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }, 50);
        });
      }
      return;
    }

    // ⭐ 分组头部折叠
    const groupHd = e.target.closest('.history-group-hd');
    if (groupHd) {
      const group = groupHd.parentElement;
      const bd = group.querySelector('.history-group-bd');
      const arrow = groupHd.querySelector('.history-group-arrow');
      const willOpen = bd.style.display === 'none';
      bd.style.display = willOpen ? 'block' : 'none';
      if (arrow) arrow.style.transform = willOpen ? 'rotate(90deg)' : '';
      return;
    }

    // 整条记录折叠
    const hd = e.target.closest('.history-hd');
    if (hd) {
      const item = hd.parentElement;
      const willOpen = !item.classList.contains('open');
      item.classList.toggle('open');

      // ⭐ 展开后，延迟一帧，把记录滚动到可视区顶部
      if (willOpen) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            item.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 50);
        });
      }
      return;
    }
  });

  // 清空按钮
  document.getElementById('historyClear')?.addEventListener('click', historyClear);
  // ⭐ 导出按钮
  document.getElementById('historyExport')?.addEventListener('click', historyExport);
})();

(function patchHistoryCount() {
  if (typeof historyRender !== 'function') return;
  const orig = historyRender;
  window.historyRender = function () {
    orig.apply(this, arguments);
    try {
      const list = historyLoad();
      const texts = new Set(list.map(r => r.problemText));
      const cntEl = document.getElementById('historyCount');
      if (cntEl) cntEl.textContent = `共 ${texts.size} 道 / ${list.length} 次`;
      // 顺便刷新一题一得条数
      if (window._refreshTakeawayCount) window._refreshTakeawayCount();
    } catch (e) {}
  };
  historyRender();
})();

/* ============ 错题本 · 逐题讲解（调用大模型） ============ */
/* ============ 错题本 · 逐题讲解（弹窗 + 防抖） ============ */
let _explainBusy = false;         // 防抖锁
let _explainTimer = null;         // 计时器

function showExplainModal() {
  document.getElementById('explainModalMask').style.display = 'flex';
}

function hideExplainModal() {
  document.getElementById('explainModalMask').style.display = 'none';
  const body = document.getElementById('explainModalBody');
  body.innerHTML = '';
  body.classList.remove('scrollable');   // ⭐ 清掉渐隐
  if (_explainTimer) { clearInterval(_explainTimer); _explainTimer = null; }
}

/* 显示弹窗内的加载动画 */
function showExplainLoading() {
  const body = document.getElementById('explainModalBody');
  body.innerHTML = `
    <div class="ai-thinking">
      <span class="dots"><span></span><span></span><span></span></span>
      <div>
        <div class="think-text">🤖 AI 正在思考…</div>
        <div class="think-sub">正在分析这道题的解法</div>
      </div>
      <span class="think-time" id="explainTime">0.0s</span>
    </div>
  `;
  const start = performance.now();
  const timeEl = document.getElementById('explainTime');
  if (_explainTimer) clearInterval(_explainTimer);
  _explainTimer = setInterval(() => {
    if (timeEl) timeEl.textContent = ((performance.now() - start) / 1000).toFixed(1) + 's';
  }, 100);
}

/* 渲染讲解结果到弹窗 */
function renderExplainResult(result) {
  const body = document.getElementById('explainModalBody');
  if (!body) return;

  // ⭐ Koji 的提问开头
  const kojiIntro = result.problem_understanding
    ? `💡 Koji 想跟你说：先想想——${escapeHtmlStrict(result.problem_understanding)}`
    : `💡 Koji 想跟你说：我们一步一步来看看这道题。`;

  const introHtml = `
    <div class="koji-intro">
      <span class="koji-intro-emoji">🤖</span>
      <span>${kojiIntro}</span>
    </div>
  `;

  /* -------- 题目 -------- */
  const problemHtml = `
    <div style="margin-bottom:16px;">
      <div style="font-size:13px;color:#64748b;margin-bottom:8px;">题目：</div>
      <div style="font-size:15px;line-height:1.7;color:#334155;background:#f8fafc;padding:12px 16px;border-radius:10px;">
        ${escapeHtmlStrict(result._problemText || '')}
      </div>
    </div>
  `;

  /* -------- 题意理解 -------- */
  const understandingHtml = result.problem_understanding ? `
    <div class="std-fold open" style="margin-bottom:12px;">
      <div class="std-fold-hd"><span>📝 题意理解</span><span class="arrow">▶</span></div>
      <div class="std-fold-bd">
        <div class="std-line">${escapeHtmlStrict(result.problem_understanding)}</div>
      </div>
    </div>
  ` : '';

  /* -------- ⭐ 4 类 AI 反馈（共用）-------- */
  const insight = buildAiInsightHtml(result, { open: true });

  /* -------- 标准步骤 -------- */
  const stepsHtml = (result.steps || []).map(s => `
    <div class="std-fold">
      <div class="std-fold-hd"><span>第 ${s.step} 步</span><span class="arrow">▶</span></div>
      <div class="std-fold-bd">
        <div class="std-line"><b>关系式：</b>${escapeHtmlStrict(s.relation)}</div>
        <div class="std-line"><b>代入：</b>${escapeHtmlStrict(s.substitution)}</div>
        <div class="std-line"><b>得数：</b>${escapeHtmlStrict(s.result)}</div>
      </div>
    </div>
  `).join('');

  /* -------- 最终答案 -------- */
  const answerHtml = `
    <div class="std-fold" style="margin-top:12px;">
      <div class="std-fold-hd"><span>✅ 最终答案</span><span class="arrow">▶</span></div>
      <div class="std-fold-bd">
        <div class="std-answer">${escapeHtmlStrict(result.answer?.full || '—')}</div>
      </div>
    </div>
  `;

  /* -------- 提示 -------- */
  const hintHtml = result.hint ? `
    <div class="std-fold open" style="margin-bottom:12px;">
      <div class="std-fold-hd"><span>💡 提示</span><span class="arrow">▶</span></div>
      <div class="std-fold-bd">
        <div class="std-keywords" style="background:#fef3c7;color:#92400e;margin-top:0;">
          ${escapeHtmlStrict(result.hint)}
        </div>
      </div>
    </div>
  ` : '';

  /* -------- 组装 -------- */
  body.innerHTML = `
    ${introHtml}
    ${problemHtml}
    ${understandingHtml}
    ${insight.strengthsHtml}
    ${insight.gapsHtml}
    ${insight.judgementHtml}
    ${insight.walkHtml}
    ${stepsHtml}
    ${answerHtml}
    ${hintHtml}
  `;

  body.querySelectorAll('.std-fold-hd').forEach(hd => {
    hd.addEventListener('click', () => hd.parentElement.classList.toggle('open'));
  });

  // ⭐ 内容高度超出时，底部加渐隐提示
  requestAnimationFrame(() => {
    const isScrollable = body.scrollHeight > body.clientHeight + 20;
    body.classList.toggle('scrollable', isScrollable);
  });
}

/* 讲解主流程 */
async function explainWrongItem(record) {
  // ⭐ 优先读缓存
  if (record.aiFeedback && record.aiFeedback.answer) {
    showExplainModal();
    const cached = JSON.parse(JSON.stringify(record.aiFeedback));  // 深拷贝
    cached._problemText = record.text;
    renderExplainResult(cached);
    return;
  }

  if (!LLM_CONFIG.enabled) {
    alert('请先启用大模型');
    return;
  }

  // ✅ 内部统一管理 _explainBusy，避免外部漏置位
  if (_explainBusy) return;
  _explainBusy = true;

  showExplainModal();
  showExplainLoading();

  try {
    const raw = await callLLM({
      problem: record.text,
      studentAnswer: record.studentAnswer,
      steps: record.studentSteps || []
    });

    // ✅ 统一结构
    const result = normalizeAiFeedback(raw, null);
    result._source = 'llm';
    result._problemText = record.text;

    // 缓存回写：错题本 + 历史记录都写
    try {
      // ① 错题本
      const wbList = wbLoad();
      const wbIdx = wbList.findIndex(r => r.text === record.text);
      if (wbIdx >= 0) {
        wbList[wbIdx].aiFeedback = result;
        wbSave(wbList);
      }

      // ⭐ ② 历史记录：把最近一条同题记录的 aiFeedback 补上
      const hist = historyLoad();
      const hIdx = hist.findIndex(r => (r.problemText || '').trim() === record.text.trim());
      if (hIdx >= 0) {
        hist[hIdx].aiFeedback = result;
        historySave(hist);
      } else {
        // 历史里也没有 → 新建一条"仅讲解"的记录
        historyAdd({
          problemText: record.text,
          problemSource: 'koji',
          moduleId: (document.querySelector('#modulePool .module.active') || {}).id || 'koji',
          studentSteps: [],
          studentAnswer: '',
          isCorrect: false,
          correctAnswer: result.answer?.full || '',
          aiFeedback: result,
        });
      }
    } catch (e) { console.warn('[缓存回写失败]', e); }

    if (_explainTimer) { clearInterval(_explainTimer); _explainTimer = null; }
    renderExplainResult(result);
  } catch (e) {
    if (_explainTimer) { clearInterval(_explainTimer); _explainTimer = null; }
    document.getElementById('explainModalBody').innerHTML = `
      <div style="text-align:center;padding:30px 20px;color:#b91c1c;">
        ❌ 讲解失败：${e.message}
      </div>
    `;
  } finally {
    _explainBusy = false;
  }
}

/* 弹窗关闭按钮 */
document.getElementById('explainModalClose').addEventListener('click', () => {
  if (_explainBusy) return;   // 加载中不允许关闭
  hideExplainModal();
});

document.getElementById('explainModalMask').addEventListener('click', e => {
  if (e.target.id === 'explainModalMask' && !_explainBusy) {
    hideExplainModal();
  }
});

/* ============ 错题本 · 重做 ============ */
function wbRedo(text) {
  const list = wbLoad();
  const rec = list.find(r => r.text === text);
  if (!rec) return;

  const mid = rec.moduleId || 'm13';

  // 关抽屉
  document.getElementById('wrongBookDrawer').classList.remove('open');
  document.getElementById('wrongBookMask').classList.remove('open');
  lockBodyScroll(false);

  // 跳 lesson 页 + 对应模块
  if (window.__shell?.navigate) {
    window.__shell.navigate('lesson', { lessonId: mid });
  }

  // 等一帧，让模块渲染完，再注入题目
  setTimeout(() => {
    if (mid === 'm1') {
      // M1：把题目文本塞进自定义输入框，触发载入
      const custom = document.getElementById('m1Custom');
      if (custom) {
        custom.value = text;
        document.getElementById('m1UseCustom')?.click();
      }
    } else if (mid === 'm9') {
      // M9：题目文本是 "a op b"，解析后填入
      const m = text.match(/^(\d+)\s*([+\-−×÷])\s*(\d+)$/);
      if (m) {
        document.getElementById('m9a').value = m[1];
        document.getElementById('m9op').value = m[2];
        document.getElementById('m9b').value = m[3];
        document.getElementById('m9reset')?.click();
      }
    } else {
      // m13 及兜底
      m13LoadProblem(text, null, 'custom', null);
      m13InitSteps();
    }
    showRedoBanner(text);
  }, 200);
}

/* ⭐ 顶部显示"正在重做错题"横幅 */
function showRedoBanner(text) {
  // 移除旧的
  document.getElementById('redoBanner')?.remove();

  const banner = document.createElement('div');
  banner.id = 'redoBanner';
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0;
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: #fff; padding: 10px 20px;
    font-size: 14px; font-weight: 700;
    text-align: center; z-index: 9999;
    box-shadow: 0 2px 12px rgba(0,0,0,.15);
  `;
  banner.innerHTML = `
    🔁 正在重做错题：如果做对，将累计"掌握进度"（连续做对 2 次自动从错题本移除）
    <button style="margin-left:16px;padding:2px 10px;border:none;border-radius:6px;background:rgba(255,255,255,.25);color:#fff;font-weight:700;cursor:pointer;" onclick="this.parentElement.remove()">×</button>
  `;
  document.body.appendChild(banner);
}

/* ============ 错题本 · 事件委托（一次性绑定） ============ */
(function initWrongBookDelegation() {
  const listEl = document.getElementById('wrongBookList');
  if (!listEl) return;

  listEl.addEventListener('click', e => {
    // 删除按钮
    const removeBtn = e.target.closest('.wrong-item-remove');
    if (removeBtn) {
      const text = decodeURIComponent(removeBtn.dataset.text);
      wbRemove(text);
      return;
    }

    // 讲解按钮
    const explainBtn = e.target.closest('.wrong-item-explain');
    if (explainBtn) {
      if (_explainBusy) return;
      if (explainBtn.disabled) return;

      const text = decodeURIComponent(explainBtn.dataset.text);
      const rec = wbLoad().find(r => r.text === text);
      if (!rec) return;

      // 全局置灰所有讲解按钮（含当前按钮转圈）
      const allBtns = listEl.querySelectorAll('.wrong-item-explain');
      allBtns.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '.4';
        btn.style.cursor = 'not-allowed';
      });
      const origText = explainBtn.textContent;
      explainBtn.innerHTML = '<span class="btn-spinner" style="border-color: rgba(37,99,235,.3); border-top-color: #2563eb;"></span>讲解中…';

      // 执行讲解（_explainBusy 由 explainWrongItem 内部管理）
      explainWrongItem(rec).finally(() => {
        allBtns.forEach(btn => {
          btn.disabled = false;
          btn.style.opacity = '';
          btn.style.cursor = '';
        });
        explainBtn.textContent = origText;
      });
      return;
    }

    // 重做按钮
    const redoBtn = e.target.closest('.wrong-item-redo');
    if (redoBtn) {
      const text = decodeURIComponent(redoBtn.dataset.text);
      wbRedo(text);
      return;
    }
  });
})();

/* ============ 学习看板 ============ */
function getStudyStreak() {
  // 从做题记录中提取所有"日期"（去重）
  const list = historyLoad();
  if (!list.length) return 0;

  const dates = new Set();
  list.forEach(r => {
    const d = new Date(r.timestamp);
    d.setHours(0, 0, 0, 0);
    dates.add(d.getTime());
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  let cur = today.getTime();

  // 从今天往前数
  while (dates.has(cur)) {
    streak++;
    cur -= 24 * 60 * 60 * 1000;
  }

  // 如果今天没记录，但昨天有，则从昨天开始数
  if (streak === 0) {
    let y = today.getTime() - 24 * 60 * 60 * 1000;
    while (dates.has(y)) {
      streak++;
      y -= 24 * 60 * 60 * 1000;
    }
  }

  return streak;
}

function renderDashboard() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // 今日做题
  const history = historyLoad();
  const todayList = history.filter(r => r.timestamp >= todayStart.getTime());
  const todayTotal = todayList.length;
  const todayCorrect = todayList.filter(r => r.isCorrect).length;
  const rate = todayTotal > 0 ? Math.round(todayCorrect / todayTotal * 100) : null;

  // 错题本数量
  const wrongCount = wbLoad().length;

  // 连续天数
  const streak = getStudyStreak();

  // 更新 UI
  const el1 = document.getElementById('dashToday');
  const el2 = document.getElementById('dashCorrect');
  const el3 = document.getElementById('dashRate');
  const el4 = document.getElementById('dashStreak');
  const el5 = document.getElementById('dashWrong');

  if (el1) el1.innerHTML = html`${todayTotal} <small>道</small>`;
  if (el2) el2.innerHTML = `${todayCorrect} <small>道</small>`;
  if (el3) el3.innerHTML = rate === null ? `— <small>%</small>` : `${rate} <small>%</small>`;
  if (el4) el4.innerHTML = `${streak} <small>天</small>`;
  if (el5) el5.innerHTML = `${wrongCount} <small>道</small>`;
}

/* ============================================================
   ⭐ 6. 学习看板：今日 / 本周 / 累计切换
   ============================================================ */
(function patchRangeTabs() {
  const tabs = document.querySelectorAll('#rangeTabs .range-tab');
  if (!tabs.length) return;

  let currentRange = 'today';

  tabs.forEach(t => {
    t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      currentRange = t.dataset.range;
      renderDashboard();
    });
  });

  // 覆盖 renderDashboard，按当前范围计算
  if (typeof renderDashboard === 'function') {
    const orig = renderDashboard;
    window.renderDashboard = function () {
      // 先调原函数（会写"今日"的数据，我们随后覆盖）
      orig.apply(this, arguments);

      try {
        const history = historyLoad();
        const now = Date.now();
        let start;
        if (currentRange === 'today') {
          const d = new Date(); d.setHours(0,0,0,0);
          start = d.getTime();
        } else if (currentRange === 'week') {
          start = now - 7 * 86400000;
        } else {
          start = 0;
        }
        const list = history.filter(r => r.timestamp >= start);
        const total = list.length;
        const correct = list.filter(r => r.isCorrect).length;
        const rate = total ? Math.round(correct / total * 100) : null;

        const el1 = document.getElementById('dashToday');
        const el2 = document.getElementById('dashCorrect');
        const el3 = document.getElementById('dashRate');
        const el1b = document.getElementById('dashToday2');
        const el2b = document.getElementById('dashCorrect2');
        const el3b = document.getElementById('dashRate2');

        if (el1) el1.innerHTML = `${total} <small>道</small>`;
        if (el2) el2.innerHTML = `${correct} <small>道</small>`;
        if (el3) el3.innerHTML = rate === null ? `— <small>%</small>` : `${rate} <small>%</small>`;
        if (el1b) el1b.innerHTML = `${total} <small>道</small>`;
        if (el2b) el2b.innerHTML = `${correct} <small>道</small>`;
        if (el3b) el3b.innerHTML = rate === null ? `— <small>%</small>` : `${rate} <small>%</small>`;
      } catch (e) {}
    };
  }
})();

/* ============================================================
   ⭐ 9. 今日完成鼓励条（今日 ≥ 5 道时弹出一次）
   ============================================================ */
(function patchDailyCheer() {
  // 每天弹一次
  const KEY = 'grade3_daily_cheer_date';
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (lsGet(KEY) === today) return;
  } catch (e) {}

  // 检查今日做题数
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayList = historyLoad().filter(r => r.timestamp >= todayStart.getTime());
  if (todayList.length < 5) return;

  try { lsSet(KEY, today); } catch (e) {}

  const cheer = document.createElement('div');
  cheer.className = 'daily-cheer';
  cheer.innerHTML = `
    <span>🎉 今天已经完成 <b>${todayList.length}</b> 道题，很棒！</span>
    <div class="daily-cheer-actions">
      <button class="daily-cheer-btn daily-cheer-rest" onclick="this.closest('.daily-cheer').remove()">休息一下</button>
      <button class="daily-cheer-btn daily-cheer-go">继续加油</button>
    </div>
  `;
  document.body.appendChild(cheer);

  cheer.querySelector('.daily-cheer-go').addEventListener('click', () => {
    cheer.remove();
    const tab = document.querySelector('.tab[data-target="m13"]');
    if (tab) tab.click();
  });

  // 15 秒后自动消失
  setTimeout(() => {
    if (cheer.parentElement) cheer.remove();
  }, 15000);
})();

/* ============================================================
   ⭐ 10. 做题记录：时间轴视图（可选切换）
   ============================================================ */
(function patchTimelineView() {
  const historySection = document.getElementById('historySection');
  if (!historySection) return;
  if (historySection.dataset._timelinePatched === '1') return;
  historySection.dataset._timelinePatched = '1';

  // 在折叠头加切换按钮
  const hd = historySection.querySelector('.collapsible-hd');
  if (hd && !hd.querySelector('.timeline-toggle')) {
    const btn = document.createElement('button');
    btn.className = 'timeline-toggle';
    btn.style.cssText = 'margin-left:8px;padding:4px 12px;border:1.5px solid var(--primary);border-radius:8px;background:#fff;color:var(--primary-d);font-size:11.5px;font-weight:700;font-family:inherit;cursor:pointer;';
    btn.textContent = '🕐 时间轴';
    hd.appendChild(btn);

    let isTimeline = false;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      isTimeline = !isTimeline;
      btn.textContent = isTimeline ? '📋 列表' : '🕐 时间轴';
      renderTimeline(isTimeline);
    });

    function renderTimeline(on) {
      const listEl = document.getElementById('historyList');
      if (!listEl) return;
      if (!on) {
        // 恢复列表（重新调 historyRender）
        if (typeof historyRender === 'function') historyRender();
        return;
      }
      // 时间轴
      const list = historyLoad();
      if (!list.length) {
        listEl.innerHTML = '<div class="history-empty">还没有做题记录 📝</div>';
        return;
      }
      // 按天分组
      const groups = {};
      list.forEach(r => {
        const d = new Date(r.timestamp);
        const day = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (!groups[day]) groups[day] = [];
        groups[day].push(r);
      });
      const days = Object.keys(groups).sort((a, b) => b.localeCompare(a));
      const today = new Date(); today.setHours(0,0,0,0);
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      const yest = new Date(today.getTime() - 86400000);
      const yestStr = `${yest.getFullYear()}-${String(yest.getMonth()+1).padStart(2,'0')}-${String(yest.getDate()).padStart(2,'0')}`;

      listEl.innerHTML = days.map(day => {
        const items = groups[day].sort((a, b) => b.timestamp - a.timestamp);
        let label = day;
        if (day === todayStr) label = '今天';
        else if (day === yestStr) label = '昨天';
        return `
          <div class="timeline-day">
            <div class="timeline-day-hd">
              ${label}
              <span class="day-count">· ${items.length} 次</span>
            </div>
            ${items.map(r => {
              const d = new Date(r.timestamp);
              const t = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
              return `
                <div class="timeline-item ${r.isCorrect ? 'correct' : 'wrong'}">
                  <div class="timeline-time">${t}</div>
                  <div class="timeline-content">${escapeHtmlStrict(r.problemText)}</div>
                  <div class="timeline-status">${r.isCorrect ? '✓' : '✗'}</div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }).join('');
    }
  }
})();


function getStudentName() {
  try {
    return lsGet(STUDENT_KEY) || '';
  } catch (e) {
    return '';
  }
}

function setStudentName(name) {
  try {
    if (name && name.trim()) {
      lsSet(STUDENT_KEY, name.trim());
    } else {
      lsRemove(STUDENT_KEY);
    }
  } catch (e) {
    console.warn('[学生姓名] 保存失败', e);
  }
  renderStudentCard();
}

function renderStudentCard() {
  const el = document.getElementById('dashStudentName');
  if (!el) return;
  const name = getStudentName();
  el.textContent = name || '点此设置';
}

/* 显示设置弹窗 */
function showStudentModal() {
  if (document.querySelector('.student-modal-mask')) return;

  const mask = document.createElement('div');
  mask.className = 'student-modal-mask';
  mask.innerHTML = `
    <div class="student-modal">
      <h3>👦 请告诉我你的名字</h3>
      <p>做过的题会保存到你的名下（可选）</p>
      <input type="text" id="studentNameInput" maxlength="12" placeholder="例：小明" autocomplete="off" value="${getStudentName()}">
      <div class="student-btns">
        <button class="student-cancel" id="studentCancel">取消</button>
        <button class="student-ok" id="studentOk">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(mask);
  lockBodyScroll(true);

  const input = document.getElementById('studentNameInput');
  setTimeout(() => { input.focus(); input.select(); }, 60);

  function doOk() {
    const name = input.value.trim();
    if (!name) {
      alert('请输入名字');
      return;
    }
    setStudentName(name);
    lockBodyScroll(false);
    mask.remove();
    showToast(`👋 你好，${name}！`, 'success');
  }

  document.getElementById('studentOk').addEventListener('click', doOk);
  document.getElementById('studentCancel').addEventListener('click', () => mask.remove());
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') doOk();
    if (e.key === 'Escape') mask.remove();
  });
  mask.addEventListener('click', e => {
    if (e.target === mask) mask.remove();
  });
}

/* 绑定学生卡片点击 */
document.getElementById('dashStudent')?.addEventListener('click', showStudentModal);

/* 首次打开时，如果没设置名字，延迟 1 秒后弹出 */
setTimeout(() => {
  if (getStudentName()) return;
  // ⭐ 本次会话只弹一次
  if (sessionStorage.getItem('grade3_student_asked') === '1') return;
  sessionStorage.setItem('grade3_student_asked', '1');
  showStudentModal();
}, 1000);

/* ============================================================
   ⭐⭐ 移动端体验 + 视觉优化补丁（1-23 项 JS 部分）
   ============================================================ */

/* ---------- 3. 全局输入框聚焦自动避让键盘 ---------- */
const _KEY_INPUT_IDS = [
  'm1Input', 'm9InlineInput', 'pAnswer', 'pTakeaway',
  'm4answer', 'm4val', 'm12val', 'm5ChalInput',
  'm7CalcAns', 'fracNum', 'fracDen', 'loginCode',
];

document.addEventListener('focusin', e => {
  const t = e.target;
  if (!t || !/INPUT|TEXTAREA/.test(t.tagName)) return;
  
  // 延迟到键盘完全弹起后
  setTimeout(() => {
    try {
      const rect = t.getBoundingClientRect();
      const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
      // 如果输入框被键盘遮挡了，才滚动（且只用 nearest，不居中）
      if (rect.bottom > vh - 20) {
        t.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    } catch (err) {}
  }, 320);
});

// ⭐ 键盘弹起时（visualViewport 变化）也补滚一次
if (window.visualViewport) {
  let _raf = null;
  window.visualViewport.addEventListener('resize', () => {
    if (_raf) cancelAnimationFrame(_raf);
    _raf = requestAnimationFrame(() => {
      const t = document.activeElement;
      if (!t || !/INPUT|TEXTAREA/.test(t.tagName)) return;
      try {
        const rect = t.getBoundingClientRect();
        const vh = window.visualViewport.height;
        if (rect.bottom > vh - 40) {
          t.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      } catch (err) {}
    });
  }, { passive: true });
}

/* ---------- 5. 学习看板数字跳动 ---------- */
(function patchDashboardBump() {
  if (typeof renderDashboard !== 'function') return;
  const orig = renderDashboard;
  const lastVals = {};
  window.renderDashboard = function () {
    const ids = ['dashToday', 'dashCorrect', 'dashRate', 'dashStreak', 'dashWrong'];
    const before = {};
    ids.forEach(id => {
      const el = document.getElementById(id);
      before[id] = el ? el.textContent.trim() : '';
    });
    orig.apply(this, arguments);
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const after = el.textContent.trim();
      if (before[id] !== after && before[id] !== '') {
        el.classList.add('bump');
        setTimeout(() => el.classList.remove('bump'), 260);
      }
    });
  };
  // 触发一次，让首次渲染不跳
  renderDashboard();
})();

/* ---------- 6. 模块卡片顶色条 ---------- */
(function patchModuleColors() {
  const COLORS = {
    m1:  'linear-gradient(90deg,#3b82f6,#6366f1)',
    m2:  'linear-gradient(90deg,#10b981,#34d399)',
    m3:  'linear-gradient(90deg,#f59e0b,#fbbf24)',
    m4:  'linear-gradient(90deg,#06b6d4,#22d3ee)',
    m5:  'linear-gradient(90deg,#8b5cf6,#a78bfa)',
    m6:  'linear-gradient(90deg,#ec4899,#f472b6)',
    m7:  'linear-gradient(90deg,#f97316,#fb923c)',
    m8:  'linear-gradient(90deg,#84cc16,#a3e635)',
    m9:  'linear-gradient(90deg,#0ea5e9,#38bdf8)',
    m10: 'linear-gradient(90deg,#ef4444,#f87171)',
    m11: 'linear-gradient(90deg,#14b8a6,#2dd4bf)',
    m12: 'linear-gradient(90deg,#a855f7,#c084fc)',
    m13: 'linear-gradient(90deg,#2563eb,#7c3aed)'
  };
  document.querySelectorAll('.module').forEach(mod => {
    const c = COLORS[mod.id];
    const card = mod.querySelector('.card');
    if (c && card) card.style.setProperty('--card-top', c);
  });
})();

/* ---------- 2. M1 混合运算：答对后 pulse 下一个可点运算符 ---------- */
(function patchM1HintPulse() {
  // 使用 MutationObserver 监听 m1steps 更新
  const steps = document.getElementById('m1steps');
  const expr = document.getElementById('m1expr');
  if (!steps || !expr) return;

  let lastStepKey = '';
  const obs = new MutationObserver(() => {
    // 判断是否处于"可以点运算符"的状态
    if (typeof M1 === 'undefined') return;
    if (M1.done) return;
    if (M1.waitingOpIdx >= 0) return;
    if (typeof M1_PRIORITY !== 'undefined' && !M1_PRIORITY.passed) return;

    // 用 steps 长度作为 key，避免重复触发
    const key = M1.steps.length + '_' + M1.tokens.length;
    if (key === lastStepKey) return;
    lastStepKey = key;

    // 找下一个可点的运算符
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

    // 计算 DOM 里对应第几个 .token.op
    let opCount = 0;
    let domIdx = -1;
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].type === 'op') {
        if (i === targetIdx) { domIdx = opCount; break; }
        opCount++;
      }
    }
    if (domIdx < 0) return;

    setTimeout(() => {
      const opEls = expr.querySelectorAll('.token.op');
      const el = opEls[domIdx];
      if (el) {
        el.classList.add('hint-pulse');
        setTimeout(() => el.classList.remove('hint-pulse'), 1600);
      }
    }, 620);
  });
  obs.observe(steps, { childList: true, subtree: true });
})();

/* ---------- 3. M9 打勾飘出 ---------- */
(function patchM9Tick() {
  const display = document.getElementById('m9display');
  if (!display) return;

  let lastCorrectKey = '';
  const obs = new MutationObserver(() => {
    // 检查是否刚刚填对了：M9.filled 变了且 M9.step 前进
    if (typeof M9 === 'undefined') return;
    const key = Object.keys(M9.filled).length + '_' + M9.step;
    if (key === lastCorrectKey) return;
    // 只在没有等待输入、且最近有填充时，找到最近填对的格子（绿色）
    // 简单做法：找刚渲染出来的 .vc-cell 中有 .correct 的 input，它的父级加 tick
    const inp = display.querySelector('.vc-input.correct');
    if (!inp) { lastCorrectKey = key; return; }
    lastCorrectKey = key;

    const parent = inp.closest('.vc-cell.input-cell') || inp.parentElement;
    if (!parent) return;
    // 移除旧 tick
    parent.querySelectorAll('.m9-tick').forEach(x => x.remove());
    const tick = document.createElement('span');
    tick.className = 'm9-tick';
    tick.textContent = '✓';
    parent.appendChild(tick);
    setTimeout(() => tick.remove(), 800);
  });
  obs.observe(display, { childList: true, subtree: true });
})();

/* ---------- 10. 错题本：错题次数徽章数据 ---------- */
(function patchWrongBookBadge() {
  if (typeof wbRender !== 'function') return;
  const orig = wbRender;
  window.wbRender = function () {
    orig.apply(this, arguments);
    // 原函数里已经渲染完，我们对 DOM 补 data-wrong-count
    try {
      const history = historyLoad();
      const wrongCountMap = {};
      history.forEach(r => {
        const t = r.problemText;
        wrongCountMap[t] = wrongCountMap[t] || 0;
        if (!r.isCorrect) wrongCountMap[t]++;
      });
      document.querySelectorAll('#wrongBookList .wrong-item').forEach(item => {
        const textEl = item.querySelector('.wrong-item-text');
        if (!textEl) return;
        const text = textEl.textContent.trim();
        const cnt = wrongCountMap[text] || 0;
        if (cnt > 0) item.setAttribute('data-wrong-count', '错 ' + cnt + ' 次');
        else item.removeAttribute('data-wrong-count');
      });
    } catch (e) {}
  };
  wbRender();
})();

/* ---------- 18. Toast 加图标 + 更像提示 ---------- */
(function patchToast() {
  const orig = window.showToast;
  if (typeof orig !== 'function') return;
  window.showToast = function (msg, type) {
    const ico = type === 'success' ? '🎉 ' : '💡 ';
    // 临时改写样式：让调用方追加 class
    const styleBak = document.createElement('style');
    styleBak.textContent = '.m3-toast{display:flex;align-items:center;gap:8px;max-width:82vw;line-height:1.5;}';
    document.head.appendChild(styleBak);
    try {
      // 复制原逻辑但把 emoji 加进去
      const toast = document.createElement('div');
      toast.className = 'm3-toast';
      toast.style.cssText = `
        position: fixed; top: max(60px, env(safe-area-inset-top)); left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#3b82f6,#2563eb)'};
        color: #fff; padding: 12px 22px; border-radius: 12px;
        font-size: 14px; font-weight: 700; z-index: 99999;
        box-shadow: 0 8px 24px rgba(0,0,0,.18);
        animation: fadeUp .3s ease;
      `;
      toast.textContent = ico + msg;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity .3s';
        setTimeout(() => toast.remove(), 300);
      }, 2600);
    } catch (e) {
      orig.call(this, msg, type);
    } finally {
      setTimeout(() => styleBak.remove(), 100);
    }
  };
})();

/* ---------- 19. M11 坐标格子注入 --cols ---------- */
(function patchM11Grid() {
  if (typeof m11Render !== 'function') return;
  const orig = m11Render;
  window.m11Render = function () {
    orig.apply(this, arguments);
    try {
      const grid = document.querySelector('#m11grid-wrap .coord-grid');
      if (grid && typeof M11 !== 'undefined') {
        grid.style.setProperty('--cols', M11.cols);
      }
    } catch (e) {}
  };
  m11Render();
})();

/* ---------- 4/3. 竖式输入框：聚焦自动居中（覆盖已有逻辑） ---------- */
document.addEventListener('focusin', e => {
  if (e.target && e.target.id === 'm9InlineInput') {
    setTimeout(() => {
      try {
        const rect = e.target.getBoundingClientRect();
        const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
        if (rect.bottom > vh - 120 || rect.top < 100) {
          e.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      } catch (err) {}
    }, 200);
  }
});

/* ---------- 4. M1 输入框：聚焦自动居中 ---------- */
document.addEventListener('focusin', e => {
  if (e.target && e.target.id === 'm1Input') {
    setTimeout(() => {
      try {
        e.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (err) {}
    }, 200);
  }
});

/* ---------- 6/7/8. 额外：竖式/混合运算容器加相对定位，让 tick 有锚点 ---------- */
(function ensurePositions() {
  document.querySelectorAll('.vc-cell.input-cell').forEach(el => {
    el.style.position = 'relative';
  });
  document.querySelectorAll('.step-input-row .step-content').forEach(el => {
    el.style.position = 'relative';
  });
})();

/* ---------- 22b. M13 步骤输入框 enterkeyhint ---------- */
(function patchM13EnterHint() {
  const c = document.getElementById('formulaSteps');
  if (!c) return;
  const apply = () => {
    c.querySelectorAll('input[data-field]').forEach(inp => {
      inp.setAttribute('enterkeyhint', 'next');
      inp.setAttribute('autocomplete', 'off');
    });
  };
  apply();
  // 监听动态添加的输入框
  new MutationObserver(apply).observe(c, { childList: true, subtree: true });
})();

/* ---------- 1b. 其他关键输入框 enterkeyhint ---------- */
(function patchEnterHints() {
  const map = {
    m1Input:        { hint: 'done', mode: 'numeric' },
    pAnswer:        { hint: 'done', mode: 'text' },      // ⭐ 中文答案
    pTakeaway:      { hint: 'done', mode: 'text' },      // ⭐ 心得输入
    m4val:          { hint: 'done', mode: 'decimal' },
    m4answer:       { hint: 'done', mode: 'decimal' },
    m12val:         { hint: 'done', mode: 'decimal' },
    m5ChalInput:    { hint: 'done', mode: 'decimal' },
    m7CalcAns:      { hint: 'done', mode: 'decimal' },
    m7CalcH:        { hint: 'next', mode: 'numeric' },
    m7CalcM:        { hint: 'done', mode: 'numeric' },
    fracNum:        { hint: 'next', mode: 'numeric' },
    fracDen:        { hint: 'done', mode: 'numeric' },
  };
  Object.keys(map).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute('enterkeyhint', map[id].hint);
    el.setAttribute('inputmode', map[id].mode);
    el.setAttribute('autocomplete', 'off');
  });
})();

/* ---------- 14b. 强制刷新一次 M11 让 --cols 生效 ---------- */
try { if (typeof m11Render === 'function') m11Render(); } catch (e) {}

/* ---------- 3b. M9 现有 focusin 兼容（避免与已有监听冲突） ---------- */
// 无需改动，已有 focusInlineInput 会继续工作。

console.log('[优化补丁] ✅ 1-23 项已加载');

/* ============================================================
   ⭐⭐ A–P 进阶优化补丁（JS 部分）
   ============================================================ */

/* ============================================================
   ⭐⭐ 看板：折叠/展开 + 成长曲线 + 打卡树
   ============================================================ */
(function patchDashboard() {
  const bar = document.getElementById('dashboard');
  if (!bar) return;

  // ⭐ 点击任意 chip（除学生外）→ 展开面板
  document.querySelectorAll('.dash-chip').forEach(chip => {
    if (chip.id === 'dashStudent') return;
    chip.style.cursor = 'pointer';
    chip.addEventListener('click', () => {
      bar.classList.add('expanded');
    });
  });

  /* ---------- 折叠/展开交互 ---------- */
  const collapsed = document.getElementById('dashCollapsed');
  if (collapsed) {
    collapsed.addEventListener('click', e => {
      // 点击"学生"chip 时不要切换折叠，而是走原有设置姓名逻辑
      if (e.target.closest('#dashStudent')) return;
      bar.classList.toggle('expanded');
    });
  }

  /* ---------- 同步展开面板里的数值 ---------- */
  function syncExpandedValues() {
    const map = [
      ['dashToday', 'dashToday2'],
      ['dashCorrect', 'dashCorrect2'],
      ['dashRate', 'dashRate2'],
      ['dashStreak', 'dashStreak2'],
      ['dashWrong', 'dashWrong2']
    ];
    map.forEach(([src, dst]) => {
      const a = document.getElementById(src);
      const b = document.getElementById(dst);
      if (a && b) b.innerHTML = a.innerHTML;
    });
  }

  /* ---------- 成长曲线 ---------- */
  function refreshGrowth() {
    const box = document.getElementById('growthBarsBox');
    if (!box) return;
    const history = typeof historyLoad === 'function' ? historyLoad() : [];
    const days = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      days.push({ date: d, label: `${d.getMonth() + 1}/${d.getDate()}`, total: 0, correct: 0 });
    }
    history.forEach(r => {
      const d = new Date(r.timestamp); d.setHours(0, 0, 0, 0);
      const slot = days.find(x => x.date.getTime() === d.getTime());
      if (slot) {
        slot.total++;
        if (r.isCorrect) slot.correct++;
      }
    });
    const maxTotal = Math.max(1, ...days.map(x => x.total));
    box.innerHTML = days.map(d => {
      const totalH = d.total ? Math.round(d.total / maxTotal * 100) : 0;
      const correctH = d.total ? Math.round(d.correct / d.total * totalH) : 0;
      const wrongH = totalH - correctH;
      return `
        <div class="growth-bar-wrap">
          <div class="growth-bar-count">${d.total || ''}</div>
          <div class="growth-bar-stack">
            <div class="growth-bar-seg correct" style="height:${correctH}%"></div>
            <div class="growth-bar-seg wrong" style="height:${wrongH}%"></div>
          </div>
          <div class="growth-bar-label">${d.label}</div>
        </div>
      `;
    }).join('');
  }

  /* ---------- 打卡树 ---------- */
  function refreshStreak() {
    const box = document.getElementById('streakDotsBox');
    const label = document.getElementById('streakDaysLabel');
    if (!box) return;
    const streak = typeof getStudyStreak === 'function' ? getStudyStreak() : 0;
    const cycle = (streak > 0 && streak % 7 === 0) ? 7 : (streak % 7);
    const loops = Math.floor(streak / 7);

    box.innerHTML = Array.from({ length: 7 }).map((_, i) => {
      let cls = 'streak-dot';
      if (i < cycle) {
        cls += ' lit';
        if (loops >= 1 && i === 6) cls += ' flower';
        if (loops >= 4 && i === 3) cls += ' fruit';
      }
      return `<span class="${cls}"></span>`;
    }).join('');

    if (label) {
      const tips = loops >= 4 ? ' 🌟 已结果' : (loops >= 1 ? ' 🌸 开花' : '');
      label.textContent = `已连续 ${streak} 天${tips}`;
    }
  }

  /* ---------- 首次进入时自动展开一次（可选） ---------- */
  // 若想默认展开，取消下面注释
  // bar.classList.add('expanded');

  /* ---------- 挂钩 renderDashboard，同步所有显示 ---------- */
  if (typeof renderDashboard === 'function') {
    const orig = renderDashboard;
    window.renderDashboard = function () {
      orig.apply(this, arguments);
      syncExpandedValues();
      refreshGrowth();
      refreshStreak();
    };
  }

  /* ---------- 初次渲染 ---------- */
  syncExpandedValues();
  refreshGrowth();
  refreshStreak();

  /* ---------- 存到全局，供其他代码触发 ---------- */
  window._refreshDashboardExtras = function () {
    syncExpandedValues();
    refreshGrowth();
    refreshStreak();
  };
})();

/* ============================================================
   E. iOS 键盘避让（visualViewport 精确感知）
   ============================================================ */
(function patchKeyboardAvoid() {
  if (!window.visualViewport) return;
  let raf = null;
  window.visualViewport.addEventListener('resize', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const focused = document.activeElement;
      if (!focused || !/INPUT|TEXTAREA/.test(focused.tagName)) return;
      try {
        const rect = focused.getBoundingClientRect();
        const vh = window.visualViewport.height;
        if (rect.bottom > vh - 100 || rect.top < 60) {
          focused.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      } catch (e) {}
    });
  });
})();

/* ============================================================
   F. 交互控件禁用误选（CSS 已处理，这里做双保险）
   ============================================================ */
// CSS 已足够，无需 JS。

/* ============================================================
   H. 音效体系（Web Audio 合成）
   ============================================================ */
const SFX = (function () {
  let ctx = null;
  let enabled = false;
  try {
    enabled = lsGet('grade3_sound_on') === '1';
  } catch (e) {}

  function init() {
    if (ctx) return;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, dur, type, vol) {
    if (!enabled) return;
    init();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  return {
    isEnabled: () => enabled,
    setEnabled(v) {
      enabled = !!v;
      try { lsSet('grade3_sound_on', enabled ? '1' : '0'); } catch (e) {}
      if (enabled) init();
    },
    correct() { tone(880, 0.12, 'sine', 0.10); setTimeout(() => tone(1320, 0.10, 'sine', 0.08), 70); },
    wrong()   { tone(220, 0.18, 'triangle', 0.10); },
    finish()  { tone(660, 0.10, 'sine', 0.10); setTimeout(() => tone(880, 0.10, 'sine', 0.10), 100); setTimeout(() => tone(1100, 0.16, 'sine', 0.10), 200); },
    streak()  { [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.10, 'sine', 0.10), i * 80)); }
  };
})();

/* ============================================================
   A. 错题智能标签 + 错题画像
   ============================================================ */
function autoTagsFor(text) {
  // ⭐ 初始化：第一次调用时才创建，避免 TDZ（TAG_RULES 声明在文件后面）
  if (!autoTagsFor._rules) {
    autoTagsFor._rules = [
      { re: /还剩|剩下|一共|平均|找回|找零|共计/, tag: '两步应用题' },
      { re: /面积|周长|边长|长.*宽|围栏|地砖/,        tag: '面积周长' },
      { re: /倍|是.*的.*倍|增加到/,                    tag: '倍数关系' },
      { re: /时|分|秒|经过|几点|分钟/,                 tag: '时间推算' },
      { re: /元|角|分|吨|千克|克|米|分米|厘米|毫米/,   tag: '单位换算' },
      { re: /[×÷]/,                                    tag: '乘除运算' },
      { re: /千克|克|吨/,                              tag: '质量单位' },
      { re: /分数|几分之几/,                           tag: '分数' }
    ];
  }
  const tags = new Set();
  autoTagsFor._rules.forEach(r => { if (r.re.test(text)) tags.add(r.tag); });
  return [...tags];
}

function loadReasons() {
  try { return JSON.parse(lsGet(REASON_KEY) || '{}'); } catch (e) { return {}; }
}
function saveReasons(map) {
  try { lsSet(REASON_KEY, JSON.stringify(map)); } catch (e) {}
}
function getReasons(text) {
  const m = loadReasons();
  return m[text] || [];
}
function toggleReason(text, reason) {
  const m = loadReasons();
  const cur = new Set(m[text] || []);
  if (cur.has(reason)) cur.delete(reason);
  else cur.add(reason);
  m[text] = [...cur];
  saveReasons(m);
}

/* 重写错题本渲染：追加标签 + 手动归因按钮 */
(function patchWrongBookRender2() {
  if (typeof wbRender !== 'function') return;
  const orig = wbRender;
  window.wbRender = function () {
    orig.apply(this, arguments);
    try {
      const history = historyLoad();
      const wrongCountMap = {};
      history.forEach(r => {
        wrongCountMap[r.problemText] = wrongCountMap[r.problemText] || 0;
        if (!r.isCorrect) wrongCountMap[r.problemText]++;
      });

      document.querySelectorAll('#wrongBookList .wrong-item').forEach(item => {
        const textEl = item.querySelector('.wrong-item-text');
        if (!textEl) return;
        const text = textEl.textContent.trim();

        // 补 data-wrong-count（原 patchWrongBookBadge 兼容）
        const cnt = wrongCountMap[text] || 0;
        if (cnt > 0) item.setAttribute('data-wrong-count', '错 ' + cnt + ' 次');

        // 如果已经渲染过，跳过
        if (item.dataset._tagPatched === '1') {
          // 只刷新按钮状态
          const reasons = getReasons(text);
          item.querySelectorAll('.wrong-reason-btn').forEach(b => {
            b.classList.toggle('on', reasons.includes(b.dataset.reason));
          });
          return;
        }
        item.dataset._tagPatched = '1';

        // 1. 自动标签
        const autoTags = autoTagsFor(text);
        if (autoTags.length) {
          const tagBox = document.createElement('div');
          tagBox.className = 'wrong-item-tags';
          tagBox.innerHTML = autoTags.map(t =>
            `<span class="wrong-item-tag-chip">${t}</span>`
          ).join('');
          textEl.after(tagBox);
        }

        // 2. 手动归因按钮
        const reasons = getReasons(text);
        const reasonRow = document.createElement('div');
        reasonRow.className = 'wrong-item-reason-row';
        reasonRow.innerHTML = REASONS.map(r =>
          `<button class="wrong-reason-btn ${reasons.includes(r) ? 'on' : ''}" data-reason="${r}">${r}</button>`
        ).join('');
        reasonRow.addEventListener('click', e => {
          const btn = e.target.closest('.wrong-reason-btn');
          if (!btn) return;
          e.stopPropagation();
          toggleReason(text, btn.dataset.reason);
          btn.classList.toggle('on');
          renderErrorProfile();
        });

        // 插到"讲解/重做"按钮前面
        const actionsWrap = item.querySelector('.wrong-item-explain');
        if (actionsWrap) actionsWrap.before(reasonRow);
        else item.appendChild(reasonRow);
      });
    } catch (e) { console.warn('[A. 错题标签]', e); }

    // 顺带刷新错题画像
    renderErrorProfile();
  };
})();

/* 错题画像面板 */
function renderErrorProfile() {
  const panel = document.getElementById('errorProfilePanel');
  if (!panel) return;

  const history = historyLoad();
  const wrongRecords = history.filter(r => !r.isCorrect);
  if (!wrongRecords.length) {
    panel.style.display = 'none';
    return;
  }

  // 1. 知识标签统计
  const tagCount = {};
  wrongRecords.forEach(r => {
    autoTagsFor(r.problemText).forEach(t => {
      tagCount[t] = (tagCount[t] || 0) + 1;
    });
  });
  const tagArr = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);

  // 2. 归因统计
  const reasonMap = loadReasons();
  const reasonCount = {};
  Object.values(reasonMap).forEach(arr => {
    arr.forEach(r => { reasonCount[r] = (reasonCount[r] || 0) + 1; });
  });

  const tagsHtml = tagArr.length
    ? tagArr.map(([t, c]) =>
        `<span class="error-tag" data-tag="${t}">${t}<span class="tag-count">${c}</span></span>`
      ).join('')
    : '<span style="color:#94a3b8;font-size:12.5px;">还没有足够的错题数据</span>';

  const reasonHtml = Object.keys(reasonCount).length
    ? REASONS.filter(r => reasonCount[r])
        .map(r => `<span class="error-tag">${r}<span class="tag-count">${reasonCount[r]}</span></span>`)
        .join('')
    : '';

  const topTag = tagArr[0];
  const topReason = Object.entries(reasonCount).sort((a, b) => b[1] - a[1])[0];

  const summary = `
    <div class="error-profile-summary">
      📊 你在 <b>${wrongRecords.length}</b> 道错题中，
      ${topTag ? `最容易在「<b>${topTag[0]}</b>」上出错（错 <b>${topTag[1]}</b> 次）` : ''}
      ${topReason ? `，归因最多的是「<b>${topReason[0]}</b>」` : ''}。
      ${topTag ? `<br>💡 建议：先集中练一练「<b>${topTag[0]}</b>」类题目。` : ''}
    </div>
  `;

  panel.innerHTML = `
    <h4>🎯 我的错题画像</h4>
    <div class="error-tag-cloud">${tagsHtml}</div>
    ${reasonHtml ? `<div style="font-size:12.5px;color:#92400e;font-weight:700;margin-bottom:8px;">归因统计：</div><div class="error-tag-cloud">${reasonHtml}</div>` : ''}
    ${summary}
  `;
  panel.style.display = 'block';

  // 点击标签筛选错题
  panel.querySelectorAll('.error-tag[data-tag]').forEach(el => {
    el.addEventListener('click', () => {
      const tag = el.dataset.tag;
      const listEl = document.getElementById('wrongBookList');
      if (!listEl) return;
      const items = listEl.querySelectorAll('.wrong-item');
      items.forEach(item => {
        const itemTags = [...item.querySelectorAll('.wrong-item-tag-chip')].map(x => x.textContent);
        item.style.display = itemTags.includes(tag) ? '' : 'none';
      });
    });
  });
}

/* ============================================================
   C. 一题一得汇总
   ============================================================ */
function renderTakeawayGallery() {
  // 扫 localStorage 里所有 grade3_takeaway_ 开头的 key
  const items = [];
  try {
    lsKeysByPrefix('grade3_takeaway_').forEach(k => {
      const v = lsGet(k);
      if (v && v.trim()) items.push({ key: k, note: v.trim() });
    });
  } catch (e) {}

  if (!items.length) {
    return `
      <div class="takeaway-gallery">
        <div class="takeaway-gallery-hd">
          <div class="takeaway-gallery-title">💡 一题一得 · 汇总</div>
        </div>
        <div class="takeaway-empty">
          还没有心得，做题时在"一题一得"里记一句吧 ✍️<br>
          <button class="empty-cta-btn" onclick="document.querySelector('.tab[data-target=\\'m13\\']').click()">去写第一条 →</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="takeaway-gallery">
      <div class="takeaway-gallery-hd">
        <div class="takeaway-gallery-title">💡 一题一得 · 汇总（${items.length} 条）</div>
        <input type="search" class="takeaway-gallery-search" id="takeawaySearch" placeholder="🔍 搜索关键词…">
      </div>
      <div class="takeaway-list" id="takeawayList"></div>
    </div>
  `;
}

/* ============================================================
   ⭐ 一题一得：只挂"快捷提示词按钮"（section 已在 HTML 里）
   ============================================================ */
(function patchTakeawayGallery() {
  // ⭐ 快捷提示词按钮（挂在输入框旁边）
  (function attachQuickHints() {
    const input = document.getElementById('pTakeaway');
    if (!input) return;
    const wrap = input.closest('.takeaway');
    if (!wrap) return;
    if (wrap.querySelector('.takeaway-quick')) return;

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
    wrap.appendChild(quick);

    quick.querySelectorAll('.takeaway-quick-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        const cur = input.value.trim();
        input.value = cur ? cur + '；' + hints[i].text : hints[i].text;
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  })();

  // ⭐ 提供刷新函数（供 patchGrowthPanel 调用）
  window._refreshTakeawayCount = function () {
    const cntEl = document.getElementById('takeawayCount');
    if (cntEl) {
      let n = 0;
      lsKeysByPrefix('grade3_takeaway_').forEach(k => {
        const v = lsGet(k);
        if (v && v.trim()) n++;
      });
      cntEl.textContent = n + ' 条';
    }
    // ⭐ 同步刷新成长卡片
    if (typeof window._refreshGrowthCards === 'function') {
      setTimeout(window._refreshGrowthCards, 50);
    }
  };
})();

/* ============================================================
   I. 每日一练推荐
   ============================================================ */
(function patchDailySuggest() {
  // 每会话只弹一次
  if (sessionStorage.getItem('grade3_daily_suggest_shown') === '1') return;

  const history = historyLoad();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayRecords = history.filter(r => r.timestamp >= todayStart.getTime());
  if (todayRecords.length > 0) return; // 今天已做题

  // 分析最近 7 天错题模块
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const recent = history.filter(r => r.timestamp >= sevenDaysAgo && !r.isCorrect);
  const tagCount = {};
  recent.forEach(r => {
    autoTagsFor(r.problemText).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
  });
  const topTag = Object.entries(tagCount).sort((a, b) => b[1] - a[1])[0];
  if (!topTag) return; // 没数据不推荐

  // 模块映射
  const MODULE_MAP = {
    '两步应用题': 'm13', '面积周长': 'm5', '倍数关系': 'm8',
    '时间推算': 'm7', '单位换算': 'm4', '乘除运算': 'm1',
    '质量单位': 'm12', '分数': 'm3'
  };
  const targetModule = MODULE_MAP[topTag[0]];
  if (!targetModule) return;

  const card = document.createElement('div');
  card.className = 'daily-suggest';
  card.innerHTML = `
    <button class="daily-suggest-close" id="dailySuggestClose" aria-label="关闭">×</button>
    <div class="daily-suggest-hd">📅 每日一练推荐</div>
    <div class="daily-suggest-body">
      最近你「<b>${topTag[0]}</b>」错了 <b>${topTag[1]}</b> 次。<br>
      要不要先练 3 道，把它攻克？💪
    </div>
    <div class="daily-suggest-actions">
      <button class="daily-suggest-later" id="dailySuggestLater">稍后</button>
      <button class="daily-suggest-go" id="dailySuggestGo">开始练习</button>
    </div>
  `;
  document.body.appendChild(card);
  document.getElementById('dailySuggestClose').addEventListener('click', () => {
    sessionStorage.setItem('grade3_daily_suggest_shown', '1');
    card.remove();
  });

  document.getElementById('dailySuggestLater').addEventListener('click', () => {
    sessionStorage.setItem('grade3_daily_suggest_shown', '1');
    card.remove();
  });
  document.getElementById('dailySuggestGo').addEventListener('click', () => {
    sessionStorage.setItem('grade3_daily_suggest_shown', '1');
    card.remove();
    const tab = document.querySelector(`.tab[data-target="${targetModule}"]`);
    if (tab) tab.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

/* ============================================================
   J. 计时挑战模式（M1 混合运算 + M9 竖式）
   ============================================================ */
const TIMER_CHALLENGE = {
  enabled: false,
  records: {},  // { moduleId: [秒数...] }
  _timer: null,
  _startAt: 0,
  _curModule: null,
  _onFinish: null
};

try {
  const saved = lsGet('grade3_timer_challenge');
  if (saved) TIMER_CHALLENGE.records = JSON.parse(saved);
} catch (e) {}

function timerChallengeToggle(enabled) {
  TIMER_CHALLENGE.enabled = !!enabled;
  try { lsSet('grade3_timer_challenge', JSON.stringify(TIMER_CHALLENGE.records)); } catch (e) {}
  document.querySelectorAll('.timer-challenge-display').forEach(el => {
    el.style.display = enabled ? '' : 'none';
  });
}

function timerChallengeStart(moduleId, onFinish) {
  if (!TIMER_CHALLENGE.enabled) return;
  if (TIMER_CHALLENGE._timer) clearInterval(TIMER_CHALLENGE._timer);
  TIMER_CHALLENGE._curModule = moduleId;
  TIMER_CHALLENGE._startAt = Date.now();
  TIMER_CHALLENGE._onFinish = onFinish;

  const el = document.querySelector(`#${moduleId} .timer-challenge-display`);
  if (!el) return;
  el.classList.remove('warn', 'danger');

  let seconds = 0;
  TIMER_CHALLENGE._timer = setInterval(() => {
    seconds = Math.floor((Date.now() - TIMER_CHALLENGE._startAt) / 1000);
    el.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (seconds >= 60) el.classList.add('danger');
    else if (seconds >= 30) el.classList.add('warn');
  }, 200);
}

function timerChallengeFinish(moduleId) {
  if (!TIMER_CHALLENGE.enabled) return;
  if (TIMER_CHALLENGE._timer) clearInterval(TIMER_CHALLENGE._timer);
  const seconds = Math.floor((Date.now() - TIMER_CHALLENGE._startAt) / 1000);
  if (!TIMER_CHALLENGE.records[moduleId]) TIMER_CHALLENGE.records[moduleId] = [];
  TIMER_CHALLENGE.records[moduleId].push(seconds);
  if (TIMER_CHALLENGE.records[moduleId].length > 20) TIMER_CHALLENGE.records[moduleId].shift();
  try { lsSet('grade3_timer_challenge', JSON.stringify(TIMER_CHALLENGE.records)); } catch (e) {}
  if (TIMER_CHALLENGE._onFinish) TIMER_CHALLENGE._onFinish(seconds);
  updateTimerChallengeStat(moduleId);
}

function updateTimerChallengeStat(moduleId) {
  const el = document.querySelector(`#${moduleId} .timer-challenge-stat`);
  if (!el) return;
  const arr = TIMER_CHALLENGE.records[moduleId] || [];
  if (!arr.length) { el.textContent = '暂无记录'; return; }
  const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  const best = Math.min(...arr);
  el.innerHTML = `最佳 <b>${best}s</b> · 平均 <b>${avg}s</b> · ${arr.length} 次`;
}

/* 给 M1 和 M9 注入挑战条 */
(function patchTimerChallenge() {
  ['m1', 'm9'].forEach(id => {
    const card = document.querySelector(`#${id} .card`);
    if (!card) return;
    if (card.querySelector('.timer-challenge-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'timer-challenge-bar';
    bar.innerHTML = `
      <label class="timer-challenge-toggle">
        <input type="checkbox" data-timer-toggle="${id}"> ⚡ 计时挑战
      </label>
      <div class="timer-challenge-display" data-timer-display="${id}" style="display:none;">00:00</div>
      <div class="timer-challenge-stat" data-timer-stat="${id}">暂无记录</div>
    `;
    const h2 = card.querySelector('h2');
    if (h2) h2.after(bar);
    else card.insertBefore(bar, card.firstChild);

    bar.querySelector(`input[data-timer-toggle="${id}"]`).addEventListener('change', e => {
      if (e.target.checked) {
        timerChallengeToggle(true);
        bar.querySelectorAll('input[data-timer-toggle]').forEach(x => { if (x !== e.target) x.checked = true; });
      } else {
        const anyOn = [...document.querySelectorAll('input[data-timer-toggle]')].some(x => x.checked);
        if (!anyOn) timerChallengeToggle(false);
      }
      document.querySelectorAll(`.timer-challenge-display`).forEach(el => {
        el.style.display = TIMER_CHALLENGE.enabled ? '' : 'none';
      });
    });

    updateTimerChallengeStat(id);
  });

  // 恢复上次开关状态
  if (TIMER_CHALLENGE.enabled) {
    document.querySelectorAll('input[data-timer-toggle]').forEach(x => x.checked = true);
    document.querySelectorAll('.timer-challenge-display').forEach(el => el.style.display = '');
  }
})();

/* 挂钩：M1 完成 / M9 完成 → 结束计时 */

/* M1：监听 m1fb 文本变化 */
(function hookM1Timer() {
  const fb = document.getElementById('m1fb');
  if (!fb) return;
  let started = false;
  let lastDone = false;
  const obs = new MutationObserver(() => {
    if (typeof M1 === 'undefined') return;
    if (M1.done && !lastDone) {
      lastDone = true;
      if (started) {
        timerChallengeFinish('m1');
        started = false;
        if (SFX && SFX.isEnabled()) SFX.finish();
      }
    } else if (!M1.done) {
      lastDone = false;
      if (!started && TIMER_CHALLENGE.enabled) {
        started = true;
        timerChallengeStart('m1');
      }
    }
  });
  obs.observe(fb, { childList: true, subtree: true, characterData: true });
})();

/* M9：监听 m9fb */
(function hookM9Timer() {
  const fb = document.getElementById('m9fb');
  if (!fb) return;
  let started = false;
  let lastDone = false;
  const obs = new MutationObserver(() => {
    const isDone = /算出来啦|🎉/.test(fb.textContent);
    if (isDone && !lastDone) {
      lastDone = true;
      if (started) {
        timerChallengeFinish('m9');
        started = false;
        if (SFX && SFX.isEnabled()) SFX.finish();
      }
    } else if (!isDone) {
      lastDone = false;
      if (!started && TIMER_CHALLENGE.enabled) {
        started = true;
        timerChallengeStart('m9');
      }
    }
  });
  obs.observe(fb, { childList: true, subtree: true, characterData: true });
})();

/* ============================================================
   M. 数据备份 / 恢复
   ============================================================ */
const LS_KEYS = [
  'grade3_wrong_book_v1',
  'grade3_practice_history_v1',
  'grade3_student_name',
  'grade3_wrong_reasons_v1',
  'grade3_timer_challenge',
  'grade3_sound_on'
];

let _restoringFromSession = false;
function backupToSession() {
  // ⭐ 恢复期间不备份，避免用"还没加载完的 _memCache"覆盖 sessionStorage
  if (_restoringFromSession) return;
  const data = {};
  LS_KEYS.forEach(k => {
    try {
      const v = lsGet(k);
      if (v != null) data[k] = v;
    } catch (e) {}
  });
  // 一题一得
  lsKeysByPrefix('grade3_takeaway_').forEach(k => {
    data[k] = lsGet(k);
  });
  try { sessionStorage.setItem(SESSION_BACKUP_KEY, JSON.stringify(data)); } catch (e) {}
}

async function restoreFromSession() {
  let data;
  try { data = JSON.parse(sessionStorage.getItem(SESSION_BACKUP_KEY) || '{}'); } catch (e) { return false; }
  const keys = Object.keys(data);
  if (!keys.length) return false;
  keys.forEach(k => { try { lsSet(k, data[k]); } catch (e) {} });
  // ⭐ 关键：等所有写落盘
  try { await flushStorage(); } catch (e) {}
  return true;
}

/* 定时备份 */
setInterval(backupToSession, 30000);
window.addEventListener('beforeunload', backupToSession);

/* 启动时检测：localStorage 空了但 session 有 */
function checkRestore() {
  try {
    // ⭐ 用 lsKeysByPrefix 判断，更严谨
    const hasAny = lsKeysByPrefix('grade3_').length > 0;
    if (hasAny) return;

    const sessionRaw = sessionStorage.getItem(SESSION_BACKUP_KEY);
    if (!sessionRaw) return;
    const data = JSON.parse(sessionRaw);
    if (!Object.keys(data).length) return;

    const bar = document.createElement('div');
    bar.className = 'backup-restore-bar';
    bar.innerHTML = `
      ⚠️ 检测到上次会话数据，是否恢复？
      <div style="display:flex;gap:8px;margin-left:auto;">
        <button class="backup-restore-no" id="backupNo">忽略</button>
        <button class="backup-restore-yes" id="backupYes">恢复</button>
      </div>
    `;
    document.body.appendChild(bar);
    document.getElementById('backupYes').addEventListener('click', async () => {
      _restoringFromSession = true;
      try {
        await restoreFromSession();
        await flushStorage();
      } finally {
        _restoringFromSession = false;
      }
      location.reload();
    });
    document.getElementById('backupNo').addEventListener('click', () => {
      sessionStorage.removeItem(SESSION_BACKUP_KEY);
      bar.remove();
    });
  } catch (e) {}
}

/* ============================================================
   N. 预加载骨架
   ============================================================ */
(function patchPreload() {
  const sk = document.createElement('div');
  sk.className = 'preload-skeleton';
  sk.innerHTML = `
    <div class="preload-skeleton-logo">🎓</div>
    <div class="preload-skeleton-text">正在准备数学课堂…</div>
  `;
  document.body.appendChild(sk);
  window.addEventListener('load', () => {
    setTimeout(() => {
      sk.classList.add('hide');
      setTimeout(() => sk.remove(), 500);
    }, 250);
  });
})();

/* ============================================================
   O. 离线状态提示
   ============================================================ */
(function patchOffline() {
  const banner = document.createElement('div');
  banner.className = 'offline-banner';
  banner.textContent = '当前离线，已完成内容保存在本地，恢复网络后可继续';
  document.body.appendChild(banner);

  const refresh = () => {
    banner.classList.toggle('show', !navigator.onLine);
  };
  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);
  refresh();
})();

/* ============================================================
   K. 分享卡片（重做错题做对时触发）
   ============================================================ */
function showShareCard(record) {
  if (document.querySelector('.share-card-mask')) return;

  const mask = document.createElement('div');
  mask.className = 'share-card-mask';

  const stepsHtml = (record.studentSteps || []).filter(s => s.rel || s.sub || s.res).map((s, i) => `
    <div style="margin-bottom:6px;">
      <b style="color:#2563eb;">第 ${i + 1} 步：</b>
      ${s.rel ? `<div>关系式：${escapeHtmlStrict(s.rel)}</div>` : ''}
      ${s.sub ? `<div>代入：${escapeHtmlStrict(s.sub)}</div>` : ''}
      ${s.res ? `<div>得数：${escapeHtmlStrict(s.res)}</div>` : ''}
    </div>
  `).join('');

  const takeaway = takeawayLoad(record.text) || '';

  mask.innerHTML = `
    <div class="share-card">
      <div class="share-card-hd">
        <div class="share-card-emoji">🎉</div>
        <div class="share-card-title">我做对啦！</div>
      </div>
      <div class="share-card-problem">
        <b>📝 题目：</b>${escapeHtmlStrict(record.text)}
      </div>
      <div class="share-card-steps">
        <b>✏️ 我的解法：</b>
        ${stepsHtml || '<div style="color:#94a3b8;">（未填步骤）</div>'}
      </div>
      <div class="share-card-answer">✅ 答案：${escapeHtmlStrict(record.studentAnswer || record.correctAnswer || '')}</div>
      ${takeaway ? `<div class="share-card-note"><b>💡 一题一得：</b>${escapeHtmlStrict(takeaway)}</div>` : ''}
      <div class="share-card-btns">
        <button class="share-card-close" id="shareCardClose">关闭</button>
        <button class="share-card-print" id="shareCardPrint">🖨️ 保存为图片</button>
      </div>
      <div class="share-card-footer">
        三年级数学互动课堂 · ${new Date().toLocaleDateString('zh-CN')}
      </div>
    </div>
  `;
  document.body.appendChild(mask);

  document.getElementById('shareCardClose').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });

  document.getElementById('shareCardPrint').addEventListener('click', () => {
    // 用 window.print() 简化实现；如需 PNG 需引入 html2canvas
    alert('提示：可用手机截图，或长按保存。若需要真正的 PNG，可引入 html2canvas 库。');
  });
}

/* ============================================================
   L. 分页加载（做题记录）
   ============================================================ */
(function patchHistoryPagination() {
  const HISTORY_PAGE = 20;
  if (typeof historyRender !== 'function') return;
  const orig = historyRender;
  let visibleCount = HISTORY_PAGE;

  window.historyRender = function () {
    orig.apply(this, arguments);
    try {
      const listEl = document.getElementById('historyList');
      if (!listEl) return;
      const groups = listEl.querySelectorAll('.history-group');
      groups.forEach((g, i) => {
        g.style.display = i < visibleCount ? '' : 'none';
      });
      // 移除旧按钮
      document.getElementById('historyLoadMore')?.remove();
      if (groups.length > visibleCount) {
        const btn = document.createElement('button');
        btn.id = 'historyLoadMore';
        btn.className = 'load-more-btn';
        btn.textContent = `📥 加载更多（还有 ${groups.length - visibleCount} 道）`;
        btn.addEventListener('click', () => {
          visibleCount += HISTORY_PAGE;
          historyRender();
        });
        listEl.parentElement.appendChild(btn);
      }
    } catch (e) {}
  };
  historyRender();
})();

/* ============================================================
   P. 家长周报
   ============================================================ */
function buildWeeklyReport() {
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const history = historyLoad().filter(r => r.timestamp >= weekAgo);
  const total = history.length;
  const correct = history.filter(r => r.isCorrect).length;
  const rate = total ? Math.round(correct / total * 100) : 0;
  const days = new Set(history.map(r => {
    const d = new Date(r.timestamp); d.setHours(0, 0, 0, 0);
    return d.getTime();
  }));
  const streak = typeof getStudyStreak === 'function' ? getStudyStreak() : 0;

  // ⭐ 本周掌握
  const masteryMap = masteryLoad();
  const weekMastered = Object.values(masteryMap).filter(r =>
    r.state === 'mastered' && r.lastAt >= weekAgo
  );

  // 错题 Top 3
  const wrongCount = {};
  history.filter(r => !r.isCorrect).forEach(r => {
    wrongCount[r.problemText] = (wrongCount[r.problemText] || 0) + 1;
  });
  const topWrong = Object.entries(wrongCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // 一题一得 Top 3（近期添加的）
  const takeaways = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('grade3_takeaway_')) {
        const v = lsGet(k);
        if (v && v.trim()) takeaways.push(v.trim());
      }
    }
  } catch (e) {}
  const topTakeaways = takeaways.slice(-3).reverse();

  // 下周建议（错题最多的模块）
  const tagCount = {};
  history.filter(r => !r.isCorrect).forEach(r => {
    autoTagsFor(r.problemText).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
  });
  const topTag = Object.entries(tagCount).sort((a, b) => b[1] - a[1])[0];

  // ⭐ 月对比
  const nowDate = new Date();
  const thisMonthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
  const lastMonthStart = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1).getTime();
  const allHistory = historyLoad();
  const thisMonthList = allHistory.filter(r => r.timestamp >= thisMonthStart);
  const lastMonthList = allHistory.filter(r => r.timestamp >= lastMonthStart && r.timestamp < thisMonthStart);
  const thisTotal = thisMonthList.length;
  const thisCorrect = thisMonthList.filter(r => r.isCorrect).length;
  const thisRate = thisTotal ? Math.round(thisCorrect / thisTotal * 100) : 0;
  const lastTotal = lastMonthList.length;
  const lastCorrect = lastMonthList.filter(r => r.isCorrect).length;
  const lastRate = lastTotal ? Math.round(lastCorrect / lastTotal * 100) : 0;

  const monthCompareHtml = (lastTotal > 0 || thisTotal > 0) ? `
    <div class="weekly-report-section">
      <h5>📈 本月 vs 上月</h5>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="background:#f0f9ff;padding:10px;border-radius:8px;">
          <div style="font-size:11.5px;color:#64748b;font-weight:700;">做题</div>
          <div style="font-size:18px;font-weight:800;color:#2563eb;">${thisTotal} <small style="color:#94a3b8;font-size:11px;font-weight:600;">/ 上月 ${lastTotal}</small></div>
        </div>
        <div style="background:#f0fdf4;padding:10px;border-radius:8px;">
          <div style="font-size:11.5px;color:#64748b;font-weight:700;">正确率</div>
          <div style="font-size:18px;font-weight:800;color:#15803d;">${thisRate}% <small style="color:#94a3b8;font-size:11px;font-weight:600;">/ 上月 ${lastRate}%</small></div>
        </div>
      </div>
    </div>
  ` : '';

  // ⭐ 本周留言对话
  const weekMsg = msgLoad().filter(m => m.at >= weekAgo);
  const msgHtml = weekMsg.length ? `
    <div class="weekly-report-section">
      <h5>💌 本周留言</h5>
      ${weekMsg.map(m => `
        <div style="margin-bottom:8px;padding:8px 12px;background:#fff;border-radius:8px;font-size:13px;">
          <div style="color:#be185d;font-weight:700;">家长：${escapeHtmlStrict(m.text)}</div>
          ${m.reply ? `<div style="color:#334155;margin-top:4px;">👦 孩子：${escapeHtmlStrict(m.reply)}</div>` : `<div style="color:#94a3b8;margin-top:4px;">孩子还没回复</div>`}
        </div>
      `).join('')}
    </div>
  ` : '';

  return `
    <div class="weekly-report-panel" id="weeklyReportPanel">
      <h4>📊 本周学习周报</h4>
      <div class="weekly-report-stats">
        <div class="weekly-report-stat">
          <div class="label">做题总数</div>
          <div class="value">${total}<small> 道</small></div>
        </div>
        <div class="weekly-report-stat">
          <div class="label">正确率</div>
          <div class="value">${total ? rate : '—'}<small>%</small></div>
        </div>
        <div class="weekly-report-stat">
          <div class="label">掌握</div>
          <div class="value" style="color:#7c3aed;">${weekMastered.length}<small> 题</small></div>
        </div>
        <div class="weekly-report-stat">
          <div class="label">学习天数</div>
          <div class="value">${days.size}<small> 天</small></div>
        </div>
        <div class="weekly-report-stat">
          <div class="label">连续打卡</div>
          <div class="value">${streak}<small> 天</small></div>
        </div>
        ${msgHtml}
      </div>
      ${weekMastered.length ? `
        <div class="weekly-report-section">
          <h5>🏆 本周掌握的题</h5>
          ${weekMastered.slice(0, 5).map(r => `<div>• ${escapeHtmlStrict(r.text.slice(0, 40))}…</div>`).join('')}
          ${weekMastered.length > 5 ? `<div style="color:#94a3b8;font-size:12px;margin-top:4px;">还有 ${weekMastered.length - 5} 题…</div>` : ''}
        </div>
      ` : ''}
      ${topWrong.length ? `
        <div class="weekly-report-section">
          <h5>⚠️ 需要重点复习的题</h5>
          ${topWrong.map(([t, c]) => `<div>• ${escapeHtmlStrict(t.slice(0, 40))}…（错 ${c} 次）</div>`).join('')}
        </div>
      ` : ''}
      ${topTakeaways.length ? `
        <div class="weekly-report-section">
          <h5>💡 我的心得精选</h5>
          ${topTakeaways.map(t => `<div>• ${escapeHtmlStrict(t)}</div>`).join('')}
        </div>
      ` : ''}
      ${topTag ? `
        <div class="weekly-report-section">
          <h5>🎯 下周建议</h5>
          <div>集中练习「<b>${topTag[0]}</b>」类题目（本周错过 ${topTag[1]} 次）</div>
        </div>
      ` : ''}
      <div class="weekly-report-actions">
        <button class="btn-secondary" id="weeklyReportExport">📤 导出周报 HTML</button>
      </div>
    </div>
  `;
}

/* ============================================================
   ⭐ 家长周报：section 已在 HTML 里，内容由 patchGrowthPanel 渲染
   ============================================================ */
// 无需动态创建，patchGrowthPanel 会调用 buildWeeklyReport()

function buildWeeklyReportHtml() {
  const name = getStudentName() || '未命名';
  const report = buildWeeklyReport();
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name} 的学习周报</title>
<style>
body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;background:#eef3f9;color:#1e293b;padding:20px;line-height:1.7;}
.wrap{max-width:640px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 6px 24px rgba(15,23,42,.08);}
h1{font-size:22px;color:#7c3aed;text-align:center;margin-bottom:8px;}
.sub{text-align:center;color:#64748b;font-size:13px;margin-bottom:24px;}
.weekly-report-panel{background:none;border:none;padding:0;margin:0;border-left:none;}
.weekly-report-panel h4{font-size:17px;color:#5b21b6;margin-bottom:14px;text-align:center;}
.weekly-report-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px;}
.weekly-report-stat{padding:12px;background:#f5f3ff;border-radius:10px;text-align:center;}
.weekly-report-stat .label{font-size:12px;color:#64748b;font-weight:700;}
.weekly-report-stat .value{font-size:22px;font-weight:800;color:#7c3aed;font-family:ui-monospace,monospace;}
.weekly-report-stat .value small{font-size:12px;opacity:.7;}
.weekly-report-section{padding:12px 16px;background:#f8fafc;border-radius:10px;margin-bottom:10px;font-size:13.5px;}
.weekly-report-section h5{font-size:13px;color:#6d28d9;margin-bottom:6px;}
.btn-secondary{display:none;}
.footer{text-align:center;color:#94a3b8;font-size:12px;margin-top:20px;padding-top:14px;border-top:1px dashed #e2e8f0;}

.vc-input.correct {
  transition: transform .15s cubic-bezier(.34,1.5,.64,1);
}

// M13 答对：进度条 + 徽章“跳一下”
@keyframes badgeBump {
  0% { transform: scale(.8); }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

//回 Home，做完的岛进度条“滑”到新位置
.island-progress span {
  transition: width .6s cubic-bezier(.34,1.3,.64,1);
}

</style>
</head><body>
<div class="parent-tip" style="background:#fdf2f8;border-left:4px solid #ec4899;padding:12px 16px;border-radius:10px;margin-bottom:16px;font-size:13px;color:#831843;line-height:1.7;">
  💌 给家长：这是孩子本周的学习记录。如果孩子有进步，记得当面夸夸他/她。
</div>
<div class="wrap">
  <h1>📊 ${name} 的数学学习周报</h1>
  <div class="sub">${new Date().toLocaleString('zh-CN')}</div>
  ${report}
  <div class="footer">由"三年级数学互动课堂"自动生成</div>
</div>
</body></html>`;
}

/* ============================================================
   音效挂钩：答对 / 答错
   ============================================================ */
(function hookSfx() {
  // M1 答对/答错
  const m1fb = document.getElementById('m1fb');
  const m1inpFb = document.getElementById('m1InputFeedback');
  if (m1inpFb) {
    new MutationObserver(() => {
      const txt = m1inpFb.textContent;
      if (/✓ 正确/.test(txt)) SFX.correct();
      else if (/❌/.test(txt)) SFX.wrong();
    }).observe(m1inpFb, { childList: true, subtree: true, characterData: true });
  }

  // M9 答对/答错（通过 m9fb 反馈）
  const m9fb = document.getElementById('m9fb');
  if (m9fb) {
    let last = '';
    new MutationObserver(() => {
      const txt = m9fb.textContent;
      if (txt === last) return;
      last = txt;
      if (/✓ 正确/.test(txt)) SFX.correct();
      else if (/❌/.test(txt)) SFX.wrong();
    }).observe(m9fb, { childList: true, subtree: true, characterData: true });
  }

  // M3 / M5 / M7 等模块的反馈（通过类名检测）
  document.addEventListener('click', e => {
    // 答对点击后的反馈条出现时，可能已经有音效；这里只处理"再次点击"的简单场景。
  });
})();

console.log('[优化补丁] ✅ A-P 已加载');

/* ============================================================
   ⭐ 解题思维：折叠面板交互
   ============================================================ */
(function patchCollapsible() {
  document.addEventListener('click', e => {
    const hd = e.target.closest('.collapsible-hd');
    if (!hd) return;
    const section = hd.closest('.collapsible-section');
    if (!section) return;
    // ⭐ 跳过成长卡片详情面板（由 patchGrowthPanel 单独处理）
    if (section.closest('#growthDetailPanels')) return;
    section.classList.toggle('expanded');
  });
})();

/* ============================================================
   ⭐ 2. "我的成长"：卡片点击 → 展开对应面板 + 更新卡片统计
   ============================================================ */
(function patchGrowthPanel() {
  const panel = document.getElementById('growthPanelContainer');
  const detailPanels = document.getElementById('growthDetailPanels');
  if (!panel || !detailPanels) return;

  if (panel.dataset._growthPatched === '1') return;
  panel.dataset._growthPatched = '1';

  /* ---------- 卡片点击 → 展开对应面板 ---------- */
  const cards = panel.querySelectorAll('.growth-card[data-goto]');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const targetId = card.dataset.goto;
      const targetSection = document.getElementById(targetId);
      if (!targetSection) return;

      // 收起其他所有 section
      detailPanels.querySelectorAll('.collapsible-section').forEach(sec => {
        if (sec.id !== targetId) sec.classList.remove('expanded');
      });

      // 切换当前 section
      const willExpand = !targetSection.classList.contains('expanded');
      targetSection.classList.toggle('expanded', willExpand);
      card.classList.toggle('expanded', willExpand);

      // 滚动到目标位置
      if (willExpand) {
        setTimeout(() => {
          targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    });
  });

  /* ---------- 详情面板折叠条点击 → 同步卡片状态（只绑一次） ---------- */
  detailPanels.querySelectorAll('.collapsible-section').forEach(section => {
    const hd = section.querySelector('.collapsible-hd');
    if (!hd) return;
    hd.addEventListener('click', () => {
      const willExpand = !section.classList.contains('expanded');
      // 收起其他
      detailPanels.querySelectorAll('.collapsible-section').forEach(sec => {
        if (sec !== section) sec.classList.remove('expanded');
      });
      section.classList.toggle('expanded', willExpand);

      // 同步对应卡片
      const card = panel.querySelector(`.growth-card[data-goto="${section.id}"]`);
      if (card) card.classList.toggle('expanded', willExpand);
    });
  });

  /* ---------- 更新卡片上的统计数字 ---------- */
  function updateCardStats() {
    /* ---------- 详情面板折叠条点击 → 同步卡片状态 ---------- */
    if (typeof historyLoad !== 'function') return;
    const history = historyLoad();
    const weekAgo = Date.now() - 7 * 86400000;
    const week = history.filter(r => r.timestamp >= weekAgo);
    const weekCorrect = week.filter(r => r.isCorrect).length;
    const weekDays = new Set(week.map(r => {
      const d = new Date(r.timestamp); d.setHours(0, 0, 0, 0);
      return d.getTime();
    })).size;
    const totalCorrect = history.filter(r => r.isCorrect).length;
    const totalRate = history.length ? Math.round(totalCorrect / history.length * 100) : 0;
    const allTexts = new Set(history.map(r => r.problemText));
    const weekRate = week.length ? Math.round(weekCorrect / week.length * 100) : 0;

    // ① 做题记录
    const hs = document.getElementById('historyStats');
    if (hs) hs.innerHTML = `
      <div class="growth-card-stat"><div class="num">${allTexts.size}<small>道</small></div><div class="lbl">题目</div></div>
      <div class="growth-card-stat"><div class="num">${history.length}<small>次</small></div><div class="lbl">练习</div></div>
      <div class="growth-card-stat"><div class="num">${totalRate}<small>%</small></div><div class="lbl">正确率</div></div>
    `;

    // ② 一题一得
    let takeawayN = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('grade3_takeaway_')) {
          const v = lsGet(k);
          if (v && v.trim()) takeawayN++;
        }
      }
    } catch (e) {}
    const ts = document.getElementById('takeawayStats');
    if (ts) ts.innerHTML = `
      <div class="growth-card-stat"><div class="num">${takeawayN}<small>条</small></div><div class="lbl">心得</div></div>
    `;

    // ③ 成长曲线
    const gs = document.getElementById('growthChartStats');
    if (gs) gs.innerHTML = `
      <div class="growth-card-stat"><div class="num">${week.length}<small>道</small></div><div class="lbl">本周做题</div></div>
      <div class="growth-card-stat"><div class="num">${weekCorrect}<small>道</small></div><div class="lbl">做对</div></div>
      <div class="growth-card-stat"><div class="num">${weekDays}<small>天</small></div><div class="lbl">学习天数</div></div>
    `;

    // ④ 打卡树
    const streak = typeof getStudyStreak === 'function' ? getStudyStreak() : 0;
    const loops = Math.floor(streak / 7);
    const ss = document.getElementById('streakTreeStats');
    if (ss) ss.innerHTML = `
      <div class="growth-card-stat"><div class="num">${streak}<small>天</small></div><div class="lbl">连续打卡</div></div>
      <div class="growth-card-stat"><div class="num">${loops}<small>轮</small></div><div class="lbl">7天周期</div></div>
    `;

    // ⑤ 周报
    const ws = document.getElementById('weeklyReportStats');
    if (ws) ws.innerHTML = `
      <div class="growth-card-stat"><div class="num">${week.length}<small>道</small></div><div class="lbl">本周做题</div></div>
      <div class="growth-card-stat"><div class="num">${weekRate}<small>%</small></div><div class="lbl">正确率</div></div>
      <div class="growth-card-stat"><div class="num">${weekDays}<small>天</small></div><div class="lbl">学习天数</div></div>
    `;

    // 内部图形/内容
    renderGrowthChartInline();
    renderStreakTreeInline();
    renderTakeawayGalleryInline();
    renderWeeklyReportInline();
    updateHistorySectionCount();
  }

  /* ---------- 成长曲线柱状图 ---------- */
  function renderGrowthChartInline() {
    const box = document.getElementById('growthChartInline');
    if (!box) return;
    const history = typeof historyLoad === 'function' ? historyLoad() : [];
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
    box.innerHTML = days.map(d => {
      const totalH = d.total ? Math.round(d.total / maxTotal * 100) : 0;
      const correctH = d.total ? Math.round(d.correct / d.total * totalH) : 0;
      const wrongH = totalH - correctH;
      return `
        <div class="growth-bar-wrap">
          <div class="growth-bar-count">${d.total || ''}</div>
          <div class="growth-bar-stack">
            <div class="growth-bar-seg correct" style="height:${correctH}%"></div>
            <div class="growth-bar-seg wrong" style="height:${wrongH}%"></div>
          </div>
          <div class="growth-bar-label">${d.label}</div>
        </div>
      `;
    }).join('');
  }

  /* ---------- 打卡树圆点 ---------- */
  function renderStreakTreeInline() {
    const box = document.getElementById('streakTreeInline');
    const label = document.getElementById('streakTreeInlineLabel');
    if (!box) return;
    const streak = typeof getStudyStreak === 'function' ? getStudyStreak() : 0;
    const cycle = (streak > 0 && streak % 7 === 0) ? 7 : (streak % 7);
    const loops = Math.floor(streak / 7);
    box.innerHTML = Array.from({ length: 7 }).map((_, i) => {
      let cls = 'streak-dot';
      if (i < cycle) {
        cls += ' lit';
        if (loops >= 1 && i === 6) cls += ' flower';
        if (loops >= 4 && i === 3) cls += ' fruit';
      }
      return `<span class="${cls}"></span>`;
    }).join('');
    if (label) {
      const tips = loops >= 4 ? ' 🌟 已结果' : (loops >= 1 ? ' 🌸 开花' : '');
      label.textContent = `已连续 ${streak} 天${tips}`;
    }
  }

  /* ---------- 一题一得列表 ---------- */
  function renderTakeawayGalleryInline() {
    const box = document.getElementById('takeawayGalleryBox');
    if (!box) return;
    if (typeof renderTakeawayGallery !== 'function') return;

    // ⭐ 计算数据指纹，只有变化时才重绘
    let fp = 0;
    try {
      lsKeysByPrefix('grade3_takeaway_').forEach(k => {
        const v = lsGet(k);
        if (v && v.trim()) fp += v.length + k.length;
      });
    } catch (e) {}
    if (box.dataset._fp === String(fp)) return;   // 数据没变，跳过
    box.dataset._fp = String(fp);

    box.innerHTML = renderTakeawayGallery();
    const searchEl = box.querySelector('#takeawaySearch');
    const listEl = box.querySelector('#takeawayList');
    if (!listEl) return;

    const renderList = (filter) => {
      const items = [];
      try {
        lsKeysByPrefix('grade3_takeaway_').forEach(k => {
          const v = lsGet(k);
          if (v && v.trim()) items.push({ key: k, note: v.trim() });
        });
      } catch (e) {}
      const f = (filter || '').trim().toLowerCase();
      const filtered = f ? items.filter(x => x.note.toLowerCase().includes(f)) : items;
      if (!filtered.length) {
        listEl.innerHTML = `<div class="takeaway-empty" style="grid-column:1/-1;">没有匹配的心得</div>`;
        return;
      }
      listEl.innerHTML = filtered.map(x => `
        <div class="takeaway-item">
          <div class="takeaway-item-note">${typeof escapeHtmlStrict === 'function' ? escapeHtmlStrict(x.note) : x.note}</div>
        </div>
      `).join('');
    };
    renderList('');
    if (searchEl) {
      // ⭐ 用 oninput 而不是 addEventListener，避免重复绑定
      searchEl.oninput = () => renderList(searchEl.value);
    }
  }

  /* ---------- 周报 ---------- */
  function renderWeeklyReportInline() {
    const box = document.getElementById('weeklyReportBox');
    if (!box) return;
    if (typeof buildWeeklyReport !== 'function') return;

    // ⭐ 用"上次渲染时间 + 历史记录数"做指纹
    const history = typeof historyLoad === 'function' ? historyLoad() : [];
    const fp = history.length + '_' + (history[0]?.timestamp || 0);
    if (box.dataset._fp === fp) return;
    box.dataset._fp = fp;

    box.innerHTML = buildWeeklyReport();
    const exportBtn = box.querySelector('#weeklyReportExport');
    if (exportBtn) {
      // ⭐ 用 onclick 而不是 addEventListener
      exportBtn.onclick = () => {
        const name = (typeof getStudentName === 'function' && getStudentName()) || '未命名';
        const html = typeof buildWeeklyReportHtml === 'function' ? buildWeeklyReportHtml() : '';
        if (typeof downloadBlob === 'function') {
          downloadBlob(html, `周报_${name}_${new Date().toISOString().slice(0, 10)}.html`, 'text/html');
        }
        if (typeof showToast === 'function') showToast('✅ 周报已导出', 'success');
      };
    }
  }

  /* ---------- 做题记录计数 ---------- */
  function updateHistorySectionCount() {
    const list = typeof historyLoad === 'function' ? historyLoad() : [];
    const texts = new Set(list.map(r => r.problemText));
    const cntEl = document.getElementById('historyCount');
    if (cntEl) cntEl.textContent = `共 ${texts.size} 道 / ${list.length} 次`;
  }

  /* ---------- 首次渲染 ---------- */
  setTimeout(updateCardStats, 100);

  /* ---------- 挂到全局，数据变化后调用 ---------- */
  window._refreshGrowthCards = updateCardStats;
})();

/* ============================================================
   ⭐ 4. 答对飘星星 + 连续答对彩带
   ============================================================ */
const COMBO = { count: 0, lastAt: 0 };

function burstStars(x, y, n) {
  n = n || 5;
  const emojis = ['⭐', '✨', '🌟', '💫', '🎉'];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'star-burst';
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    const ang = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 60;
    el.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    el.style.setProperty('--dx2', (Math.cos(ang) * dist * 1.8) + 'px');
    el.style.left = (x - 12) + 'px';
    el.style.top = (y - 12) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }
}

function burstConfetti(n) {
  n = n || 60;
  const colors = ['#fbbf24', '#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.left = (Math.random() * 100) + 'vw';
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.animationDuration = (2 + Math.random() * 1.5) + 's';
    el.style.animationDelay = (Math.random() * 0.4) + 's';
    el.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}

function showComboBanner(text) {
  const el = document.createElement('div');
  el.className = 'combo-banner';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

/* ---------- 挂钩：监听"答对"事件 ---------- */
(function hookCorrectCelebration() {
  // M1 答对
  const m1Fb = document.getElementById('m1InputFeedback');
  if (m1Fb) {
    new MutationObserver(() => {
      if (/✓ 正确/.test(m1Fb.textContent)) {
        const rect = m1Fb.getBoundingClientRect();
        onCorrect(rect.left + rect.width / 2, rect.top);
      }
    }).observe(m1Fb, { childList: true, subtree: true, characterData: true });
  }

  // M9 答对
  const m9Fb = document.getElementById('m9fb');
  if (m9Fb) {
    let last = '';
    new MutationObserver(() => {
      const t = m9Fb.textContent;
      if (t === last) return;
      last = t;
      if (/✓ 正确/.test(t)) {
        const rect = m9Fb.getBoundingClientRect();
        onCorrect(rect.left + rect.width / 2, rect.top);
      }
    }).observe(m9Fb, { childList: true, subtree: true, characterData: true });
  }
})();

function onCorrect(x, y) {
  const now = Date.now();
  // 3 分钟内算连续
  if (now - COMBO.lastAt < 180000) {
    COMBO.count++;
  } else {
    COMBO.count = 1;
  }
  COMBO.lastAt = now;

  // 每次答对飘星星
  burstStars(x, y, 5);

  // 连击 5 → 彩带 + 横幅
  if (COMBO.count === 5) {
    burstConfetti(80);
    showComboBanner('🔥 连对 5 题！');
  } else if (COMBO.count === 10) {
    burstConfetti(120);
    showComboBanner('🏆 连对 10 题！太厉害了');
  } else if (COMBO.count > 10 && COMBO.count % 5 === 0) {
    burstConfetti(60);
    showComboBanner(`🌟 连对 ${COMBO.count} 题！`);
  }
}

/* ============================================================
   ⭐ 修复：分享卡片挂钩（放到最后，确保 handleRedoSuccess 已定义）
   ============================================================ */
(function hookShareOnRedo() {
  if (typeof handleRedoSuccess !== 'function') {
    console.warn('[分享卡片] handleRedoSuccess 未定义，跳过挂钩');
    return;
  }
  if (window._shareHooked) return;   // 防重复挂钩
  window._shareHooked = true;

  const orig = window.handleRedoSuccess;
  window.handleRedoSuccess = function (problemText) {
    try {
      orig.apply(this, arguments);
    } catch (e) {
      console.warn('[分享卡片] 原 handleRedoSuccess 执行失败', e);
    }

    // 找到最新一次做对的记录
    const history = historyLoad();
    const latest = history.find(r => r.problemText === problemText && r.isCorrect);
    if (latest) {
      setTimeout(() => showShareCard(latest), 500);
    }
  };
})();

/* ============================================================
   ⭐ 启动：先初始化存储，再渲染 UI
   ============================================================ */
(async function bootstrap() {
  await initStorage();
  await migrateFromLocalStorage();

  const syncOK = await initSync();
  if (syncOK) {
    const cloudMap = await pullFromCloud();
    if (cloudMap) {
      const toPush = [];
      mergeCloudIntoLocal(
        cloudMap,
        (key) => {
          const value = lsGet(key);
          if (value == null) return undefined;
          return { value, localUpdatedAt: getLocalUpdatedAt(key) };
        },
        (key, value) => {
          // 从 cloudMap 中取出该 key 的更新时间
          const cloudItem = cloudMap.get(key);
          applyCloudValue(key, value, cloudItem?.updated_at);
        },
        (key, value) => {
          // 只有当本地确实比云端新时，才推回云端
          toPush.push([key, value]);
        }
      );

      // 如果确实有本地更新，才回推
      if (toPush.length) {
        const { pushBatch } = await import('../core/sync/cloudbase-adapter.js');
        pushBatch(toPush).catch(e => console.warn('[Sync] 回推失败', e));
      }

      // ⭐ 核心修复：拉取并覆盖完成后，必须重绘 UI 才能看到新数据
      try { wbRender(); } catch (e) {}
      try { historyRender(); } catch (e) {}
      try { renderDashboard(); } catch (e) {}
    }
  }

  // 4. 渲染 UI（原有代码）
  // 年级切换后重渲染
  on(EVT.GRADE_CHANGED, () => {
    try { wbRender(); } catch (e) {}
    try { historyRender(); } catch (e) {}
    try { renderDashboard(); } catch (e) {}
    try { renderStudentCard(); } catch (e) {}
    try { window._refreshGrowthCards?.(); } catch (e) {}
  });
  // 数据变化后重渲染（history/wrongbook/takeaway 任一）
  on(EVT.DATA_CHANGED, (payload) => {
    if (payload.source === 'history') {
      try { historyRender(); } catch (e) {}
    } else if (payload.source === 'wrongbook') {
      try { wbRender(); } catch (e) {}
    } else if (payload.source === 'takeaway') {
      try { window._refreshGrowthCards?.(); } catch (e) {}
    }
    try { renderDashboard(); } catch (e) {}
  });

  wbRender();
  historyRender();
  renderDashboard();
  renderStudentCard();
  renderErrorProfile();

  initSyncUI();   // ⭐ 这行必须有

  initShell();
  // ⭐ 拇指区浮球联动：劫持全局 showThumbBar / hideThumbBar
  (function hookThumbBarToFloats() {
    const shell = window.__shell;
    if (!shell) return;
    const origShow = shell.showThumbBar;
    const origHide = shell.hideThumbBar;

    shell.showThumbBar = function (opts) {
      document.body.classList.add('thumb-bar-open');
      return origShow.call(this, opts);
    };
    shell.hideThumbBar = function () {
      document.body.classList.remove('thumb-bar-open');
      return origHide.call(this);
    };

    // 兜底：监听 thumbBar 的实际 class
    const bar = document.getElementById('thumbBar');
    if (bar) {
      new MutationObserver(() => {
        document.body.classList.toggle('thumb-bar-open', bar.classList.contains('show'));
      }).observe(bar, { attributes: true, attributeFilter: ['class'] });
    }
  })();

  hookFeedbackToThumbBar();
  showUnreadParentMsg();

  console.log('[启动] ✅ core/ 已就绪, sync =', getSyncState());
})();

/* ---------- 切后台 / 关页面：把挂起写入落盘 ---------- */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    flushStorage().catch(() => {});
  }
});

window.addEventListener('pagehide', () => {
  flushStorage().catch(() => {});
});

window.addEventListener('beforeunload', () => {
  // 不能 await，但能触发；localForage 的 IndexedDB 写一般够快
  flushStorage().catch(() => {});
});

/* ---------- 暴露给控制台调试 ---------- */
window.__debug = {
  getStorageHealth,
  getErrorLog,
  flushStorage,
  //ERROR_LOG,
};

/* ============================================================
   P0：把模块的 .feedback 同步到拇指区反馈条
   ============================================================ */
function hookFeedbackToThumbBar() {
  const TARGETS = [
    { fb: 'm1fb',      next: null,        retry: 'm1reset' },
    { fb: 'm4fb',      next: 'm4newq',    retry: null },
    { fb: 'm9fb',      next: 'm9step',    retry: 'm9reset' },
    { fb: 'm10info',   next: null,        retry: null },
    { fb: 'm1PriorityFeedback', next: null, retry: null },
  ];

  TARGETS.forEach(({ fb, next, retry }) => {
    const el = document.getElementById(fb);
    if (!el) return;
    let last = '';
    let hideTimer = null;

    new MutationObserver(() => {
      const txt = el.textContent.trim();
      if (txt === last || !txt) return;
      last = txt;

      const isErr = /❌|再想想|错|不对|失败/.test(txt);
      const isOk  = !isErr && /✓|🎉|正确|对|算完|完成/.test(txt);
      if (!isOk && !isErr) return;

      // ⭐ 调 showThumbBar，不要在这里绑 thumbRetry
      showThumbBar({
        text: txt.replace(/^[✓❌🎉]\s*/, ''),
        ok: isOk,
        onNext: () => {
          const module = document.querySelector('#modulePool .module.active');
          if (!module) return;
          const id = module.id;

          const isWholeDone =
            (id === 'm1' && typeof M1 !== 'undefined' && M1.done) ||
            (id === 'm9' && /算出来啦|🎉/.test(document.getElementById('m9fb')?.textContent || ''));

          if (isWholeDone) {
            const btnMap = { m1: 'm1Random', m9: 'm9random' };
            const btn = document.getElementById(btnMap[id]);
            if (btn) btn.click();

            // ⭐ 换题后自动聚焦
            setTimeout(() => {
              if (id === 'm1') {
                // M1 换题后没有直接输入框，等用户点运算符
              } else if (id === 'm9') {
                // M9 换题后，等用户点"下一步"
              }
            }, 200);
          } else {
            // 没完成整题 → 走下一步
            const nextBtn = document.getElementById(
              id === 'm1' ? 'm1InputSubmit' : id === 'm9' ? 'm9step' : null
            );
            if (nextBtn) {
              nextBtn.click();
              // ⭐ 下一步后自动聚焦输入框
              setTimeout(() => {
                const input = document.getElementById(id === 'm1' ? 'm1Input' : id === 'm9' ? 'm9InlineInput' : null);
                if (input) {
                  input.focus();
                  try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
                }
              }, 100);
            }
          }
          hideThumbBar();
        },
      });

      clearTimeout(hideTimer);
      hideTimer = setTimeout(hideThumbBar, 8000);
    }).observe(el, { childList: true, subtree: true, characterData: true });
  });
}

/* ============================================================
   ⭐ 统一查缓存：历史 → 错题本 → 题库
   返回 { aiFeedback, source } 或 null
   ============================================================ */
function findCachedFeedback(problemText) {
  if (!problemText) return null;
  const key = String(problemText).trim();

  // ① 查历史记录（最近的优先）
  try {
    const history = historyLoad();
    const hit = history.find(r =>
      (r.problemText || '').trim() === key && r.aiFeedback && r.aiFeedback.answer
    );
    if (hit) return { aiFeedback: hit.aiFeedback, source: 'history' };
  } catch (e) {}

  // ② 查错题本
  try {
    const wb = wbLoad();
    const hit = wb.find(r =>
      (r.text || '').trim() === key && r.aiFeedback && r.aiFeedback.answer
    );
    if (hit) return { aiFeedback: hit.aiFeedback, source: 'wrongbook' };
  } catch (e) {}

  // ③ 查题库（M13_BANK 里带 steps 的题）
  try {
    if (Array.isArray(M13_BANK)) {
      const hit = M13_BANK.find(p =>
        (p.text || '').trim() === key && p.steps && p.steps.length
      );
      if (hit) {
        // 题库没有 aiFeedback 结构，用 normalizeAiFeedback 包一层
        const fb = normalizeAiFeedback({
          answer: {
            full: hit.answer?.full || (typeof hit.answer === 'string' ? hit.answer : ''),
            value: hit.answer?.value,
          },
          steps: hit.steps,
          judgement: { answer_correct: true },
          _source: 'bank',
        }, hit.answer?.full);
        return { aiFeedback: fb, source: 'bank' };
      }
    }
  } catch (e) {}

  return null;
}

/* ⭐ Koji 浮球：点击打开 AI 讲解弹窗 */
(function hookKoji() {
  const btn = document.getElementById('kojiBtn');
  if (!btn || btn.dataset._hooked) return;
  btn.dataset._hooked = '1';

  btn.addEventListener('click', () => {
    const module = document.querySelector('#modulePool .module.active');
    if (!module) { showToast('先进一个知识岛，再来找 Koji 💡', 'info'); return; }

    const id = module.id;
    let problemText = '';
    if (id === 'm1') {
      problemText = document.getElementById('m1expr')?.textContent?.trim() || '';
    } else if (id === 'm9') {
      const a = document.getElementById('m9a')?.value || '';
      const op = document.getElementById('m9op')?.value || '';
      const b = document.getElementById('m9b')?.value || '';
      problemText = `${a} ${op} ${b}`;
    } else if (id === 'm13') {
      problemText = document.getElementById('problem-text')?.innerText?.trim() || '';
    } else {
      problemText = module.querySelector('h2')?.textContent || '';
    }

    if (!problemText) {
      showToast('这一题还没开始，先做一步再问 Koji 吧', 'info');
      return;
    }

    // ⭐ 先查缓存
    const cached = findCachedFeedback(problemText);

    if (cached) {
      // 命中：直接展示缓存讲解，不调 AI
      showExplainModal();
      const fb = JSON.parse(JSON.stringify(cached.aiFeedback));
      fb._problemText = problemText;
      renderExplainResult(fb);

      // ⭐ 底部追加"还要更详细？"按钮
      appendKojiMoreButton(problemText);
    } else {
      // 未命中：弹窗里给两个选项，让用户选
      showKojiChoiceModal(problemText);
    }
  });
})();

function appendKojiMoreButton(problemText) {
  const body = document.getElementById('explainModalBody');
  if (!body) return;
  // 避免重复追加
  if (body.querySelector('.koji-more-wrap')) return;

  const wrap = document.createElement('div');
  wrap.className = 'koji-more-wrap';
  wrap.style.cssText = 'margin-top:16px;padding:14px 16px;background:#f5f3ff;border-radius:12px;border-left:4px solid #8b5cf6;';
  wrap.innerHTML = `
    <div style="font-size:13px;color:#6d28d9;font-weight:700;margin-bottom:10px;">
      💡 这是之前保存的讲解。还想让 AI 换个角度再讲一遍吗？
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn-secondary" id="kojiMoreBtn"
              style="flex:1;background:#fff;border:2px solid #8b5cf6;color:#6d28d9;font-weight:700;">
        🤖 让 AI 再讲一遍
      </button>
      <button class="btn-secondary" id="kojiCloseBtn"
              style="flex:1;background:#fff;border:2px solid #cbd5e1;color:#64748b;">
        够了，谢谢
      </button>
    </div>
  `;
  body.appendChild(wrap);

  document.getElementById('kojiCloseBtn').addEventListener('click', hideExplainModal);
  document.getElementById('kojiMoreBtn').addEventListener('click', async () => {
    wrap.remove();
    // 走原 explainWrongItem，但传 aiFeedback: null 强制调 AI
    await explainWrongItem({
      text: problemText,
      studentAnswer: '',
      studentSteps: [],
      aiFeedback: null,
    });
  });
}

function showKojiChoiceModal(problemText) {
  if (document.querySelector('.koji-choice-mask')) return;

  const mask = document.createElement('div');
  mask.className = 'koji-choice-mask';
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:10005;padding:20px;';
  mask.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:24px 22px 20px;width:360px;max-width:90vw;text-align:center;box-shadow:0 20px 60px rgba(15,23,42,.3);">
      <div style="font-size:40px;margin-bottom:12px;">🤖</div>
      <div style="font-size:16px;font-weight:800;color:#1e293b;margin-bottom:8px;">Koji 还不认识这道题</div>
      <div style="font-size:13px;color:#64748b;line-height:1.7;margin-bottom:18px;">
        这道题之前没有保存过讲解。<br>要我调用 AI 现场分析一遍吗？<br>
        <span style="color:#b45309;font-weight:700;">（会消耗一点时间和 token）</span>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn-secondary" id="kojiChoiceCancel"
                style="flex:1;padding:10px;border-radius:10px;font-weight:700;background:#f1f5f9;color:#475569;border:none;cursor:pointer;">
          先不用
        </button>
        <button class="btn" id="kojiChoiceGo"
                style="flex:1;padding:10px;border-radius:10px;font-weight:700;background:#8b5cf6;color:#fff;border:none;cursor:pointer;box-shadow:0 3px 0 #6d28d9;">
          让 AI 分析
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(mask);

  document.getElementById('kojiChoiceCancel').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });

  document.getElementById('kojiChoiceGo').addEventListener('click', async () => {
    mask.remove();
    await explainWrongItem({
      text: problemText,
      studentAnswer: '',
      studentSteps: [],
      aiFeedback: null,
    });
  });
}

/* ⭐ Koji 主动提示：用户卡住时，浮球冒泡 */
(function hookKojiProactive() {
  const btn = document.getElementById('kojiBtn');
  if (!btn) return;

  let stuckTimer = null;
  let errorCount = 0;
  let correctCount = 0;

  // ⭐ Koji 的三种状态
  const KOJI_STATE = {
    IDLE: 'idle',        // 默认
    ALERT: 'alert',      // 用户卡住了，脉冲
    RETREAT: 'retreat',  // 用户很顺利，退后变暗
  };

  function setKojiState(state) {
    btn.classList.remove('koji-idle', 'koji-alert', 'koji-retreat');
    btn.classList.add('koji-' + state);
    btn.dataset.state = state;

    if (state === 'alert') {
      btn.title = '卡住了？点我看看 🤖';
    } else if (state === 'retreat') {
      btn.title = '你做得很好，我不打扰你';
    } else {
      btn.title = 'Koji 助手';
    }
  }

  // 初始状态
  setKojiState(KOJI_STATE.IDLE);

  // ⭐ M1 答对：correctCount + 1，连对 3 次 → RETREAT
  const m1Fb = document.getElementById('m1InputFeedback');
  if (m1Fb) {
    new MutationObserver(() => {
      const txt = m1Fb.textContent;
      if (/✓ 正确/.test(txt)) {
        correctCount++;
        errorCount = 0;
        if (correctCount >= 3) setKojiState(KOJI_STATE.RETREAT);
        else setKojiState(KOJI_STATE.IDLE);
      } else if (/❌/.test(txt)) {
        errorCount++;
        correctCount = 0;
        if (errorCount >= 3) {
          setKojiState(KOJI_STATE.ALERT);
          showKojiBubble('卡住了？点我看看这步怎么算 🤖');
        }
      }
    }).observe(m1Fb, { childList: true, subtree: true, characterData: true });
  }

  // ⭐ M9 同理
  const m9Fb = document.getElementById('m9fb');
  if (m9Fb) {
    let last = '';
    new MutationObserver(() => {
      const txt = m9Fb.textContent;
      if (txt === last) return;
      last = txt;
      if (/✓ 正确/.test(txt)) {
        correctCount++;
        errorCount = 0;
        if (correctCount >= 3) setKojiState(KOJI_STATE.RETREAT);
        else setKojiState(KOJI_STATE.IDLE);
      } else if (/❌/.test(txt)) {
        errorCount++;
        correctCount = 0;
        if (errorCount >= 3) {
          setKojiState(KOJI_STATE.ALERT);
          showKojiBubble('卡住了？点我看看这一步 🤖');
        }
      }
    }).observe(m9Fb, { childList: true, subtree: true, characterData: true });
  }

  function showKojiBubble(text) {
    if (document.querySelector('.koji-bubble')) return;
    const bubble = document.createElement('div');
    bubble.className = 'koji-bubble';
    bubble.style.cssText = `
      position: fixed;
      bottom: max(88px, calc(env(safe-area-inset-bottom) + 88px));
      right: max(144px, calc(env(safe-area-inset-right) + 144px));
      background: #fff;
      border: 2px solid #8b5cf6;
      border-radius: 14px;
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 600;
      color: #5b21b6;
      box-shadow: 0 8px 24px rgba(139, 92, 246, .25);
      z-index: 999;
      max-width: 220px;
      animation: fadeUp .3s ease;
      cursor: pointer;
    `;
    bubble.textContent = text;
    bubble.addEventListener('click', () => {
      bubble.remove();
      btn.click();
    });
    document.body.appendChild(bubble);
    setTimeout(() => bubble.remove(), 8000);
  }

  // 监听 M1 的错误反馈
  const m1InputFb = document.getElementById('m1InputFeedback');
  if (m1InputFb) {
    new MutationObserver(() => {
      if (/❌/.test(m1InputFb.textContent)) {
        errorCount++;
        if (errorCount === 3) {
          showKojiBubble('卡住了？点我看看这步怎么算 🤖');
        }
      } else if (/✓/.test(m1InputFb.textContent)) {
        errorCount = 0;
      }
    }).observe(m1InputFb, { childList: true, subtree: true, characterData: true });
  }

  // 监听 M9 的错误反馈
  if (m9Fb) {
    let last = '';
    new MutationObserver(() => {
      const txt = m9Fb.textContent;
      if (txt === last) return;
      last = txt;
      if (/❌/.test(txt)) {
        errorCount++;
        if (errorCount === 3) {
          showKojiBubble('卡住了？点我看看这一步 🤖');
        }
      } else if (/✓|🎉/.test(txt)) {
        errorCount = 0;
      }
    }).observe(m9Fb, { childList: true, subtree: true, characterData: true });
  }

  // 60 秒无操作 → 也提示
  function resetStuckTimer() {
    clearTimeout(stuckTimer);
    stuckTimer = setTimeout(() => {
      const module = document.querySelector('#modulePool .module.active');
      if (!module) return;
      const id = module.id;
      if (id === 'm1' || id === 'm9' || id === 'm13') {
        showKojiBubble('有不会的地方吗？点我问问 🤖');
      }
    }, 60000);
  }
  ['click', 'keydown', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, resetStuckTimer, { passive: true });
  });
  resetStuckTimer();
})();

(function hookDailyComplete() {
  let shown = false;
  on(EVT.DATA_CHANGED, (payload) => {
    if (payload.source !== 'history') return;
    if (shown) return;

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayRecords = historyLoad().filter(r => r.timestamp >= todayStart.getTime());
    if (todayRecords.length < 5) return;

    // ⭐ 本次会话只弹一次
    if (sessionStorage.getItem('grade3_daily_complete_shown') === '1') return;
    sessionStorage.setItem('grade3_daily_complete_shown', '1');
    shown = true;

    const correct = todayRecords.filter(r => r.isCorrect).length;
    const rate = Math.round(correct / todayRecords.length * 100);

    showDailyComplete({ total: todayRecords.length, correct, rate });
  });
})();

//判断今日目标是否达成
function showDailyComplete({ total, correct, rate }) {
  if (document.querySelector('.daily-complete-mask')) return;

  const mask = document.createElement('div');
  mask.className = 'daily-complete-mask';
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:10010;padding:20px;';
  mask.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:32px 28px 24px;width:380px;max-width:92vw;text-align:center;box-shadow:0 20px 60px rgba(15,23,42,.3);">
      <div style="font-size:56px;margin-bottom:8px;">🎉</div>
      <div style="font-size:20px;font-weight:800;color:#15803d;margin-bottom:8px;">今日目标完成！</div>
      <div style="font-size:14px;color:#64748b;line-height:1.8;margin-bottom:20px;">
        今天做了 <b style="color:#2563eb;">${total}</b> 道题，<br>
        正确 <b style="color:#15803d;">${correct}</b> 道，正确率 <b style="color:#2563eb;">${rate}%</b>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn-secondary" id="dailyCompleteRest"
                style="flex:1;padding:12px;border-radius:12px;font-weight:700;background:#f1f5f9;color:#475569;border:none;cursor:pointer;font-family:inherit;">
          休息一下
        </button>
        <button class="btn" id="dailyCompleteMore"
                style="flex:1;padding:12px;border-radius:12px;font-weight:700;background:#2563eb;color:#fff;border:none;cursor:pointer;box-shadow:0 3px 0 #1d4ed8;font-family:inherit;">
          再来几题
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(mask);

  document.getElementById('dailyCompleteRest').addEventListener('click', () => {
    mask.remove();
    if (window.__shell?.navigate) window.__shell.navigate('home');
  });
  document.getElementById('dailyCompleteMore').addEventListener('click', () => {
    mask.remove();
  });
  mask.addEventListener('click', e => {
    if (e.target === mask) mask.remove();
  });
}

//掌握时生成“成就卡”
function showMasteryCard({ problemText, correctAnswer, takeaway }) {
  if (document.querySelector('.mastery-card-mask')) return;

  const mask = document.createElement('div');
  mask.className = 'mastery-card-mask';
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;z-index:10020;padding:20px;';
  mask.innerHTML = `
    <div class="mastery-card">
      <div class="mastery-card-glow"></div>
      <div class="mastery-card-inner">
        <div class="mastery-card-badge">🏆 已掌握</div>
        <div class="mastery-card-title">我又学会了一道题</div>
        <div class="mastery-card-problem">
          <div class="mastery-card-label">📝 题目</div>
          <div class="mastery-card-text">${escapeHtmlStrict(problemText)}</div>
        </div>
        <div class="mastery-card-answer">
          <div class="mastery-card-label">✅ 答案</div>
          <div class="mastery-card-answer-text">${escapeHtmlStrict(correctAnswer || '—')}</div>
        </div>
        ${takeaway ? `
          <div class="mastery-card-note">
            <div class="mastery-card-label">💡 一题一得</div>
            <div class="mastery-card-note-text">${escapeHtmlStrict(takeaway)}</div>
          </div>
        ` : ''}
        <div class="mastery-card-date">${new Date().toLocaleDateString('zh-CN')}</div>
        <div class="mastery-card-btns">
          <button class="mastery-card-close" id="masteryCardClose">继续做题</button>
          <button class="mastery-card-share" id="masteryCardShare">📤 分享</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(mask);

  document.getElementById('masteryCardClose').addEventListener('click', () => mask.remove());
  document.getElementById('masteryCardShare').addEventListener('click', () => {
    shareMasteryCard({ problemText, correctAnswer, takeaway });
  });
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
}

function shareMasteryCard({ problemText, correctAnswer, takeaway }) {
  const text = `🏆 我掌握了这道题！\n\n📝 ${problemText}\n✅ ${correctAnswer}${takeaway ? `\n💡 ${takeaway}` : ''}\n\n—— 来自「老爸数学互动课堂」`;

  if (navigator.share) {
    navigator.share({ title: '我掌握了这道题', text }).catch(err => {
      // ⭐ 用户取消不算失败
      if (err && err.name === 'AbortError') return;
      // ⭐ 其它失败要有反馈
      showToast('分享失败，试试截图保存', 'info');
    });
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('✅ 已复制到剪贴板，可以粘贴到微信', 'success');
    }).catch(() => {
      showToast('复制失败，请手动截图分享', 'info');
    });
  } else {
    showToast('请手动截图分享', 'info');
  }
}

function showParentSettingsModal() {
  if (document.querySelector('.parent-settings-mask')) return;
  const targets = targetLoad();

  const mask = document.createElement('div');
  const currentNote = (() => {
    try { return noteGetThisWeek() || {}; } catch (e) { return {}; }
  })();

  mask.className = 'parent-settings-mask';
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:10015;padding:20px;';
  mask.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:24px 22px 20px;width:380px;max-width:92vw;box-shadow:0 20px 60px rgba(15,23,42,.3);">
      <div style="font-size:17px;font-weight:800;color:#1e293b;margin-bottom:6px;">⚙️ 家长设置</div>
      <div style="font-size:12.5px;color:#64748b;margin-bottom:16px;">设置每天/每周的学习目标</div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;">
        ${[
          { key: 'dailyQuestions', label: '每天做题', min: 1, max: 20, unit: '道' },
          { key: 'dailyStreak', label: '每天连对', min: 1, max: 10, unit: '题' },
          { key: 'dailyMastered', label: '每天掌握', min: 1, max: 5, unit: '题' },
          { key: 'weeklyQuestions', label: '每周做题', min: 5, max: 100, unit: '道' },
          { key: 'wrongReview', label: '每天复习错题', min: 0, max: 10, unit: '道' },
        ].map(t => `
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="flex:1;font-size:13px;font-weight:700;color:#475569;">${t.label}</span>
            <input type="number" data-target-key="${t.key}" value="${targets[t.key]}" min="${t.min}" max="${t.max}" style="width:70px;padding:8px 10px;border:2px solid #e5e7eb;border-radius:8px;font-size:14px;font-weight:700;text-align:center;font-family:inherit;outline:none;">
            <span style="font-size:12px;color:#64748b;font-weight:600;">${t.unit}</span>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:10px;">
        <button id="parentSetReset" style="flex:1;padding:12px;border-radius:12px;background:#f1f5f9;color:#475569;border:none;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;">恢复默认</button>
        <button id="parentSetSave" style="flex:1;padding:12px;border-radius:12px;background:#2563eb;color:#fff;border:none;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;box-shadow:0 3px 0 #1d4ed8;">保存</button>
      </div>
  `;

  document.body.appendChild(mask);

  document.getElementById('parentSetReset').addEventListener('click', () => {
    targetReset();
    mask.remove();
    showToast('✅ 已恢复默认目标', 'success');
  });

  document.getElementById('parentSetSave').addEventListener('click', () => {
    const newTargets = { ...targets };
    mask.querySelectorAll('[data-target-key]').forEach(inp => {
      newTargets[inp.dataset.targetKey] = parseInt(inp.value, 10) || 1;
    });
    targetSave(newTargets);
    mask.remove();
    showToast('✅ 目标已保存', 'success');
    if (window.__shell?.renderHome) window.__shell.renderHome();
  });
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });

}

window.__showParentSettingsModal = showParentSettingsModal;

/* ⭐ 孩子打开时，弹未读家长留言 */
function showUnreadParentMsg() {
  const unread = msgUnread();
  if (!unread.length) return;
  if (sessionStorage.getItem('grade3_parent_msg_shown') === '1') return;
  sessionStorage.setItem('grade3_parent_msg_shown', '1');

  const msg = unread[0];

  const mask = document.createElement('div');
  mask.className = 'parent-msg-read-mask';
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;z-index:10018;padding:20px;';
  mask.innerHTML = `
    <div style="background:linear-gradient(135deg,#fff,#fdf2f8);border-radius:24px;padding:28px 24px 20px;width:340px;max-width:92vw;text-align:center;box-shadow:0 24px 80px rgba(236,72,153,.3);">
      <div style="font-size:56px;margin-bottom:8px;">💌</div>
      <div style="font-size:13px;color:#ec4899;font-weight:800;letter-spacing:1px;margin-bottom:10px;">${msg.from} 给你留了一句话</div>
      <div style="font-size:17px;font-weight:800;color:#1e293b;line-height:1.7;padding:16px;background:#fff;border-radius:14px;margin-bottom:16px;">
        ${escapeHtmlStrict(msg.text)}
      </div>
      <div id="parentMsgReplyBox" style="display:none;margin-bottom:12px;">
        <textarea id="parentMsgReplyInput" placeholder="回一句…" style="width:100%;padding:10px 12px;border:2px solid #fbcfe8;border-radius:10px;font-size:14px;font-family:inherit;outline:none;resize:none;height:60px;"></textarea>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="parentMsgReplyToggle" style="flex:1;padding:12px;border-radius:12px;background:#fdf2f8;color:#be185d;border:2px solid #fbcfe8;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;">💬 回一句</button>
        <button id="parentMsgReadClose" style="flex:1;padding:12px;border-radius:12px;background:#ec4899;color:#fff;border:none;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;box-shadow:0 3px 0 #be185d;">我看到了 ❤️</button>
      </div>
    </div>
  `;
  document.body.appendChild(mask);

  const replyBox = document.getElementById('parentMsgReplyBox');
  const replyInput = document.getElementById('parentMsgReplyInput');

  document.getElementById('parentMsgReplyToggle').addEventListener('click', () => {
    const willShow = replyBox.style.display === 'none';
    replyBox.style.display = willShow ? 'block' : 'none';
    if (willShow) replyInput.focus();
  });

  document.getElementById('parentMsgReadClose').addEventListener('click', () => {
    const reply = replyInput.value.trim();
    if (reply) msgReply(msg.id, reply);
    msgMarkAllRead();
    mask.remove();
    if (reply) showToast('💬 已回复，家长下次打开会看到', 'success');
  });
}

/* ============================================================
   M13 分步卡片 + 换题抽屉
   ============================================================ */
(function initM13Layout() {
  const section = document.getElementById('m13');
  if (!section) return;

  const STEPS = [...section.querySelectorAll('.m13-step')];
  const drawer = document.getElementById('problemPickerDrawer');
  const changeBtn = document.getElementById('problemChangeBtn');
  const pickerClose = document.getElementById('problemPickerClose');

  /* ---------- 1. 展开/折叠 ---------- */
  STEPS.forEach(step => {
    const hd = step.querySelector('.m13-step-hd');
    if (!hd) return;
    hd.addEventListener('click', e => {
      // 点标题时切换
      step.classList.toggle('expanded');
    });
  });

  /* ---------- 2. 完成状态判定 ---------- */
  function setStatus(stepNum, status) {
    const step = section.querySelector(`.m13-step[data-step="${stepNum}"]`);
    if (!step) return;
    const el = step.querySelector('.m13-step-status');
    if (!el) return;

    const prev = el.dataset.status;
    el.dataset.status = status;
    step.classList.toggle('completed', status === 'done');

    // 从"未完成"变为"完成"时，折叠自己，自动展开下一步
    if (status === 'done' && prev !== 'done') {
      step.classList.remove('expanded');
      const next = section.querySelector(`.m13-step[data-step="${stepNum + 1}"]`);
      if (next && !next.classList.contains('expanded')) {
        setTimeout(() => next.classList.add('expanded'), 200);
      }
    }
  }

  // 用于记录用户是否操作了高亮工具
  let hasUsedHighlight = false;
  // 监听高亮工具的点击
  section.querySelector('.hl-toolbar')?.addEventListener('click', (e) => {
    if (e.target.closest('.hl-btn') && !e.target.closest('.hl-clear')) {
      hasUsedHighlight = true;
      updateAllSteps();
    }
  });

  function updateAllSteps() {
    const problemText = document.getElementById('problem-text')?.innerText.trim() || '';

    // ⭐ Step 1：必须是有题目，且用户点击过高亮画笔，才算完成
    setStatus(1, (problemText && hasUsedHighlight) ? 'done' : 'pending');

    // Step 2：任一草稿 textarea 有内容
    const scratch = [...section.querySelectorAll('.scratch-cell textarea')];
    setStatus(2, scratch.some(t => t.value.trim()) ? 'done' : 'pending');

    // Step 3：至少一步「关系式 + 代入」都填
    const stepInputs = [...section.querySelectorAll('#formulaSteps input')];
    const relInputs = stepInputs.filter(i => i.dataset.field === 'rel');
    const subInputs = stepInputs.filter(i => i.dataset.field === 'sub');
    const hasFormula = relInputs.some((r, i) =>
      r.value.trim() && subInputs[i]?.value.trim()
    );
    setStatus(3, hasFormula ? 'done' : 'pending');

    // Step 4：pAnswer 有内容
    const pAnswer = document.getElementById('pAnswer');
    setStatus(4, pAnswer?.value.trim() ? 'done' : 'pending');
  }

  // 全局监听输入变化
  section.addEventListener('input', e => {
    if (
      e.target.closest('.m13-step') ||
      e.target.id === 'problem-text'
    ) {
      updateAllSteps();
    }
  });

  // ⭐ 首次渲染：展开第 1 步，其它折叠
  function resetSteps() {
    hasUsedHighlight = false; // ⭐ 重置高亮标记
    STEPS.forEach((step, i) => {
      step.classList.toggle('expanded', i === 0);
      step.classList.remove('completed');
      const status = step.querySelector('.m13-step-status');
      if (status) status.dataset.status = 'pending';
    });
    updateAllSteps();
  }
  resetSteps();

  // ⭐ 换题后重置
  // m13LoadProblem 是模块内函数，不改它；改用 MutationObserver 监听 problem-text
  const problemEl = document.getElementById('problem-text');
  if (problemEl) {
    let lastText = problemEl.innerText;
    new MutationObserver(() => {
      const cur = problemEl.innerText;
      if (cur !== lastText) {
        lastText = cur;
        if (cur.trim()) {
          // 有新题目，重置分步
          setTimeout(resetSteps, 80);
        }
      }
    }).observe(problemEl, { childList: true, subtree: true, characterData: true });
  }

  /* ---------- 3. 换题抽屉 ---------- */
  function openDrawer() {
    if (!drawer) return;
    drawer.style.display = 'flex';
    document.body.classList.add('modal-open');
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.style.display = 'none';
    document.body.classList.remove('modal-open');
  }

  changeBtn?.addEventListener('click', openDrawer);
  pickerClose?.addEventListener('click', closeDrawer);
  drawer?.addEventListener('click', e => {
    if (e.target === drawer) closeDrawer();
  });

  // 载入/使用/清空后关闭抽屉
  ['pLoad', 'pUseCustom', 'pClear'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      setTimeout(closeDrawer, 120);
    });
  });

  /* ---------- 4. 检查按钮的前置校验：关系式/代入 ---------- */
  // 复用原有 updateCheckBtnHint，但把它挂到 input 事件里
  function refreshCheckBtn() {
    if (typeof updateCheckBtnHint === 'function') {
      try { updateCheckBtnHint(); } catch (e) {}
    }
  }
  section.addEventListener('input', e => {
    if (e.target.closest('#formulaSteps')) refreshCheckBtn();
  });
  refreshCheckBtn();
})();

/* ⭐ 监听全局输入框聚焦，动态加 body class */
(function patchInputFocusClass() {
  // ⭐ 辅助函数：判断是否为可输入元素（包含 input、textarea 和 contenteditable）
  function isInputTarget(el) {
    if (!el) return false;
    return /INPUT|TEXTAREA/.test(el.tagName) || 
           el.isContentEditable || 
           el.closest('[contenteditable="true"]') !== null;
  }

  document.addEventListener('focusin', (e) => {
    if (isInputTarget(e.target)) {
      // 1. 加上类名，隐藏底栏和悬浮球
      document.body.classList.add('input-focused');

      // 2. 强制清除上一题遗留的“大拇指反馈条”
      const thumbBar = document.getElementById('thumbBar');
      if (thumbBar) {
        thumbBar.classList.remove('show', 'ok', 'err');
        // 如果是在 m13 输入题目，确保底部栏也消失
        if (e.target.id === 'problem-text') {
           const bottomBar = document.querySelector('.m13-bottom-bar');
           if (bottomBar) bottomBar.style.display = 'none';
        }
      }

      // 3. 延迟滚动，把输入框推到屏幕中间
      setTimeout(() => {
        try {
          e.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (err) {}
      }, 300);
    }
  });

  document.addEventListener('focusout', (e) => {
    if (isInputTarget(e.target)) {
      // 延迟检查，防止 iOS 切换输入法时误判失焦
      setTimeout(() => {
        const active = document.activeElement;
        if (!isInputTarget(active)) {
          document.body.classList.remove('input-focused');
          
          // 恢复 m13 底部栏
          const bottomBar = document.querySelector('.m13-bottom-bar');
          if (bottomBar) bottomBar.style.display = '';
        }
      }, 100);
    }
  });
})();