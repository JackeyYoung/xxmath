/* core/wrongbook-profile.js */
import { historyLoad } from './history.js';
import { autoTagsFor, loadReasons, REASONS } from './wrongbook-tags.js';

export function renderErrorProfile() {
  const panel = document.getElementById('errorProfilePanel');
  if (!panel) return;

  const history = historyLoad();
  const wrongRecords = history.filter(r => !r.isCorrect);
  if (!wrongRecords.length) {
    panel.style.display = 'none';
    return;
  }

  const tagCount = {};
  wrongRecords.forEach(r => {
    autoTagsFor(r.problemText).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
  });
  const tagArr = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);

  const reasonMap = loadReasons();
  const reasonCount = {};
  Object.values(reasonMap).forEach(arr => {
    arr.forEach(r => { reasonCount[r] = (reasonCount[r] || 0) + 1; });
  });

  const tagsHtml = tagArr.length
    ? tagArr.map(([t, c]) =>
        `<span class="error-tag" data-tag="${t}">${t}<span class="tag-count">${c}</span></span>`
      ).join('')
    : '<span style="color:#94a3b8;font-size:12.5px;">还没有足够的错题数据</span>';

  const reasonHtml = Object.keys(reasonCount).length
    ? REASONS.filter(r => reasonCount[r])
        .map(r => `<span class="error-tag">${r}<span class="tag-count">${reasonCount[r]}</span></span>`)
        .join('')
    : '';

  const topTag = tagArr[0];
  const topReason = Object.entries(reasonCount).sort((a, b) => b[1] - a[1])[0];

  const summary = `
    <div class="error-profile-summary">
      📊 你在 <b>${wrongRecords.length}</b> 道错题中，
      ${topTag ? `最容易在「<b>${topTag[0]}</b>」上出错（错 <b>${topTag[1]}</b> 次）` : ''}
      ${topReason ? `，归因最多的是「<b>${topReason[0]}</b>」` : ''}。
      ${topTag ? `<br>💡 建议：先集中练一练「<b>${topTag[0]}</b>」类题目。` : ''}
    </div>
  `;

  panel.innerHTML = `
    <h4>🎯 我的错题画像</h4>
    <div class="error-tag-cloud">${tagsHtml}</div>
    ${reasonHtml ? `<div style="font-size:12.5px;color:#92400e;font-weight:700;margin-bottom:8px;">归因统计：</div><div class="error-tag-cloud">${reasonHtml}</div>` : ''}
    ${summary}
  `;
  panel.style.display = 'block';

  panel.querySelectorAll('.error-tag[data-tag]').forEach(el => {
    el.addEventListener('click', () => {
      const tag = el.dataset.tag;
      const listEl = document.getElementById('wrongBookList');
      if (!listEl) return;
      const items = listEl.querySelectorAll('.wrong-item');
      items.forEach(item => {
        const itemTags = [...item.querySelectorAll('.wrong-item-tag-chip')].map(x => x.textContent);
        item.style.display = itemTags.includes(tag) ? '' : 'none';
      });
    });
  });
}