/* core/weekly-report.js */
import { historyLoad } from './history.js';
import { masteryLoad } from './mastery.js';
import { msgLoad } from './parent-message.js';
import { escapeHtmlStrict } from './html.js';
import { autoTagsFor } from './wrongbook-tags.js';
import { getStudyStreak } from './dashboard-render.js';
import { getStudentName } from './student.js';

export function buildWeeklyReport() {
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const history = historyLoad().filter(r => r.timestamp >= weekAgo);
  const total = history.length;
  const correct = history.filter(r => r.isCorrect).length;
  const rate = total ? Math.round(correct / total * 100) : 0;
  const days = new Set(history.map(r => {
    const d = new Date(r.timestamp); d.setHours(0, 0, 0, 0); return d.getTime();
  }));
  const streak = getStudyStreak();

  const masteryMap = masteryLoad();
  const weekMastered = Object.values(masteryMap).filter(r =>
    r.state === 'mastered' && r.lastAt >= weekAgo
  );

  const wrongCount = {};
  history.filter(r => !r.isCorrect).forEach(r => {
    wrongCount[r.problemText] = (wrongCount[r.problemText] || 0) + 1;
  });
  const topWrong = Object.entries(wrongCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const takeaways = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('grade3_takeaway_')) {
        const v = localStorage.getItem(k);
        if (v && v.trim()) takeaways.push(v.trim());
      }
    }
  } catch (e) {}
  const topTakeaways = takeaways.slice(-3).reverse();

  const tagCount = {};
  history.filter(r => !r.isCorrect).forEach(r => {
    autoTagsFor(r.problemText).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
  });
  const topTag = Object.entries(tagCount).sort((a, b) => b[1] - a[1])[0];

  // 月对比
  const nowDate = new Date();
  const thisMonthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
  const lastMonthStart = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1).getTime();
  const allHistory = historyLoad();
  const thisMonthList = allHistory.filter(r => r.timestamp >= thisMonthStart);
  const lastMonthList = allHistory.filter(r => r.timestamp >= lastMonthStart && r.timestamp < thisMonthStart);
  const thisTotal = thisMonthList.length;
  const thisCorrect = thisMonthList.filter(r => r.isCorrect).length;
  const thisRate = thisTotal ? Math.round(thisCorrect / thisTotal * 100) : 0;
  const lastTotal = lastMonthList.length;
  const lastCorrect = lastMonthList.filter(r => r.isCorrect).length;
  const lastRate = lastTotal ? Math.round(lastCorrect / lastTotal * 100) : 0;

  const monthCompareHtml = (lastTotal > 0 || thisTotal > 0) ? `
    <div class="weekly-report-section">
      <h5>📈 本月 vs 上月</h5>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="background:#f0f9ff;padding:10px;border-radius:8px;">
          <div style="font-size:11.5px;color:#64748b;font-weight:700;">做题</div>
          <div style="font-size:18px;font-weight:800;color:#2563eb;">${thisTotal} <small style="color:#94a3b8;font-size:11px;font-weight:600;">/ 上月 ${lastTotal}</small></div>
        </div>
        <div style="background:#f0fdf4;padding:10px;border-radius:8px;">
          <div style="font-size:11.5px;color:#64748b;font-weight:700;">正确率</div>
          <div style="font-size:18px;font-weight:800;color:#15803d;">${thisRate}% <small style="color:#94a3b8;font-size:11px;font-weight:600;">/ 上月 ${lastRate}%</small></div>
        </div>
      </div>
    </div>
  ` : '';

  const weekMsg = msgLoad().filter(m => m.at >= weekAgo);
  const msgHtml = weekMsg.length ? `
    <div class="weekly-report-section">
      <h5>💌 本周留言</h5>
      ${weekMsg.map(m => `
        <div style="margin-bottom:8px;padding:8px 12px;background:#fff;border-radius:8px;font-size:13px;">
          <div style="color:#be185d;font-weight:700;">家长：${escapeHtmlStrict(m.text)}</div>
          ${m.reply ? `<div style="color:#334155;margin-top:4px;">👦 孩子：${escapeHtmlStrict(m.reply)}</div>` : `<div style="color:#94a3b8;margin-top:4px;">孩子还没回复</div>`}
        </div>
      `).join('')}
    </div>
  ` : '';

  return `
    <div class="weekly-report-panel" id="weeklyReportPanel">
      <h4>📊 本周学习周报</h4>
      <div class="weekly-report-stats">
        <div class="weekly-report-stat"><div class="label">做题总数</div><div class="value">${total}<small> 道</small></div></div>
        <div class="weekly-report-stat"><div class="label">正确率</div><div class="value">${total ? rate : '—'}<small>%</small></div></div>
        <div class="weekly-report-stat"><div class="label">掌握</div><div class="value" style="color:#7c3aed;">${weekMastered.length}<small> 题</small></div></div>
        <div class="weekly-report-stat"><div class="label">学习天数</div><div class="value">${days.size}<small> 天</small></div></div>
        <div class="weekly-report-stat"><div class="label">连续打卡</div><div class="value">${streak}<small> 天</small></div></div>
      </div>
      ${msgHtml}
      ${weekMastered.length ? `
        <div class="weekly-report-section">
          <h5>🏆 本周掌握的题</h5>
          ${weekMastered.slice(0, 5).map(r => `<div>• ${escapeHtmlStrict(r.text.slice(0, 40))}…</div>`).join('')}
          ${weekMastered.length > 5 ? `<div style="color:#94a3b8;font-size:12px;margin-top:4px;">还有 ${weekMastered.length - 5} 题…</div>` : ''}
        </div>
      ` : ''}
      ${topWrong.length ? `
        <div class="weekly-report-section">
          <h5>⚠️ 需要重点复习的题</h5>
          ${topWrong.map(([t, c]) => `<div>• ${escapeHtmlStrict(t.slice(0, 40))}…（错 ${c} 次）</div>`).join('')}
        </div>
      ` : ''}
      ${topTakeaways.length ? `
        <div class="weekly-report-section">
          <h5>💡 我的心得精选</h5>
          ${topTakeaways.map(t => `<div>• ${escapeHtmlStrict(t)}</div>`).join('')}
        </div>
      ` : ''}
      ${topTag ? `
        <div class="weekly-report-section">
          <h5>🎯 下周建议</h5>
          <div>集中练习「<b>${topTag[0]}</b>」类题目（本周错过 ${topTag[1]} 次）</div>
        </div>
      ` : ''}
      ${monthCompareHtml}
      <div class="weekly-report-actions">
        <button class="btn-secondary" id="weeklyReportExport">📤 导出周报 HTML</button>
      </div>
    </div>
  `;
}

