/* core/ui/chat-keypad.js
   <Aji 聊天舱专用虚拟键盘> —— 与做题键盘 core/ui/virtual-keypad.js 完全隔离
   ─────────────────────────────────────────────────────────────
   为什么另起一把、不复用做题那把：
   · 那把是**全局单例**，m1/m9 的判卷链路绑在它的 show({onDigit,onConfirm,…}) 上。
     聊天输入一旦调用，就会覆盖做题键盘的回调、并把它的 maxLength 计数清零——
     "做题做到一半问 Aji"这条最自然的路径会直接把判卷打断。
   · 那把的契约写着"屏幕键只有 0-9 + 确认，DOM 结构冻结"，而聊天要 A-Z、标点、
     退格、模式切换，等于把它拆了重写。
   所以：两把键盘、两套生命周期、互不知情。共享的只有主题 CSS 变量
   （--keyboard-background / --keycap-background / --keycap-text / --keyboard-accent-color），
   视觉上仍是"同一件工具"。

   ⚠️ 本组件绝不设置 document.body.style.paddingBottom。
      那是"背后算式重排跳动"的唯一来源（virtual-keypad.show() 就是这么干的）。
      键盘只做自己（position:fixed），页面布局一点不碰。

   ── 布局取舍（认知负荷）──
   · **默认文字层**：学生对着聊天框，99% 是在说话，不是在算算式。
     数学层做成第二屏（一次切换可达），而不是默认挡在面前。
   · 字母按 **a→z 顺排**而非 QWERTY：三年级学生没有盲打肌肉记忆，
     找字母靠的是"我知道 a 在最前面"，QWERTY 对他们只有找不着。
   · 数学层用 4 列大键（≈85px），文字层用 8 列（≈42px）——
     层与层的键宽不同是有意的：算数时专注，说话时够用。
   · 无手写按钮。可点却无反馈的空画板是认知负荷的经典反模式，
     留一个常量注释就是全部的口子（见 FEATURE_HANDWRITING）。
*/
import { gsap } from '../../js/vendor/gsap/index.js';

/* 手写输入的预留开关：真正的形态是「画板 + 笔迹识别 + 只把算式喂给 LLM」。
   在它完整可用之前，界面上不留任何按钮——可见即可用是硬线。 */
export const FEATURE_HANDWRITING = false;

let instance = null;

/* 主题值与 virtual-keypad.js 的 THEMES 刻意保持一致（两把键盘长得像同一件工具），
   但各自持有、互不 import —— 隔离优先于 DRY。 */
const THEMES = {
  light: { keyboardBackground: '#f8fafc', keycapBackground: '#ffffff', keycapText: '#1e293b', keycapBorder: 'rgba(15,23,42,.08)', accent: '#29CC57' },
  dark: { keyboardBackground: '#1e293b', keycapBackground: '#0f172a', keycapText: '#f1f5f9', keycapBorder: 'rgba(248,250,252,.10)', accent: '#29CC57' },
};

/* 键描述：字符串 = 直接上字的键；对象 = 功能键
   { label, act: 'key:<char>' | 'backspace' | 'submit' | 'mode:<text|symbol>', span, fn, accent } */

/* 数学符号层：4 列大键（≈85px），专注计算，无切换干扰 */
const SYMBOL_ROWS = [
  ['7', '8', '9', { label: '⌫', act: 'backspace', fn: true }],
  ['4', '5', '6', '+'],
  ['1', '2', '3', '−'],
  [{ label: 'ABC', act: 'mode:text', fn: true }, '0', '.', '='],
  [{ label: '发送', act: 'submit', span: 4, accent: true }],
];

const TEXT_GRID = [
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  ['i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'],
  ['q', 'r', 's', 't', 'u', 'v', 'w', 'x'],
  ['y', 'z', '，', '。', '？', '；', '：', { label: '⌫', act: 'backspace', fn: true }],
  [{ label: '?123', act: 'mode:symbol', span: 2, fn: true },
   { label: '空格', act: 'key: ', span: 4, fn: true },
   { label: '发送', act: 'submit', span: 2, accent: true }],
];

const MODES = {
  text: { cols: 8, rows: TEXT_GRID },
  symbol: { cols: 4, rows: SYMBOL_ROWS },
};

const CSS = `
.akp { position: fixed; left: 0; right: 0; bottom: 0; z-index: 9997;
  visibility: hidden;
  background: var(--keyboard-background, #f8fafc);
  padding: 8px 8px calc(8px + env(safe-area-inset-bottom, 0px));
  box-shadow: 0 -8px 30px rgba(15,23,42,.18);
  border-radius: 18px 18px 0 0; font-family: inherit; }
.akp-grid { display: grid; gap: 5px; max-width: 520px; margin: 0 auto; }
.akp-key { height: var(--akp-key-h, 44px); padding: 0;
  border: 1px solid var(--vkp-border, rgba(15,23,42,.08));
  border-radius: 10px; background: var(--keycap-background, #fff);
  color: var(--keycap-text, #1e293b);
  font-size: var(--akp-font, 18px); font-weight: 800; font-family: inherit;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  user-select: none; -webkit-user-select: none; touch-action: manipulation; }
.akp-key:active { filter: brightness(.92); }
.akp-key.akp-fn { font-size: 13.5px; font-weight: 700; opacity: .78; }
.akp-key.akp-accent { background: var(--keyboard-accent-color, #29CC57); color: #fff;
  border-color: transparent; box-shadow: 0 3px 0 rgba(15,23,42,.14); }
.akp-key.akp-accent:active { filter: brightness(.96); }
`;

