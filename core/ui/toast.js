/* core/ui/toast.js */
export function showToast(msg, type) {
  document.querySelectorAll('.m3-toast').forEach(t => t.remove());
  const ico = type === 'success' ? '🎉 ' : '💡 ';
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
    display: flex; align-items: center; gap: 8px;
    max-width: 82vw; line-height: 1.5;
  `;
  toast.textContent = ico + msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity .3s';
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

window.showToast = showToast;