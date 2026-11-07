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

   ── 移动端交互（吸附 + 输入） ──
   · 拖拽吸附：只有移动端可拖（桌面是"不遮挡"的浮窗，拖全屏反而毁掉这个意义）。
     手柄 + 消息列表都能起拖，但**列表未滚到顶时下拉一律还给原生滚动**——
     判定必须在 pointermove 里实时做（学生会先滚到顶再接着往下拉）。
   · 高度唯一权威 = `_hubTargetH(state)`：吸附态 × "算式不许被顶出去"的交集，
     一处算出。刻意不再有第二个控制器（历史上 _fitDrawerToViewport 是独立第二个）。
   · 输入禁用原生键盘（readonly + inputmode=none）、改用聊天键盘
     core/ui/chat-keypad.js —— **与做题键盘虚拟键盘完全隔离的两个实例**，
     复用会覆盖 m1/m9 的 maxLength 计数、打断判卷链路。

   ── 其它约定 ──
   - 键盘避让：visualViewport resize/scroll 动态抬升 hub 与球。
   - 位移一律走 GSAP 分量（xPercent/yPercent/x/y）——CSS transform 会被补间覆盖，
     严禁给聊天舱/球写 CSS translate(-50%,-50%)。
   - 样式类全部带 aji 命名空间（.aji-chat-hub / .aji-float-bubble / .aji-msg-chip…），
     防全局污染（历史上 .koji-btn 曾与旧页面类名撞车）。
   - 主题跟随 <html data-theme>；hub z-index 9996（做题键盘 9990、聊天键盘 9997 之上）。
   - ⭐ 换题抽屉（.b1-sheet / .b1-mask，z-index 9995）已随"视觉重心归零"整体移除，
     m1/m9 的换题与载入算式改由 Aji 对话本地路由接管（零 LLM）。
   - ⭐ 绝不写 document.body.style.paddingBottom —— 那是"背后算式重排跳动"的唯一来源
     （做题键盘 virtual-keypad.show() 就是这么干的，聊天键盘刻意不跟）。
*/
import { gsap } from '../../js/vendor/gsap/index.js';
import { resolveApiUrl, LLM_CONFIG } from '../llm.js';
import { getChatKeypad } from './chat-keypad.js';
import { activeModules } from '../../app/active-modules.js';
import { historyClear, historyLoad } from '../history.js';
import { wbClear, wbLoad } from '../wrongbook.js';
import { takeawayListAll } from '../takeaway.js';
import { lsRemove, lsKeysByPrefix } from '../storage.js';
import {
  captureInterests, learnerTagSummary, interestSummary,
  wrongDigest, topWrongTags, eventsLoad, eventsClear, memoryClear, memoryLoad,
} from '../learner.js';

let instance = null;

const GREETING = '你好呀，我是 Aji。做题遇到困难，或者想复习方法，随时可以找我！';
/* 通识概念问法（"什么是余数？"）→ currentProblem 置「无」，讲概念本身不牵强联系当前题 */
const CONCEPT_RE = /什么是|是什么|啥是|啥意思|什么意思|为什么|怎么理解|如何理解|讲讲|解释|介绍一下/;
/* 指代「当前这题/这一步」的问法 → 仍是场景二，必须保留题目与进度上下文。
   否则"为什么这一步要进位？"会被误判成通识提问、把最该带的上下文丢掉。 */
const CONTEXT_RE = /这题|这道|这个题|这一步|这步|这里|这儿|上面|刚才|我(算|写|填)的|我的答案|接下来|下一步|第\s*[一二三四五六七八九十\d]+\s*步/;

/* ⭐ 记忆检索问法（本地规则，毫秒级，零 LLM 成本）：
   "我哪里错得最多 / 我所有的错题 / 我的错题本" → 聚合 Tag + 给一个错题本跳转按钮。
   刻意不走大模型：这类问题的答案是本地数据，LLM 只会瞎编。 */
const WRONGBOOK_RE = /错题本|错题(清单|列表|记录)|所有.{0,3}错题|我的错题|错得最多|错的最多|哪里错|哪些错|最薄弱|学得不好|哪里学得不好|薄弱/;
const HISTORY_RE = /上(一道|道)题|刚才(那道|这题)|上一题|我(错|算错)哪/;

/* ⭐ 「这一步对吗」类问法（本地比对，毫秒级，零 LLM 成本）：
   学生问的是一道可以直接用等号判定的问题，标准答案就在手上——
   交给大模型既慢又可能瞎编。命中即前端对比标准答案，直接给结论。
   ⚠️ 只管"对不对"，不管"为什么错"：后者仍走大模型（要讲算理、要引导思考）。 */
const CHECK_STEP_RE = /(这|那)?\s*(一)?步\s*(对|错|对吗|对不对|正确|做得对)|我(填|算|写)得(对|错)|我(这|那)个(对|错)|对不对|对吗|错了吗|算对了吗|对吗\?/;
/* ⭐ 设置类诉求（本地接管，绝不交给大模型"假装已完成"）：
   清空记录/重置进度这类是不可逆动作，必须本地执行 + 二次确认。
   ⚠️ 必须容忍中间的定语：学生最自然的说法恰恰是「清空**我的**进度」，
      只写 `清空(进度|记录)` 会把这句话整个漏掉 → 落到大模型手里"假装已完成"。
      所以只认动词、不卡宾语 —— 有意放宽。
      误判的代价是弹一张确认卡（学生点「先不清」即可），
      漏判的代价是把不可逆动作交给一个只会"假装完成"的模型。两者不对称，宁宽勿漏。 */
const SETTINGS_RESET_RE = /清空|清除|重置|重新开始|从头开始|删除?(所有|全部)/;

/* ⭐ 换题诉求（原右上角 ⚙ 抽屉的职责）：
   "换一题/下一题/再来一题/换个数" → 本地换题，零 LLM。
   ⚠️ 刻意不匹配单独的"下一题"以外的模糊说法，避免把"我们接下来学什么"误伤成换题。 */
const NEW_PROBLEM_RE = /换(一)?(道)?(题|个题)|下一题|再来一(题|道)|换个数|换个题|出新题|随机(出)?(一)?(道)?题|再出一题/;

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

