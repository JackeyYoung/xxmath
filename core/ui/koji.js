/* core/ui/koji.js
   <Koji 心流助教> —— 全局统一聊天舱（Chat Hub，单例）
   ─────────────────────────────────────────────
   架构（Brilliant & Restrained）：
   - 全局唯一 koji-drawer（微信式聊天舱）：滚动消息区 + 底部输入区（预留 LLM 接入）。
     默认隐藏，从右下角平滑滑出；壳层 initShell 启动时挂载，全应用仅此一份。
   - 状态记忆：所有消息进 this.history（结构化数据），重开抽屉上下文不丢，封顶 60 条。
   - 统一消息 API（结构化数据，废弃每次传 HTML 片段的 showDialog）：
       koji.sendMessage({
         type: 'hint',        // 'hint' | 'estimate' | 'error_review'
         title: '这一步怎么想？',
         content: '你是不是忘记了先乘除后加减？…',   // 可信 HTML
         actions: [{ text: '我懂了', type: 'close' }],  // type:'close' 点击后收起；否则留在舱内续聊
       });
     点选 action 会以"用户气泡"落入聊天流（对话感），再触发 onClick 回调——
     回调里可继续 sendMessage 追加 Koji 消息（如估算揭晓）。
   - 诊断入口仍是右下角浮条（唯一入口）：showToast/hideToast/requestIdleToast，
     全局空闲计时器 + 任何有效操作自动淡出/重置（见下方 _onActivity）。
   - 键盘避让：visualViewport resize/scroll 动态抬升 drawer 与 toast 的 bottom。
   - 居中/滑出位移一律走 GSAP 分量（xPercent/yPercent/x/y）——CSS transform 会被补间覆盖。
   - 主题跟随 <html data-theme>；drawer z-index 9996（键盘 9990、抽屉式换题表 9995 之上）。
*/
import { gsap } from '../../js/vendor/gsap/index.js';

let instance = null;

