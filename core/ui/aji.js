/* core/ui/aji.js
   <Aji 全站通识陪学助教> —— 全局唯一聊天舱 + 重识知识注册表 + 双引擎路由
   ─────────────────────────────────────────────
   设计哲学（全时段陪伴，绝不阻断）：
   - Aji 不是"报错插件"，而是常驻的陪伴型助教。右下角**全局唯一悬浮球**永远在线：
     任何时刻点击 → 聊天舱平滑展开，绝不出现"点击无响应 / 请先做题"的阻断感。
   - 无模态干扰：展开时不加任何全局遮罩，学生可以边看提示边操作背后的算式。
   - 双引擎：本地规则优先（快思考，毫秒级）/ AI 大模型兜底（慢思考，通识讲解）。

   ── 三个对外能力 ──
   ① 全局唯一入口
        aji.open(intent?)     展开聊天舱并按路由规则推消息（永远可用）
        aji.registerModuleContext(cfg)   模块挂载时注册通识知识（不负责画 UI）
        aji.sendMessage(msg)  追加一条结构化消息
   ② 通用知识注入接口（模块只报数据，不画 UI）
        aji.registerModuleContext({
          moduleId: 'm2',
          topic: '两位数乘法',
          knowledgeCards: [
            { title: '乘法口诀', content: '…' },
            { title: '进位法则', content: '…' },
          ],
          problemText: () => '12 × 3 + 15',   // 可选：当前题目（无则返回 ''）
          progress:    () => '第 2 步算错了',   // 可选：当前步骤与错误记录
          isStarted:   () => true,             // 可选：是否已动过手（场景一/二分水岭）
          resolveLocal:(intent) => msg | null, // 可选：模块特化规则（优先于通识）
        });
      注册表按 moduleId 存放、按当前路由解析——切模块无需清理，不会留陈旧上下文。
   ③ 全局上下文提取机制（Context Collector）
        _collectContext() → { moduleId, topic, currentProblem, studentProgress, started }
        · moduleId      当前挂载模块（路由 hash #lesson/mX 解析）
        · topic         模块主题（注册信息拉取）
        · currentProblem 当前题目（无则 '无'）
        · studentProgress 当前步骤和错误记录（无则 '无'）
        · started       学生是否已动过手（未声明 isStarted 的模块退化为"有题目即算"）

   ── 路由规则（见 _route）──
   场景一 无题目上下文（刚进页面/未做题）：
        首次进入模块 → 打招呼「你好呀，我是 Aji…」→ 推 knowledgeCards 按钮气泡
        （点选渲染知识卡片）；模块没注册卡片 → AI 兜底（currentProblem 置「无」，
        用三年级语言讲概念）。再次点击只展开舱体，不重复刷屏。
   场景二 已动过手（做到一半/出错）：
        只推当前步骤的特定规则（m1 算理拆解 / m9 估算提示…），不刷问候语与卡片。
        浮条携带显式 intent（'hint'/'estimate'/'review'）时，模块点名要什么就给什么。
   场景三 用户直接打字提问：
        无论何时都绕过本地规则 → 直接触发 AI 引擎，
        System Prompt 前置注入当前上下文（题目、步骤、错误）；
        提问若像通识概念（"什么是余数？"）→ currentProblem 置「无」，讲概念本身。

   ── 消息 API（结构化数据）──
        aji.sendMessage({
          type: 'greeting' | 'knowledge' | 'hint' | 'estimate' | 'error_review',
          title: '这一步怎么想？',
          content: '…可信 HTML…',
          actions: [{ text: '我懂了', type: 'close'|'reply', onClick, style: 'primary' }],
        });
        点选 action 会以「用户气泡」落入聊天流（对话感），再触发 onClick。

   ── 悬浮球 / 空闲轻推 ──
   悬浮球常驻右下角（唯一入口）。requestIdleToast(ms, text, onClick) 只控制
   球旁那句**轻推文案**（nudge）——任何有效操作立刻收起，静置够久再浮现。

   ── 其它约定 ──
   - 键盘避让：visualViewport resize/scroll 动态抬升 hub 与球。
   - 位移一律走 GSAP 分量（xPercent/yPercent/x/y）——CSS transform 会被补间覆盖，
     严禁给聊天舱/球写 CSS translate(-50%,-50%)。
   - 样式类全部带 aji 命名空间（.aji-chat-hub / .aji-float-bubble / .aji-msg-chip…），
     防全局污染（历史上 .koji-btn 曾与旧页面类名撞车）。
   - 主题跟随 <html data-theme>；hub z-index 9996（键盘 9990、换题表 9995 之上）。
*/
import { gsap } from '../../js/vendor/gsap/index.js';
import { resolveApiUrl, LLM_CONFIG } from '../llm.js';

