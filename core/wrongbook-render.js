/* core/wrongbook-render.js
   合并原 wbRender + patchWrongBookBadge + patchWrongBookRender2 + patchWbRecommendRender
*/
import { wbLoad } from './wrongbook.js';
import { historyLoad } from './history.js';
import { escapeHtmlStrict } from './html.js';
import { takeawayLoad } from './takeaway.js';
import { autoTagsFor, getReasons, toggleReason, REASONS } from './wrongbook-tags.js';
import { renderErrorProfile } from './wrongbook-profile.js';
import { renderWbRecommend } from './wrongbook-recommend.js';

export function wbRender() {
  const listEl = document.getElementById('wrongBookList');
  const badge  = document.getElementById('wrongBookBadge');
  if (!listEl) return;

  const history = historyLoad();
  const wrongCountMap = {};
  const totalCountMap = {};
  history.forEach(r => {
    const t = r.problemText;
    if (!totalCountMap[t]) { totalCountMap[t] = 0; wrongCountMap[t] = 0; }
    totalCountMap[t]++;
    if (!r.isCorrect) wrongCountMap[t]++;
  });

  const list = wbLoad();
  const now = Date.now();
  const dueCount = list.filter(r => r.nextReviewAt && r.nextReviewAt <= now).length;

  list.sort((a, b) => {
    const aScore = (wrongCountMap[a.text] || 0) * 10 - (a.masteredCount || 0) * 5;
    const bScore = (wrongCountMap[b.text] || 0) * 10 - (b.masteredCount || 0) * 5;
    if (aScore !== bScore) return bScore - aScore;
    return b.timestamp - a.timestamp;
  });

  if (badge) {
    if (list.length) {
      badge.textContent = list.length > 99 ? '99+' : list.length;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  if (!list.length) {
    listEl.innerHTML = '<div class="wrong-book-empty">还没有错题，继续加油 💪</div>';
    renderErrorProfile();
    return;
  }

  const dueBanner = dueCount > 0
    ? `<div style="padding:10px 14px;margin-bottom:10px;background:#fef3c7;border:2px solid #fcd34d;border-radius:10px;font-size:13px;font-weight:700;color:#b45309;">
        🔔 今天有 <b>${dueCount}</b> 道错题到期，复习一下吧
      </div>`
    : '';

  listEl.innerHTML = dueBanner + list.map(r => {
    const d = new Date(r.timestamp);
    const date = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const enc = encodeURIComponent(r.text);
    const takeaway = takeawayLoad(r.text);
    const takeawayHtml = takeaway ? `
      <div style="margin-top:8px;padding:8px 12px;background:#f0f9ff;border-left:3px solid #3b82f6;border-radius:6px;font-size:12px;color:#334155;line-height:1.6;">
        <b style="color:#2563eb;">💡 一题一得：</b>${escapeHtmlStrict(takeaway)}
      </div>
    ` : '';

    const masteredCount = r.masteredCount || 0;
    const progressHtml = masteredCount > 0 ? `
      <div style="margin-top:6px;font-size:11.5px;color:#10b981;font-weight:700;">
        ✅ 已做对 ${masteredCount}/2 次（再做对 ${2 - masteredCount} 次就移除）
      </div>
    ` : '';

    const due = r.nextReviewAt && r.nextReviewAt <= now;
    const upcoming = r.nextReviewAt && r.nextReviewAt > now;
    const reviewBadge = due
      ? `<span style="background:#fef3c7;color:#b45309;font-size:11px;font-weight:800;padding:2px 8px;border-radius:6px;">🔔 今天复习</span>`
      : upcoming
        ? `<span style="background:#e0e7ff;color:#3730a3;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;">📅 ${new Date(r.nextReviewAt).toLocaleDateString('zh-CN')} 复习</span>`
        : '';

    // ⭐ 自动标签（原 patchWrongBookRender2）
    const autoTags = autoTagsFor(r.text);
    const autoTagsHtml = autoTags.length
      ? `<div class="wrong-item-tags">${autoTags.map(t => `<span class="wrong-item-tag-chip">${t}</span>`).join('')}</div>`
      : '';

    // ⭐ 手动归因按钮（原 patchWrongBookRender2）
    const reasons = getReasons(r.text);
    const reasonRowHtml = `
      <div class="wrong-item-reason-row" data-text="${enc}">
        ${REASONS.map(rr => `<button class="wrong-reason-btn ${reasons.includes(rr) ? 'on' : ''}" data-reason="${rr}">${rr}</button>`).join('')}
      </div>
    `;

    // ⭐ 错题次数徽章（原 patchWrongBookBadge，通过 data-wrong-count 让 CSS 渲染）
    const wcAttr = wrongCountMap[r.text] ? ` data-wrong-count="错 ${wrongCountMap[r.text]} 次"` : '';

    return `
      <div class="wrong-item"${wcAttr}>
        <button class="wrong-item-remove" data-text="${enc}">×</button>
        <div class="wrong-item-text">${escapeHtmlStrict(r.text)}</div>
        ${autoTagsHtml}
        <div class="wrong-item-meta">
          <span>你的答案：${escapeHtmlStrict(r.studentAnswer || '（空）')}</span>
          <span>正确：${escapeHtmlStrict(r.correctAnswer || '—')}</span>
          <span>${date}</span>
          ${reviewBadge}
          ${wrongCountMap[r.text] ? `<span style="background:#fee2e2;color:#b91c1c;font-weight:800;">❌ 错过 ${wrongCountMap[r.text]} 次</span>` : ''}
          ${totalCountMap[r.text] ? `<span style="background:#e0e7ff;color:#3730a3;">📝 共做 ${totalCountMap[r.text]} 次</span>` : ''}
        </div>
        ${takeawayHtml}
        ${progressHtml}
        ${reasonRowHtml}
        <button class="wrong-item-explain" data-text="${enc}">🧠 讲解</button>
        <button class="wrong-item-redo" data-text="${enc}">🔁 重做</button>
      </div>
    `;
  }).join('');

  // ⭐ 绑定归因按钮（原 patchWrongBookRender2 的绑定逻辑）
  listEl.querySelectorAll('.wrong-item-reason-row').forEach(row => {
    row.addEventListener('click', e => {
      const btn = e.target.closest('.wrong-reason-btn');
      if (!btn) return;
      e.stopPropagation();
      const text = decodeURIComponent(row.dataset.text);
      toggleReason(text, btn.dataset.reason);
      btn.classList.toggle('on');
      renderErrorProfile();
    });
  });

  // ⭐ 渲染完直接刷推荐（原 patchWbRecommendRender）
  renderWbRecommend();
  renderErrorProfile();

  if (typeof window._refreshGrowthCards === 'function') {
    setTimeout(window._refreshGrowthCards, 50);
  }
}