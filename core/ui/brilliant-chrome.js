/* core/ui/brilliant-chrome.js
   Brilliant 卡片公共 Chrome（顶栏 / 图标按钮 / 底部抽屉 / 聚光灯 / 弱化提示）
   —— m1、m9 及后续模块共用；主题色由各模块在自己的容器上设置
   （--b1-sheet-bg；其余用中性 slate 色两种主题通吃，保持克制）。
*/

const CSS = `
.b1-topbar { display: flex; align-items: center; justify-content: flex-end; gap: 12px; min-height: 38px; }
.b1-actions { display: flex; gap: 8px; }
.b1-iconbtn { min-width: 38px; height: 38px; padding: 0 8px; border-radius: 10px;
  border: 1px solid rgba(100,116,139,.45); background: transparent; color: #64748b;
  font-size: 17px; font-weight: 800; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; }
.b1-iconbtn:active { transform: scale(.93); }
.b1-iconbtn[disabled] { opacity: .45; }

.b1-sheet { position: fixed; left: 12px; right: 12px; bottom: 0; z-index: 9995;
  background: var(--b1-sheet-bg, #fff); border-radius: 18px 18px 0 0;
  padding: 18px 16px calc(20px + env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; gap: 10px;
  box-shadow: 0 -10px 40px rgba(15,23,42,.22);
  transform: translateY(105%); transition: transform .3s cubic-bezier(.2,.9,.3,1); }
.b1-sheet.open { transform: translateY(0); }
.b1-mask { position: fixed; inset: 0; z-index: 9994; background: rgba(15,23,42,.35); }

.b1-hint { margin-top: 28px; }
.b1-hint:not(.ok):not(.error) { color: #64748b; font-size: 16px; }

/* 聚光灯：等待输入时页面其余部分退后 */
.b1-card.b1-awaiting .b1-topbar,
.b1-card.b1-awaiting .b1-hint { opacity: .4; transition: opacity .25s; }
`;

let done = false;

export function ensureChromeStyle() {
  if (done || document.getElementById('bchrome-style')) return;
  const style = document.createElement('style');
  style.id = 'bchrome-style';
  style.textContent = CSS;
  document.head.appendChild(style);
  done = true;
}
