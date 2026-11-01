/* grades/grade3/modules/m14.js */
import { getTemplate } from '../../../core/ui/template.js';

import { historyLoad } from '../../../core/history.js';
import { getStudyStreak, statCards, renderWeekBars, renderStreakDots } from '../../../core/dashboard-render.js';
import { lsGet, lsKeysByPrefix } from '../../../core/storage.js';
import { escapeHtmlStrict } from '../../../core/html.js';
import { buildWeeklyReport, buildWeeklyReportHtml } from '../../../core/weekly-report.js';
import { downloadBlob } from '../../../core/download.js';
import { getStudentName } from '../../../core/student.js';
import { historyRender } from '../../../core/history-render.js';
import { on, EVT } from '../../../core/events.js';
import { takeawayListAll } from '../../../core/takeaway.js';

export const meta = { title: '我的成长', icon: '📊' };

export default async function mount(container, ctx) {
  const tpl = getTemplate('tpl-m14');
  if (!tpl) return;
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));

  const $ = sel => container.querySelector(sel);

  // ================= 成长卡片交互 =================
  const panel = $('#growthPanelContainer');
  const detailPanels = $('#growthDetailPanels');
  
  if (panel && detailPanels) {
    const allSections = detailPanels.querySelectorAll('.collapsible-section');

    // 1. 卡片点击展开/收起对应面板
    panel.querySelectorAll('.growth-card[data-goto]').forEach(card => {
      card.addEventListener('click', () => {
        const targetId = card.dataset.goto;
        const targetSection = detailPanels.querySelector('#' + targetId);
        if (!targetSection) return;

        // 判断当前卡片是否已经展开
        const isAlreadyOpen = card.classList.contains('expanded');

        // 先清理所有卡片和面板的状态
        panel.querySelectorAll('.growth-card').forEach(c => c.classList.remove('expanded'));
        allSections.forEach(sec => sec.classList.remove('open'));

        // 如果点击前已经打开，本次操作即为“收起”，直接返回
        if (isAlreadyOpen) return;

        // 否则，展开当前卡片和对应面板
        card.classList.add('expanded');
        targetSection.classList.add('open');

        // 平滑滚动到面板位置
        setTimeout(() => {
          targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          
          // ⭐ 如果展开的是做题记录，触发一下重新渲染
          if (targetId === 'historySection' && typeof historyRender === 'function') {
            historyRender(container);
          }
        }, 100);
      });
    });

    // 2. 点击下方面板的头部也能收起（并同步取消卡片高亮）
    allSections.forEach(section => {
      const hd = section.querySelector('.collapsible-hd');
      if (!hd) return;
      
      hd.addEventListener('click', (e) => {
        // 如果点到了内部某些功能性按钮，不触发收起
        if (e.target.closest('button:not(.timeline-toggle)')) return;

        // 收起面板
        section.classList.remove('open');
        
        // 同步移除对应卡片的高亮
        const card = panel.querySelector(`.growth-card[data-goto="${section.id}"]`);
        if (card) card.classList.remove('expanded');
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
if (hs) hs.replaceChildren(statCards([
  [allTexts.size, '道', '题目'],
  [history.length, '次', '练习'],
  [totalRate, '%', '正确率'],
]));

    // ② 一题一得
    let takeawayN = 0;
    try {
      lsKeysByPrefix('grade3_takeaway_').forEach(k => {
        const v = lsGet(k);
        if (v && v.trim()) takeawayN++;
      });
    } catch (e) {}
    const ts = $('#takeawayStats');
if (ts) ts.replaceChildren(statCards([[takeawayN, '条', '心得']]));

    // ③ 成长曲线统计
    const gs = $('#growthChartStats');
if (gs) gs.replaceChildren(statCards([
  [week.length, '道', '本周做题'],
  [weekCorrect, '道', '做对'],
  [weekDays, '天', '学习天数'],
]));

    // ④ 打卡树统计
    const streak = typeof getStudyStreak === 'function' ? getStudyStreak() : 0;
    const loops = Math.floor(streak / 7);
    const ss = $('#streakTreeStats');
if (ss) ss.replaceChildren(statCards([
  [streak, '天', '连续打卡'],
  [loops, '轮', '7天周期'],
]));

    // ⑤ 周报统计
    const ws = $('#weeklyReportStats');
if (ws) ws.replaceChildren(statCards([
  [week.length, '道', '本周做题'],
  [weekRate, '%', '正确率'],
  [weekDays, '天', '学习天数'],
]));

    // 内部图形/内容渲染
    renderGrowthChartInline();
    renderStreakTreeInline();
    renderTakeawayGalleryInline();
    renderWeeklyReportInline();
    updateHistorySectionCount();
  }

  // ================= 内部图形渲染 =================
  // L7：下面两个函数原来各自拼一遍图表与打卡点，而 core/dashboard-render.js 已经在渲染
  //     同一批节点（#growthChartInline / #streakTreeInline），属于「后写者赢」的重复实现。
  //     现在只做委托，视觉结果不变，但只剩一份实现。
  function renderGrowthChartInline() { renderWeekBars(); }
  function renderStreakTreeInline() { renderStreakDots(getStudyStreak()); }

  function renderTakeawayGalleryInline() {
    const box = $('#takeawayGalleryBox');
    if (!box) return;
    
    // 用新的 takeawayListAll
    const items = takeawayListAll(); 

    if (!items.length) {
      // M3：DOM 构建替代模板字符串
      box.textContent = '';
      const gallery = document.createElement('div');
      gallery.className = 'takeaway-gallery';
      const head = document.createElement('div');
      head.className = 'takeaway-gallery-hd';
      const title = document.createElement('div');
      title.className = 'takeaway-gallery-title';
      title.textContent = '💡 一题一得 · 汇总';
      head.append(title);
      const empty = document.createElement('div');
      empty.className = 'takeaway-empty';
      empty.textContent = '还没有心得，做题时在"一题一得"里记一句吧 ✍️';
      gallery.append(head, empty);
      box.append(gallery);
      return;
    }

    // M3：DOM 构建替代模板字符串
    box.textContent = '';
    const gallery = document.createElement('div');
    gallery.className = 'takeaway-gallery';
    const head = document.createElement('div');
    head.className = 'takeaway-gallery-hd';
    const title = document.createElement('div');
    title.className = 'takeaway-gallery-title';
    title.textContent = '💡 一题一得 · 汇总（' + items.length + ' 条）';
    const searchEl = document.createElement('input');
    searchEl.type = 'search';
    searchEl.className = 'takeaway-gallery-search';
    searchEl.id = 'takeawaySearch';
    searchEl.placeholder = '🔍 搜索题目或心得…';
    head.append(title, searchEl);
    const listEl = document.createElement('div');
    listEl.className = 'takeaway-list';
    listEl.id = 'takeawayList';
    gallery.append(head, listEl);
    box.append(gallery);

    const renderList = (filter) => {
      const f = (filter || '').trim().toLowerCase();
      const filtered = f 
        ? items.filter(x => x.note.toLowerCase().includes(f) || x.problemText.toLowerCase().includes(f)) 
        : items;
        
      if (!filtered.length) {
        // M3：DOM 构建替代模板字符串
        listEl.textContent = '';
        const empty = document.createElement('div');
        empty.className = 'takeaway-empty';
        empty.style.gridColumn = '1/-1';
        empty.textContent = '没有匹配的心得';
        listEl.append(empty);
        return;
      }
      
      // M3：DOM 构建替代模板字符串（problemText / note 走 textContent，不再靠转义）
      listEl.textContent = '';
      for (const x of filtered) {
        const item = document.createElement('div');
        item.className = 'takeaway-item';

        const prob = document.createElement('div');
        prob.className = 'takeaway-item-problem';
        prob.title = String(x.problemText || '');
        const pt = String(x.problemText || '');
        prob.textContent = '📝 ' + pt.slice(0, 30) + (pt.length > 30 ? '…' : '');

        const note = document.createElement('div');
        note.className = 'takeaway-item-note';
        note.textContent = '💡 ' + String(x.note || '');

        item.append(prob, note);
        listEl.append(item);
      }
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

  // ================= 修复顶部 Tab（今日/本周/累计）与年级文字 =================
  
  // 1. 绑定 今日/本周/累计 切换
  const rangeTabs = container.querySelectorAll('#rangeTabs .range-tab');
  rangeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // 切换 active 样式
      rangeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // 调用 core/dashboard-render.js 更新状态并重新渲染
      import('../../../core/dashboard-render.js').then(mod => {
        // 如果你的 dashboard-render.js 暴露了 setRange，就调用它
        if (mod.setRange) mod.setRange(tab.dataset.range);
        if (mod.renderDashboard) mod.renderDashboard();
      });
    });
  });

  // 2. 确保年级名字正确显示（因为 grade.js 里的文字更新可能比 m14 渲染早）
  import('../../../js/grade.js').then(mod => {
    if (mod.updateGradeChipText) mod.updateGradeChipText();
  });

  // 3. 绑定学生点击改名
  $('#dashStudent')?.addEventListener('click', () => {
    if (window.__showStudentModal) window.__showStudentModal();
    else import('../../../core/student.js').then(m => m.showStudentModal());
  });

  // 4. 绑定“▼”展开/收起
  const dashChevron = $('#dashChevron');
  const dashExpanded = $('.dash-expanded');
  if (dashChevron && dashExpanded) {
    dashChevron.addEventListener('click', () => {
      const isOpen = dashExpanded.classList.contains('open');
      dashExpanded.classList.toggle('open', !isOpen);
      dashChevron.classList.toggle('open', !isOpen);
    });
  }

  // 3. 生命周期清理（极其重要）
  return () => {
    if (rafId1) cancelAnimationFrame(rafId1);
    if (rafId2) cancelAnimationFrame(rafId2);
    if (typeof offDataChanged === 'function') offDataChanged(); // 解绑事件
    // ⭐ S7：只清自己挂的那个全局钩子（身份比对，避免误删后来者的）
    if (window._refreshGrowthCards === updateCardStats) delete window._refreshGrowthCards;
    container.innerHTML = '';
  };
}