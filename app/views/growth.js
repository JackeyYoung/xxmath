/* S3：优先在 #page-growth 内查找，找不到退回全局（最坏情况等价于改动前）。 */
const _growthQ = (id) => {
  const root = document.getElementById('page-growth');
  const el = root && typeof root.querySelector === 'function' ? root.querySelector('#' + id) : null;
  return el || document.getElementById(id);
};

/* app/views/growth.js —— 成长页：周总结 / 成长卡片 / 本周一句话（原来在 shell.js 的 6 节 + 周报弹窗） */
import { activityAdd } from '../../core/activity.js';
import { getStudentName } from '../../core/student.js';
import { downloadBlob } from '../../core/download.js';
import { historyAdd, historyLoad, historySave } from '../../core/history.js';
import { escapeHtmlStrict } from '../../core/html.js';
import { focusInputWhenReady } from '../../core/input-focus.js';
import { masteryLoad, masteryRecord } from '../../core/mastery.js';
import { lsGet, lsSet } from '../../core/storage.js';
import { takeawayLoad } from '../../core/takeaway.js';
import { showToast } from '../../core/toast.js';
import { buildAiInsightHtml } from '../../core/ui/ai-insight.js';
import { showMasteryCard } from '../../core/ui/mastery-card.js';
import { noteGetThisWeek, noteSetChild, noteSetParent } from '../../core/weekly-note.js';
import { buildWeeklyReportHtml } from '../../core/weekly-report.js';
import { wbAdd, wbLoad, wbSave } from '../../core/wrongbook.js';
import { LESSON_META } from '../lesson-meta.js';
import { swapModule } from '../lifecycle.js';
import { navigate } from '../router.js';


