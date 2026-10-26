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
      
      // ⭐ 兼容 M13 和 M1 的展示
      // ⭐ 兼容 M13 和 M1 的展示，只要填了任意一项就渲染
      let stepsHtml = '';
      if (Array.isArray(r.studentSteps) && r.studentSteps.length > 0) {
        stepsHtml = r.studentSteps.map((s, i) => {
          // 1. 清理所有 HTML 标签
          const cleanRel = String(s.rel || s.relation || '').replace(/<[^>]+>/g, '').trim();
          const cleanSub = String(s.sub || s.substitution || '').replace(/<[^>]+>/g, '').trim();
          const cleanRes = String(s.res || s.result || '').replace(/<[^>]+>/g, '').trim();
          
          // 2. 判断步骤名（如果是 M1 的"第X步"，直接用，否则加前缀）
          const stepLabel = cleanRel.startsWith('第') ? cleanRel : `第 ${i + 1} 步`;
          
          // 3. 只要有任何一个数据（哪怕是空的空格），就渲染出来
          if (!cleanRel && !cleanSub && !cleanRes) {
            return ''; // 真的全空才跳过
          }

          return `
            <div class="history-step" style="margin-bottom: 8px; padding-left: 12px; border-left: 2px solid #e2e8f0;">
              <div style="font-weight:700; color:#475569; font-size:12px; margin-bottom:4px;">${stepLabel}</div>
              ${(cleanRel && !cleanRel.startsWith('第')) ? `<div style="color:#334155; margin-bottom:2px;">关系式：${escapeHtmlStrict(cleanRel)}</div>` : ''}
              ${cleanSub ? `<div style="color:#334155; margin-bottom:2px;">代入：${escapeHtmlStrict(cleanSub)}</div>` : ''}
              ${cleanRes ? `<div style="color:#15803d; font-weight:700;">得数：${escapeHtmlStrict(cleanRes)}</div>` : ''}
            </div>
          `;
        }).join('');
      }

      // 兜底：如果真的啥也没提取出来
      if (!stepsHtml) {
        stepsHtml = '<div style="color:#94a3b8;font-size:13px;font-style:italic;">未填写步骤</div>';
      }

      return `
        <div class="history-item ${r.isCorrect ? 'correct' : 'wrong'}" style="margin-left:16px;margin-top:10px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; overflow: hidden;">
          
          <!-- 头部：加上 data-toggle-item 标记 -->
          <div class="history-hd" data-toggle-item="true" style="padding: 10px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; background: #f8fafc;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="width: 20px; height: 20px; border-radius: 50%; background: ${r.isCorrect ? '#10b981' : '#ef4444'}; color: #fff; font-size: 12px; display: flex; align-items: center; justify-content: center;">${r.isCorrect ? '✓' : '✗'}</span>
              <span style="font-size:13px; color:#64748b; font-weight:600;">第 ${g.records.length - rIdx} 次 · ${timeStr}</span>
            </div>
            <span class="history-arrow" style="font-size: 12px; color: #94a3b8; transition: transform 0.2s;">▶</span>
          </div>
          
          <!-- 内容：默认隐藏 -->
          <div class="history-bd" style="display: none; padding: 12px; border-top: 1px solid #e2e8f0;">
            <div style="margin-bottom: 12px;">
              <div style="font-size:12px; font-weight:700; color:#3b82f6; margin-bottom:8px;">✏️ 我的解题过程</div>
              ${stepsHtml}
            </div>
            <div style="background: #fef3c7; color: #b45309; padding: 8px 12px; border-radius: 6px; font-size: 13px; font-weight: 700; margin-bottom: 12px;">
              我的答案：${escapeHtmlStrict(r.studentAnswer || '（空）')}
            </div>
            
            <div style="text-align: right;">
              <button class="history-remove" data-remove-id="${r.id}" style="background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;">🗑 删除这条记录</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // 题目分组头部
    return `
      <div class="history-group" data-group-idx="${gIdx}">
        <!-- 分组头部：加上 data-toggle-group 标记 -->
        <div class="history-group-hd" data-toggle-group="true" style="
          background: #f8fafc;
          border: 2px solid var(--border);
          border-left: 4px solid ${g.correctCount > 0 ? 'var(--green)' : 'var(--red)'};
          border-radius: 12px;
          padding: 12px 16px;
          margin-bottom: 4px;
          cursor: pointer;
        ">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            <span style="
              width:24px;height:24px;border-radius:50%;
              background:${g.correctCount > 0 ? 'var(--green)' : 'var(--red)'};
              color:#fff;font-size:13px;font-weight:800;
              display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;
            ">${g.correctCount > 0 ? '✓' : '✗'}</span>
            <div style="flex:1;font-size:14.5px;line-height:1.6;color:#334155;font-weight:700;">
              ${escapeHtmlStrict(g.text)}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-left:34px;">
            <span style="background:#e0e7ff;color:#3730a3;padding:2px 10px;border-radius:6px;font-size:11.5px;font-weight:700;">共 ${g.total} 次</span>
            <span style="font-size:11.5px;color:#94a3b8;margin-left:auto;">最近：${new Date(g.latestTime).toLocaleDateString('zh-CN')}</span>
            <span class="history-group-arrow" style="font-size:12px;color:#94a3b8;transition:transform .22s;">▶</span>
          </div>
        </div>
        
        <!-- 分组内容：默认隐藏 -->
        <div class="history-group-bd" style="display:none;padding:0 4px 12px;">
          ${recordsHtml}
        </div>
      </div>
    `;
  }).join('');

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

    // 2. 展开单次记录
    const itemHd = e.target.closest('[data-toggle-item="true"]');
    if (itemHd) {
      e.stopPropagation();
      const bd = itemHd.nextElementSibling;
      const arrow = itemHd.querySelector('.history-arrow');
      const willOpen = bd.style.display === 'none';
      bd.style.display = willOpen ? 'block' : 'none';
      if (arrow) arrow.style.transform = willOpen ? 'rotate(90deg)' : '';
      return;
    }

    // 3. 展开题目分组
    const groupHd = e.target.closest('[data-toggle-group="true"]');
    if (groupHd) {
      e.stopPropagation();
      const bd = groupHd.nextElementSibling;
      const arrow = groupHd.querySelector('.history-group-arrow');
      const willOpen = bd.style.display === 'none';
      bd.style.display = willOpen ? 'block' : 'none';
      if (arrow) arrow.style.transform = willOpen ? 'rotate(90deg)' : '';
      return;
    }
  });
}

/* ============ 保留此函数为空，兼容 main.js 的调用 ============ */
export function initHistoryDelegation() {
  // ⭐ 因为上面的全局监听已经包揽了所有事情，这里留空即可，防止重复绑定
}