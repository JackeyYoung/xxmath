/* core/ui/global.js */
const _KEY_INPUT_IDS = [
  'm1Input', 'm9InlineInput', 'pAnswer', 'pTakeaway',
  'm4answer', 'm4val', 'm12val', 'm5ChalInput',
  'm7CalcAns', 'fracNum', 'fracDen', 'loginCode',
];

const _MODULE_COLORS = {
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
  m13: 'linear-gradient(90deg,#2563eb,#7c3aed)',
};

function _isInputTarget(el) {
  if (!el) return false;
  return /INPUT|TEXTAREA/.test(el.tagName) ||
         el.isContentEditable ||
         el.closest('[contenteditable="true"]') !== null;
}

export function installGlobalUI() {
  // ⭐ ① 输入框聚焦避让 + visualViewport
  document.addEventListener('focusin', e => {
    if (!_isInputTarget(e.target)) return;
    
    // ⭐ 不再直接移除 show 类，而是由 body.input-focused 触发 CSS 动画滑出
    document.body.classList.add('input-focused');
    
    if (e.target.id === 'problem-text') {
      const bottomBar = document.querySelector('.m13-bottom-bar');
      if (bottomBar) bottomBar.style.display = 'none';
    }
    
    setTimeout(() => {
      try {
        const rect = e.target.getBoundingClientRect();
        const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
        if (rect.bottom > vh - 20) e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch (err) {}
    }, 320);
  });

  document.addEventListener('focusout', e => {
    if (!_isInputTarget(e.target)) return;
    setTimeout(() => {
      if (!_isInputTarget(document.activeElement)) {
        // ⭐ 失去焦点，移除 input-focused 类，拇指条会自动滑回
        document.body.classList.remove('input-focused');
        const bottomBar = document.querySelector('.m13-bottom-bar');
        if (bottomBar) bottomBar.style.display = '';
      }
    }, 100);
  });

  if (window.visualViewport) {
    let raf = null;
    window.visualViewport.addEventListener('resize', () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const focused = document.activeElement;
        if (!_isInputTarget(focused)) return;
        try {
          const rect = focused.getBoundingClientRect();
          const vh = window.visualViewport.height;
          if (rect.bottom > vh - 100 || rect.top < 60) {
            focused.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        } catch (e) {}
      });
    }, { passive: true });
  }

  // ⭐ ② 通用折叠（.collapsible-hd）
  document.addEventListener('click', e => {
    const hd = e.target.closest('.collapsible-hd');
    if (!hd) return;
    const section = hd.closest('.collapsible-section');
    if (!section) return;
    if (section.closest('#growthDetailPanels')) return;
    section.classList.toggle('expanded');
  });

  // ⭐ ③ 离线横幅
  const offline = document.createElement('div');
  offline.className = 'offline-banner';
  offline.textContent = '当前离线模式，已完成内容保存在本地';
  document.body.appendChild(offline);

  let offlineTimer = null;

  const refreshOnline = () => {
    if (!navigator.onLine) {
      // 断网了，立刻滑上来显示
      offline.classList.add('show');
      
      // 清空上一次的定时器
      if (offlineTimer) clearTimeout(offlineTimer);
      
      // ⭐ 核心：3 秒后自动滑走隐藏
      offlineTimer = setTimeout(() => {
        offline.classList.remove('show');
      }, 3000);
      
    } else {
      // 网络恢复了，瞬间让它滑走消失
      offline.classList.remove('show');
      if (offlineTimer) clearTimeout(offlineTimer);
    }
  };

  window.addEventListener('online', refreshOnline);
  window.addEventListener('offline', refreshOnline);
  refreshOnline();

  /* ⭐ ④ 预加载骨架
  const sk = document.createElement('div');
  sk.className = 'preload-skeleton';
  sk.innerHTML = '<div class="preload-skeleton-logo">🎓</div><div class="preload-skeleton-text">正在准备数学课堂…</div>';
  document.body.appendChild(sk);
  window.addEventListener('load', () => {
    setTimeout(() => { sk.classList.add('hide'); setTimeout(() => sk.remove(), 500); }, 250);
  });
  */

  // ⭐ ⑤ 模块卡片顶色条
  document.querySelectorAll('.module').forEach(mod => {
    const c = _MODULE_COLORS[mod.id];
    const card = mod.querySelector('.card');
    if (c && card) card.style.setProperty('--card-top', c);
  });
}

/* ⭐ 锁 body 滚动 */
export function lockBodyScroll(lock) {
  if (lock) document.body.classList.add('modal-open');
  else document.body.classList.remove('modal-open');
}