class ChatKeypad {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'akp';
    this.el.setAttribute('role', 'group');
    this.el.setAttribute('aria-label', 'Aji 输入键盘');
    this.gridEl = document.createElement('div');
    this.gridEl.className = 'akp-grid';
    this.el.appendChild(this.gridEl);
    document.body.appendChild(this.el);

    const style = document.createElement('style');
    style.id = 'akp-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    this._handlers = { onKey: () => {}, onBackspace: () => {}, onSubmit: () => {}, onModeChange: () => {}, onResize: () => {} };
    this.mode = 'text';          // ⭐ 默认文字层（见文件头布局取舍）
    this.visible = false;

    this._render();

    // pointerdown：响应更快，且不抢走页面的合成点击
    this.el.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('.akp-key');
      if (!btn) return;
      e.preventDefault();
      this._fire(btn.dataset.act);
    });

    this._applyTheme();
    this._themeObserver = new MutationObserver(() => this._applyTheme());
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    this._onWinResize = () => { if (this.visible) this._report(); };
    window.addEventListener('resize', this._onWinResize);

    // ⭐ 初始位移交给 gsap（CSS 里绝不写 transform——会被 gsap 解析烘焙成 px 分量）
    gsap.set(this.el, { yPercent: 105 });
  }

  /* ---- 渲染 ---- */
  _render() {
    const spec = MODES[this.mode] || MODES.text;
    this.gridEl.style.gridTemplateColumns = `repeat(${spec.cols}, 1fr)`;
    const frag = document.createDocumentFragment();
    for (const row of spec.rows) {
      for (const k of row) {
        const def = (typeof k === 'string') ? { label: k, act: 'key:' + k } : k;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'akp-key' + (def.fn ? ' akp-fn' : '') + (def.accent ? ' akp-accent' : '');
        btn.textContent = def.label;
        btn.dataset.act = def.act;
        if (def.span && def.span > 1) btn.style.gridColumn = `span ${def.span}`;
        btn.setAttribute('aria-label', def.act.startsWith('key:') ? def.label : def.label);
        frag.appendChild(btn);
      }
    }
    this.gridEl.replaceChildren(frag);
  }

  _fire(act) {
    if (!act) return;
    if (act.startsWith('key:')) { this._handlers.onKey(act.slice(4)); return; }
    if (act === 'backspace') { this._handlers.onBackspace(); return; }
    if (act === 'submit') { this._handlers.onSubmit(); return; }
    if (act.startsWith('mode:')) {
      const next = act.slice(5);
      if (next === this.mode) return;
      this.mode = next;
      this._render();
      this._handlers.onModeChange(next);
      this._report();     // 两层行数不同 → 高度会变，必须通知宿主重算
      return;
    }
  }

  _applyTheme() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const t = dark ? THEMES.dark : THEMES.light;
    const s = this.el.style;
    s.setProperty('--keyboard-background', t.keyboardBackground);
    s.setProperty('--keycap-background', t.keycapBackground);
    s.setProperty('--keycap-text', t.keycapText);
    s.setProperty('--vkp-border', t.keycapBorder);
    s.setProperty('--keyboard-accent-color', t.accent);
  }

  /** 高度上报（宿主据此托举输入行；本组件绝不碰 body 布局） */
  _report() {
    let h = 0;
    try { h = Math.round(this.el.getBoundingClientRect().height) || 0; } catch (e) {}
    this.height = h;
    this._handlers.onResize(h);
  }

  _ensureAttached() {
    if (!this.el.isConnected) document.body.appendChild(this.el);
    if (!document.getElementById('akp-style')) {
      const style = document.createElement('style');
      style.id = 'akp-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
  }

  /** 显示键盘。已可见时只重绑回调、不重播动画。 */
  show({ onKey, onBackspace, onSubmit, onModeChange, onResize } = {}) {
    this._ensureAttached();
    this._handlers = {
      onKey: typeof onKey === 'function' ? onKey : () => {},
      onBackspace: typeof onBackspace === 'function' ? onBackspace : () => {},
      onSubmit: typeof onSubmit === 'function' ? onSubmit : () => {},
      onModeChange: typeof onModeChange === 'function' ? onModeChange : () => {},
      onResize: typeof onResize === 'function' ? onResize : () => {},
    };
    this._applyTheme();
    if (!this.visible) {
      this.visible = true;
      this.el.style.visibility = 'visible';
      gsap.fromTo(this.el, { yPercent: 105 }, { yPercent: 0, duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
    }
    this._report();
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    const cb = this._handlers.onResize;
    gsap.to(this.el, {
      yPercent: 105, duration: 0.26, ease: 'power2.in', overwrite: 'auto',
      onComplete: () => { if (!this.visible) this.el.style.visibility = 'hidden'; },
    });
    this.height = 0;
    cb(0);            // ⭐ 收键盘立刻复位（不等动画结束，否则宿主高度要等到下一帧）
  }

  /** 强制切层（宿主在外部改状态时用；正常走动线是键盘上的切换键） */
  setMode(mode) {
    if (!MODES[mode] || mode === this.mode) return;
    this.mode = mode;
    this._render();
    this._report();
  }

  destroy() {
    this._themeObserver.disconnect();
    window.removeEventListener('resize', this._onWinResize);
    gsap.killTweensOf(this.el);
    this.el.remove();
    document.getElementById('akp-style')?.remove();
    instance = null;
  }
}

export function getChatKeypad() {
  if (!instance) instance = new ChatKeypad();
  return instance;
}
