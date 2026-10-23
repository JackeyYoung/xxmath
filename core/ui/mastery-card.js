/* core/ui/mastery-card.js */
import { escapeHtmlStrict } from '../html.js';
import { showToast } from './toast.js';

export function showMasteryCard({ problemText, correctAnswer, takeaway }) {
  if (document.querySelector('.mastery-card-mask')) return;

  const mask = document.createElement('div');
  mask.className = 'mastery-card-mask';
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;z-index:10020;padding:20px;';
  mask.innerHTML = `
    <div class="mastery-card">
      <div class="mastery-card-glow"></div>
      <div class="mastery-card-inner">
        <div class="mastery-card-badge">🏆 已掌握</div>
        <div class="mastery-card-title">我又学会了一道题</div>
        <div class="mastery-card-problem">
          <div class="mastery-card-label">📝 题目</div>
          <div class="mastery-card-text">${escapeHtmlStrict(problemText)}</div>
        </div>
        <div class="mastery-card-answer">
          <div class="mastery-card-label">✅ 答案</div>
          <div class="mastery-card-answer-text">${escapeHtmlStrict(correctAnswer || '—')}</div>
        </div>
        ${takeaway ? `
          <div class="mastery-card-note">
            <div class="mastery-card-label">💡 一题一得</div>
            <div class="mastery-card-note-text">${escapeHtmlStrict(takeaway)}</div>
          </div>
        ` : ''}
        <div class="mastery-card-date">${new Date().toLocaleDateString('zh-CN')}</div>
        <div class="mastery-card-btns">
          <button class="mastery-card-close" id="masteryCardClose">继续做题</button>
          <button class="mastery-card-share" id="masteryCardShare">📤 分享</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(mask);
  document.getElementById('masteryCardClose').addEventListener('click', () => mask.remove());
  document.getElementById('masteryCardShare').addEventListener('click', () => shareMasteryCard({ problemText, correctAnswer, takeaway }));
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
}

function shareMasteryCard({ problemText, correctAnswer, takeaway }) {
  const text = `🏆 我掌握了这道题！\n\n📝 ${problemText}\n✅ ${correctAnswer}${takeaway ? `\n💡 ${takeaway}` : ''}\n\n—— 来自「老爸数学互动课堂」`;
  if (navigator.share) {
    navigator.share({ title: '我掌握了这道题', text }).catch(err => {
      if (err?.name === 'AbortError') return;
      showToast('分享失败，试试截图保存', 'info');
    });
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('✅ 已复制到剪贴板', 'success'))
      .catch(() => showToast('复制失败，请截图', 'info'));
  } else {
    showToast('请手动截图分享', 'info');
  }
}