/* core/ui/virtual-keypad.js
   <共享底部数字键盘> —— 全局黑盒输入组件（业务层只经回调接入）
   ─────────────────────────────────────────────
   设计契约：
   - 主题 CSS 变量名与 MathLive 虚拟键盘保持一致，宿主可覆盖：
       --keyboard-background / --keycap-background / --keycap-text
       --keyboard-accent-color / --keycap-height / --keycap-font-size
   - 持久模式：show() 之后键盘常驻底部，hide() 只由业务在"终局"调用；
     连续答题（确认后继续下一步）绝不收起。
   - 单例：全局只有一把键盘，show() 重绑回调不重播动画。
   - ⭐ 黑盒接入（零业务耦合）：键盘内部绝无判分/步骤/业务元素逻辑，一切语义经回调上抛：
       show({ onDigit, onConfirm, onBackspace, onCancel, maxLength })
       · onDigit(d)     屏幕键或实体数字键
       · onConfirm()    确认键或实体回车（回车 preventDefault）
       · onBackspace()  实体退格键（屏幕键无退格，DOM 结构冻结）
       · onCancel()     实体 Esc（业务未传则 Esc 无效果）
       · maxLength      键盘侧发牌上限（计数字屏+实体；show/确认后清零，退格递减；
                        业务在回调外清空缓冲后须调 resetInput() 同步）。
                        键盘无缓冲，业务层回调内的截断仍是最终权威。
   - 实体键路由在本组件内（键盘可见时才接管）；键盘外部点击属于业务判卷语义
     （各模块规则不同），由业务层自行监听，本组件绝不越界。
*/
import { gsap } from '../../js/vendor/gsap/index.js';

let instance = null;

const THEMES = {
  light: {
    keyboardBackground: '#f8fafc',
    keycapBackground: '#ffffff',
    keycapText: '#1e293b',
    keycapBorder: 'rgba(15,23,42,.08)',
    accent: '#29CC57',
  },
  dark: {
    keyboardBackground: '#1e293b',
    keycapBackground: '#0f172a',
    keycapText: '#f1f5f9',
    keycapBorder: 'rgba(248,250,252,.10)',
    accent: '#29CC57',
  },
};

const CSS = `
.vkp { position: fixed; left: 0; right: 0; bottom: 0; z-index: 9990;
  visibility: hidden;
  background: var(--keyboard-background, #f8fafc);
  padding: 10px 10px calc(10px + env(safe-area-inset-bottom, 0px));
  box-shadow: 0 -8px 30px rgba(15,23,42,.18);
  border-radius: 18px 18px 0 0; }
.vkp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; max-width: 430px; margin: 0 auto; }
.vkp-key { height: var(--keycap-height, 52px); border: 1px solid var(--vkp-border, rgba(15,23,42,.08));
  border-radius: 12px; background: var(--keycap-background, #fff); color: var(--keycap-text, #1e293b);
  font-size: var(--keycap-font-size, 22px); font-weight: 800; font-family: inherit;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  user-select: none; -webkit-user-select: none; touch-action: manipulation; }
.vkp-key:active { filter: brightness(.92); transform: scale(.97); }
.vkp-key.vkp-accent { grid-column: span 2; background: var(--keyboard-accent-color, #29CC57);
  color: #fff; border-color: transparent; box-shadow: 0 3px 0 rgba(15,23,42,.14); }
.vkp-key.vkp-accent:active { transform: scale(.98); filter: brightness(.96); }
`;

class VirtualKeypad {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'vkp';
    this.el.innerHTML = `
      <div class="vkp-grid">
        ${['1', '2', '3', '4', '5', '6', '7', '8', '9']
          .map(d => `<button type="button" class="vkp-key" data-digit="${d}">${d}</button>`)
          .join('')}
        <button type="button" class="vkp-key" data-digit="0">0</button>
        <button type="button" class="vkp-key vkp-accent" data-confirm="1">确认</button>
      </div>`;
    document.body.appendChild(this.el);

    const style = document.createElement('style');
    style.id = 'vkp-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    this._handlers = { onDigit: () => {}, onConfirm: () => {}, onBackspace: () => {}, onCancel: () => {} };
    this._maxLength = null;   // 键盘侧发牌上限（null = 不限，由业务截断）
    this._pressCount = 0;     // 自 show/确认 起已发出的数字个数（退格递减）
    this.visible = false;