function renderWeeklySummary() {
  const wrap = _growthQ('weeklySummaryWrap');
  if (!wrap) {
    console.warn('[renderWeeklySummary] weeklySummaryWrap 不存在');   // ⭐
    return;
  }
  // S3：这些元素都在 wrap 内部，用作用域查询，不再依赖「id 全局唯一」
  const q = (id) => wrap.querySelector('#' + id);

  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const weekRecords = historyLoad().filter(r => r.timestamp >= weekAgo);

  const total = weekRecords.length;
  const correct = weekRecords.filter(r => r.isCorrect).length;
  const rate = total ? Math.round(correct / total * 100) : 0;
  const days = new Set(weekRecords.map(r => {
    const d = new Date(r.timestamp); d.setHours(0, 0, 0, 0);
    return d.getTime();
  })).size;

  // ⭐ 本周掌握数
  const masteryMap = masteryLoad();
  const weekMastered = Object.values(masteryMap).filter(r =>
    r.state === 'mastered' && r.lastAt >= weekAgo
  );

  // 本周模块分布
  const byModule = {};
  weekRecords.forEach(r => {
    const mid = r.moduleId || 'other';
    byModule[mid] = (byModule[mid] || 0) + 1;
  });
  const topModules = Object.entries(byModule).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // 错题最多的模块
  const wrongByModule = {};
  weekRecords.filter(r => !r.isCorrect).forEach(r => {
    const mid = r.moduleId || 'other';
    wrongByModule[mid] = (wrongByModule[mid] || 0) + 1;
  });
  const topWrong = Object.entries(wrongByModule).sort((a, b) => b[1] - a[1])[0];

/* ==========================================
  ⭐ 重构成就墙：使用专门类名 + 防止断行
  ========================================== */
  const allMastered = Object.values(masteryMap).filter(r => r.state === 'mastered');
  const achievementHtml = `
    <div class="achievement-wall">
      <div class="achievement-wall-hd">
        <span>🏆 成就墙</span>
        <small>共掌握 ${allMastered.length} 题</small>
      </div>
      ${allMastered.length === 0 ? `
        <div class="achievement-empty">
          还没有掌握的题，做对同一道题 2 次就能点亮第一颗星 ⭐
        </div>
      ` : `
        <div class="achievement-grid">
          ${allMastered.slice(0, 20).map(r => `
            <div class="achievement-badge unlocked" title="${escapeHtmlStrict(r.text)}">
              <div class="achievement-icon">⭐</div>
              <div class="achievement-name">${escapeHtmlStrict(r.text)}</div>
            </div>
          `).join('')}
          ${allMastered.length > 20 ? `<div class="achievement-more-badge">还有 ${allMastered.length - 20} 题…</div>` : ''}
        </div>
      `}
    </div>
  `;

  /* ==========================================
     ⭐ 重构本月 vs 上月：使用 2x2 四宫格卡片
     ========================================== */
  const monthCompareHtml = (() => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

    const allHistory = historyLoad();
    const thisMonth = allHistory.filter(r => r.timestamp >= thisMonthStart);
    const lastMonth = allHistory.filter(r => r.timestamp >= lastMonthStart && r.timestamp < thisMonthStart);

    const thisTotal = thisMonth.length;
    const thisCorrect = thisMonth.filter(r => r.isCorrect).length;
    const thisRate = thisTotal ? Math.round(thisCorrect / thisTotal * 100) : 0;
    const lastTotal = lastMonth.length;
    const lastCorrect = lastMonth.filter(r => r.isCorrect).length;
    const lastRate = lastTotal ? Math.round(lastCorrect / lastTotal * 100) : 0;

    const thisMastered = Object.values(masteryMap).filter(r => r.state === 'mastered' && r.lastAt >= thisMonthStart).length;
    const lastMastered = Object.values(masteryMap).filter(r => r.state === 'mastered' && r.lastAt >= lastMonthStart && r.lastAt < thisMonthStart).length;

    const thisDays = new Set(thisMonth.map(r => new Date(r.timestamp).toDateString())).size;
    const lastDays = new Set(lastMonth.map(r => new Date(r.timestamp).toDateString())).size;

    if (lastTotal === 0 && thisTotal === 0) return '';

    const getDiff = (cur, prev) => {
      if (prev === 0 && cur === 0) return '';
      if (prev === 0) return '<span class="mc-diff up">↑ 新</span>';
      if (cur > prev) return '<span class="mc-diff up">↑ 提升</span>';
      if (cur < prev) return '<span class="mc-diff down">↓ 退步</span>';
      return '<span class="mc-diff same">— 持平</span>';
    };

    return `
      <div class="month-compare-card">
        <div class="month-compare-hd">
          <span>📈 本月 vs 上月</span>
          <span style="font-size:12px;font-weight:600;">${now.getFullYear()}年${now.getMonth() + 1}月</span>
        </div>
        <div class="month-compare-grid">
          <div class="month-compare-item">
            <div class="mc-label">做题</div>
            <div class="mc-value">${thisTotal} <small style="font-size:11px;font-weight:600;color:var(--muted);">/ 上月 ${lastTotal}</small></div>
            ${getDiff(thisTotal, lastTotal)}
          </div>
          <div class="month-compare-item">
            <div class="mc-label">正确率</div>
            <div class="mc-value">${thisRate}% <small style="font-size:11px;font-weight:600;color:var(--muted);">/ 上月 ${lastRate}%</small></div>
            ${getDiff(thisRate, lastRate)}
          </div>
          <div class="month-compare-item">
            <div class="mc-label">掌握</div>
            <div class="mc-value">${thisMastered} <small style="font-size:11px;font-weight:600;color:var(--muted);">/ 上月 ${lastMastered}</small></div>
            ${getDiff(thisMastered, lastMastered)}
          </div>
          <div class="month-compare-item">
            <div class="mc-label">学习天数</div>
            <div class="mc-value">${thisDays} <small style="font-size:11px;font-weight:600;color:var(--muted);">/ 上月 ${lastDays}</small></div>
            ${getDiff(thisDays, lastDays)}
          </div>
        </div>
      </div>
    `;
  })();

  // ===== 最后拼装到页面 =====
  wrap.innerHTML = `
    <div class="weekly-summary">
      <div class="weekly-summary-hd">
        <span>📊 本周学习总结</span>
        <span class="weekly-summary-range">${new Date(weekAgo).toLocaleDateString('zh-CN')} - 今天</span>
      </div>
      <div class="weekly-summary-stats">
        <div class="weekly-stat">
          <div class="weekly-stat-value">${total}</div>
          <div class="weekly-stat-label">做题</div>
        </div>
        <div class="weekly-stat">
          <div class="weekly-stat-value" style="color:#15803d;">${correct}</div>
          <div class="weekly-stat-label">做对</div>
        </div>
        <div class="weekly-stat">
          <div class="weekly-stat-value" style="color:#2563eb;">${rate}%</div>
          <div class="weekly-stat-label">正确率</div>
        </div>
        <div class="weekly-stat">
          <div class="weekly-stat-value" style="color:#7c3aed;">${weekMastered.length}</div>
          <div class="weekly-stat-label">掌握</div>
        </div>
        <div class="weekly-stat">
          <div class="weekly-stat-value" style="color:#f59e0b;">${days}</div>
          <div class="weekly-stat-label">学习天数</div>
        </div>
      </div>
      ${topModules.length ? `
        <div class="weekly-summary-section">
          <div class="weekly-summary-section-title">📚 本周练得最多</div>
          <div class="weekly-summary-tags">
            ${topModules.map(([mid, count]) => {
              const meta = LESSON_META[mid] || { title: mid, icon: '📖' };
              return `<span class="weekly-summary-tag">${meta.icon} ${meta.title} · ${count} 次</span>`;
            }).join('')}
          </div>
        </div>
      ` : ''}
      ${weekMastered.length ? `
        <div class="weekly-summary-section">
          <div class="weekly-summary-section-title">🏆 本周掌握的题</div>
          <div class="weekly-mastered-list">
            ${weekMastered.slice(0, 5).map(r => `
              <div class="weekly-mastered-item">✅ ${escapeHtmlStrict(r.text.slice(0, 32))}${r.text.length > 32 ? '…' : ''}</div>
            `).join('')}
            ${weekMastered.length > 5 ? `<div class="weekly-mastered-more">还有 ${weekMastered.length - 5} 题…</div>` : ''}
          </div>
        </div>
      ` : ''}
      ${topWrong ? `
        <div class="weekly-summary-section">
          <div class="weekly-summary-section-title">⚠️ 下周重点</div>
          <div class="weekly-summary-tip">
            集中练一练「<b>${(LESSON_META[topWrong[0]] || { title: topWrong[0] }).title}</b>」，本周错过 ${topWrong[1]} 次
          </div>
        </div>
      ` : ''}
      <div class="weekly-summary-section">
        <div class="weekly-summary-section-title">💬 本周一句话</div>
        <div class="weekly-note-row">
          <span class="weekly-note-who">👦 孩子</span>
          <span class="weekly-note-text" id="weeklyNoteChildText">还没写</span>
          <button class="weekly-note-edit" id="weeklyNoteChildEdit">✏️ 写一句</button>
        </div>
        <div class="weekly-note-row">
          <span class="weekly-note-who">👨‍👩 家长</span>
          <span class="weekly-note-text" id="weeklyNoteParentText">还没回</span>
          <button class="weekly-note-edit" id="weeklyNoteParentEdit">💬 回一句</button>
        </div>
        <div id="weeklyNoteParentEditor" style="display:none;margin-top:10px;">
          <textarea id="parentWeeklyNote" maxlength="120" placeholder="回孩子一句…" style="width:100%;min-height:64px;padding:10px 12px;border:2px solid var(--border);border-radius:10px;background:var(--card);color:var(--text-soft);font-size:14px;font-family:inherit;outline:none;resize:vertical;box-sizing:border-box;"></textarea>
          <button id="weeklyNoteParentSave" style="margin-top:8px;padding:10px 18px;border:none;border-radius:10px;background:#2563eb;color:#fff;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;box-shadow:0 3px 0 #1d4ed8;">保存</button>
        </div>
      </div>
      <div class="weekly-summary-actions">
        <button class="btn-secondary" id="weeklyExportBtn">📤 导出周报</button>
        <button class="btn" id="weeklyGoWrongBtn">📕 复习错题</button>
      </div>
    </div>

    ${monthCompareHtml}
    ${achievementHtml}
  `;

  // ⭐ 「本周一句话」：孩子写一句 / 家长回一句
  //   原来这里只监听了一个从未被渲染的 #weeklyNoteParentWrite，点了会去开「家长设置」弹窗，
  //   而那个弹窗里根本没有输入框 → 整条链是断的。现在入口和存储都接上了。
  const note = noteGetThisWeek();
  const childTextEl = q('weeklyNoteChildText');
  if (childTextEl) childTextEl.textContent = note.child || '还没写，点右边写一句 →';
  const parentTextEl = q('weeklyNoteParentText');
  if (parentTextEl) parentTextEl.textContent = note.parent || '还没回';

  q('weeklyNoteChildEdit')?.addEventListener('click', () => showWeeklyNoteModal());

  q('weeklyNoteParentEdit')?.addEventListener('click', () => {
    const box = q('weeklyNoteParentEditor');
    if (!box) return;
    const willOpen = box.style.display === 'none' || !box.style.display;
    box.style.display = willOpen ? 'block' : 'none';
    if (willOpen) {
      const ta = q('parentWeeklyNote');
      if (ta) { ta.value = noteGetThisWeek().parent || ''; ta.focus(); }
    }
  });

  q('weeklyNoteParentSave')?.addEventListener('click', () => {
    const ta = q('parentWeeklyNote');
    const text = ta ? ta.value.trim() : '';
    if (!text) { if (typeof showToast === 'function') showToast('先写一句再保存吧', 'info'); return; }
    noteSetParent(text);
    renderWeeklySummary();   // 重建卡片以显示新内容
    if (typeof showToast === 'function') showToast('✅ 已回给孩子', 'success');
  });

  q('weeklyExportBtn').addEventListener('click', () => {
    const name = (typeof getStudentName === 'function' && getStudentName()) || '未命名';
    const html = typeof buildWeeklyReportHtml === 'function' ? buildWeeklyReportHtml() : '';
    if (typeof downloadBlob === 'function') {
      downloadBlob(html, `周报_${name}_${new Date().toISOString().slice(0, 10)}.html`, 'text/html');
    }
    if (typeof showToast === 'function') showToast('✅ 周报已导出', 'success');
  });

  q('weeklyGoWrongBtn').addEventListener('click', () => {
    _growthQ('wrongBookBtn')?.click();
  });
  
}