export function buildWeeklyReportHtml() {
  const name = getStudentName() || '未命名';
  const report = buildWeeklyReport();
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name} 的学习周报</title>
<style>
body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;background:#eef3f9;color:#1e293b;padding:20px;line-height:1.7;}
.wrap{max-width:640px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 6px 24px rgba(15,23,42,.08);}
h1{font-size:22px;color:#7c3aed;text-align:center;margin-bottom:8px;}
.sub{text-align:center;color:#64748b;font-size:13px;margin-bottom:24px;}
.weekly-report-panel h4{font-size:17px;color:#5b21b6;margin-bottom:14px;text-align:center;}
.weekly-report-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px;}
.weekly-report-stat{padding:12px;background:#f5f3ff;border-radius:10px;text-align:center;}
.weekly-report-stat .label{font-size:12px;color:#64748b;font-weight:700;}
.weekly-report-stat .value{font-size:22px;font-weight:800;color:#7c3aed;font-family:ui-monospace,monospace;}
.weekly-report-section{padding:12px 16px;background:#f8fafc;border-radius:10px;margin-bottom:10px;font-size:13.5px;}
.weekly-report-section h5{font-size:13px;color:#6d28d9;margin-bottom:6px;}
.footer{text-align:center;color:#94a3b8;font-size:12px;margin-top:20px;padding-top:14px;border-top:1px dashed #e2e8f0;}
</style></head><body>
<div class="wrap">
  <h1>📊 ${name} 的数学学习周报</h1>
  <div class="sub">${new Date().toLocaleString('zh-CN')}</div>
  ${report}
  <div class="footer">由"三年级数学互动课堂"自动生成</div>
</div>
</body></html>`;
}