const CSS = `
/* ── 聊天舱 ── */
.koji-drawer { position: fixed; right: 14px; bottom: 18px; z-index: 9996;
  width: min(340px, calc(100vw - 28px)); height: min(460px, calc(100vh - 120px));
  display: none; flex-direction: column;
  background: var(--koji-bg, #ffffff); color: var(--koji-text, #1e293b);
  border: 1px solid rgba(100,116,139,.22); border-radius: 18px;
  box-shadow: 0 18px 60px rgba(15,23,42,.28);
  font-family: inherit; overflow: hidden; }
.koji-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px 10px;
  border-bottom: 1px solid rgba(100,116,139,.16); }
.koji-head .koji-avatar { font-size: 18px; }
.koji-head .koji-name { flex: 1; font-size: 14px; font-weight: 800; }
.koji-close { border: none; background: transparent; color: var(--koji-text-soft, #64748b);
  font-size: 15px; cursor: pointer; padding: 2px 6px; border-radius: 8px; font-family: inherit; }
.koji-close:active { transform: scale(.94); }
.koji-msgs { flex: 1; overflow-y: auto; padding: 12px 12px 8px; display: flex;
  flex-direction: column; gap: 10px; scroll-behavior: smooth; }
.koji-msg { display: flex; gap: 8px; align-items: flex-start; }
.koji-msg .koji-msg-avatar { font-size: 16px; line-height: 1.2; flex: none; margin-top: 2px; }
.koji-msg-body { max-width: 82%; padding: 9px 12px; border-radius: 14px;
  background: var(--koji-msg-bg, #f1f5f9); color: var(--koji-text, #1e293b);
  font-size: 13.5px; line-height: 1.6; }
.koji-msg-title { font-weight: 800; margin-bottom: 3px; font-size: 13px; }
.koji-msg-content b { font-weight: 800; }
.koji-msg-acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.koji-act { padding: 6px 12px; border-radius: 10px; border: 1.5px solid rgba(100,116,139,.4);
  background: var(--koji-bg, #ffffff); color: var(--koji-text, #1e293b); font-size: 13px;
  font-weight: 700; cursor: pointer; font-family: inherit; }
.koji-act:active { transform: scale(.97); }
.koji-act.primary { border-color: transparent; background: #29CC57; color: #fff; }
.koji-msg.koji-msg-user { justify-content: flex-end; }
.koji-msg.koji-msg-user .koji-msg-body { background: #29CC57; color: #fff; font-weight: 700;
  border-bottom-right-radius: 4px; }
.koji-msg.koji-msg-koji .koji-msg-body { border-top-left-radius: 4px; }
.koji-inputbar { display: flex; gap: 8px; padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid rgba(100,116,139,.16); }
.koji-input { flex: 1; min-width: 0; padding: 9px 12px; border-radius: 12px;
  border: 1.5px solid rgba(100,116,139,.3); background: transparent;
  color: var(--koji-text, #1e293b); font-size: 13.5px; font-family: inherit; outline: none; }
.koji-input::placeholder { color: var(--koji-text-soft, #94a3b8); }
.koji-send { padding: 9px 14px; border-radius: 12px; border: none; background: #29CC57;
  color: #fff; font-size: 13px; font-weight: 800; cursor: pointer; font-family: inherit; }
.koji-send[disabled] { opacity: .45; cursor: default; }
/* ── 右下角浮条（唯一诊断入口） ── */
.koji-toast { position: fixed; right: 18px; bottom: 24px; z-index: 9992;
  max-width: min(250px, calc(100vw - 32px)); padding: 10px 14px;
  border-radius: 14px; border: 1px solid rgba(100,116,139,.28);
  background: var(--koji-bg, #ffffff); color: var(--koji-text, #1e293b);
  box-shadow: 0 8px 30px rgba(15,23,42,.18);
  font-size: 13.5px; line-height: 1.55; text-align: left; font-family: inherit;
  cursor: pointer; }
.koji-toast .koji-toast-name { display: block; font-size: 12px; font-weight: 800;
  color: #29CC57; margin-bottom: 2px; letter-spacing: .02em; }
@media (prefers-reduced-motion: reduce) { .koji-drawer, .koji-toast { transition: none; } }
`;

