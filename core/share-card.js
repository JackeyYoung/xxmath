/* core/share-card.js */
import { escapeHtmlStrict } from './html.js';
import { takeawayLoad } from './takeaway.js';

export function showShareCard(record) {
  if (document.querySelector('.share-card-mask')) return;

  const mask = document.createElement('div');
  mask.className = 'share-card-mask';

  const stepsHtml = (record.studentSteps || []).filter(s => s.rel || s.sub || s.res).map((s, i) => `
    <div style="margin-bottom:6px;">
      <b style="color:#2563eb;">第 ${i + 1} 步：</b>
      ${s.rel ? `<div>关系式：${escapeHtmlStrict(s.rel)}</div>` : ''}
      ${s.sub ? `<div>代入：${escapeHtmlStrict(s.sub)}</div>` : ''}
      ${s.res ? `<div>得数：${escapeHtmlStrict(s.res)}</div>` : ''}
    </div>
  `).join('');

  const takeaway = takeawayLoad(record.text) || '';

  mask.innerHTML = `
    <div class="share-card">
      <div class="share-card-hd">
        <div class="share-card-emoji">🎉</div>
        <div class="share-card-title">我做对啦！</div>
      </div>
      <div class="share-card-problem"><b>📝 题目：</b>${escapeHtmlStrict(record.text)}</div>
      <div class="share-card-steps"><b>✏️ 我的解法：</b>${stepsHtml || '<div style="color:#94a3b8;">（未填步骤）</div>'}</div>
      <div class="share-card-answer">✅ 答案：${escapeHtmlStrict(record.studentAnswer || record.correctAnswer || '')}</div>
      ${takeaway ? `<div class="share-card-note"><b>💡 一题一得：</b>${escapeHtmlStrict(takeaway)}</div>` : ''}
      <div class="share-card-btns">
        <button class="share-card-close" id="shareCardClose">关闭</button>
        <button class="share-card-print" id="shareCardPrint">🖨️ 保存为图片</button>
      </div>
      <div class="share-card-footer">三年级数学互动课堂 · ${new Date().toLocaleDateString('zh-CN')}</div>
    </div>
  `;
  document.body.appendChild(mask);
  document.getElementById('shareCardClose').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
  document.getElementById('shareCardPrint').addEventListener('click', () => {
    alert('提示：可用手机截图，或长按保存。');
  });
}