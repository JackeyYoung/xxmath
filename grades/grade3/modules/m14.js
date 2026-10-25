/* grades/grade3/modules/m14.js */
import { historyLoad } from '../../../core/history.js';
import { getStudyStreak } from '../../../core/dashboard-render.js';
import { lsGet, lsKeysByPrefix } from '../../../core/storage.js';
import { escapeHtmlStrict } from '../../../core/html.js';
import { buildWeeklyReport, buildWeeklyReportHtml } from '../../../core/weekly-report.js';
import { downloadBlob } from '../../../core/download.js';
import { getStudentName } from '../../../core/student.js';
import { historyRender } from '../../../core/history-render.js';
import { on, EVT } from '../../../core/events.js';

export const meta = { title: '我的成长', icon: '📊' };

export default async function mount(container, ctx) {
  const tpl = document.getElementById('tpl-m14');
  if (!tpl) return;
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));

  const $ = sel => container.querySelector(sel);

  // ================= 成长卡片交互 =================
  const panel = $('#growthPanelContainer');
  const detailPanels = $('#growthDetailPanels');
  
  if (panel && detailPanels) {
    // 1. 卡片点击展开
    panel.querySelectorAll('.growth-card[data-goto]').forEach(card => {
      card.addEventListener('click', () => {
        const targetId = card.dataset.goto;
        const targetSection = document.getElementById(targetId);
        if (!targetSection) return;

        detailPanels.querySelectorAll('.collapsible-section').forEach(sec => {
          if (sec.id !== targetId) sec.classList.remove('expanded');
        });

        const willExpand = !targetSection.classList.contains('expanded');
        targetSection.classList.toggle('expanded', willExpand);
        card.classList.toggle('expanded', willExpand);

        if (willExpand) {
          setTimeout(() => targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
          
          // 展开时，如果点开的是“做题记录”，确保重新渲染一次
          if (targetId === 'historySection' && typeof historyRender === 'function') {
            historyRender();
          }
        }
      });
    });

    // 2. 折叠头点击同步卡片
    detailPanels.querySelectorAll('.collapsible-section').forEach(section => {
      const hd = section.querySelector('.collapsible-hd');
      if (!hd) return;
      hd.addEventListener('click', () => {
        const willExpand = !section.classList.contains('expanded');
        detailPanels.querySelectorAll('.collapsible-section').forEach(sec => {
          if (sec !== section) sec.classList.remove('expanded');
        });
        section.classList.toggle('expanded', willExpand);

        const card = panel.querySelector(`.growth-card[data-goto="${section.id}"]`);
        if (card) card.classList.toggle('expanded', willExpand);
      });
    });
  }

  // ================= 核心：刷新统计数据 =================
  function updateCardStats() {
    if (typeof historyLoad !== 'function') return;
    
    const history = historyLoad();
    const weekAgo = Date.now() - 7 * 86400000;
    const week = history.filter(r => r.timestamp >= weekAgo);
    const weekCorrect = week.filter(r => r.isCorrect).length;
    const weekDays = new Set(week.map(r => {
      const d = new Date(r.timestamp); d.setHours(0, 0, 0, 0);
      return d.getTime();
    })).size;
    const totalCorrect = history.filter(r => r.isCorrect).length;
    const totalRate = history.length ? Math.round(totalCorrect / history.length * 100) : 0;
    const allTexts = new Set(history.map(r => r.problemText));
    const weekRate = week.length ? Math.round(weekCorrect / week.length * 100) : 0;

    // ① 做题记录统计
    const hs = $('#historyStats');
    if (hs) hs.innerHTML = `
      <div class="growth-card-stat"><div class="num">${allTexts.size}<small>道</small></div><div class="lbl">题目</div></div>
      <div class="growth-card-stat"><div class="num">${history.length}<small>次</small></div><div class="lbl">练习</div></div>
      <div class="growth-card-stat"><div class="num">${totalRate}<small>%</small></div><div class="lbl">正确率</div></div>
    `;

    // ② 一题一得
    let takeawayN = 0;
    try {
      lsKeysByPrefix('grade3_takeaway_').forEach(k => {
        const v = lsGet(k);
        if (v && v.trim()) takeawayN++;
      });
    } catch (e) {}
    const ts = $('#takeawayStats');
    if (ts) ts.innerHTML = `
      <div class="growth-card-stat"><div class="num">${takeawayN}<small>条</small></div><div class="lbl">心得</div></div>
    `;

    // ③ 成长曲线统计
    const gs = $('#growthChartStats');
    if (gs) gs.innerHTML = `
      <div class="growth-card-stat"><div class="num">${week.length}<small>道</small></div><div class="lbl">本周做题</div></div>
      <div class="growth-card-stat"><div class="num">${weekCorrect}<small>道</small></div><div class="lbl">做对</div></div>
      <div class="growth-card-stat"><div class="num">${weekDays}<small>天</small></div><div class="lbl">学习天数</div></div>
    `;

    // ④ 打卡树统计
    const streak = typeof getStudyStreak === 'function' ? getStudyStreak() : 0;
    const loops = Math.floor(streak / 7);
    const ss = $('#streakTreeStats');
    if (ss) ss.innerHTML = `
      <div class="growth-card-stat"><div class="num">${streak}<small>天</small></div><div class="lbl">连续打卡</div></div>
      <div class="growth-card-stat"><div class="num">${loops}<small>轮</small></div><div class="lbl">7天周期</div></div>
    `;

    // ⑤ 周报统计
    const ws = $('#weeklyReportStats');
    if (ws) ws.innerHTML = `
      <div class="growth-card-stat"><div class="num">${week.length}<small>道</small></div><div class="lbl">本周做题</div></div>
      <div class="growth-card-stat"><div class="num">${weekRate}<small>%</small></div><div class="lbl">正确率</div></div>
      <div class="growth-card-stat"><div class="num">${weekDays}<small>天</small></div><div class="lbl">学习天数</div></div>
    `;

    // 内部图形/内容渲染
    renderGrowthChartInline();
    renderStreakTreeInline();
    renderTakeawayGalleryInline();
    renderWeeklyReportInline();
    updateHistorySectionCount();
  }

  // ================= 内部图形渲染 =================
  function renderGrowthChartInline() {
    const box = $('#growthChartInline');
    if (!box) return;
    const history = historyLoad();
    const days = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      days.push({ date: d, label: `${d.getMonth() + 1}/${d.getDate()}`, total: 0, correct: 0 });
    }
    history.forEach(r => {
      const d = new Date(r.timestamp); d.setHours(0, 0, 0, 0);
      const slot = days.find(x => x.date.getTime() === d.getTime());
      if (slot) { slot.total++; if (r.isCorrect) slot.correct++; }
    });
    const maxTotal = Math.max(1, ...days.map(x => x.total));
    box.innerHTML = days.map(d => {
      const totalH = d.total ? Math.round(d.total / maxTotal * 100) : 0;
      const correctH = d.total ? Math.round(d.correct / d.total * totalH) : 0;
      const wrongH = totalH - correctH;
      return `
        <div class="growth-bar-wrap">
          <div class="growth-bar-count">${d.total || ''}</div>
          <div class="growth-bar-stack">
            <div class="growth-bar-seg correct" style="height:${correctH}%"></div>
            <div class="growth-bar-seg wrong" style="height:${wrongH}%"></div>
          </div>
          <div class="growth-bar-label">${d.label}</div>
        </div>
      `;
    }).join('');
  }

  function renderStreakTreeInline() {
    const box = $('#streakTreeInline');
    const label = $('#streakTreeInlineLabel');
    if (!box) return;
    const streak = typeof getStudyStreak === 'function' ? getStudyStreak() : 0;
    const cycle = (streak > 0 && streak % 7 === 0) ? 7 : (streak % 7);
    const loops = Math.floor(streak / 7);
    box.innerHTML = Array.from({ length: 7 }).map((_, i) => {
      let cls = 'streak-dot';
      if (i < cycle) {
        cls += ' lit';
        if (loops >= 1 && i === 6) cls += ' flower';
        if (loops >= 4 && i === 3) cls += ' fruit';
      }
      return `<span class="${cls}"></span>`;
    }).join('');
    if (label) {
      const tips = loops >= 4 ? ' 🌟 已结果' : (loops >= 1 ? ' 🌸 开花' : '');
      label.textContent = `已连续 ${streak} 天${tips}`;
    }
  }

  function renderTakeawayGalleryInline() {
    const box = $('#takeawayGalleryBox');
    if (!box) return;
    let fp = 0;
    try {
      lsKeysByPrefix('grade3_takeaway_').forEach(k => {
        const v = lsGet(k);
        if (v && v.trim()) fp += v.length + k.length;
      });
    } catch (e) {}
    if (box.dataset._fp === String(fp)) return;
    box.dataset._fp = String(fp);

    const items = [];
    try {
      lsKeysByPrefix('grade3_takeaway_').forEach(k => {
        const v = lsGet(k);
        if (v && v.trim()) items.push({ key: k, note: v.trim() });
      });
    } catch (e) {}

    if (!items.length) {
      box.innerHTML = `<div class="takeaway-gallery"><div class="takeaway-gallery-hd"><div class="takeaway-gallery-title">💡 一题一得 · 汇总</div></div><div class="takeaway-empty">还没有心得，做题时在"一题一得"里记一句吧 ✍️</div></div>`;
      return;
    }

    box.innerHTML = `
      <div class="takeaway-gallery">
        <div class="takeaway-gallery-hd">
          <div class="takeaway-gallery-title">💡 一题一得 · 汇总（${items.length} 条）</div>
          <input type="search" class="takeaway-gallery-search" id="takeawaySearch" placeholder="🔍 搜索关键词…">
        </div>
        <div class="takeaway-list" id="takeawayList"></div>
      </div>
    `;
    const searchEl = box.querySelector('#takeawaySearch');
    const listEl = box.querySelector('#takeawayList');

    const renderList = (filter) => {
      const f = (filter || '').trim().toLowerCase();
      const filtered = f ? items.filter(x => x.note.toLowerCase().includes(f)) : items;
      if (!filtered.length) {
        listEl.innerHTML = `<div class="takeaway-empty" style="grid-column:1/-1;">没有匹配的心得</div>`;
        return;
      }
      listEl.innerHTML = filtered.map(x => `
        <div class="takeaway-item">
          <div class="takeaway-item-note">${escapeHtmlStrict(x.note)}</div>
        </div>
      `).join('');
    };
    renderList('');
    if (searchEl) searchEl.oninput = () => renderList(searchEl.value);
  }

  function renderWeeklyReportInline() {
    const box = $('#weeklyReportBox');
    if (!box) return;
    const history = historyLoad();
    const fp = history.length + '_' + (history[0]?.timestamp || 0);
    if (box.dataset._fp === fp) return;
    box.dataset._fp = fp;

    box.innerHTML = buildWeeklyReport();
    const exportBtn = box.querySelector('#weeklyReportExport');
    if (exportBtn) {
      exportBtn.onclick = () => {
        const name = getStudentName() || '未命名';
        const html = buildWeeklyReportHtml();
        downloadBlob(html, `周报_${name}_${new Date().toISOString().slice(0, 10)}.html`, 'text/html');
        ctx.toast('✅ 周报已导出', 'success');
      };
    }
  }

  function updateHistorySectionCount() {
    const list = historyLoad();
    const texts = new Set(list.map(r => r.problemText));
    const cntEl = $('#historyCount');
    if (cntEl) cntEl.textContent = `共 ${texts.size} 道 / ${list.length} 次`;
  }

  // ================= 启动：首屏渲染 =================
  // ================= 启动 =================
  window._refreshGrowthCards = updateCardStats;

  // 1. 数据变化监听
  const onDataChanged = () => {
    updateCardStats();
    if (typeof historyRender === 'function') historyRender(container); 
  };
  // 注册监听，并保存引用
  const offDataChanged = on(EVT.DATA_CHANGED, onDataChanged);

  // 2. 唯一首屏渲染：使用 requestAnimationFrame，确保 DOM 完全挂载且只执行一次
  let rafId1, rafId2;
  rafId1 = requestAnimationFrame(() => {
    rafId2 = requestAnimationFrame(() => {
      updateCardStats();
      if (typeof historyRender === 'function') {
        historyRender(container);
      }
    });
  });

  // 3. 生命周期清理（极其重要）
  return () => {
    if (rafId1) cancelAnimationFrame(rafId1);
    if (rafId2) cancelAnimationFrame(rafId2);
    if (typeof offDataChanged === 'function') offDataChanged(); // 解绑事件
    container.innerHTML = '';
  };
}