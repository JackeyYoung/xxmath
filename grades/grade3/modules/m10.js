/* m10.js 年月日 */
export const meta = { title: '年月日', icon: '📅' };

export default async function mount(container, ctx) {
  const tpl = document.getElementById('tpl-m10');
  if (!tpl) return;
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  const $ = sel => container.querySelector(sel);


  function m10IsLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
  function m10DaysInMonth(y, m) { return [31, m10IsLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m-1]; }
  function m10Render(isUserAction = false) {
    let y = +$('#m10year').value;
    const m = +$('#m10month').value;
    if (isNaN(y)) y = 2026;
    if (!(m >= 1 && m <= 12)) return;   // ⭐ 月份非法时直接跳过渲染
    const days = m10DaysInMonth(y, m);
    $('#m10title').textContent = `${y} 年 ${m} 月`;
    const firstDay = new Date(y, m - 1, 1).getDay();
    const wd = ['日', '一', '二', '三', '四', '五', '六'];
    let html = '<thead><tr>';
    wd.forEach(w => html += `<th>${w}</th>`);
    html += '</tr></thead><tbody><tr>';
    for (let i = 0; i < firstDay; i++) html += '<td class="empty"></td>';
    for (let d = 1; d <= days; d++) {
      const dow = (firstDay + d - 1) % 7;
      const isWeekend = (dow === 0 || dow === 6);
      html += `<td class="${isWeekend ? 'weekend' : ''}">${d}</td>`;
      if ((firstDay + d) % 7 === 0 && d < days) html += '</tr><tr>';
    }
    html += '</tr></tbody>';
    $('#m10calendar').innerHTML = html;
    const isLeap = m10IsLeap(y);
    $('#m10info').innerHTML = `${y} 年是<b>${isLeap ? '闰' : '平'}年</b>，2 月有 <b>${isLeap ? 29 : 28}</b> 天；${m} 月有 <b>${days}</b> 天。`;
    // ⭐ M10：只有用户真实操作才记体验，且走防抖版 recordActivity（此前每次渲染/每敲一个键都会刷一条记录）
    if (isUserAction) ctx.data.recordActivity?.('m10', `${y} 年 ${m} 月`, `${days} 天`);
  }

  $('#m10year')?.addEventListener('input', () => m10Render(true));
  $('#m10month')?.addEventListener('change', () => m10Render(true));

  m10Render();
  return () => { container.innerHTML = ''; };
}