/* ============================================================
   6. Growth 页：把 m14 搬进来
   ============================================================ */
export function renderGrowth() {
  const stage = _growthQ('growthStage');
  if (!stage) return;

  // 基础 UI 重置（stage 的清空交给 swapModule：先 cleanup、再清 DOM）
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-growth')?.classList.add('active');
  _growthQ('globalHeader').style.display = 'none';

  // 3. 渲染 Header
  const hd = _growthQ('growthHeader');
  if (hd) {
    hd.innerHTML = `
      <button class="lesson-back" id="growthBack">←</button>
      <div class="lesson-title">📊 我的成长</div>
      <div style="width:36px"></div>
    `;
    _growthQ('growthBack')?.addEventListener('click', () => navigate('home'));
  }

  // 4. 动态加载并挂载 m14 模块
  swapModule(stage, async () => {
    let mod;
    try {
      // 注意：本文件在 app/views/ 下，到项目根要退两级
      mod = await import('../../grades/grade3/modules/m14.js');
    } catch (err) {
      console.error('加载成长页失败', err);
      // M3/L6：err.message 是第三方文本，不该进 HTML 解析器
      stage.innerHTML = '';
      {
        const box = document.createElement('div');
        box.style.cssText = 'padding:40px;text-align:center;color:#ef4444;';
        box.textContent = '加载失败：' + (err && err.message ? err.message : '未知错误');
        stage.appendChild(box);
      }
      return null;
    }
    const mount = mod.default;
    if (typeof mount !== 'function') return;

    // ⭐ 构造注入的上下文
    const ctx = {
      storage: { get: lsGet, set: lsSet },
      toast: showToast,
      focusWhenReady: focusInputWhenReady,
      data: {
        historyAdd: historyAdd,
        historyLoad: historyLoad,
        historySave: historySave,
        masteryRecord: masteryRecord,
        takeawayLoad: takeawayLoad,
        activityAdd: activityAdd,
        wbAdd: wbAdd,
        wbLoad: wbLoad,
        wbSave: wbSave,
      },
      showMasteryCard: showMasteryCard,
      buildAiInsightHtml: buildAiInsightHtml,
    };

    // 执行模块挂载（m14 内部会自动渲染所有数据）；cleanup 交给 swapModule 保管
    const cleanup = mount(stage, ctx);

    // ==========================================
    // 5. 挂载完成后，处理“本周学习总结”的插入逻辑
    // ==========================================
    const card = stage.querySelector('.card');
    if (card && !_growthQ('weeklySummaryWrap')) {
      const summaryWrap = document.createElement('div');
      summaryWrap.id = 'weeklySummaryWrap';
      summaryWrap.className = 'weekly-summary-wrap';
      
      // 插到 card 的第一个子元素前面
      card.insertBefore(summaryWrap, card.firstChild);
      
      // 如果外部还有 renderWeeklySummary 可以调用
      if (typeof renderWeeklySummary === 'function') {
        renderWeeklySummary();
      }
    }
    return cleanup;
  });

  // ⭐ 本周周报提示
  const now = new Date();
  const dayOfWeek = now.getDay();
  const isSunday = dayOfWeek === 0;
  const weekAgo = now.getTime() - 7 * 86400000;
  const weekRecords = historyLoad().filter(r => r.timestamp >= weekAgo);

  // ⭐ 每次生成前，先把页面上旧的提示条删掉！
  document.querySelectorAll('.growth-weekly-tip').forEach(el => el.remove());

  if (weekRecords.length > 0) {
    const tip = document.createElement('div');
    tip.className = 'growth-weekly-tip';
    
    // ⭐ 移除硬编码的 cssText，完全交给 CSS 类控制
    tip.innerHTML = isSunday
      ? `🎉 <b>今天是周日</b>，本周共学习了 <b>${weekRecords.length}</b> 道题，快去下方查看你的专属周报吧！`
      : `📊 本周已学习 <b>${weekRecords.length}</b> 道题，周日将为你生成完整周报。`;
      
    const header = _growthQ('growthHeader');
    if (header && header.nextSibling) {
      header.parentNode.insertBefore(tip, header.nextSibling);
    }
  }
}