let instance = null;

const GREETING = '你好呀，我是 Aji。做题遇到困难，或者想复习方法，随时可以找我！';
/* 通识概念问法（"什么是余数？"）→ currentProblem 置「无」，讲概念本身不牵强联系当前题 */
const CONCEPT_RE = /什么是|是什么|啥是|啥意思|什么意思|为什么|怎么理解|如何理解|讲讲|解释|介绍一下/;
/* 指代「当前这题/这一步」的问法 → 仍是场景二，必须保留题目与进度上下文。
   否则"为什么这一步要进位？"会被误判成通识提问、把最该带的上下文丢掉。 */
const CONTEXT_RE = /这题|这道|这个题|这一步|这步|这里|这儿|上面|刚才|我(算|写|填)的|我的答案|接下来|下一步|第\s*[一二三四五六七八九十\d]+\s*步/;

const CSS = `
/* ── 聊天舱（.aji-chat-hub） ── */
.aji-chat-hub { position: fixed; right: 14px; bottom: 18px; z-index: 9996;
  width: min(340px, calc(100vw - 28px)); height: min(460px, calc(100vh - 120px));
  display: none; flex-direction: column;
  background: var(--aji-bg, #ffffff); color: var(--aji-text, #1e293b);
  border: 1px solid rgba(100,116,139,.22); border-radius: 18px;
  box-shadow: 0 18px 60px rgba(15,23,42,.28);
  font-family: inherit; overflow: hidden; }
.aji-hub-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px 10px;
  border-bottom: 1px solid rgba(100,116,139,.16); }
.aji-hub-avatar { font-size: 18px; }
.aji-hub-name { flex: 1; font-size: 14px; font-weight: 800; }
.aji-hub-close { border: none; background: transparent; color: var(--aji-text-soft, #64748b);
  font-size: 15px; cursor: pointer; padding: 2px 6px; border-radius: 8px; font-family: inherit; }
.aji-hub-close:active { transform: scale(.94); }
.aji-chat-msgs { flex: 1; overflow-y: auto; padding: 12px 12px 8px; display: flex;
  flex-direction: column; gap: 10px; scroll-behavior: smooth; }
.aji-msg { display: flex; gap: 8px; align-items: flex-start; }
.aji-msg .aji-msg-avatar { font-size: 16px; line-height: 1.2; flex: none; margin-top: 2px; }
.aji-msg-body { max-width: 82%; padding: 9px 12px; border-radius: 14px;
  background: var(--aji-msg-bg, #f1f5f9); color: var(--aji-text, #1e293b);
  font-size: 13.5px; line-height: 1.6; }
.aji-msg-title { font-weight: 800; margin-bottom: 3px; font-size: 13px; }
.aji-msg-content b { font-weight: 800; }
.aji-msg-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.aji-msg-chip { padding: 6px 12px; border-radius: 10px; border: 1.5px solid rgba(100,116,139,.4);
  background: var(--aji-bg, #ffffff); color: var(--aji-text, #1e293b); font-size: 13px;
  font-weight: 700; cursor: pointer; font-family: inherit; }
.aji-msg-chip:active { transform: scale(.97); }
.aji-msg-chip.primary { border-color: transparent; background: #29CC57; color: #fff; }
.aji-msg.aji-msg-user { justify-content: flex-end; }
.aji-msg.aji-msg-user .aji-msg-body { background: #29CC57; color: #fff; font-weight: 700;
  border-bottom-right-radius: 4px; }
.aji-msg.aji-msg-aji .aji-msg-body { border-top-left-radius: 4px; }
.aji-thinking { color: var(--aji-text-soft, #94a3b8); }
.aji-hub-inputbar { display: flex; gap: 8px; padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid rgba(100,116,139,.16); }
.aji-hub-input { flex: 1; min-width: 0; padding: 9px 12px; border-radius: 12px;
  border: 1.5px solid rgba(100,116,139,.3); background: transparent;
  color: var(--aji-text, #1e293b); font-size: 13.5px; font-family: inherit; outline: none; }
.aji-hub-input::placeholder { color: var(--aji-text-soft, #94a3b8); }
.aji-hub-send { padding: 9px 14px; border-radius: 12px; border: none; background: #29CC57;
  color: #fff; font-size: 13px; font-weight: 800; cursor: pointer; font-family: inherit; }
.aji-hub-send:active { transform: scale(.97); }
/* ── 右下角悬浮球（.aji-float-bubble，全局唯一入口，常驻） ── */
.aji-float-bubble { position: fixed; right: 18px; bottom: 24px; z-index: 9992;
  display: block; padding: 0; border: none; background: transparent; font-family: inherit;
  cursor: pointer; -webkit-tap-highlight-color: transparent; }
.aji-ball-inner { display: flex; align-items: center; gap: 8px; }
.aji-ball-avatar { flex: none; width: 48px; height: 48px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font-size: 22px;
  background: var(--aji-bg, #ffffff); border: 1px solid rgba(100,116,139,.28);
  box-shadow: 0 8px 30px rgba(15,23,42,.18); }
.aji-float-bubble:active .aji-ball-avatar { transform: scale(.94); }
/* 轻推文案（nudge）：静置够久才浮现，任何有效操作立刻收起 */
.aji-ball-text { display: none; max-width: min(230px, calc(100vw - 96px));
  padding: 9px 13px; border-radius: 14px; border: 1px solid rgba(100,116,139,.28);
  background: var(--aji-bg, #ffffff); color: var(--aji-text, #1e293b);
  box-shadow: 0 8px 30px rgba(15,23,42,.18);
  font-size: 13.5px; line-height: 1.55; text-align: left; }
.aji-ball-name { display: block; font-size: 12px; font-weight: 800;
  color: var(--aji-text-soft, #64748b); margin-bottom: 2px; }
.aji-ball-msg { display: block; }
.aji-float-bubble.aji-nudging .aji-ball-text { display: block; }
@media (prefers-reduced-motion: reduce) { .aji-chat-hub, .aji-float-bubble { transition: none; } }
`;