/* ── 拖拽手柄：仅移动端底部抽屉形态显示；桌面端不拖（浮窗语义是"不遮挡"） ── */
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
       --kb-height 由 visualViewport 写入；聊天键盘升起时它还额外叠加 --aji-kp 的高度
       （输入行始终悬浮在虚拟键盘正上方）。 */
    bottom: calc(var(--kb-height, 0px) + var(--aji-kp, 0px));
    /* ⭐ 高度只有一个来源：--aji-h，由 JS 的 _hubTargetH(state) 统一算出
       （吸附态 ∩ "算式不许被顶出去"）。CSS 不再自己下 50dvh 的判断，
       否则与 JS 抢同一把尺子、必抖。max-height 只做兜底护栏。 */
    height: var(--aji-h, 50dvh);
    /* 兜底护栏：绝不超出「键盘之上的可用高度」。
       ⚠️ 刻意不给页头留余量 —— 留了会把「上拉全屏」压成 724/780，
          而全屏的语义正是**覆盖背后**，那 56px 会让它名不副实。 */
    max-height: calc(100dvh - var(--kb-height, 0px) - var(--aji-kp, 0px));
    /* 拖拽是"贴在手指上"的，任何 CSS 过渡都会让它像在追手 */
    transition: none;
  }
  /* 松手吸附时恢复过渡（回弹/吸附有惯性感） */
  .aji-chat-hub.aji-settling { transition: height .28s cubic-bezier(.22,.61,.36,1); }
  .aji-hub-grip { display: flex; justify-content: center; align-items: center;
    padding: 10px 0 4px; flex: none; cursor: grab; touch-action: none; }
  .aji-hub-grip::before { content: ''; width: 40px; height: 4px; border-radius: 2px;
    background: rgba(100,116,139,.4); }
  .aji-hub-grip:active { cursor: grabbing; }
  /* ⭐ 消息列表是拖拽的第二入手区（微信/iOS 惯例），但列表未滚到顶时
     纵向手势必须还给原生滚动 —— touch-action 设 pan-y 交给浏览器，
     真正的"滚到顶才转拖拽"判定在 _bindDrag 的 pointermove 里实时做。 */
  .aji-chat-msgs { touch-action: pan-y; }
  /* ⭐ 关闭态：列表不滚、键盘不收，学生正好在打字（收起由 ✕ 负责） */
  .aji-chat-hub.aji-input-mode { transition: height .24s ease-out; }
  .aji-hub-input { font-size: 16px; }   /* ⭐ ≥16px：iOS 聚焦时不再自动放大页面 */
  /* 自绘光标 + 缓冲：input 被 readonly 锁死后要自己给"正在输入"的反馈 */
  .aji-hub-input { caret-color: transparent; }
  .aji-hub-inputbar { position: relative; }
  /* ⭐ 移动端的输入气泡就是输入框（原生 input 已 display:none），
     所以要给它输入框的外形（内边距/圆角/底色）和"可点"的手势反馈，
     否则学生看不出这里能点。 */
  .aji-input-buf { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap;
    text-overflow: ellipsis; font-size: 16px; line-height: 1.3;
    display: flex; align-items: center;
    padding: 9px 12px; border-radius: 12px; cursor: text;
    background: var(--aji-input-bg, rgba(148,163,184,.12)); }
  .aji-input-buf:active { background: var(--aji-input-bg-active, rgba(148,163,184,.2)); }
  .aji-input-buf.aji-buf-empty { color: var(--aji-text-soft, #94a3b8); }
  .aji-buf-caret { display: inline-block; width: 1.5px; height: 17px; margin: 0 1px;
    background: var(--aji-caret, #29CC57); vertical-align: -3px;
    animation: aji-caret 1.05s steps(1, end) infinite; }
  @keyframes aji-caret { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
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
    this.inputBarEl = this.hub.querySelector('.aji-hub-inputbar');
    this.gripEl = this.hub.querySelector('.aji-hub-grip');

    /* ⭐ 移动端输入缓冲：input 被 readonly 锁死（防原生键盘）后，改由虚拟键盘
       写 this._buf，再用这层自绘气泡呈现（含假光标）。桌面端不创建、不启用
       —— 物理键盘直接写 input.value，走原生路径。 */
    this._buf = '';
    this.bufEl = document.createElement('div');
    this.bufEl.className = 'aji-input-buf aji-buf-empty';
    /* ⭐ 移动端的输入气泡**本身就是输入框**（role=textbox 让读屏/自动化都认它）。
       光有输入框不算数，视觉上那个绿色的光标让它是可见的输入控件。 */
    this.bufEl.setAttribute('role', 'textbox');
    this.bufEl.setAttribute('aria-label', '向 Aji 提问');
    this.inputBarEl.insertBefore(this.bufEl, this.inputEl);

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

    /* ⭐ 移动端"点输入区 → 开聊天键盘"。
       ⚠️ 必须挂在**移动端真正可见**的那个表面上：
          移动端 _lockNativeKeyboard() 会把原生 input 设成 display:none，
          于是它宽高归零、pointerdown / focus 一个都收不到 ——
          原来只把监听挂在 inputEl 上，学生点输入框毫无反应（键盘永远出不来）。
          移动端可见的是自绘气泡 bufEl，所以两个表面都要挂；
          且【只能挂到 bufEl 这一个元素】—— 挂到整条 inputbar 会把「发送」键也吃掉。 */
    const onInputSurfaceTap = (e) => {
      if (!this._isMobile()) return;
      e.preventDefault();      // 拦在聚焦之前，双重保险（别让原生键盘冒头）
      this._openKeypad();
    };
    this.bufEl.addEventListener('pointerdown', onInputSurfaceTap);
    this.inputEl.addEventListener('pointerdown', onInputSurfaceTap);
    this._onInputSurfaceTap = onInputSurfaceTap;
    // ⭐ 聚焦兜底：真机上偶有焦点落到 input 的情况，立刻 blur 掉，别让原生键盘冒头
    this.inputEl.addEventListener('focus', () => {
      if (this._isMobile()) { try { this.inputEl.blur(); } catch (err) {} this._openKeypad(); return; }
      this._adjust?.();
    });

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
      // ⭐ 跨越 768px 断点（平板旋转/窗口缩放）时输入形态要跟着翻面
      this._lockNativeKeyboard();
      try {
        if (!window.visualViewport) return;
        const kb = Math.max(0, Math.round(window.innerHeight - window.visualViewport.height));
        document.documentElement.style.setProperty('--kb-height', kb + 'px');
        this.bubble.style.bottom = kb > 0 ? (kb + 14) + 'px' : '24px';
        // 移动端 bottom 由 CSS 的 var(--kb-height)+var(--aji-kp) 接管，别写行内值覆盖它
        if (this._isMobile()) this.hub.style.bottom = '';
        else this.hub.style.bottom = kb > 0 ? (kb + 14) + 'px' : '18px';
        // ⭐ 高度不再单独收缩：_hubTargetH 已经把"算式要多少空间"算进去了，
        //    这里只是重算一次（同一把尺子，不再有第二个高度控制器）。
        this._applyHubHeight('snap');
      } catch (e) { /* 环境不支持就保持默认位置 */ }
      // ⭐ 键盘/视口变化后重算算式让位带（抽屉托起/收缩后带上缘跟着变）
      this.reflowStage();
    };
    this._adjust = adjust;
    window.visualViewport?.addEventListener('resize', adjust);
    window.visualViewport?.addEventListener('scroll', adjust);
    window.addEventListener('resize', adjust);

    this._applyTheme();
    this._themeObserver = new MutationObserver(() => this._applyTheme());
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    this._bindDrag();
    this._lockNativeKeyboard();   // 初始按端形态定好输入框（移动端锁死原生键盘）

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

    // 组整体外框 = 算式 + 其下反馈行（与 _hubTargetH 共用 _stageGroupH 的同一把尺子）
    const groupH = this._stageGroupH();

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

  /* ============================================================
     移动端拖拽吸附（原生 Pointer 事件，未 vendor GSAP Draggable）
     ────────────────────────────────────────────────────────────
     两个入手区：顶部手柄（任何方向都起拖）+ 消息列表（只在滚到顶时）。
     手柄与列表共用一套逻辑，差别只在"列表要先验 scrollTop===0"。
     ============================================================ */
  _bindDrag() {
    if (this._dragBound) return;
    this._dragBound = true;

    /** downH = 按下瞬间的舱高（拖拽以它 + 位移为绝对高度，不依赖"当前"高度） */
    const begin = (e, fromList) => {
      if (!this._isMobile() || !this.visible) return;
      // ⭐ 列表入手区：只在**滚到顶**且手指**向下**时才允许转拖拽。
      //    滚到顶还继续下拉 = 学生明确想"再往下拉一点"（iOS/微信惯例）；
      //    向上滑则无论如何都是滚动——列表没到底部，凭什么抢走它。
      //    down 只是记账，真正的仲裁在 move 里做（此时还不知道方向）。
      if (fromList && this.msgsEl.scrollTop > 0) return;
      const r = this.hub.getBoundingClientRect();
      this._drag = {
        id: e.pointerId, startY: e.clientY, downH: r.height || 0,
        fromList, active: false, moved: 0, capEl: e.currentTarget,
      };
      this.hub.classList.remove('aji-settling');
    };

    const move = (e) => {
      const d = this._drag;
      if (!d || e.pointerId !== d.id) return;
      const dy = e.clientY - d.startY;
      if (!d.active) {
        if (Math.abs(dy) < 6) return;            // 抖动容差，防误判
        // ⭐ 方向仲裁：列表入手区只有"向下拉"才归拖拽（上滑一律还给滚动）；
        //    中途滚离顶部（学生先滚再拉）同样还给滚动。
        if (d.fromList && (dy < 0 || this.msgsEl.scrollTop > 0)) { this._drag = null; return; }
        d.active = true;
        // ⭐ capture 必须挂在监听者身上，不能挂 e.target ——
        //    pointer capture 会把后续事件的目标锁死在捕获元素上，
        //    挂到列表里的某条消息上会让快速拖出列表的那一段事件丢失。
        try { d.capEl?.setPointerCapture?.(e.pointerId); } catch (err) {}
      }
      if (e.cancelable) e.preventDefault();
      d.moved = dy;
      // 上拉＝变高，下拉＝变矮；clamp 到 [40, avail-8]，越界别让舱飞出屏
      const avail = this._availH();
      const next = Math.max(40, Math.min(avail - 8, d.downH - dy));
      this._applyHubHeight('drag', next);
    };

    const end = (e) => {
      const d = this._drag;
      if (!d || (e && e.pointerId !== d.id)) return;
      this._drag = null;
      if (!d.active) return;                     // 没拖动过 = 一次普通点击，什么都别做
      try { d.capEl?.releasePointerCapture?.(e.pointerId); } catch (err) {}
      const avail = this._availH();
      const endH = Math.max(0, Math.min(avail - 8, d.downH - d.moved));
      const snap = this._autoSnapFromHeight(endH);
      if (snap === 'close') { this.closeDrawer(); return; }   // < 35% → 关闭
      this._dragState = snap;                                 // > 75% 全屏，35~75% 半屏
      this._applyHubHeight('snap');
      this._setStageShift(true);                 // 吸附后带上缘变了，算式重算让位
    };

    const onDown = (e) => begin(e, false);
    this.gripEl.addEventListener('pointerdown', onDown);

    /* 列表入手区：只监听 pointerdown 起手，move/up 挂 window——
       pointer capture 会把这串事件的目标锁定在原元素上，挂自身会漏掉快速拖出列表的那一段。 */
    const listDown = (e) => begin(e, true);
    this.msgsEl.addEventListener('pointerdown', listDown);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    this._dragHandlers = { onDown, listDown, move, end };
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
      /* ⭐ 当前正在作答的那一步：{ currentStep, studentInput, standardAnswer }
         模块在作答态返回，未作答返回 null —— 这是"问哪答哪"的唯一来源。
         既有 isError/progress 只说"哪一步错"，说不出"标准答案是多少"。 */
      stepCtx: typeof cfg.stepCtx === 'function' ? cfg.stepCtx : null,
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
      /* ⭐ 是否出错：模块自行判定（m1 过程有错也算错）。未声明则从进度文案里嗅探。 */
      isError: this._safeBool(cfg && cfg.isError, /错|偏差|不对/.test(this._safe(cfg && cfg.progress, ''))),
      /* 学生是否已真的动过手：场景一（刚进页面未做题）与场景二（做到一半）的分水岭。
         未声明 isStarted 的模块退化为「有题目即有上下文」，与旧行为一致。 */
      started: this._safeBool(cfg && cfg.isStarted, this._safe(cfg && cfg.problemText, '') !== ''),
      /* ⭐ 当前作答步三件套（可能为 null：没在作答 / 模块未接入） */
      stepCtx: this._stepCtx(cfg),
      cfg,
    };
  }

  /** ⭐ 取模块报出的"当前作答步"。模块抛错或返回畸形 → 一律当作没有，
      宁可少注入一段，也绝不把脏数据塞进 Prompt 让模型照着编。 */
  _stepCtx(cfg) {
    if (!cfg || typeof cfg.stepCtx !== 'function') return null;
    let v = null;
    try { v = cfg.stepCtx(); } catch (e) { return null; }
    if (!v || typeof v !== 'object') return null;
    const str = (x) => (x == null ? '' : String(x).trim());
    const out = {
      currentStep: str(v.currentStep),
      studentInput: str(v.studentInput),
      standardAnswer: str(v.standardAnswer),
    };
    /* 三项全空 = 模块处于非作答态，按"没有"处理（否则会注入一段全空占位） */
    return (out.currentStep || out.studentInput || out.standardAnswer) ? out : null;
  }

  /* ⭐ 记忆检索（RAG）本地路由：命中则毫秒级返回，绝不走大模型。
     这类问题的答案全在本地数据里，交给 LLM 只会瞎编（任务书 §三 明确要求）。 */
  _memoryLocal(userQuery) {
    const q = String(userQuery || '');
    /* ⭐ 设置类诉求最先拦：清空/重置是不可逆动作，绝不能落到大模型手里"假装完成" */
    if (SETTINGS_RESET_RE.test(q)) return this._settingsResetAnswer();
    /* ⭐ 换题 / 载入题目：原右上角 ⚙ 抽屉的职责，现已下沉到对话 */
    const swap = this._problemSwapAnswer(q);
    if (swap) return swap;
    if (WRONGBOOK_RE.test(q)) return this._wrongbookAnswer();
    if (HISTORY_RE.test(q)) return this._lastWrongAnswer();
    /* ⚠️ 「这一步对吗」必须排在 WRONGBOOK_RE 之后、且只在真的在作答时才拦：
       否则"我哪里错了"这类会被 CHECK_STEP_RE 的"错"字抢先吃掉。 */
    if (CHECK_STEP_RE.test(q)) return this._checkStepAnswer();
    return null;
  }

  /* ---------- ⭐ 题目载入（原抽屉职责，零 LLM） ---------- */

  /** 当前模块是否提供 nextProblem / loadExpression（m1/m9 都提供了） */
  _activeApi() {
    const id = this._activeModuleId();
    return id ? (activeModules[id] || null) : null;
  }

  /** 从学生的话里抽出算式：必须"整句就是一个算式"才算，夹带文字一律不认。
      返回规范化后的算式串或 ''。 */
  _exprFromQuery(q) {
    const t = String(q || '')
      .replace(/[×xX*]/g, '×').replace(/[÷/]/g, '÷').replace(/[−–—]/g, '-')
      .replace(/[（]/g, '(').replace(/[）]/g, ')');
    const m = t.match(/(\d[\d.]*\s*[+\-×÷]\s*\d[\d.]*(?:\s*[+\-×÷]\s*\d[\d.]*)*)/);
    if (!m) return '';
    const expr = m[1].replace(/\s+/g, '');
    // 句子里除了这个算式之外还有别的实质内容（汉字）→ 不当作"载入题目"指令
    const rest = t.replace(m[1], '').replace(/[\s，。！？、,.!?]/g, '');
    if (/[一-龥]/.test(rest)) return '';
    return expr;
  }

  /** ⭐ 换题 / 载入题目：命中才有值，未命中返回 null（交给后面的规则或大模型） */
  _problemSwapAnswer(q) {
    const api = this._activeApi();
    if (!api) return null;
    const e = (s) => this._escapeHtml(s);

    // ① 学生给了具体算式（无论有没有说"算这道"）→ 载入
    if (typeof api.loadExpression === 'function') {
      const expr = this._exprFromQuery(q);
      if (expr) {
        const ok = api.loadExpression(expr);
        return ok
          ? {
            type: 'hint',
            title: '题目换好了',
            content: `我们来算 <b>${e(expr)}</b> 吧。点算式里的运算符，把它先算出来。`,
            actions: [{ text: '开始', type: 'close' }],
          }
          : {
            /* ⚠️ 示例**必须与该模块真正接受的形态一致**：
               m9 是竖式练习，只吃「两数一个运算符」；拿 m1 的多步算式当例子
               等于教学生写一个这里照样会被拒的东西（本想帮忙，结果更绕）。 */
            type: 'hint',
            title: '这个算式这儿算不了',
            content: api.exampleHint
              ? `换一个写法试试？比如：<b>${e(api.exampleHint)}</b>。`
              : '换个写法试试？把要算的两个数和一个运算符写清楚就行。',
            actions: [{ text: '我懂了', type: 'close' }],
          };
      }
    }

    // ② 只是要换题 → 换一题
    if (NEW_PROBLEM_RE.test(q) && typeof api.nextProblem === 'function') {
      api.nextProblem();
      return {
        type: 'hint',
        title: '换了一道新题',
        content: '已经给你换好啦，看看算式里的数变了没。想好先算哪一步就点它。',
        actions: [{ text: '开始', type: 'close' }],
      };
    }
    return null;
  }

  /** ⭐ 清空进度 / 重置记录：本地执行 + 二次确认（不可逆动作绝不一键完成） */
  _settingsResetAnswer() {
    return {
      type: 'error_review',
      title: '要清空学习记录吗？',
      content: '这会删掉<b>做题记录、错题本、一题一得和我记住的学情</b>。清掉之后就找不回来了，确认要清吗？',
      actions: [
        { text: '清空', type: 'close', style: 'primary', onClick: () => this._doResetProgress() },
        { text: '先不清', type: 'close' },
      ],
    };
  }

  /** ⭐ 真正的清空动作：这是**不可逆**操作，所以做两件事——
      ① 逐项 try 包裹：任何一项失败都不阻断其余项；
      ② **清完回读核验**：存储层是"内存立即 + 磁盘排队"的异步落盘模型，
         clear() 从不抛异常（失败走 onStorageError 旁路上报），
         所以"没抛错"根本不能证明"清干净了"——必须回读，按回读结果说话。
      宁可告诉学生"这项没清掉"，也绝不谎报"已清空"。 */
  _doResetProgress() {
    const done = [];
    const failed = [];
    /* 每项 = [标签, 执行, 回读核验（true＝确实空了）] */
    const jobs = [
      ['做题记录', () => historyClear(), () => { try { return historyLoad().length === 0; } catch (e) { return false; } }],
      ['错题本', () => wbClear(), () => { try { return wbLoad().length === 0; } catch (e) { return false; } }],
      /* ⚠️ memoryLoad() 永远返回 { interests: [], tags: {} } 形状，
         空对象是**真值** —— 必须数长度，不能直接判真假。 */
      ['学情记忆', () => { eventsClear(); memoryClear(); },
        () => {
          try {
            const m = memoryLoad() || {};
            return eventsLoad().length === 0
              && Object.keys(m.tags || {}).length === 0
              && (m.interests || []).length === 0;
          } catch (e) { return false; }
        }],
      ['一题一得', () => this._takeawayClearAll(), () => { try { return takeawayListAll().length === 0; } catch (e) { return false; } }],
    ];
    for (const [label, run, verify] of jobs) {
      let ok = false;
      try { run(); } catch (e) { ok = false; }
      try { ok = verify(); } catch (e) { ok = false; }
      (ok ? done : failed).push(label);
    }

    const okAll = failed.length === 0;
    this.sendMessage({
      type: okAll ? 'hint' : 'error_review',
      title: okAll ? '✅ 记录清空好了' : '有几项没清掉',
      content: okAll
        ? `已经清掉了：${done.join('、')}。<br><br>我们重新开始吧，先算哪一步都行，卡住了就叫我。`
        : `这些清掉了：${done.join('、') || '（无）'}；<b>这几项还没清掉</b>：${failed.join('、')}。稍后再让我试一次就行。`,
      actions: [{ text: '好', type: 'close' }],
    });
  }

  /** ⭐ 一题一得清空（没有专门的 clear API）：
      必须走 storage 层，不能直接摸 localStorage ——
      本地数据的主存是 localForage，直接删 localStorage 会"删了个空"却报告成功。 */
  _takeawayClearAll() {
    const keys = new Set();
    try { lsKeysByPrefix('grade').forEach(k => { if (k.includes('takeaway')) keys.add(k); }); } catch (e) {}
    /* 兜底：无 localForage 时是 localStorage 模式；也覆盖"内存尚未水合"的场景 */
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.includes('takeaway')) keys.add(k);
      }
    } catch (e) {}
    keys.forEach(k => { try { lsRemove(k); } catch (e) {} });
  }

  /** ⭐ 「这一步对吗」→ 前端直接比对标准答案（毫秒级、零成本、绝不瞎编）
      只有三种结局，全部如实说：对了 / 错了（并指出该填什么） / 还没轮到你填。
      刻意不解释"为什么错"——那要讲算理，仍需大模型，留给场景三。 */
  _checkStepAnswer() {
    const c = this._collectContext();
    const sc = c.stepCtx;
    if (!sc) {
      return {
        type: 'hint',
        title: '现在还没有可判定的步骤',
        content: '先点算式里的运算符、或者点竖式里那个待填的格子，等你填了数，我马上帮你看对不对。',
        actions: [{ text: '我懂了', type: 'close' }],
      };
    }
    const hasInput = !!sc.studentInput;
    const same = this._normNum(sc.studentInput) === this._normNum(sc.standardAnswer);
    const where = sc.currentStep ? `${sc.currentStep}` : '这一步';
    const e = (s) => this._escapeHtml(s);

    if (!hasInput) {
      return {
        type: 'hint',
        title: `${where}还没填呢`,
        content: `你还没写这一格的数。想好了就填上，填完再问我「这一步对吗」，我立刻帮你看。`,
        actions: [{ text: '我懂了', type: 'close' }],
      };
    }
    if (same) {
      return {
        type: 'hint',
        title: '✅ 这一步是对的',
        content: `${where}你填的是 <b>${e(sc.studentInput)}</b>，和标准答案一致，继续往下算就行。`,
        actions: [{ text: '我懂了', type: 'close' }],
      };
    }
    return {
      type: 'error_review',
      title: '这一步和标准答案不一样',
      content: `${where}你填的是 <b>${e(sc.studentInput)}</b>，标准答案应该是 <b>${e(sc.standardAnswer)}</b>。<br><br>先别急着改，回头看看这一格的数是怎么得来的——想不通再问我，我们一起找找是哪一位出了问题。`,
      actions: [
        { text: '我再想想', type: 'close' },
        { text: '讲讲这一步', type: 'close', style: 'primary', onClick: () => this._askAI(`${where}我填了 ${sc.studentInput}，标准答案是 ${sc.standardAnswer}，我错在哪了？`) },
      ],
    };
  }

  /** 数值归一：去掉空格、全角、前导零与末尾小数点，防止 "007" vs "7" 误判 */
  _normNum(s) {
    let t = String(s == null ? '' : s).trim();
    try { t = t.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)); } catch (e) {}
    t = t.replace(/\s+/g, '').replace(/^0+(?=\d)/, '').replace(/\.$/, '');
    return t;
  }

  /** "我哪里错得最多 / 我的错题本" → 聚合错得最多的 5 类 Tag + 错题本入口 */
  _wrongbookAnswer() {
    const top = topWrongTags(5);
    const all = eventsLoad().length;
    if (!top.length) {
      return {
        type: 'error_review',
        title: '错题本',
        content: '你还没有错题记录呢，继续保持就好。真遇到卡住的地方，我随时都在。',
        actions: [{ text: '我懂了', type: 'close' }],
      };
    }
    const lines = top.map((x, i) => `${i + 1}. <b>${this._escapeHtml(x.tag)}</b> —— ${x.count} 次`).join('<br>');
    return {
      type: 'error_review',
      title: '你最容易卡住的地方',
      content: `一共记下 ${all} 道错题，错得最多的是这几类：<br>${lines}<br><br>想看看具体是哪几道题吗？`,
      actions: [
        { text: '📕 打开错题本', type: 'close', style: 'primary', onClick: () => this._openWrongBook() },
        { text: '先不看', type: 'close' },
      ],
    };
  }

  /** "我上道题错哪了" → 引用最近一条真实错题（problemText + errorStep） */
  _lastWrongAnswer() {
    const events = eventsLoad();
    if (!events.length) {
      return {
        type: 'error_review',
        title: '错题回顾',
        content: '我这边还没有记下错题哦。你先按自己的节奏算，真错了我会帮你一起找出来。',
        actions: [{ text: '我懂了', type: 'close' }],
      };
    }
    const e = events[0];
    // ⚠️ 错题正文来自学生输入/题库，是**不可信内容**，必须转义后再拼 HTML
    const eb = (s) => this._escapeHtml(s);
    const detail = [
      e.errorStep ? `错在：${eb(e.errorStep)}` : '',
      e.correctAnswer ? `正确答案：<b>${eb(e.correctAnswer)}</b>` : '',
      e.studentAnswer ? `你写的是：${eb(e.studentAnswer)}` : '',
    ].filter(Boolean).join('；');
    return {
      type: 'error_review',
      title: '上一道错题',
      content: `你刚才算的是「${eb(e.problemText)}」。${detail ? detail + '。' : ''}回头看看这一步，是不是哪里漏了？`,
      actions: [{ text: '我懂了', type: 'close' }],
    };
  }

  /** 打开既有错题本抽屉（全站已有功能，Aji 只做入口，不自建界面） */
  _openWrongBook() {
    try {
      const btn = document.getElementById('wrongBookBtn');
      if (btn) { btn.click(); return; }
      const drawer = document.getElementById('wrongBookDrawer');
      if (drawer) {
        drawer.classList.add('open');
        document.getElementById('wrongBookMask')?.classList.add('open');
      }
    } catch (e) { /* 环境缺错题本也不阻断对话 */ }
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
    /* ⭐ 记忆检索优先：命中"错题本/我错哪了"类问法直接用本地聚合回答（毫秒级、零成本、不瞎编） */
    const mem = this._memoryLocal(userQuery);
    if (mem) { this.sendMessage(mem); return; }
    /* ⭐ 好奇心捕获：学生这次提问里若提到恐龙/宇宙…静默记进 LearnerMemory（绝不提示已记录） */
    try { captureInterests(userQuery); } catch (e) {}
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
        isError: c.isError,
        /* ⭐ 记忆引擎注入：学情摘要 + 兴趣摘要 + 最近 5 条相关真实错题（RAG） */
        learnerTags: learnerTagSummary(),
        interestTags: interestSummary(),
        wrongHistory: wrongDigest(c.topic || ''),
        /* ⭐ 当前这一步的三件套：模块在作答态时报出（未作答则返回 null 整段不注入） */
        stepCtx: c.stepCtx,
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

  /* ⭐ 系统提示词：前置注入当前上下文（题目、步骤、错误、标准答案） */
  _buildSystemPrompt({
    moduleId, topic, currentProblem, studentProgress, isError,
    learnerTags, interestTags, wrongHistory, stepCtx,
  }) {
    const ctxLines = [
      `- 当前模块：${moduleId}${topic ? `（${topic}）` : ''}`,
      `- 当前题目：${currentProblem}`,
      `- 学生进度：${studentProgress}`,
      `- 是否出错：${isError ? '是' : '否'}`,
      `- 学生近期学情：${learnerTags || '（暂无记录）'}`,
      `- 学生兴趣：${interestTags || '（暂无记录）'}`,
    ].join('\n');

    /* ⭐ 「当前这一步」三件套（题目 / 学生输入 / 标准答案）——问哪答哪的地基。
       没有它，模型只能对着 studentProgress 里的历史值猜，必然答非所问。
       学生未进入作答态时整段不注入：拿上一次的残值做对比，比不注入更坏。 */
    const sc = stepCtx && (stepCtx.standardAnswer || stepCtx.studentInput)
      ? `\n- 当前步骤：${stepCtx.currentStep || '（进行中）'}
- 学生当前输入：${stepCtx.studentInput || '（还没输入）'}
- 标准答案参考：${stepCtx.standardAnswer || '（无）'}  ← 重点：请对比"学生当前输入"与"标准答案参考"，指出差在哪一步、错在哪一位数，不要给出最终得数`
      : '';

    /* ⭐ RAG：最近 5 条真实错题（由 core/learner.js 前端聚合好，Prompt 不做数据逻辑） */
    const rag = (Array.isArray(wrongHistory) && wrongHistory.length)
      ? `\n\n【历史错题参考】\n${wrongHistory.join('\n')}\n（基于这些真实错题给出针对性的启发式提问或鼓励，不要凭空编造别的错题。）`
      : '';

    return `你是 Aji，一位克制、耐心、充满好奇心，且深受三年级学生信任的 AI 数学陪学助教。

【当前场景上下文】
${ctxLines}${sc}${rag}

【对话边界与路由规则】（必须严格遵守）
1. 核心区（当前数学题）：绝对不要直接给出最终答案。结合学情，用启发式提问引导他自己发现错误。每次回答控制在 3 句话以内。
2. 泛学科区（超纲知识、其他学科、好奇心）：如果学生问了有趣的知识（如恐龙、宇宙），允许你跳出数学，用三年级听得懂的语言满足他的好奇心。但回答完毕后，必须温和地拉回题目。例如：宇宙的奥秘很神奇吧？等我们算完这道题，你可以多问我！
3. 干扰区（游戏、闲聊、负面情绪）：如果学生不想做题，温和地理解他的情绪。简短回答后引回题目。绝不进行无意义闲聊。
4. 设置区（学生要求"清空记录/重置进度/换个名字"这类）：不要自己执行，也不要假装已经做完。用一句话告诉学生"点我就能帮你处理"，系统会把按钮递给他；等他确认后由本地逻辑完成。

【语气与克制要求】
- 语气像邻家学霸哥哥/姐姐，绝不居高临下。
- 不显摆你记录了他的偏好，而是自然地流露。`;
  }

  /** ⭐ SSE 流式请求：逐 chunk 解析 `data: {...}`，把正文增量交给 onDelta */
  async _streamAI(ctx, onDelta) {
    const apiUrl = resolveApiUrl();
    if (!apiUrl) throw new Error('AI 服务地址未配置');
    const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
    if (LLM_CONFIG.apiKey) headers.Authorization = `Bearer ${LLM_CONFIG.apiKey}`;
    /* ⚠️ messages 必须是 [system, user] 两轮，缺了 user 这一轮：
       ① 模型收到的只有设定、没有问题 → 只会自说自话（"答非所问"的真根因）；
       ② 部分 OpenAI 兼容网关（含 GLM）会直接判 400 —— 线上那个 400 就出在这。
       学生提问一律进 user 轮，system 只放设定与上下文。 */
    const body = {
      model: LLM_CONFIG.model,
      messages: [
        { role: 'system', content: this._buildSystemPrompt(ctx) },
        { role: 'user', content: ctx.userQuery || '我卡住了，该怎么想？' },
      ],
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
    /* 移动端走自绘缓冲（#aji-hub-input 被 readonly 锁死、display:none），
       桌面端走原生 input.value。
       ⚠️ 兜底：移动端仍接受 inputEl.value 里**已被程序化写入**的内容——
         原生的 value 属性在 readonly 下照样可写（只是用户打不进去），
         所以键盘/脚本两条路都能进;不要因为"输入框被隐藏了"就把这条断了。 */
    const mobile = this._isMobile();
    const native = (this.inputEl.value || '').trim();
    const text = mobile ? ((this._buf || '').trim() || native) : native;
    if (!text || this._aiBusy) return;
    if (mobile) { this._buf = ''; this._paintBuf(); }
    this.inputEl.value = '';
    this.history.push({ role: 'user', text });
    this._trim();
    this._render();
    this._askAI(text);
    // ⭐ 发出去就收键盘：学生要立刻看见回答（键盘此刻纯属占地方）。
    //    键盘不收，聊天舱的"收起＝半屏"根本没机会发生。
    if (mobile && this._keypad && this._keypad.visible) this._closeKeypad();
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
    this._lockNativeKeyboard();   // 移动端输入框天生不可聚焦（防原生键盘）
    if (this.visible) { this._applyHubHeight('snap'); this._setStageShift(true); return; }
    this.visible = true;
    this._dragState = null;       // 每次开舱都回到吸附态，不记住上次拖到哪儿
    this.hub.style.display = 'flex';
    gsap.fromTo(this.hub, { x: 28, y: 28, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.28, ease: 'power2.out', overwrite: 'auto' });
    this._applyHubHeight('snap');
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
    this._closeKeypad();     // 键盘必须先收，否则留在屏上没人管
    this.hub.classList.remove('aji-input-mode', 'aji-settling');
    this._dragState = null;
    this._setStageShift(false);   // ⭐ 算式容器平滑归位
    gsap.to(this.hub, {
      x: 28, y: 28, opacity: 0, duration: 0.2, ease: 'power2.in', overwrite: 'auto',
      onComplete: () => { if (!this.visible) this.hub.style.display = 'none'; },
    });
  }

  /* ============================================================
     移动端吸附：全屏 / 半屏 / 关闭 三档
     ============================================================
     高度权威只有一处：_hubTargetH()。它把"用户拖到的吸附态"与
     "算式不许被顶出可视带"求交 —— 单一控制器，才不会自己跟自己抖。
     ⚠️ 全程不动 document.body.style.paddingBottom（背后算式重排的唯一来源）。
     ⚠️ 布局位置只认 offsetTop 链，绝不用 rect.top（补间中途读数会漂移）。
     ============================================================ */

  /** 当前吸附态：'full' | 'half'（关闭态不在这个维度里，它是 visible=false） */
  _snapState() { return this._dragState || 'half'; }

  /** ⭐ 舱体被抬离底部的总高度 = 原生软键盘 + 聊天虚拟键盘。
      两者都会把舱体往上顶，所以**都得算进可用空间**——
      只减聊天键盘会漏掉原生键盘那 300px，算出来的"半屏"实际会压在算式上。
      （原生键盘高度由 visualViewport 的写进 --kb-height；聊天键盘高度由 chat-keypad 上报。） */
  _bottomLift() {
    if (!this._isMobile()) return 0;
    let native = 0;
    try {
      native = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kb-height')) || 0;
    } catch (e) { native = 0; }
    return Math.max(0, native) + this._kpHeight();
  }

  /** ⭐ 舱体可用的纵向空间 = 视口高 - 全部底部抬升。
      ⭐ 拖拽分数与吸附阈值都以它为分母，不以 innerHeight 为分母——
         否则键盘升起时（只剩 480/780）永远够不到 0.75，"上拉全屏"直接失效。 */
  _availH() {
    return Math.max(1, (window.innerHeight || 0) - this._bottomLift());
  }

  /** ⭐ 高度唯一权威：算出舱体当前该多高（null = 交回 CSS 默认）。
      算式保护只对 half 态生效：学生主动上拉全屏是明确意图，
      让位管线会把算式居中进剩下的带上缘，所以不必再压缩它。
      ⚠️ 刻意不返回 overflow 开关 —— 消息区永远 overflow-y:auto。
        给短抽屉配 overflow:hidden 会让历史**既看不见又滚不到**，
        那是比"算式被让位"严重得多的死路。 */
  _hubTargetH(state = this._snapState(), kp = this._bottomLift()) {
    if (!this._isMobile()) return null;
    const avail = Math.max(0, (window.innerHeight || 0) - kp);
    if (state === 'full') return Math.max(0, avail - 8);   // 全屏吸附：顶到视口上缘
    const cap = Math.round(avail * 0.55);                  // 半屏上限（任务书 50~55%）
    const st = this._stage;
    if (!st || !st.el) return cap;                         // 无舞台（通识页）→ 纯半屏
    const gap = st.gap || 20;
    const bandTop = this._stageBandTop();
    /* ⚠️ 必须按"算式 + 其下反馈行"的**整组**下缘反推，不能只算算式本体：
       反馈行（#m1fb）也归让位管线管，它被舱体压住时管线只能把它淡出——
       那等于为了多给消息几像素，把提示语藏了。50dvh 时整组刚好放得下，
       抬到 55% 就会踩上去（实测 13962px² 重叠）。 */
    const groupH = this._stageGroupH();
    const room = Math.round(avail - (bandTop + groupH + gap * 2));
    // 整组放得下 → 取半屏上限；放不下 → 让位给算式组，但下限 175
    //   （只求 头≈44 + 最后一两行消息 + 输入行≈52 可见——学生此刻在打字，
    //    完整历史等收起键盘再看。压到 150 会把消息区整个吞掉，让位就失去意义；
    //    此时超出部分由让位管线把算式往上推来补，不是单纯重叠。）
    return Math.max(175, Math.min(cap, room));
  }

  /** 让位组的高度：算式 + 其下反馈行（与 _setStageShift 里 groupH 同一算法）。
      两处必须共用同一把尺子——"反推抽屉高度"与"实际让位"各算各的，
      正是高度互相追着抖的根源。 */
  _stageGroupH() {
    const st = this._stage;
    if (!st || !st.el) return 150;
    const docTopOf = (el) => { let t = 0, n = el; while (n && n !== document.body) { t += n.offsetTop; n = n.offsetParent; } return t; };
    const top = docTopOf(st.el);
    let bottom = top + (st.el.offsetHeight || 150);
    for (const ex of st.extra || []) {
      if (ex && ex.isConnected) bottom = Math.max(bottom, docTopOf(ex) + ex.offsetHeight);
    }
    return Math.max(150, Math.round(bottom - top));
  }

  /**
   * 应用高度。
   * @param {'drag'|'snap'} mode  'drag' = 跟手（无过渡、用显式像素）
   *                              'snap' = 吸附回弹（走过渡）
   * @param {number} [dragH]      mode='drag' 时的显式高度
   */
  _applyHubHeight(mode = 'snap', dragH) {
    if (!this._isMobile()) return;
    const dragging = (mode === 'drag' && typeof dragH === 'number');
    this.hub.classList.toggle('aji-settling', !dragging);
    if (dragging) {
      this.hub.style.setProperty('--aji-h', Math.round(dragH) + 'px');
    } else {
      const h = this._hubTargetH();
      if (h == null) this.hub.style.removeProperty('--aji-h');
      else this.hub.style.setProperty('--aji-h', Math.round(h) + 'px');
    }
    // 吸附落定后撤掉过渡类，避免影响下一次拖拽的跟手性
    if (!dragging) {
      clearTimeout(this._settleTimer);
      this._settleTimer = setTimeout(() => this.hub.classList.remove('aji-settling'), 340);
    }
  }

  /** 拖拽高度 → 吸附态（松手即按它落定）。
      'close' = 低于 35%，交给 up 处理器收舱。 */
  _autoSnapFromHeight(h) {
    if (!this._isMobile() || typeof h !== 'number') return null;
    const frac = h / this._availH();
    if (frac >= 0.75) return 'full';
    if (frac >= 0.35) return 'half';
    return 'close';
  }

  /** 聊天键盘当前高度（移动端托举用；桌面端恒 0） */
  _kpHeight() {
    if (!this._isMobile()) return 0;
    const kp = this._keypad;
    return (kp && kp.visible) ? (kp.height || 0) : 0;
  }

  /* ---- 聊天键盘（与做题键盘完全隔离的一把） ---- */
  _lockNativeKeyboard() {
    const lock = this._isMobile();
    // ⭐ 双保险：inputmode=none 只是"建议"，readonly 才是真拦得住
    //    （Safari 对 inputmode=none 支持不可靠）。桌面端绝不动——物理键盘要正常可用。
    if (lock) {
      this.inputEl.setAttribute('readonly', 'readonly');
      this.inputEl.setAttribute('inputmode', 'none');
    } else {
      this.inputEl.removeAttribute('readonly');
      this.inputEl.removeAttribute('inputmode');
    }
    this.inputEl.style.display = lock ? 'none' : '';
    this.bufEl.style.display = lock ? 'flex' : 'none';
    if (lock) this._paintBuf();
  }

  _paintBuf() {
    if (!this.bufEl) return;
    const text = this._buf || '';
    const empty = text.length === 0;
    this.bufEl.classList.toggle('aji-buf-empty', empty);
    this.bufEl.replaceChildren();
    if (empty) { this.bufEl.textContent = '问 Aji 一个问题…'; return; }
    this.bufEl.appendChild(document.createTextNode(text));
    const caret = document.createElement('span');
    caret.className = 'aji-buf-caret';
    this.bufEl.appendChild(caret);
  }

  _openKeypad() {
    if (!this._isMobile() || !this.visible) return;
    const kp = this._keypad || (this._keypad = getChatKeypad());
    kp.show({
      onKey: (ch) => { this._buf += ch; this._paintBuf(); },
      onBackspace: () => { this._buf = this._buf.slice(0, -1); this._paintBuf(); },
      onSubmit: () => this._submitInput(),
      onResize: (h) => this._onKeypadResize(h),
    });
    this.hub.classList.add('aji-input-mode');
    this._onKeypadResize(kp.height || 0);
    // 滚到最新一条：键盘占掉半屏，学生最该看见的是刚问出去那句
    this.msgsEl.scrollTop = this.msgsEl.scrollHeight;
  }

  _closeKeypad() {
    const kp = this._keypad;
    if (kp && kp.visible) kp.hide();
    this.hub.classList.remove('aji-input-mode');
    if (!this._isMobile()) return;
    // hide() 已同步回调过 onResize(0)，这里只保证复位（重复设 0 无害）
    document.documentElement.style.setProperty('--aji-kp', '0px');
    this._applyHubHeight('snap');
    this._setStageShift(true);
  }

  /** 键盘升降：只改 --aji-kp（托举）+ 重算高度。绝不碰 body 布局。 */
  _onKeypadResize(h) {
    if (!this._isMobile()) return;
    document.documentElement.style.setProperty('--aji-kp', Math.round(h || 0) + 'px');
    this._applyHubHeight('snap');
    // ⭐ 舱体没动、键盘没动算式，但带下缘变了（键盘是覆盖层，visualViewport 不缩），
    //    所以让位必须在这里主动重算一次，否则算式会被键盘压住而系统毫无察觉。
    this._setStageShift(true);
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
    clearTimeout(this._settleTimer);
    // ⭐ 拖拽监听挂在 window 上（pointer capture 会把事件目标锁在原元素，
    //    挂自身会漏掉快速拖出列表的那一段），所以必须显式摘除
    if (this._dragHandlers) {
      const h = this._dragHandlers;
      this.gripEl?.removeEventListener('pointerdown', h.onDown);
      this.msgsEl?.removeEventListener('pointerdown', h.listDown);
      window.removeEventListener('pointermove', h.move);
      window.removeEventListener('pointerup', h.end);
      window.removeEventListener('pointercancel', h.end);
      this._dragHandlers = null;
    }
    this._drag = null;
    if (this._onInputSurfaceTap) {
      this.bufEl?.removeEventListener('pointerdown', this._onInputSurfaceTap);
      this.inputEl?.removeEventListener('pointerdown', this._onInputSurfaceTap);
      this._onInputSurfaceTap = null;
    }
    this._keypad = null;          // 聊天键盘是全局单例，不随 Aji 卸载销毁
    document.documentElement.style.removeProperty('--aji-kp');
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