/* ⭐ 孩子写"本周一句话"的弹窗 */
function showWeeklyNoteModal() {
  if (document.querySelector('.weekly-note-mask')) return;

  const current = noteGetThisWeek().child || '';   // core/weekly-note.js（原来必崩）

  const mask = document.createElement('div');
  mask.className = 'weekly-note-mask';
  // ⭐ 居中弹窗（原来是 align-items:flex-end 的底部抽屉，输入框会贴在屏幕最底部）
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;z-index:10020;padding:20px;backdrop-filter:blur(2px);';
  mask.innerHTML = `
    <div class="weekly-note-modal" style="
      background:var(--card);
      color:var(--text);
      border-radius:20px;
      padding:24px 20px 20px;
      width:100%;
      max-width:420px;
      max-height:86vh;
      overflow-y:auto;
      box-shadow:0 20px 60px rgba(15,23,42,.3);
      animation:weeklyNotePop .24s cubic-bezier(.34,1.3,.64,1);
    ">
      <div style="font-size:40px;text-align:center;margin-bottom:8px;">💬</div>
      <div style="font-size:16px;font-weight:800;color:var(--text);text-align:center;margin-bottom:6px;">这一周，最想对自己说什么？</div>
      <div style="font-size:12.5px;color:var(--muted);text-align:center;line-height:1.7;margin-bottom:16px;">
        家长打开成长页会看到这句话
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:12px;">
        ${[
          '这周我学会了好多',
          '我下次要更细心',
          '乘法越来越顺了',
          '我最喜欢竖式',
          '谢谢爸爸妈妈'
        ].map(t => `
          <button class="weekly-note-quick" data-text="${t}" style="
            padding:6px 12px;border:1.5px solid var(--border);border-radius:999px;
            background:var(--bg);color:var(--muted);font-size:12px;font-weight:700;
            cursor:pointer;font-family:inherit;
          ">${t}</button>
        `).join('')}
      </div>

      <textarea
        id="weeklyNoteInput"
        placeholder="写一句…"
        maxlength="80"
        style="
          width:100%;
          padding:12px 14px;
          border:2px solid var(--border);
          background:var(--input-bg);
          color:var(--text-soft);
          border-radius:12px;
          font-size:15px;
          font-family:inherit;
          outline:none;
          resize:none;
          height:80px;
          margin-bottom:14px;
          box-sizing:border-box;
        "
      >${escapeHtmlStrict(current)}</textarea>

      <div style="display:flex;gap:10px;">
        <button id="weeklyNoteCancel" style="
          flex:1;padding:14px;border-radius:12px;background:var(--border-soft);
          color:var(--text-soft);border:none;cursor:pointer;font-size:15px;
          font-weight:700;font-family:inherit;
        ">取消</button>
        <button id="weeklyNoteSave" style="
          flex:2;padding:14px;border-radius:12px;background:#2563eb;
          color:#fff;border:none;cursor:pointer;font-size:15px;
          font-weight:700;font-family:inherit;box-shadow:0 3px 0 #1d4ed8;
        ">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(mask);

  const input = _growthQ('weeklyNoteInput');

  // 快捷语
  mask.querySelectorAll('.weekly-note-quick').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.text;
      input.focus();
    });
  });

  // 取消
  _growthQ('weeklyNoteCancel').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });

  // 保存
  _growthQ('weeklyNoteSave').addEventListener('click', () => {
    const text = input.value.trim();
    if (!text) {
      showToast('写一句再保存吧', 'info');
      return;
    }
    noteSetChild(text);   // core/weekly-note.js（原来这个函数根本不存在，保存必崩）
    mask.remove();
    renderWeeklySummary();
    showToast('✅ 写好了，家长打开成长页会看到', 'success');
  });

  // 自动聚焦（延迟一点，避免 iOS 键盘弹起时页面跳动）
  setTimeout(() => {
    try {
      input.focus({ preventScroll: true });
    } catch (e) {
      input.focus();
    }
  }, 250);
}