    // 按键：pointerdown 响应更快，且不抢走页面的合成点击
    this.el.addEventListener('pointerdown', (e) => {
      const key = e.target.closest('.vkp-key');
      if (!key) return;
      e.preventDefault();
      if (key.dataset.confirm) this._emitConfirm();
      else this._emitDigit(key.dataset.digit);
    });

    // ⭐ 实体键盘路由（桌面端补充）：键盘可见时才接管，全部经回调上抛，组件内零业务语义
    this._onWinKey = (e) => {
      if (!this.visible) return;
      if (/^[0-9]$/.test(e.key)) {
        this._emitDigit(e.key);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this._emitConfirm();
      } else if (e.key === 'Backspace') {
        if (this._pressCount > 0) this._pressCount--;
        this._handlers.onBackspace();
      } else if (e.key === 'Escape') {
        this._handlers.onCancel();
      }
    };
    window.addEventListener('keydown', this._onWinKey);

    // 跟随应用主题重设变量
    this._applyTheme();
    this._themeObserver = new MutationObserver(() => this._applyTheme());
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // ⭐ 初始位移交给 gsap（CSS 里绝不写 transform——否则会被 gsap 解析烘焙成
    //    px 分量，yPercent 补间永远清不掉它，键盘卡在屏幕外）
    gsap.set(this.el, { yPercent: 105 });
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

  /** 发牌：屏幕键与实体数字键共用（maxLength 计数在此统一） */
  _emitDigit(d) {
    if (this._maxLength != null && this._pressCount >= this._maxLength) return;
    this._pressCount++;
    this._handlers.onDigit(d);
  }

  _emitConfirm() {
    this._pressCount = 0;   // 一轮作答结束，计数清零
    this._handlers.onConfirm();
  }

  /** 显示键盘（已可见时只重绑回调，绝不重播动画） */
  show({ onDigit = () => {}, onConfirm = () => {}, onBackspace = () => {}, onCancel = () => {}, maxLength = null } = {}) {
    this._ensureAttached();
    this._handlers = { onDigit, onConfirm, onBackspace, onCancel };
    this._maxLength = maxLength;
    this._pressCount = 0;
    this._applyTheme();
    if (!this.visible) {
      this.visible = true;
      this.el.style.visibility = 'visible';
      gsap.fromTo(this.el, { yPercent: 105 }, { yPercent: 0, duration: 0.32, ease: 'power2.out', overwrite: 'auto' });
    }
    // ⭐ 给页面底部留出键盘高度，长页面可以滚动到键盘上方（内容不被遮挡）
    const h = Math.round(this.el.getBoundingClientRect().height);
    document.body.style.paddingBottom = (h + 10) + 'px';
  }

  /** 自愈：宿主环境清空过 body 时重新挂载（测试/路由场景） */
  _ensureAttached() {
    if (!this.el.isConnected) document.body.appendChild(this.el);
    if (!document.getElementById('vkp-style')) {
      const style = document.createElement('style');
      style.id = 'vkp-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
  }

  /** ⭐ 把元素滚动到键盘上沿之上（提示语/等待格不被键盘遮挡） */
  ensureVisible(el, margin = 12) {
    if (!this.visible || !el) return;
    try {
      const kTop = this.el.getBoundingClientRect().top;
      const r = el.getBoundingClientRect();
      if (r.bottom > kTop - margin) {
        window.scrollBy({ top: r.bottom - kTop + margin, behavior: 'smooth' });
      }
    } catch (e) {}
  }

  /** 隐藏键盘（只由终局逻辑调用） */
  hide() {
    if (!this.visible) return;
    this.visible = false;
    this._pressCount = 0;
    gsap.to(this.el, { yPercent: 105, duration: 0.28, ease: 'power2.in', overwrite: 'auto',
      onComplete: () => {
        if (!this.visible) {
          this.el.style.visibility = 'hidden';
          document.body.style.paddingBottom = '';   // 页面让位复位
        }
      } });
  }

  /** 业务层在回调之外清空了输入缓冲（如答错重置）后调用，同步 maxLength 计数 */
  resetInput() {
    this._pressCount = 0;
  }

  destroy() {
    this._themeObserver.disconnect();
    window.removeEventListener('keydown', this._onWinKey);
    gsap.killTweensOf(this.el);
    this.el.remove();
    document.getElementById('vkp-style')?.remove();
    instance = null;
  }
}

export function getVirtualKeypad() {
  if (!instance) instance = new VirtualKeypad();
  return instance;
}
