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
  flex-direction: column; gap: 10px; scroll-behavior: smooth;
  /* ⭐ 滚动隔离：滑到边界不把整页带着橡皮筋回弹 */
  overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.aji-msg { display: flex; gap: 8px; align-items: flex-start; }
.aji-msg .aji-msg-avatar { font-size: 16px; line-height: 1.2; flex: none; margin-top: 2px; }
.aji-msg-body { max-width: 82%; padding: 9px 12px; border-radius: 14px;
  background: var(--aji-msg-bg, #f1f5f9); color: var(--aji-text, #1e293b);
  font-size: 13.5px; line-height: 1.6; }
.aji-msg-title { font-weight: 800; margin-bottom: 3px; font-size: 13px; }
.aji-msg-content b { font-weight: 800; }
/* ⭐ pre-wrap：流式增量直接用 textContent 写入（天然免 XSS），换行由 CSS 还原，
   省掉每来一个 chunk 就 escapeHtml+<br> 重排一次的抖动 */
.aji-msg-content { white-space: pre-wrap; word-break: break-word; }
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

/* ── 拖拽手柄：仅移动端底部抽屉形态显示 ── */
.aji-hub-grip { display: none; }

/* ══════════════════════════════════════════════════════════════
   移动端（<768px）：底部抽屉（Bottom Sheet）
   — 固定右下角浮窗在窄屏会横跨整个算式板，故改为自底部升起。
   — 位置一律走 gsap 分量（yPercent/xPercent），CSS 不写 transform
     （CSS transform 会被补间烘焙成 px，导致归位不了）。
   ══════════════════════════════════════════════════════════════ */
@media (max-width: 767px) {
  .aji-chat-hub {
    left: 0; right: 0; width: 100%; border-radius: 20px 20px 0 0;
    /* ⭐ 键盘托举用 bottom（不是 transform！）：GSAP 首次补间会把 CSS transform
       解析烘焙成 px 分量，导致后续 x/y 补间清不掉、抽屉永远卡在屏外 —— 项目已有此坑实录。
       --kb-height 由 visualViewport 写入，抽屉整体坐在键盘正上方。 */
    bottom: var(--kb-height, 0px);
    max-height: min(50dvh, 460px);
    height: min(50dvh, 420px);
  }
  .aji-hub-grip { display: flex; justify-content: center; padding: 8px 0 2px; flex: none;
    cursor: grab; touch-action: none; }
  .aji-hub-grip::before { content: ''; width: 40px; height: 4px; border-radius: 2px;
    background: rgba(100,116,139,.4); }
  .aji-hub-grip:active { cursor: grabbing; }
  .aji-hub-input { font-size: 16px; }   /* ⭐ ≥16px：iOS 聚焦时不再自动放大页面 */
}
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
      <div class="aji-hub-grip" aria-hidden="true"></div>
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
    this.gripEl = this.hub.querySelector('.aji-hub-grip');

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
    this._streamAbort = null;   // ⭐ 流式请求的 AbortController（关舱/切模块/新提问都要中断）
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
    // ⭐ 输入框聚焦：移动端抽屉被键盘托起后，保证输入区仍在可视范围内
    this.inputEl.addEventListener('focus', () => { this._adjust?.(); });

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
    //    · 写入 --kb-height 供移动端底部抽屉托举（CSS 用 bottom，不用 transform）
    //    · 桌面端仍用行内 bottom 微调
    const adjust = () => {
      try {
        if (!window.visualViewport) return;
        const kb = Math.max(0, Math.round(window.innerHeight - window.visualViewport.height));
        document.documentElement.style.setProperty('--kb-height', kb + 'px');
        this.bubble.style.bottom = kb > 0 ? (kb + 14) + 'px' : '24px';
        // 移动端 bottom 由 CSS 的 var(--kb-height) 接管，别写行内值覆盖它
        if (this._isMobile()) this.hub.style.bottom = '';
        else this.hub.style.bottom = kb > 0 ? (kb + 14) + 'px' : '18px';
        // ⭐ 抽屉也做空间让渡：键盘弹起后，抽屉按"给算式留够位置"收缩。
        //    否则 50dvh(390) + 键盘(300) 会把 780 高的屏幕占满，算式必然被压住重叠。
        this._fitDrawerToViewport(kb);
      } catch (e) { /* 环境不支持就保持默认位置 */ }
      // ⭐ 键盘/视口变化后重算算式让位带（抽屉托起/收缩后带上缘跟着变）
      this.reflowStage();
    };
    this._adjust = adjust;
    this._adjust = adjust;
    window.visualViewport?.addEventListener('resize', adjust);
    window.visualViewport?.addEventListener('scroll', adjust);
    window.addEventListener('resize', adjust);

    this._applyTheme();
    this._themeObserver = new MutationObserver(() => this._applyTheme());
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    this._bindGrip();

    // 悬浮球常驻：轻微上浮入场（位置走 gsap 分量，不碰 CSS transform）
    gsap.set(this.hub, { x: 28, y: 28, opacity: 0 });
    gsap.set(this.bubble, { opacity: 0, y: 10 });
  }

  /** 移动端（<768px）→ 底部抽屉形态；桌面端 → 右侧浮窗 */
  _isMobile() {
    try { return window.matchMedia('(max-width: 767px)').matches; } catch (e) { return false; }
  }

  /* ============================================================
     算式容器让位（空间避让）
     ─────────────────────────────────────────────────────────────
     设计师要求"不遮挡核心算式 + 算式处于视觉重心居中"。
     实现取"带内居中"：把算式舞台在 [页头, 舱体上缘-安全间距] 这条可视带里
     重新垂直居中 —— 比"上移一个死值 + 缩放"更强：数学上保证零重叠，
     且天然落在视觉重心。刻意不做 scale（38px 字号是全站冻结契约）。
     ───────────────────────────────────────────────────────────── */
  registerStage({ moduleId, el, extra = [], gap = 20, onRest = null } = {}) {
    if (!moduleId || !el) return;
    this._stage = {
      moduleId, el,
      extra: Array.isArray(extra) ? extra.filter(Boolean) : [],
      gap,
      onRest: typeof onRest === 'function' ? onRest : null,   // 模块自带的居中逻辑（收起时交还）
    };
  }

  clearStage(moduleId) {
    if (this._stage && (!moduleId || this._stage.moduleId === moduleId)) {
      this._stage = null;
      this._stageCy = 0;
    }
  }

  /** 当前让位管线是否由 Aji 接管该模块（模块的 centerStage 据此让路，防两套 transform 打架） */
  stageOwned(moduleId) {
    return !!(this._stage && this._stage.moduleId === moduleId && this.visible);
  }

  /** 让位是否仍然生效（含收起态，供模块决定是否交还） */
  hasStage(moduleId) {
    return !!(this._stage && this._stage.moduleId === moduleId);
  }

  /** ⭐ 移动端：键盘弹起时收缩抽屉，给算式留出可视空间（算式优先，抽屉让渡）。
      高度由「算式实际需要多少」反推，不用魔法常量——
      420×780 + 300px 键盘时，50dvh(390) 会把算式挤到重叠，必须按需收缩。
      仅在移动端生效；桌面端键盘不遮挡抽屉，无需干预。 */
  _fitDrawerToViewport(kb) {
    if (!this._isMobile()) return;
    if (!this.visible) { this.hub.style.height = ''; return; }
    const st = this._stage;
    if (!st || !st.el) { this.hub.style.height = ''; return; }
    const vh = window.innerHeight || 0;
    const bottomY = vh - (kb || 0);                    // 抽屉底边贴键盘上沿
    const gap = st.gap || 20;
    const bandTop = this._stageBandTop();
    // ⭐ 抽屉高度只按"算式容器"反推（任务书要保护的就是算式本身）。
    //    反馈行随组上移，必要时整体隐在抽屉之后——但绝不半截裁切。
    //    ⚠️ 用"算式+反馈行"的整体高度反推是错的：420×780 上会算出 25px 的抽屉，
    //    而点算式的正是这只手，抽屉必须留够可读高度。
    const boardH = st.el.offsetHeight || 150;
    // 算式占据 [bandTop, bandTop+boardH]，抽屉只能从它下方 gap 处开始
    const room = bottomY - gap - (bandTop + boardH) - gap;
    // 下限 175：键盘弹起时只求 头(≈44)+最后一两行消息+输入行(≈52) 可见
    //   （学生此刻在打字，完整历史等收起键盘再看）。
    //   不能用更小的值：压到 150 会把消息区整个吞掉，让位就失去意义。
    const h = Math.max(175, Math.min(330, room));
    this.hub.style.height = Math.round(h) + 'px';
  }

  /** 算式可视带的顶部：内容卡片上缘（布局坐标换算到视口，避开页头与标签行） */
  _stageBandTop() {
    try {
      const card = this._stage.el.closest?.('.card') || this._stage.el.parentElement;
      if (card) {
        let docTop = 0, node = card;
        while (node && node !== document.body) { docTop += node.offsetTop; node = node.offsetParent; }
        const top = docTop - (window.scrollY || 0);
        // 页头是 sticky 的，带顶不得钻到它下面
        return Math.max(56, Math.round(top));
      }
    } catch (e) { /* 结构异常就用兜底 */ }
    return 64;
  }

  /** 舱体上缘（视口坐标） */
  _hubTopEdge() {
    try {
      const r = this.hub.getBoundingClientRect();
      if (r.height > 0) return r.top;
    } catch (e) {}
    return window.innerHeight;
  }

  _setStageShift(active) {
    const st = this._stage;
    if (!st || !st.el) return;
    if (!active) {
      // ⭐ 收起：清接管量 + 恢复反馈行透明度，交还模块自带居中（它能正确处理软键盘）
      this._stageCy = 0;
      for (const ex of st.extra) {
        if (ex && ex.isConnected && ex.style.opacity === '0') {
          gsap.to(ex, { opacity: 1, duration: 0.2, overwrite: 'auto' });
        }
      }
      st.onRest?.();
      return;
    }
    if (!st.el.isConnected) return;
    const extras = st.extra.filter((el) => el && el.isConnected);

    // 用 offsetTop 链算布局位置（对 transform 免疫；rect.top 在补间中途会漂移）
    const docTopOf = (el) => { let t = 0, n = el; while (n && n !== document.body) { t += n.offsetTop; n = n.offsetParent; } return t; };
    const scrollY = window.scrollY || 0;
    const stageTopDoc = docTopOf(st.el);
    const stageTop = stageTopDoc - scrollY;
    const boardH = st.el.offsetHeight || 120;

    // 组整体外框 = 算式 + 其下反馈行的最低缘
    let groupBottomDoc = stageTopDoc + boardH;
    for (const ex of extras) groupBottomDoc = Math.max(groupBottomDoc, docTopOf(ex) + ex.offsetHeight);
    const groupH = Math.max(boardH, groupBottomDoc - stageTopDoc);

    const gap = st.gap || 20;
    // ⚠️ 带顶不能硬编码 64：课页在页头之下还有一排标签（无括号/有括号…），
    //    内容真正的起点是卡片上缘。用实测值，否则算式会被顶到标签行上。
    const bandTop = this._stageBandTop();
    const hubTop = this._hubTopEdge();
    let bandBottom = hubTop - gap;                // ⭐ 算式绝不许伸进舱体
    const bandH = Math.max(boardH, bandBottom - bandTop);

    // ⭐ 两档自适应：
    //   ① 组装得下 → 整组（算式+反馈行）在带内居中，全部可见；
    //   ② 组装不下（窄屏 + 软键盘）→ 只保算式居中，反馈行淡出
    //      （半截裁切比暂时隐藏更难看；算式优先是任务书的硬要求）。
    const groupFits = groupH <= bandH;
    const useH = groupFits ? groupH : boardH;
    if (bandBottom - bandTop < useH) bandBottom = bandTop + useH;

    const targetTop = bandTop + Math.max(0, (bandBottom - bandTop) / 2 - useH / 2);
    const delta = Math.round(targetTop - stageTop);

    for (const ex of extras) {
      const bottom = (docTopOf(ex) - scrollY) + delta + ex.offsetHeight;
      const want = (groupFits || bottom <= hubTop - 2) ? 1 : 0;
      gsap.to(ex, { opacity: want, duration: 0.2, overwrite: 'auto' });
    }

    if (delta === this._stageCy) return;
    this._stageCy = delta;
    gsap.to([st.el, ...extras], { y: delta, duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
  }

  /** 视口/键盘变化时重算让位（模块与 Aji 自身都调这里，保持单一 transform 管线） */
  reflowStage() {
    if (this._stage && this.visible) this._setStageShift(true);
  }

  /** ⭐ 移动端抽屉：下滑手势收起（原生 Pointer 事件，未 vendor GSAP Draggable） */
  _bindGrip() {
    const grip = this.gripEl;
    if (!grip) return;
    let startY = 0, dragging = false;
    const down = (e) => {
      dragging = true; startY = e.clientY;
      try { grip.setPointerCapture(e.pointerId); } catch (err) {}
    };
    const move = (e) => {
      if (!dragging) return;
      const dy = Math.max(0, e.clientY - startY);
      gsap.set(this.hub, { y: dy });          // 跟手下移（仅 y，不碰 opacity）
      if (dy > 4) e.preventDefault();
    };
    const up = (e) => {
      if (!dragging) return;
      dragging = false;
      const dy = Math.max(0, (e.clientY || 0) - startY);
      if (dy > 80) { this.closeDrawer(); }     // 下滑够远 → 收起
      else gsap.to(this.hub, { y: 0, duration: 0.2, ease: 'power2.out', overwrite: 'auto' });  // 回弹
    };
    grip.addEventListener('pointerdown', down);
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
    this._gripHandlers = { down, move, up };
  }

  get isDrawerOpen() { return this.visible; }
  get isToastVisible() { return this.nudging; }

  /* ============================================================
     ① 通用知识注入接口（模块只报数据，不负责画 UI）
     ============================================================ */
  registerModuleContext(cfg) {
    if (!cfg || !cfg.moduleId) return;
    // ⭐ 切换模块：掐断上一个模块未完成的流 + 释放上一个模块的让位接管
    if (this._lastRegistered && this._lastRegistered !== cfg.moduleId) {
      this._abortStream();
      this._aiBusy = false;
    }
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

  /* ⭐ AI 兜底（流式）：占位「让我想想…」→ SSE 逐块追加 → 原位打字机；失败给温柔兜底 */
  async _askAI(userQuery) {
    this._ensureAttached();
    this._abortStream();          // ⭐ 新提问先掐断上一次未完成的流（防串台/内存泄漏）
    // ⚠️ 身份令牌：被中断的旧流，其 catch/finally 是异步才跑到的，
    //    若不校验身份就会把新流刚设的 controller / busy 标志覆盖成 null/false，
    //    导致此后关舱再也中断不了新流（请求继续跑，白烧 token）。
    const token = {};
    this._streamToken = token;
    const entry = {
      role: 'aji', type: 'hint', title: '让我想想…',
      content: '<span class="aji-thinking">让我想想…</span>', actions: [],
    };
    this.history.push(entry);
    this._trim();
    this._render();
    this.openDrawer();
    this._aiBusy = true;
    let gotAny = false;
    try {
      const c = this._collectContext();
      await this._streamAI({
        moduleId: c.moduleId,
        topic: c.topic,
        // 场景三：纯通识提问（"什么是余数？"）→ 不牵强联系当前题目，currentProblem 置「无」；
        //   但问句若明确指代"这道题/这一步"（CONTEXT_RE），仍带上题目与进度
        currentProblem: (CONCEPT_RE.test(userQuery || '') && !CONTEXT_RE.test(userQuery || ''))
          ? '无（学生在问通识概念）' : c.currentProblem,
        studentProgress: c.studentProgress,
        knowledgeCards: c.cfg ? c.cfg.knowledgeCards : [],
        userQuery: userQuery || '我卡住了，该怎么想？',
      }, (delta) => {
        // ⭐ 打字机：每个增量以 textContent 追加（免 XSS、免重排抖动）
        if (!gotAny) { gotAny = true; entry.title = 'Aji 想到了'; entry.content = ''; entry.plain = true; this._patchEntry(entry); }
        entry.content += delta;
        this._patchEntry(entry);
      });
      if (!gotAny) throw new Error('模型未返回有效内容');
    } catch (e) {
      if (e && e.name === 'AbortError') {
        // ⭐ 主动中断（关舱/切模块/发新提问）：不是错误，安静收尾
        if (!gotAny) this.history.splice(this.history.indexOf(entry), 1);
        else this._patchEntry(entry);
      } else {
        entry.title = '我这边暂时连不上大脑';
        entry.content = gotAny
          ? entry.content + '\n（后面没接上，可以再问我一次。）'
          : '别急，先按自己的节奏继续算；稍后再来问我。';
        this._patchEntry(entry);
      }
    } finally {
      // ⭐ 只有"当前流"才能清状态；被取代的旧流不得覆盖新流的 controller
      if (this._streamToken === token) {
        this._aiBusy = false;
        this._streamAbort = null;
        this._streamToken = null;
        this._render();
      }
    }
  }

  /** ⭐ 单条消息原位打补丁（流式追加用，避免整列表重建把滚动位置弹回去） */
  _patchEntry(entry) {
    const idx = this.history.indexOf(entry);
    if (idx < 0) return;
    const row = this.msgsEl.children[idx];
    const body = row && row.querySelector('.aji-msg-content');
    if (body) {
      body.textContent = entry.content;
      const t = row.querySelector('.aji-msg-title');
      if (t) t.textContent = entry.title || '';
    } else {
      this._render();
      return;
    }
    this._scrollToBottom();
  }

  _scrollToBottom() {
    try { this.msgsEl.scrollTop = this.msgsEl.scrollHeight; } catch (e) {}
  }

  /* ⭐ 系统提示词：前置注入当前上下文（题目、步骤、错误） */
  _buildSystemPrompt({ moduleId, topic, currentProblem, studentProgress, knowledgeCards, userQuery }) {
    const cards = Array.isArray(knowledgeCards) && knowledgeCards.length
      ? knowledgeCards.map((c) => `- ${c.title}`).join('\n')
      : '（本模块未登记通识卡片）';
    return `你是 Aji，一位克制、耐心且有启发性的三年级数学助教。

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
  }

  /** ⭐ SSE 流式请求：逐 chunk 解析 `data: {...}`，把正文增量交给 onDelta */
  async _streamAI(ctx, onDelta) {
    const apiUrl = resolveApiUrl();
    if (!apiUrl) throw new Error('AI 服务地址未配置');
    const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
    if (LLM_CONFIG.apiKey) headers.Authorization = `Bearer ${LLM_CONFIG.apiKey}`;
    const body = {
      model: LLM_CONFIG.model,
      messages: [{ role: 'system', content: this._buildSystemPrompt(ctx) }],
      temperature: 0.6,
      max_tokens: 300,
      stream: true,   // ⭐ 后端据此走 SSE 透传
    };

    const controller = new AbortController();
    this._streamAbort = controller;
    const timer = setTimeout(() => controller.abort(), 30000);
    let res;
    try {
      res = await fetch(apiUrl, {
        method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw e;
      throw new Error('网络请求失败：' + e.message);
    }
    if (!res.ok) {
      clearTimeout(timer);
      throw new Error(`API ${res.status}`);
    }

    // ⭐ 兼容非流式回退：按 Content-Type 判定（不能只看"有没有 body 流"——
    //    fetch 的响应永远有 body 流，那样会把 JSON 误当 SSE 解析、正文全丢）。
    //    真实场景：反代/CDN 剥掉流式、旧版后端、或网关返回 JSON 错误体。
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (!ctype.includes('text/event-stream') || !res.body || !res.body.getReader) {
      clearTimeout(timer);
      const raw = await res.text().catch(() => '');
      let text = '';
      try {
        const data = JSON.parse(raw);
        text = data?.choices?.[0]?.message?.content
          || data?.choices?.[0]?.delta?.content
          || data?.error?.message || '';
      } catch (e) { text = raw; }   // 纯文本响应也照单收下
      if (typeof text !== 'string' || !text.trim()) throw new Error('模型未返回有效内容');
      onDelta(text.trim());
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';
    let finished = false;
    try {
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE 以空行分隔事件；保留最后一个不完整片段
        const parts = buf.split(/\r?\n\r?\n/);
        buf = parts.pop() || '';
        for (const part of parts) {
          const payload = this._parseSSE(part);
          if (payload === null) continue;
          if (payload === '[DONE]') { finished = true; break; }
          let json;
          try { json = JSON.parse(payload); } catch (e) { continue; }
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) onDelta(delta);
          if (json?.choices?.[0]?.finish_reason) { /* 结束标记，等 [DONE] 或流结束 */ }
        }
      }
    } finally {
      clearTimeout(timer);
      try { reader.cancel().catch(() => {}); } catch (e) {}
    }
  }

  /** 从单个 SSE 事件块里取出 data 行内容（多行 data 按 SSE 规范用 \n 拼接） */
  _parseSSE(block) {
    const lines = String(block).split(/\r?\n/);
    const dataLines = [];
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;   // 忽略 event: / id: / 注释行
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (!dataLines.length) return null;
    return dataLines.join('\n');
  }

  /** ⭐ 中断当前流式请求（关舱 / 切模块 / 发新提问时调用） */
  _abortStream() {
    if (this._streamAbort) {
      try { this._streamAbort.abort(); } catch (e) {}
      this._streamAbort = null;
    }
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
        // ⭐ m.plain = AI 流式增量（纯文本，走 textContent 免 XSS 且不重排）；
        //    其余为模块/组件作者产出的可信 HTML
        if (m.plain) c.textContent = m.content;
        else c.innerHTML = m.content;
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
    if (this.visible) { this._adjust?.(); this._setStageShift(true); return; }
    this.visible = true;
    this.hub.style.display = 'flex';
    gsap.fromTo(this.hub, { x: 28, y: 28, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.28, ease: 'power2.out', overwrite: 'auto' });
    this._adjust?.();
    this._setStageShift(true);   // ⭐ 展开后算式容器让位（带内居中，绝不与舱体重叠）
  }

  /** 聊天流里是否已有问候语（防同一句自我介绍连出两遍） */
  _hasGreeting() {
    return this.history.some((m) => m && m.type === 'greeting');
  }

  closeDrawer() {
    if (!this.visible) return;
    this.visible = false;
    this._abortStream();     // ⭐ 收舱即刻中断未完成的流式请求（Network 里能看到 canceled）
    this._setStageShift(false);   // ⭐ 算式容器平滑归位
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
    window.removeEventListener('resize', this._adjust);
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._abortStream();          // ⭐ 卸载时掐断在飞的流
    this._stage = null;
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