class Aji {
  constructor() {
    /* ---- 聊天舱 ---- */
    this.hub = document.createElement('div');
    this.hub.className = 'aji-chat-hub';
    this.hub.setAttribute('role', 'dialog');
    this.hub.setAttribute('aria-label', 'Aji 陪你学');
    this.hub.innerHTML = `
      <div class="aji-hub-head">
        <span class="aji-hub-avatar">🤖</span>
        <span class="aji-hub-name">Aji 陪你学</span>
        <button type="button" class="aji-hub-close" aria-label="收起">✕</button>
      </div>
      <div class="aji-chat-msgs"></div>
      <div class="aji-hub-inputbar">
        <input type="text" class="aji-hub-input" placeholder="问 Aji 一个问题…" aria-label="向 Aji 提问">
        <button type="button" class="aji-hub-send">发送</button>
      </div>`;
    this.msgsEl = this.hub.querySelector('.aji-chat-msgs');
    this.inputEl = this.hub.querySelector('.aji-hub-input');
    this.sendBtn = this.hub.querySelector('.aji-hub-send');

    /* ---- 右下角悬浮球（常驻，唯一入口） ---- */
    this.bubble = document.createElement('button');
    this.bubble.type = 'button';
    this.bubble.className = 'aji-float-bubble';
    this.bubble.setAttribute('aria-label', '找 Aji 帮忙');
    this.bubble.innerHTML = `
      <span class="aji-ball-inner">
        <span class="aji-ball-text">
          <span class="aji-ball-name">🤖 Aji</span>
          <span class="aji-ball-msg"></span>
        </span>
        <span class="aji-ball-avatar">🤖</span>
      </span>`;
    this.ballText = this.bubble.querySelector('.aji-ball-msg');

    for (const el of [this.hub, this.bubble]) {
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    const style = document.createElement('style');
    style.id = 'aji-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    /* ---- 状态 ---- */
    this.visible = false;       // 聊天舱展开
    this.bubbleVisible = false; // 悬浮球常驻可见
    this.nudging = false;       // 轻推文案浮现中（isToastVisible 语义）
    this._aiBusy = false;       // AI 请求进行中
    this.history = [];          // 上下文记忆：[{role:'aji'|'user', type, title, content, actions}|{role:'user', text}]
    this.modules = Object.create(null);  // ⭐ 通识知识注册表：moduleId → cfg
    this.greeted = Object.create(null);  // ⭐ 已打过招呼的模块（防重复推送）
    this._nudgeCb = null;
    this._idleTimer = null;
    this._idleCfg = null;
    this._lastRegistered = '';   // 最近注册的 moduleId（无路由时的兜底）

    this.hub.querySelector('.aji-hub-close').addEventListener('click', () => this.closeDrawer());
    this.bubble.addEventListener('click', () => {
      const cb = this._nudgeCb;
      this.hideToast();
      // 空闲轻推挂了场景回调（如"修复期求助"）→ 走该场景；否则走通用路由
      if (cb) cb();
      else this.open();
    });

    // ⭐ 输入区：用户主动提问 → 直接绕过本地规则，请求大模型
    this.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._submitInput(); });
    this.sendBtn.addEventListener('click', () => this._submitInput());

