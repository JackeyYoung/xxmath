/* core/ui/global-observer.js
   UI 事件订阅中心
   取代：hookSfx / hookCorrectCelebration / hookFeedbackToThumbBar
*/
import { onUI } from './bus-ui.js';
import { onCorrect } from './celebrate.js';
import { SFX } from '../sfx.js';
import { showToast } from './toast.js';


let correctCount = 0;
let errorCount = 0;
let stuckTimer = null;

function setKojiState(state) {
  const btn = document.getElementById('kojiBtn');
  if (!btn) return;
  btn.classList.remove('koji-idle', 'koji-alert', 'koji-retreat');
  btn.classList.add('koji-' + state);
  btn.dataset.state = state;

  if (state === 'alert') btn.title = '卡住了？点我看看 🤖';
  else if (state === 'retreat') btn.title = '你做得很好，我不打扰你';
  else btn.title = 'Koji 助手';
}

function showKojiBubble(text) {
  if (document.querySelector('.koji-bubble')) return;
  const bubble = document.createElement('div');
  bubble.className = 'koji-bubble';
  bubble.style.cssText = `
    position: fixed; bottom: max(88px, calc(env(safe-area-inset-bottom) + 88px));
    right: max(144px, calc(env(safe-area-inset-right) + 144px));
    background: #fff; border: 2px solid #8b5cf6; border-radius: 14px;
    padding: 10px 14px; font-size: 13px; font-weight: 600;
    color: #5b21b6; box-shadow: 0 8px 24px rgba(139, 92, 246, .25);
    z-index: 999; max-width: 220px; animation: fadeUp .3s ease; cursor: pointer;
  `;
  bubble.textContent = text;
  bubble.addEventListener('click', () => {
    bubble.remove();
    document.getElementById('kojiBtn')?.click();
  });
  document.body.appendChild(bubble);
  setTimeout(() => bubble.remove(), 8000);
}

function resetStuckTimer() {
  clearTimeout(stuckTimer);
  stuckTimer = setTimeout(() => {
    const hash = location.hash;
    if (hash.includes('lesson/m1') || hash.includes('lesson/m9') || hash.includes('lesson/m13')) {
      showKojiBubble('有不会的地方吗？点我问问 🤖');
    }
  }, 60000);
}

export function installUIListeners() {
  // 初始化 Koji 状态
  setKojiState('idle');

  // 监听答对
  onUI('CORRECT', ({ x, y }) => {
    if (SFX.isEnabled()) SFX.correct();
    if (typeof x === 'number' && typeof y === 'number') onCorrect(x, y);

    // Koji 连对退后逻辑
    correctCount++; errorCount = 0;
    if (correctCount >= 3) setKojiState('retreat');
    else setKojiState('idle');
    resetStuckTimer();
  });

  // 监听答错
  onUI('WRONG', () => {
    if (SFX.isEnabled()) SFX.wrong();

    // Koji 连错弹出气泡
    errorCount++; correctCount = 0;
    if (errorCount >= 3) {
      setKojiState('alert');
      showKojiBubble('卡住了？点我看看这步怎么算 🤖');
    }
    resetStuckTimer();
  });

  // 监听拇指条
  onUI('THUMB', async ({ text, ok, onNext }) => {
    const { showThumbBar } = await import('../../app/shell.js');
    showThumbBar({ text, ok, onNext });
  });

  // 用户只要点屏幕、敲键盘，就重置 60 秒发呆计时器
  ['click', 'keydown', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, resetStuckTimer, { passive: true });
  });
  resetStuckTimer();
}
