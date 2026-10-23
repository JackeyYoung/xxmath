/* core/wrongbook-recommend.js */
import { wbLoad } from './wrongbook.js';
import { autoTagsFor } from './wrongbook-tags.js';

export function renderWbRecommend() {
  const el = document.getElementById('wbRecommend');
  if (!el) return;

  const list = wbLoad();
  if (!list.length) { el.style.display = 'none'; return; }

  const tagCount = {};
  list.forEach(r => {
    autoTagsFor(r.text).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
  });
  const tagArr = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);
  if (!tagArr.length) { el.style.display = 'none'; return; }

  const top3 = tagArr.slice(0, 3);
  const topTag = top3[0];

  const tagsHtml = top3.map(([t, c]) =>
    `<span class="wb-recommend-tag" data-tag="${t}">${t}<span class="tag-count">${c}</span></span>`
  ).join('');

  const bodyHtml = `
    你在「<b>${topTag[0]}</b>」类错题上累计 <b>${topTag[1]}</b> 次，
    建议先集中练这一类。点击下方按钮，我会自动筛选出该类的错题。
  `;

  el.innerHTML = `
    <div class="wb-recommend-title">🤖 智能推荐</div>
    <div class="wb-recommend-tags">${tagsHtml}</div>
    <div class="wb-recommend-body">${bodyHtml}</div>
    <div class="wb-recommend-actions">
      <button class="wb-recommend-skip">忽略</button>
      <button class="wb-recommend-go">🎯 筛选「${topTag[0]}」错题</button>
    </div>
  `;
  el.style.display = 'block';

  el.querySelectorAll('.wb-recommend-tag').forEach(tagEl => {
    tagEl.addEventListener('click', () => {
      const tag = tagEl.dataset.tag;
      filterWrongListByTag(tag);
      const btn = el.querySelector('.wb-recommend-go');
      if (btn) btn.textContent = `🎯 筛选「${tag}」错题`;
    });
  });

  el.querySelector('.wb-recommend-go').addEventListener('click', () => filterWrongListByTag(topTag[0]));
  el.querySelector('.wb-recommend-skip').addEventListener('click', () => {
    el.style.display = 'none';
    filterWrongListByTag(null);
  });
}

export function filterWrongListByTag(tag) {
  const listEl = document.getElementById('wrongBookList');
  if (!listEl) return;

  const items = listEl.querySelectorAll('.wrong-item');
  if (!tag) {
    items.forEach(item => { item.style.display = ''; });
    document.getElementById('wbFilterHint')?.remove();
    return;
  }

  items.forEach(item => {
    const textEl = item.querySelector('.wrong-item-text');
    const text = textEl ? textEl.textContent.trim() : '';
    item.style.display = autoTagsFor(text).includes(tag) ? '' : 'none';
  });

  let hint = document.getElementById('wbFilterHint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'wbFilterHint';
    hint.style.cssText = 'padding:10px 14px;margin-bottom:8px;background:#eff6ff;border-radius:8px;font-size:13px;font-weight:700;color:#2563eb;display:flex;align-items:center;justify-content:space-between;';
    listEl.insertBefore(hint, listEl.firstChild);
  }
  hint.innerHTML = `
    <span>🔍 已筛选：${tag}</span>
    <button style="padding:3px 10px;border:none;border-radius:6px;background:#2563eb;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">✕ 清除</button>
  `;
  hint.querySelector('button').addEventListener('click', () => filterWrongListByTag(null));
}