    this._onKey = (e) => { if (e.key === 'Escape' && this.visible) this.closeDrawer(); };
    window.addEventListener('keydown', this._onKey);

    // ⭐ 全局空闲计时器（捕获级）：任何有效操作 → 轻推文案立刻收起 + 计时重置
    this._onActivity = (e) => {
      if (e.target.closest?.('.aji-float-bubble, .aji-chat-hub')) return;   // 与 Aji 自身的交互不算"界面操作"
      if (this.nudging) this._fadeNudge();
      if (this._idleCfg) this._armIdleTimer();
    };
    document.addEventListener('pointerdown', this._onActivity, true);
    document.addEventListener('keydown', this._onActivity, true);

    // ⭐ 键盘避让：软键盘弹起时抬升 hub / 球
    const adjust = () => {
      try {
        if (!window.visualViewport) return;
        const kb = window.innerHeight - window.visualViewport.height;
        this.bubble.style.bottom = kb > 0 ? (kb + 14) + 'px' : '24px';
        this.hub.style.bottom = kb > 0 ? (kb + 14) + 'px' : '18px';
      } catch (e) { /* 环境不支持就保持默认位置 */ }
    };
    this._adjust = adjust;
    window.visualViewport?.addEventListener('resize', adjust);
    window.visualViewport?.addEventListener('scroll', adjust);

