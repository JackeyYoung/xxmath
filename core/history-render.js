/* core/history-render.js */
import { historyLoad, historyRemove } from './history.js';
import { escapeHtmlStrict } from './html.js';
import { showToast } from './toast.js';

export function historyRender(parentNode = document) {
  const listEl = parentNode === document 
    ? document.getElementById('historyList') 
    : parentNode.querySelector('#historyList');
  
  if (!listEl) return;

  // ⭐ 防抖：防止短时间内重复渲染覆盖 DOM 节点
  const now = Date.now();
  if (listEl.dataset.lastRender && now - parseInt(listEl.dataset.lastRender) < 100) {
    return;
  }
  listEl.dataset.lastRender = now.toString();

  const list = historyLoad();
  if (!list.length) {
    listEl.innerHTML = '<div class="history-empty">还没有做题记录哦 📝</div>';
    return;
  }

  // 分组逻辑
  const groups = {};
  list.forEach(r => {
    const key = r.problemText || '未知题目';
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
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

  const countEl = document.getElementById('historyCount');
  if (countEl) countEl.textContent = `共 ${groupArr.length} 道 / ${list.length} 次`;

  // 渲染 HTML
  listEl.innerHTML = groupArr.map((g, gIdx) => {
    
    // 每条记录
    const recordsHtml = g.records.map((r, rIdx) => {
      const d = new Date(r.timestamp);
      const timeStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      
      let stepsHtml = '';
      if (Array.isArray(r.studentSteps) && r.studentSteps.length > 0) {
        stepsHtml = r.studentSteps.map((s, i) => {
          const cleanRel = String(s.rel || s.relation || '').replace(/<[^>]+>/g, '').trim();
          const cleanSub = String(s.sub || s.substitution || '').replace(/<[^>]+>/g, '').trim();
          const cleanRes = String(s.res || s.result || '').replace(/<[^>]+>/g, '').trim();
          
          const stepLabel = cleanRel.startsWith('第') ? cleanRel : `第 ${i + 1} 步`;
          
          if (!cleanRel && !cleanSub && !cleanRes) {
            return ''; 
          }

          return `
            <div class="history-step">
              <div class="history-step-title">${stepLabel}</div>
              ${(cleanRel && !cleanRel.startsWith('第')) ? `<div class="history-step-text">关系式：${escapeHtmlStrict(cleanRel)}</div>` : ''}
              ${cleanSub ? `<div class="history-step-text">代入：${escapeHtmlStrict(cleanSub)}</div>` : ''}
              ${cleanRes ? `<div class="history-step-result">得数：${escapeHtmlStrict(cleanRes)}</div>` : ''}
            </div>
          `;
        }).join('');
      }

      if (!stepsHtml) {
        stepsHtml = '<div style="color:var(--muted);font-size:13px;font-style:italic;">未填写步骤</div>';
      }

      // AI 反馈
      let aiFeedbackHtml = '';
      if (r.aiFeedback) {
        const fb = r.aiFeedback;
        const aiSteps = (fb.steps || []).map(s => `
          <div class="history-step" style="border-left-color: var(--primary);">
            <div class="history-step-title">标准第 ${s.step} 步</div>
            <div class="history-step-text">关系式：${escapeHtmlStrict(s.relation || '—')}</div>
            <div class="history-step-text">代入：${escapeHtmlStrict(s.substitution || '—')}</div>
            <div class="history-step-result">得数：${escapeHtmlStrict(s.result || '—')}</div>
          </div>
        `).join('');

        const issue = fb.judgement?.student_answer_issue;
        const strengths = (fb.strengths || []).map(s => `<li>${escapeHtmlStrict(s)}</li>`).join('');
        const gaps = (fb.gaps || []).map(s => `<li>${escapeHtmlStrict(s)}</li>`).join('');

        aiFeedbackHtml = `
          <div style="margin-top: 16px; padding-top: 12px; border-top: 1px dashed var(--border);">
            <div class="history-section-title" style="color: var(--primary-d);">🤖 AI 评价与标准步骤</div>
            
            ${issue && issue !== '无' ? `<div style="color: var(--red-text); font-size: 13px; margin-bottom: 8px;">发现问题：${escapeHtmlStrict(issue)}</div>` : ''}
            ${strengths ? `<div style="font-size: 13px; margin-bottom: 4px;"><b style="color: var(--green-text);">做对了：</b><ul style="margin: 4px 0 8px 18px;">${strengths}</ul></div>` : ''}
            ${gaps ? `<div style="font-size: 13px; margin-bottom: 8px;"><b style="color: var(--amber-text);">漏掉了：</b><ul style="margin: 4px 0 8px 18px;">${gaps}</ul></div>` : ''}
            
            <div style="margin-top: 10px;">
              <div style="font-size: 12px; font-weight: 700; color: var(--muted); margin-bottom: 6px;">📖 标准解题步骤</div>
              ${aiSteps || '<div style="font-size:12px;color:var(--muted);">无详细步骤</div>'}
            </div>
            
            <div style="background: var(--primary-soft); color: var(--primary-d); padding: 8px 12px; border-radius: 6px; font-size: 13px; font-weight: 700; margin-top: 10px;">
              标准答案：${escapeHtmlStrict(fb.answer?.full || r.correctAnswer || '—')}
            </div>
          </div>
        `;
      }

       // 一次性返回完整结构
      return `
        <div class="history-item ${r.isCorrect ? 'correct' : 'wrong'}">
          <div class="history-hd" data-toggle-item="true">
            <div class="history-hd-left">
              <span class="history-status-dot ${r.isCorrect ? 'correct' : 'wrong'}">${r.isCorrect ? '✓' : '✗'}</span>
              <span class="history-hd-time">第 ${g.records.length - rIdx} 次 · ${timeStr}</span>
            </div>
            <span class="history-arrow">▶</span>
          </div>
          <div class="history-bd">
            <div class="history-section-title">✏️ 我的解题过程</div>
            ${stepsHtml}
            <div class="history-answer-box">我的答案：${escapeHtmlStrict(r.studentAnswer || '（空）')}</div>
            ${aiFeedbackHtml}
            <div class="history-action-bar" style="margin-top:12px;">
              <button class="history-remove" data-remove-id="${r.id}">🗑 删除这条记录</button>
            </div>
          </div>
        </div>`;
    }).join('');
    

    // 题目分组头部（这是 groupArr.map 的 return）
    return `
      <div class="history-group" data-group-idx="${gIdx}">
        <!-- 分组头部 -->
        <div class="history-group-hd" data-toggle-group="true">
          <div class="history-group-hd-top">
            <span class="history-status-dot ${g.correctCount > 0 ? 'correct' : 'wrong'}">${g.correctCount > 0 ? '✓' : '✗'}</span>
            <div class="history-group-title">
              ${escapeHtmlStrict(g.text)}
            </div>
          </div>
          <div class="history-group-meta">
            <span class="history-badge">共 ${g.total} 次</span>
            <span class="history-date">最近：${new Date(g.latestTime).toLocaleDateString('zh-CN')}</span>
            <span class="history-group-arrow">▶</span>
          </div>
        </div>
        
        <!-- 分组内容 -->
        <div class="history-group-bd">
          ${recordsHtml}
        </div>
      </div>
    `;
  }).join(''); // ⭐ 核心修复：补上 groupArr.map 的闭合

  // ================= 时间轴视图切换逻辑 =================
  const historySection = document.getElementById('historySection');
  if (historySection && !historySection.querySelector('.timeline-toggle')) {
    const hd = historySection.querySelector('.collapsible-hd');
    if (hd) {
      const btn = document.createElement('button');
      btn.className = 'timeline-toggle';
      btn.style.cssText = 'margin-left:8px;padding:4px 12px;border:1.5px solid var(--primary);border-radius:8px;background:#fff;color:var(--primary-d);font-size:11.5px;font-weight:700;font-family:inherit;cursor:pointer;';
      btn.textContent = '🕐 时间轴';
      hd.appendChild(btn);

      let isTimeline = false;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        isTimeline = !isTimeline;
        btn.textContent = isTimeline ? '📋 列表' : '🕐 时间轴';
        renderTimeline(isTimeline);
      });

      function renderTimeline(on) {
        if (!on) {
          // 恢复列表：直接重新调用一次 historyRender
          historyRender(parentNode);
          return;
        }
        // 渲染时间轴
        const list = historyLoad();
        if (!list.length) {
          listEl.innerHTML = '<div class="history-empty">还没有做题记录 📝</div>';
          return;
        }
        const groups = {};
        list.forEach(r => {
          const d = new Date(r.timestamp);
          const day = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          if (!groups[day]) groups[day] = [];
          groups[day].push(r);
        });
        const days = Object.keys(groups).sort((a, b) => b.localeCompare(a));
        const today = new Date(); today.setHours(0,0,0,0);
        const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
        const yest = new Date(today.getTime() - 86400000);
        const yestStr = `${yest.getFullYear()}-${String(yest.getMonth()+1).padStart(2,'0')}-${String(yest.getDate()).padStart(2,'0')}`;

        listEl.innerHTML = days.map(day => {
          const items = groups[day].sort((a, b) => b.timestamp - a.timestamp);
          let label = day;
          if (day === todayStr) label = '今天';
          else if (day === yestStr) label = '昨天';
          return `
            <div class="timeline-day">
              <div class="timeline-day-hd">
                ${label}
                <span class="day-count">· ${items.length} 次</span>
              </div>
              ${items.map(r => {
                const d = new Date(r.timestamp);
                const t = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                return `
                  <div class="timeline-item ${r.isCorrect ? 'correct' : 'wrong'}">
                    <div class="timeline-time">${t}</div>
                    <div class="timeline-content">${escapeHtmlStrict(r.problemText)}</div>
                    <div class="timeline-status">${r.isCorrect ? '✓' : '✗'}</div>
                  </div>
                `;
              }).join('')}
            </div>
          `;
        }).join('');
      }
    }
  }

}