class Koji {
  constructor() {
    /* ---- 聊天舱 ---- */
    this.drawer = document.createElement('div');
    this.drawer.className = 'koji-drawer';
    this.drawer.setAttribute('role', 'dialog');
    this.drawer.setAttribute('aria-label', 'Koji 心流助教');
    this.drawer.innerHTML = `
      <div class="koji-head">
        <span class="koji-avatar">🤖</span>
        <span class="koji-name">Koji 心流助教</span>
        <button type="button" class="koji-close" aria-label="收起">✕</button>
      </div>
      <div class="koji-msgs"></div>
      <div class="koji-inputbar">
        <input type="text" class="koji-input" placeholder="输入你的问题…（即将上线）" disabled>
        <button type="button" class="koji-send" disabled>发送</button>
      </div>`;
    this.msgsEl = this.drawer.querySelector('.koji-msgs');
    this.toast = document.createElement('button');
    this.toast.type = 'button';
    this.toast.className = 'koji-toast';
    for (const el of [this.drawer, this.toast]) {
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    const style = document.createElement('style');
    style.id = 'koji-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    /* ---- 状态 ---- */
    this.visible = false;      // 抽屉展开
    this.toastVisible = false; // 浮条可见
    this.history = [];         // ⭐ 上下文记忆：[{role:'koji'|'user', type, title, content, actions} | {role:'user', text}]
    this._toastCb = null;
    this._idleTimer = null;
    this._idleCfg = null;

    this.drawer.querySelector('.koji-close').addEventListener('click', () => this.closeDrawer());
    this.toast.addEventListener('click', () => {
      const cb = this._toastCb;
      this.hideToast();
      cb?.();
    });

    this._onKey = (e) => { if (e.key === 'Escape' && this.visible) this.closeDrawer(); };
    window.addEventListener('keydown', this._onKey);

    // ⭐ 全局空闲计时器（捕获级）：任何有效操作 → 浮条立刻淡出 + 挂起计时重置
    this._onActivity = (e) => {
      if (e.target.closest?.('.koji-toast, .koji-drawer')) return;   // 与 Koji 自身的交互不算"界面操作"
      if (this.toastVisible) this._fadeToast();
      if (this._idleCfg) this._armIdleTimer();
    };
    document.addEventListener('pointerdown', this._onActivity, true);
    document.addEventListener('keydown', this._onActivity, true);

    // ⭐ 键盘避让：软键盘弹起时抬升 drawer / toast 的 bottom
    const adjust = () => {
      try {
        if (!window.visualViewport) return;
        const kb = window.innerHeight - window.visualViewport.height;
        this.toast.style.bottom = kb > 0 ? (kb + 14) + 'px' : '24px';
        this.drawer.style.bottom = kb > 0 ? (kb + 14) + 'px' : '18px';
      } catch (e) { /* 环境不支持就保持默认位置 */ }
    };
    this._adjust = adjust;
    window.visualViewport?.addEventListener('resize', adjust);
    window.visualViewport?.addEventListener('scroll', adjust);

    this._applyTheme();
    this._themeObserver = new MutationObserver(() => this._applyTheme());
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    gsap.set(this.drawer, { x: 28, y: 28, opacity: 0 });
    gsap.set(this.toast, { opacity: 0 });
  }

  get isDrawerOpen() { return this.visible; }
  get isToastVisible() { return this.toastVisible; }

  _applyTheme() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    for (const el of [this.drawer, this.toast]) {
      const s = el.style;
      s.setProperty('--koji-bg', dark ? '#1e293b' : '#ffffff');
      s.setProperty('--koji-text', dark ? '#f1f5f9' : '#1e293b');
      s.setProperty('--koji-text-soft', dark ? '#cbd5e1' : '#94a3b8');
      s.setProperty('--koji-msg-bg', dark ? '#0f172a' : '#f1f5f9');
    }
  }

