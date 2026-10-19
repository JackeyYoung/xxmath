/* core/toast.js
   全局 Toast 提示
*/
export function showToast(msg, type) {
  if (document.querySelector('.toast-showing')) {
    document.querySelector('.toast-showing').remove();
  }

  const toast = document.createElement('div');
  toast.className = 'toast-showing';
  toast.style.cssText = `
    position: fixed; top: 60px; left: 50%; transform: translateX(-50%);
    background: ${type === 'success' ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#3b82f6,#2563eb)'};
    color: #fff; padding: 12px 24px; border-radius: 10px;
    font-size: 14px; font-weight: 700; z-index: 99999;
    box-shadow: 0 8px 24px rgba(0,0,0,.15);
    animation: fadeUp .3s ease;
    max-width: 90vw;
    text-align: center;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity .3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

window.showToast = showToast;