/* ============ ⭐ 唯一的全局事件监听（只绑一次） ============ */
if (!window.__historyBound) {
  window.__historyBound = true;

  document.addEventListener('click', e => {
    // 1. 删除按钮
    const removeBtn = e.target.closest('.history-remove');
    if (removeBtn) {
      e.stopPropagation();
      const id = removeBtn.dataset.removeId;
      if (id && confirm('确定要删除这条记录吗？')) {
        historyRemove(id);
        // 删除后，找到当前最底层的 historyList 重绘
        const listEl = document.getElementById('historyList');
        if (listEl && listEl.dataset.lastRender) {
          listEl.dataset.lastRender = '0'; // 强制清除防抖
          historyRender();
        }
        showToast('✅ 已删除该记录', 'success');
      }
      return;
    }

    // 展开单次记录
    const itemHd = e.target.closest('[data-toggle-item="true"]');
    if (itemHd) {
      e.stopPropagation();
      const item = itemHd.closest('.history-item');
      if (item) item.classList.toggle('open'); // ⭐ 切换父级 .open
      return;
    }

    // 展开题目分组
    const groupHd = e.target.closest('[data-toggle-group="true"]');
    if (groupHd) {
      e.stopPropagation();
      const group = groupHd.closest('.history-group');
      if (group) group.classList.toggle('open'); // ⭐ 切换父级 .open
      return;
    }
  });
}

/* ============ 保留此函数为空，兼容 main.js 的调用 ============ */
export function initHistoryDelegation() {
  // ⭐ 因为上面的全局监听已经包揽了所有事情，这里留空即可，防止重复绑定
}