  _ensureAttached() {
    for (const el of [this.drawer, this.toast]) {
      if (!el.isConnected) document.body.appendChild(el);
    }
    if (!document.getElementById('koji-style')) {
      const style = document.createElement('style');
      style.id = 'koji-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
  }

  /* ---- 聊天舱：统一消息机制 ---- */

  /** ⭐ 推送一条 Koji 消息并打开抽屉。
      msg = { type: 'hint'|'estimate'|'error_review', title, content(可信 HTML),
              actions: [{ text, type: 'close'|'reply', onClick }] } */
  sendMessage(msg = {}) {
    this._ensureAttached();
    this.history.push({
      role: 'koji',
      type: msg.type || 'hint',
      title: msg.title || '',
      content: msg.content || '',
      actions: Array.isArray(msg.actions) ? msg.actions.slice(0, 4) : [],
    });
    if (this.history.length > 60) this.history.splice(0, this.history.length - 60);
    this._render();
    this.openDrawer();
  }

  /* 依据 history 重建聊天流（状态记忆），并滚到最底 */
  _render() {
    const frag = document.createDocumentFragment();
    for (const m of this.history) {
      const row = document.createElement('div');
      row.className = 'koji-msg koji-msg-' + m.role;
      if (m.role === 'user') {
        const body = document.createElement('div');
        body.className = 'koji-msg-body';
        body.textContent = m.text;
        row.appendChild(body);
      } else {
        const av = document.createElement('div');
        av.className = 'koji-msg-avatar';
        av.textContent = '🤖';
        const body = document.createElement('div');
        body.className = 'koji-msg-body';
        if (m.title) {
          const t = document.createElement('div');
          t.className = 'koji-msg-title';
          t.textContent = m.title;
          body.appendChild(t);
        }
        const c = document.createElement('div');
        c.className = 'koji-msg-content';
        c.innerHTML = m.content;   // 可信 HTML（模块作者产出）
        body.appendChild(c);
        if (m.actions && m.actions.length) {
          const acts = document.createElement('div');
          acts.className = 'koji-msg-acts';
          m.actions.forEach((a, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'koji-act' + (a.style === 'primary' ? ' primary' : '');
            b.textContent = a.text;
            b.addEventListener('click', () => {
              // ⭐ 用户选择以"用户气泡"落入聊天流（对话感），随后触发回调
              this.history.push({ role: 'user', text: a.text });
              if (this.history.length > 60) this.history.splice(0, this.history.length - 60);
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
    if (!this.history.length) {
      // 初次见面：轻声自我介绍（一并入史，保持上下文连续）
      this.history.push({
        role: 'koji', type: 'hint', title: '你好，我是 Koji',
        content: '卡住了就点右下角的气泡找我；我讲思路，不报答案。', actions: [],
      });
      this._render();
    }
    if (this.visible) return;
    this.visible = true;
    this.drawer.style.display = 'flex';
    gsap.fromTo(this.drawer, { x: 28, y: 28, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.28, ease: 'power2.out', overwrite: 'auto' });
    this._adjust?.();
  }

  closeDrawer() {
    if (!this.visible) return;
    this.visible = false;
    gsap.to(this.drawer, {
      x: 28, y: 28, opacity: 0, duration: 0.2, ease: 'power2.in', overwrite: 'auto',
      onComplete: () => { if (!this.visible) this.drawer.style.display = 'none'; },
    });
  }

  /* ---- 右下角浮条（唯一诊断入口） ---- */

  /** 立即显示浮条：点击浮条 → 淡出 + onClick（通常 onClick 里 sendMessage 推导内容） */
  showToast(text, onClick) {
    this._ensureAttached();
    this._toastCb = onClick || null;
    this.toast.innerHTML = `<span class="koji-toast-name">🤖 Koji</span>${''}`;
    this.toast.appendChild(document.createTextNode(String(text || '')));
    this._adjust?.();
    if (this.toastVisible) return;
    this.toastVisible = true;
    this.toast.style.display = 'block';
    gsap.fromTo(this.toast, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
  }

  /** 强制清理浮条：隐藏 + 清除挂起的空闲计时器与场景请求 */
  hideToast() {
    if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; }
    this._idleCfg = null;
    this._toastCb = null;
    if (!this.toastVisible && this.toast.style.display !== 'block') return;
    this.toastVisible = false;
    gsap.to(this.toast, {
      opacity: 0, duration: 0.18, ease: 'power2.in', overwrite: 'auto',
      onComplete: () => { if (!this.toastVisible) this.toast.style.display = 'none'; },
    });
  }

  /** 场景声明：空闲 ms 毫秒后浮条。全局任何有效操作都会重置这段静默计时。 */
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

  /* 活动触发的软淡出：只藏浮条，请求保留（静置后可再次浮现） */
  _fadeToast() {
    if (!this.toastVisible) return;
    this.toastVisible = false;
    gsap.to(this.toast, {
      opacity: 0, duration: 0.18, ease: 'power2.in', overwrite: 'auto',
      onComplete: () => { if (!this.toastVisible) this.toast.style.display = 'none'; },
    });
  }

  destroy() {
    this._themeObserver.disconnect();
    window.removeEventListener('keydown', this._onKey);
    document.removeEventListener('pointerdown', this._onActivity, true);
    document.removeEventListener('keydown', this._onActivity, true);
    window.visualViewport?.removeEventListener('resize', this._adjust);
    window.visualViewport?.removeEventListener('scroll', this._adjust);
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this.drawer.remove();
    this.toast.remove();
    document.getElementById('koji-style')?.remove();
    instance = null;
  }
}

/* 惰性单例：koji.sendMessage(...) / koji.isDrawerOpen 直读直调（spec 统一 API 形态） */
export function getKoji() {
  if (!instance) instance = new Koji();
  return instance;
}

export const koji = new Proxy({}, {
  get(_, key) {
    const impl = getKoji();
    const v = impl[key];
    return typeof v === 'function' ? v.bind(impl) : v;
  },
  set(_, key, value) { getKoji()[key] = value; return true; },
});