    this._applyTheme();
    this._themeObserver = new MutationObserver(() => this._applyTheme());
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // 悬浮球常驻：轻微上浮入场（位置走 gsap 分量，不碰 CSS transform）
    gsap.set(this.hub, { x: 28, y: 28, opacity: 0 });
    gsap.set(this.bubble, { opacity: 0, y: 10 });
  }

  get isDrawerOpen() { return this.visible; }
  get isToastVisible() { return this.nudging; }

  /* ============================================================
     ① 通用知识注入接口（模块只报数据，不负责画 UI）
     ============================================================ */
  registerModuleContext(cfg) {
    if (!cfg || !cfg.moduleId) return;
    this._lastRegistered = cfg.moduleId;
    this.modules[cfg.moduleId] = {
      moduleId: cfg.moduleId,
      topic: cfg.topic || '',
      knowledgeCards: Array.isArray(cfg.knowledgeCards) ? cfg.knowledgeCards.slice(0, 6) : [],
      problemText: typeof cfg.problemText === 'function' ? cfg.problemText : null,
      progress: typeof cfg.progress === 'function' ? cfg.progress : null,
      resolveLocal: typeof cfg.resolveLocal === 'function' ? cfg.resolveLocal : null,
      isStarted: typeof cfg.isStarted === 'function' ? cfg.isStarted : null,
    };
  }

  /* 兼容旧调用形态（m1/m9 早期版本用 setEngine({resolveLocal, buildContext})） */
  setEngine(engine) {
    if (!engine) return;
    this.registerModuleContext({
      moduleId: engine.moduleId,
      topic: engine.topic,
      knowledgeCards: engine.knowledgeCards,
      problemText: engine.problemText || (engine.buildContext ? () => {
        try { return (engine.buildContext() || {}).problemText || ''; } catch (e) { return ''; }
      } : null),
      progress: engine.progress || (engine.buildContext ? () => {
        try { return (engine.buildContext() || {}).studentSteps || ''; } catch (e) { return ''; }
      } : null),
      resolveLocal: engine.resolveLocal,
    });
  }

  /* ---- ② 全局上下文提取机制（Context Collector）---- */

  /** 当前挂载模块 id：路由 hash `#lesson/mX` 解析（切模块无需清理，绝不残留陈旧上下文）
      兜底：hash 缺失（如单模块测试台/直挂场景）时，退回最近一次注册的模块。 */
  _activeModuleId() {
    let hash = '';
    try { hash = String(location.hash || ''); } catch (e) { hash = ''; }
    const m = hash.match(/#lesson\/([A-Za-z0-9_-]+)/);
    if (m) return m[1];
    /* 非课页（#home/#growth/…）→ 明确无模块上下文，绝不残留上一次的注册信息 */
    if (hash.trim()) return '';
    /* 无路由（模块测试台/单模块直挂）→ 退回最近注册的模块 */
    return this._lastRegistered || '';
  }

  /** 安全调用模块回调（模块内部报错绝不冒泡成"点击无响应"） */
  _safe(fn, fallback = '') {
    if (typeof fn !== 'function') return fallback;
    try {
      const v = fn();
      return (v == null || v === '') ? fallback : String(v);
    } catch (e) { return fallback; }
  }

  /** 安全取布尔（模块回调异常 → 用兜底值） */
  _safeBool(fn, fallback = false) {
    if (typeof fn !== 'function') return fallback;
    try { return !!fn(); } catch (e) { return fallback; }
  }

  /** 上下文结构：{ moduleId, topic, currentProblem, studentProgress } */
  _collectContext() {
    const moduleId = this._activeModuleId();
    const cfg = this.modules[moduleId] || null;
    return {
      moduleId: moduleId || '无',
      topic: (cfg && cfg.topic) || '',
      currentProblem: this._safe(cfg && cfg.problemText, '无'),
      studentProgress: this._safe(cfg && cfg.progress, '无'),
      /* 学生是否已真的动过手：场景一（刚进页面未做题）与场景二（做到一半）的分水岭。
         未声明 isStarted 的模块退化为「有题目即有上下文」，与旧行为一致。 */
      started: this._safeBool(cfg && cfg.isStarted, this._safe(cfg && cfg.problemText, '') !== ''),
      cfg,
    };
  }

  _applyTheme() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    for (const el of [this.hub, this.bubble]) {
      const s = el.style;
      s.setProperty('--aji-bg', dark ? '#1e293b' : '#ffffff');
      s.setProperty('--aji-text', dark ? '#f1f5f9' : '#1e293b');
      s.setProperty('--aji-text-soft', dark ? '#cbd5e1' : '#94a3b8');
      s.setProperty('--aji-msg-bg', dark ? '#0f172a' : '#f1f5f9');
    }
  }

  _ensureAttached() {
    for (const el of [this.hub, this.bubble]) {
      if (!el.isConnected) document.body.appendChild(el);
    }
    if (!document.getElementById('aji-style')) {
      const style = document.createElement('style');
      style.id = 'aji-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    // ⭐ 只回填轻推文案节点（.aji-ball-msg），别错拿到外层 .aji-ball-text 容器
    this.ballText = this.bubble.querySelector('.aji-ball-msg') || this.ballText;
  }

  /* ============================================================
     ③ 路由与交互规则
     ============================================================ */

  /** ⭐ 全局唯一入口：任何求助交互都走这里。永远展开，绝不阻断。 */
  open(intent = '') {
    this._ensureAttached();
    this.openDrawer();          // 先展开——无论后面路由命中与否，舱一定打开
    try { this._route(intent); } catch (e) { /* 路由异常也绝不让点击无响应 */ }
  }

  /** 浮条唤起入口（旧名保留）：与 open 同义，附带 intent 场景分流 */
  handleAsk(userQuery = '', intent = '') {
    if (userQuery) { this._askAI(userQuery); return; }
    this.open(intent);
  }

  _route(intent) {
    const c = this._collectContext();
    const cfg = c.cfg;
    const first = !this.greeted[c.moduleId];

    /* ── 路由 1：本地规则优先（模块特化的"当前这一步"规则）──
       快思考，毫秒级返回；异常一律吞掉，绝不让点击无响应 */
    let local = null;
    if (cfg && cfg.resolveLocal) {
      try { local = cfg.resolveLocal(intent); } catch (e) { local = null; }
    }

    /* ── 显式 intent（浮条挂了场景回调，如回溯期 'review' / 估算邀请）──
       模块点名要什么就给什么，不看"是否已动过手" */
    if (intent) {
      if (local) this.sendMessage(local);
      else this._sceneOne(c, cfg, first);
      return;
    }

    /* ── 场景二：已动过手（做到一半 / 出错）──
       只给"这一步"的特定规则，用完即止，绝不刷问候语和知识卡片刷屏 */
    if (c.started && local) { this.sendMessage(local); return; }

    /* ── 场景一：无做题上下文（刚进页面 / 还没做题）──
       打招呼 + 通识知识卡片（点选渲染）；模块没注册卡片则 AI 讲概念。
       再次点击只展开舱体，不重复刷屏 */
    this._sceneOne(c, cfg, first);
  }

  /** 场景一：问候 + 核心法则卡片（模块没注册卡片 → AI 兜底讲概念） */
  _sceneOne(c, cfg, first) {
    if (!first) return;   // 已打过招呼：只展开舱体，不重复刷屏
    this.greeted[c.moduleId] = true;
    if (!this._hasGreeting()) {
      this.sendMessage({ type: 'greeting', title: '', content: GREETING });
    }
    if (cfg && cfg.knowledgeCards.length) {
      this._pushKnowledge(cfg);
      return;
    }
    if (c.moduleId !== '无') {
      /* 路由 3：模块没注册知识卡片 → currentProblem 置「无」，交给大模型讲概念 */
      this._askAI(`请用三年级听得懂的话，讲讲「${c.topic || c.moduleId}」最重要的方法和容易错的地方。`);
    }
  }

  /** 知识卡片按钮气泡：点选后以"用户气泡"落史，再渲染卡片正文 */
  _pushKnowledge(cfg) {
    if (!cfg.knowledgeCards.length) return;
    this.sendMessage({
      type: 'knowledge',
      title: `📚 ${cfg.topic || '复习'}`,
      content: '这些是这一关的核心方法，想复习哪一条？',
      actions: cfg.knowledgeCards.map((card) => ({
        text: card.title,
        onClick: () => this.sendMessage({
          type: 'knowledge',
          title: card.title,
          content: card.content,
          actions: [{ text: '我懂了', type: 'close' }],
        }),
      })),
    });
  }

  /* ⭐ AI 兜底：占位「让我想想…」→ 请求大模型 → 原位更新为回复；失败给温柔兜底 */
  async _askAI(userQuery) {
    this._ensureAttached();
    const entry = {
      role: 'aji', type: 'hint', title: '让我想想…',
      content: '<span class="aji-thinking">让我想想…</span>', actions: [],
    };
    this.history.push(entry);
    this._trim();
    this._render();
    this.openDrawer();
    this._aiBusy = true;
    try {
      const c = this._collectContext();
      const reply = await this._requestAI({
        moduleId: c.moduleId,
        topic: c.topic,
        // 场景三：纯通识提问（"什么是余数？"）→ 不牵强联系当前题目，currentProblem 置「无」；
        //   但问句若明确指代"这道题/这一步"（CONTEXT_RE），仍带上题目与进度
        currentProblem: (CONCEPT_RE.test(userQuery || '') && !CONTEXT_RE.test(userQuery || ''))
          ? '无（学生在问通识概念）' : c.currentProblem,
        studentProgress: c.studentProgress,
        knowledgeCards: c.cfg ? c.cfg.knowledgeCards : [],
        userQuery: userQuery || '我卡住了，该怎么想？',
      });
      entry.title = 'Aji 想到了';
      entry.content = this._escapeHtml(reply).replace(/\n/g, '<br>');
    } catch (e) {
      entry.title = '我这边暂时连不上大脑';
      entry.content = '别急，先按自己的节奏继续算；稍后再来问我。';
    } finally {
      this._aiBusy = false;
      this._render();
    }
  }

  /* ⭐ 系统提示词：前置注入当前上下文（题目、步骤、错误） */
  async _requestAI({ moduleId, topic, currentProblem, studentProgress, knowledgeCards, userQuery }) {
    const cards = Array.isArray(knowledgeCards) && knowledgeCards.length
      ? knowledgeCards.map((c) => `- ${c.title}`).join('\n')
      : '（本模块未登记通识卡片）';
    const systemPrompt = `你是 Aji，一位克制、耐心且有启发性的三年级数学助教。

【当前上下文】
当前模块：${moduleId}${topic ? `（${topic}）` : ''}
当前题目：${currentProblem}
学生当前的计算过程与错误：${studentProgress}
本模块通识要点：
${cards}
学生提问：${userQuery}

要求：
1. 绝对不要直接给出最终答案。
2. 用三年级学生听得懂的语言解释；学生问通识概念时（如"什么是余数"）就讲清概念本身，不要牵强联系当前题目。
3. 引导他发现自己是在哪一步算错的（例如进位、优先级）。
4. 每次回答控制在 3 句话以内，语气温和、鼓励。`;

    const apiUrl = resolveApiUrl();
    if (!apiUrl) throw new Error('AI 服务地址未配置');
    const headers = { 'Content-Type': 'application/json' };
    if (LLM_CONFIG.apiKey) headers.Authorization = `Bearer ${LLM_CONFIG.apiKey}`;
    const body = {
      model: LLM_CONFIG.model,
      messages: [{ role: 'system', content: systemPrompt }],
      temperature: 0.6,
      max_tokens: 300,
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let res;
    try {
      res = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('请求超时');
      throw new Error('网络请求失败：' + e.message);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('模型未返回有效内容');
    return text.trim();
  }

  /* ⭐ 输入区提交：学生主动提问 → 绕过本地规则 → 携带上下文请求大模型 */
  _submitInput() {
    const text = (this.inputEl.value || '').trim();
    if (!text || this._aiBusy) return;
    this.inputEl.value = '';
    this.history.push({ role: 'user', text });
    this._trim();
    this._render();
    this._askAI(text);
  }

  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  _trim() {
    if (this.history.length > 60) this.history.splice(0, this.history.length - 60);
  }

  /* ---- 聊天舱：统一消息机制 ---- */

  /** ⭐ 推送一条 Aji 消息并打开聊天舱。
      msg = { type, title, content(可信 HTML),
              actions: [{ text, type: 'close'|'reply', onClick, style: 'primary' }] } */
  sendMessage(msg = {}) {
    this._ensureAttached();
    this.history.push({
      role: 'aji',
      type: msg.type || 'hint',
      title: msg.title || '',
      content: msg.content || '',
      actions: Array.isArray(msg.actions) ? msg.actions.slice(0, 4) : [],
    });
    this._trim();
    this._render();
    this.openDrawer();
  }

  /* 依据 history 重建聊天流（状态记忆），并滚到最底 */
  _render() {
    const frag = document.createDocumentFragment();
    for (const m of this.history) {
      const row = document.createElement('div');
      row.className = 'aji-msg aji-msg-' + m.role;
      if (m.role === 'user') {
        const body = document.createElement('div');
        body.className = 'aji-msg-body';
        body.textContent = m.text;
        row.appendChild(body);
      } else {
        const av = document.createElement('div');
        av.className = 'aji-msg-avatar';
        av.textContent = '🤖';
        const body = document.createElement('div');
        body.className = 'aji-msg-body';
        if (m.title) {
          const t = document.createElement('div');
          t.className = 'aji-msg-title';
          t.textContent = m.title;
          body.appendChild(t);
        }
        const c = document.createElement('div');
        c.className = 'aji-msg-content';
        c.innerHTML = m.content;   // 可信 HTML（模块/本组件作者产出；AI 回复已转义）
        body.appendChild(c);
        if (m.actions && m.actions.length) {
          const acts = document.createElement('div');
          acts.className = 'aji-msg-chips';
          m.actions.forEach((a) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'aji-msg-chip' + (a.style === 'primary' ? ' primary' : '');
            b.textContent = a.text;
            b.addEventListener('click', () => {
              // ⭐ 用户选择以"用户气泡"落入聊天流（对话感），随后触发回调
              this.history.push({ role: 'user', text: a.text });
              this._trim();
              this._render();
              a.onClick?.();
              if (a.type === 'close') this.closeDrawer();
            });
            acts.appendChild(b);
          });
          body.appendChild(acts);
        }
        row.appendChild(body);
      }
      frag.appendChild(row);
    }
    this.msgsEl.replaceChildren(frag);
    this.msgsEl.scrollTop = this.msgsEl.scrollHeight;
  }

  openDrawer() {
    this._ensureAttached();
    if (this.visible) return;
    this.visible = true;
    this.hub.style.display = 'flex';
    gsap.fromTo(this.hub, { x: 28, y: 28, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.28, ease: 'power2.out', overwrite: 'auto' });
    this._adjust?.();
  }

  /** 聊天流里是否已有问候语（防同一句自我介绍连出两遍） */
  _hasGreeting() {
    return this.history.some((m) => m && m.type === 'greeting');
  }

  closeDrawer() {
    if (!this.visible) return;
    this.visible = false;
    gsap.to(this.hub, {
      x: 28, y: 28, opacity: 0, duration: 0.2, ease: 'power2.in', overwrite: 'auto',
      onComplete: () => { if (!this.visible) this.hub.style.display = 'none'; },
    });
  }

  /* ---- 右下角悬浮球（常驻唯一入口）+ 空闲轻推 ---- */

  /** 显示悬浮球（常驻）：首次挂载时轻微上浮入场 */
  showBall() {
    this._ensureAttached();
    if (this.bubbleVisible) return;
    this.bubbleVisible = true;
    this.bubble.style.display = 'block';
    gsap.fromTo(this.bubble, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
  }

  /** 立即浮现轻推文案：点击可触发 onClick（或走通用 open 路由） */
  showToast(text, onClick) {
    this._ensureAttached();
    this.showBall();
    this._nudgeCb = onClick || null;
    this.nudging = true;
    this.bubble.classList.add('aji-nudging');
    if (this.ballText) this.ballText.textContent = String(text || '');
    this._adjust?.();
  }

  /** 收起轻推文案（悬浮球本身常驻不消失）+ 清除挂起的空闲计时与场景请求 */
  hideToast() {
    if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; }
    this._idleCfg = null;
    this._nudgeCb = null;
    this._fadeNudge();
  }

  /** 场景声明：空闲 ms 毫秒后浮现轻推文案。全局任何有效操作都会重置这段静默计时。 */
  requestIdleToast(delayMs, text, onClick) {
    this._idleCfg = { delayMs, text, onClick };
    this._armIdleTimer();
  }

  _armIdleTimer() {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    if (!this._idleCfg) return;
    this._idleTimer = setTimeout(() => {
      this._idleTimer = null;
      const cfg = this._idleCfg;
      this.showToast(cfg.text, cfg.onClick);
    }, this._idleCfg.delayMs);
  }

  /* 活动触发的软淡出：只藏轻推文案，请求保留（静置后可再次浮现） */
  _fadeNudge() {
    if (!this.nudging) return;
    this.nudging = false;
    this.bubble.classList.remove('aji-nudging');
    if (this.ballText) this.ballText.textContent = '';
  }

  destroy() {
    this._themeObserver.disconnect();
    window.removeEventListener('keydown', this._onKey);
    document.removeEventListener('pointerdown', this._onActivity, true);
    document.removeEventListener('keydown', this._onActivity, true);
    window.visualViewport?.removeEventListener('resize', this._adjust);
    window.visualViewport?.removeEventListener('scroll', this._adjust);
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this.hub.remove();
    this.bubble.remove();
    document.getElementById('aji-style')?.remove();
    instance = null;
  }
}

/* 惰性单例：aji.open() / aji.sendMessage(...) 直读直调（spec 统一 API 形态） */
export function getAji() {
  if (!instance) { instance = new Aji(); instance.showBall(); }
  return instance;
}

export const aji = new Proxy({}, {
  get(_, key) {
    const impl = getAji();
    const v = impl[key];
    return typeof v === 'function' ? v.bind(impl) : v;
  },
  set(_, key, value) { getAji()[key] = value; return true; },
});
