/* core/history-render.js
   合并原 historyRender + patchHistoryCount + patchHistoryPagination + 导出相关
*/
import { historyLoad, historyRemove, historySave } from './history.js';
import { escapeHtmlStrict } from './html.js';
import { buildAiInsightHtml } from './ui/ai-insight.js';
import { getStudentName } from './student.js';

const HISTORY_PAGE = 20;
let _visibleCount = HISTORY_PAGE;

export function historyRender() {
  const listEl = document.getElementById('historyList');
  const countEl = document.getElementById('historyCount');
  if (!listEl) return;

  const list = historyLoad();
  const groups = {};
  list.forEach(r => {
    if (!groups[r.problemText]) groups[r.problemText] = [];
    groups[r.problemText].push(r);
  });

  const groupArr = Object.keys(groups).map(text => {
    const records = groups[text].sort((a, b) => b.timestamp - a.timestamp);
    const correctCount = records.filter(r => r.isCorrect).length;
    return {
      text, records, correctCount,
      wrongCount: records.length - correctCount,
      total: records.length,
      latestTime: records[0].timestamp,
    };
  }).sort((a, b) => b.latestTime - a.latestTime);

  if (countEl) countEl.textContent = `共 ${groupArr.length} 道 / ${list.length} 次`;

  if (!groupArr.length) {
    listEl.innerHTML = '<div class="history-empty">还没有做题记录，做完一道题会自动保存 📝</div>';
    return;
  }

  listEl.innerHTML = groupArr.map((g, gIdx) => {
    const dLatest = new Date(g.latestTime);
    const latestTimeStr = `${dLatest.getMonth() + 1}/${dLatest.getDate()} ${String(dLatest.getHours()).padStart(2, '0')}:${String(dLatest.getMinutes()).padStart(2, '0')}`;

    let statusIcon, statusCls;
    if (g.correctCount === 0) { statusIcon = '✗'; statusCls = 'wrong'; }
    else if (g.wrongCount === 0) { statusIcon = '✓'; statusCls = 'correct'; }
    else { statusIcon = '◐'; statusCls = 'mixed'; }

    const statsHtml = `
      <span style="display:inline-block;padding:1px 8px;background:#dcfce7;color:#15803d;border-radius:5px;font-size:11px;font-weight:700;margin-right:4px;">对 ${g.correctCount} 次</span>
      <span style="display:inline-block;padding:1px 8px;background:#fee2e2;color:#b91c1c;border-radius:5px;font-size:11px;font-weight:700;">错 ${g.wrongCount} 次</span>
    `;

    const recordsHtml = g.records.map((r, rIdx) => {
      const d = new Date(r.timestamp);
      const timeStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

      const stepsHtml = (r.studentSteps || []).length
        ? r.studentSteps.map((s, i) => `
            <div class="history-step">
              <span class="history-step-num">第 ${i + 1} 步</span>
              <span class="history-step-content">
                ${s.rel ? `<span class="field"><b>关系式：</b>${escapeHtmlStrict(s.rel)}</span>` : ''}
                ${s.sub ? `<span class="field"><b>代入：</b>${escapeHtmlStrict(s.sub)}</span>` : ''}
                ${s.res ? `<span class="field"><b>得数：</b>${escapeHtmlStrict(s.res)}</span>` : ''}
              </span>
            </div>
          `).join('')
        : '<div style="color:#94a3b8;font-size:13px;font-style:italic;">未填写步骤</div>';

      const fb = r.aiFeedback;
      let explainHtml = '';
      if (fb) {
        const stdStepsHtml = (fb.steps || []).map(s => `
          <div class="history-explain-step">
            <b>第 ${s.step} 步：</b>
            ${s.relation ? `<div><b>关系式：</b>${escapeHtmlStrict(s.relation)}</div>` : ''}
            ${s.substitution ? `<div><b>代入：</b>${escapeHtmlStrict(s.substitution)}</div>` : ''}
            ${s.result ? `<div><b>得数：</b>${escapeHtmlStrict(s.result)}</div>` : ''}
          </div>
        `).join('');

        const insight = buildAiInsightHtml(fb, { open: false });

        const commentHtml = (fb.judgement && fb.judgement.step_count_comment)
          ? `<div class="history-explain-comment"><b>📐 步数评价：</b>${escapeHtmlStrict(fb.judgement.step_count_comment)}</div>`
          : '';
        const hintHtml = fb.hint
          ? `<div class="history-explain-hint"><b>💡 提示：</b>${escapeHtmlStrict(fb.hint)}</div>` : '';

        explainHtml = `
          <div class="history-explain-fold">
            <div class="history-explain-hd"><span>📖 答案讲解（点击展开）</span><span class="arrow">▶</span></div>
            <div class="history-explain-bd">
              ${commentHtml}
              ${insight.strengthsHtml}
              ${insight.gapsHtml}
              ${insight.judgementHtml}
              ${insight.walkHtml}
              ${stdStepsHtml || '<div style="color:#94a3b8;font-size:13px;">暂无标准步骤</div>'}
              <div class="history-explain-answer">✅ ${escapeHtmlStrict(fb.answer?.full || r.correctAnswer || '—')}</div>
              ${hintHtml}
            </div>
          </div>
        `;
      } else {
        explainHtml = `
          <div class="history-explain-fold">
            <div class="history-explain-hd"><span>📖 答案讲解（点击展开）</span><span class="arrow">▶</span></div>
            <div class="history-explain-bd">
              <div class="history-explain-answer">✅ ${escapeHtmlStrict(r.correctAnswer || '—')}</div>
            </div>
          </div>
        `;
      }

      const rStatusIcon = r.isCorrect ? '✓' : '✗';
      const rStatusCls = r.isCorrect ? 'correct' : 'wrong';

      return `
        <div class="history-item ${rStatusCls}" data-id="${r.id}" style="margin-left:16px;margin-top:10px;">
          <div class="history-hd">
            <span class="history-status">${rStatusIcon}</span>
            <div class="history-problem" style="font-size:13px;color:#64748b;font-weight:600;">第 ${g.records.length - rIdx} 次 · ${timeStr}</div>
            <div class="history-meta">${r.problemSource || ''}</div>
            <span class="history-arrow">▶</span>
          </div>
          <div class="history-bd">
            <div class="history-section">
              <div class="history-section-title">✏️ 我的解题过程</div>
              <div class="history-steps">${stepsHtml}</div>
              <div class="history-answer-line">我的答案：${escapeHtmlStrict(r.studentAnswer || '（空）')}</div>
            </div>
            ${explainHtml}
            <button class="history-remove" data-remove-id="${r.id}">🗑 删除这条记录</button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="history-group" data-group-idx="${gIdx}" style="${gIdx >= _visibleCount ? 'display:none;' : ''}">
        <div class="history-group-hd" style="
          background: #f8fafc;
          border: 2px solid var(--border);
          border-left: 4px solid ${statusIcon === '✓' ? 'var(--green)' : statusIcon === '✗' ? 'var(--red)' : '#f59e0b'};
          border-radius: 12px;
          padding: 12px 16px;
          margin-bottom: 4px;
          cursor: pointer;
        ">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            <span style="
              width:24px;height:24px;border-radius:50%;
              background:${statusIcon === '✓' ? 'var(--green)' : statusIcon === '✗' ? 'var(--red)' : '#f59e0b'};
              color:#fff;font-size:13px;font-weight:800;
              display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;
            ">${statusIcon}</span>
            <div style="flex:1;font-size:14.5px;line-height:1.6;color:#334155;font-weight:700;">
              ${escapeHtmlStrict(g.text)}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-left:34px;">
            <span style="background:#e0e7ff;color:#3730a3;padding:2px 10px;border-radius:6px;font-size:11.5px;font-weight:700;">共 ${g.total} 次</span>
            ${statsHtml}
            <span style="font-size:11.5px;color:#94a3b8;margin-left:auto;">最近：${latestTimeStr}</span>
            <span class="history-group-arrow" style="font-size:12px;color:#94a3b8;transition:transform .22s;">▶</span>
          </div>
        </div>
        <div class="history-group-bd" style="display:none;padding:0 4px 12px;">
          ${recordsHtml}
        </div>
      </div>
    `;
  }).join('');

  // ⭐ 分页加载（原 patchHistoryPagination）
  document.getElementById('historyLoadMore')?.remove();
  if (groupArr.length > _visibleCount) {
    const btn = document.createElement('button');
    btn.id = 'historyLoadMore';
    btn.className = 'load-more-btn';
    btn.textContent = `📥 加载更多（还有 ${groupArr.length - _visibleCount} 道）`;
    btn.addEventListener('click', () => {
      _visibleCount += HISTORY_PAGE;
      historyRender();
    });
    listEl.parentElement.appendChild(btn);
  }

  if (typeof window._refreshGrowthCards === 'function') {
    setTimeout(window._refreshGrowthCards, 50);
  }
}

/* ============ 事件委托（一次性绑定） ============ */
export function initHistoryDelegation() {
  const listEl = document.getElementById('historyList');
  if (!listEl || listEl.dataset._delegated) return;
  listEl.dataset._delegated = '1';

  listEl.addEventListener('click', e => {
    const removeBtn = e.target.closest('.history-remove');
    if (removeBtn) {
      e.stopPropagation();
      const id = removeBtn.dataset.removeId;
      if (id) historyRemove(id);
      return;
    }

    const stdFoldHd = e.target.closest('.std-fold-hd');
    if (stdFoldHd && listEl.contains(stdFoldHd)) {
      e.stopPropagation();
      stdFoldHd.parentElement.classList.toggle('open');
      return;
    }

    const explainHd = e.target.closest('.history-explain-hd');
    if (explainHd) {
      e.stopPropagation();
      const fold = explainHd.parentElement;
      const willOpen = !fold.classList.contains('open');
      fold.classList.toggle('open');
      if (willOpen) {
        requestAnimationFrame(() => setTimeout(() => {
          fold.querySelector('.history-explain-answer')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50));
      }
      return;
    }

    const groupHd = e.target.closest('.history-group-hd');
    if (groupHd) {
      const group = groupHd.parentElement;
      const bd = group.querySelector('.history-group-bd');
      const arrow = groupHd.querySelector('.history-group-arrow');
      const willOpen = bd.style.display === 'none';
      bd.style.display = willOpen ? 'block' : 'none';
      if (arrow) arrow.style.transform = willOpen ? 'rotate(90deg)' : '';
      return;
    }

    const hd = e.target.closest('.history-hd');
    if (hd) {
      const item = hd.parentElement;
      const willOpen = !item.classList.contains('open');
      item.classList.toggle('open');
      if (willOpen) {
        requestAnimationFrame(() => setTimeout(() => item.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50));
      }
      return;
    }
  });

  document.getElementById('historyClear')?.addEventListener('click', () => {
    import('./history.js').then(({ historyClear }) => historyClear());
  });
  document.getElementById('historyExport')?.addEventListener('click', () => {
    import('./history-export.js').then(({ historyExport }) => historyExport());
  });
}