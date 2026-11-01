/* m10.js 年月日
   已按「线 B」底座改造：createScope + el/replace（日历表不再拼 innerHTML 字符串）
   对外契约不变：export const meta + export default async mount(container, ctx)
*/
import { createScope } from '../../../core/lesson/scope.js';
import { el, replace } from '../../../core/lesson/dom.js';

export const meta = { title: '年月日', icon: '📅' };

const WEEK_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

export function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y, m) {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** 解析年份输入：空串 / 非整数 / 越界一律回退到默认年（对应 M6 修复） */
export function parseYear(raw, fallback = 2026) {
  const n = Number.parseInt(String(raw == null ? '' : raw).trim(), 10);
  return Number.isFinite(n) && n >= 1900 && n <= 2100 ? n : fallback;
}

/** 纯函数：给定年月，产出「每行 7 天」的日期矩阵（null 表示占位空单元格） */
export function buildMonthGrid(y, m) {
  const days = daysInMonth(y, m);
  const firstDay = new Date(y, m - 1, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return { weeks, days, firstDay };
}

export default async function mount(container, ctx) {
  const scope = createScope(container, 'tpl-m10');
  const { $, on, dispose } = scope;

  function render() {
    const y = parseYear($('#m10year') ? $('#m10year').value : '');
    const m = Number($('#m10month') ? $('#m10month').value : 1) || 1;
    const { weeks, days } = buildMonthGrid(y, m);

    const title = $('#m10title');
    if (title) title.textContent = y + ' 年 ' + m + ' 月';

    // 用 el() 构建表头与表体，替换整张表（结构稳定，不会误伤别处节点）
    const thead = el('thead', {}, el('tr', {}, WEEK_NAMES.map((w) => el('th', { text: w }))));
    const tbody = el('tbody', {}, weeks.map((week) => el('tr', {}, week.map((d) => {
      if (d == null) return el('td', { class: 'empty' });
      const dow = new Date(y, m - 1, d).getDay();
      return el('td', { class: dow === 0 || dow === 6 ? 'weekend' : '', text: d });
    }))));

    const cal = $('#m10calendar');
    if (cal) replace(cal, thead, tbody);

    const leap = isLeapYear(y);
    const info = $('#m10info');
    if (info) {
      replace(info,
        document.createTextNode(y + ' 年是'),
        el('b', { text: leap ? '闰' : '平' }),
        document.createTextNode('年，2 月有 '),
        el('b', { text: leap ? 29 : 28 }),
        document.createTextNode(' 天；' + m + ' 月有 '),
        el('b', { text: days }),
        document.createTextNode(' 天。'),
      );
    }

    ctx.data.activityAdd('m10', y + ' 年 ' + m + ' 月', days + ' 天');
  }

  on($('#m10year'), 'input', render);
  on($('#m10month'), 'change', render);

  render();
  return () => dispose();
}
