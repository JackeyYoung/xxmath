/* m11.js 方向 */
import { getTemplate } from '../../../core/ui/template.js';
import { aji } from '../../../core/ui/aji.js';

export const meta = { title: '位置方向', icon: '📍' };

export default async function mount(container, ctx) {
  const tpl = getTemplate('tpl-m11');
  if (!tpl) return;
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  // ---------- Aji 全站陪学助教（模块只报数据，不画 UI） ----------
  aji.registerModuleContext({
    moduleId: 'm11',
    topic: '方向与位置',
    knowledgeCards: [
      { title: '先列后行', content: '说位置要<b>先说第几列（竖着数），再说第几行（横着数）</b>。' },
      { title: '从哪边开始数', content: '一般<b>从左往右</b>数列，<b>从前往后</b>数行，起点是第 1 个不是第 0 个。' },
      { title: '地图上的方向', content: '地图上通常是<b>上北下南、左西右东</b>。' },
    ],
    problemText: () => (M11.selected
      ? `找出第 ${M11.selected.c} 列、第 ${M11.selected.r} 行的位置`
      : `在 ${M11.cols} 列 ${M11.rows} 行的格子里找位置`),
    progress: () => (M11.selected
      ? `已选：第 ${M11.selected.c} 列，第 ${M11.selected.r} 行`
      : '（尚未选择位置）'),
  });

  const $ = sel => container.querySelector(sel);

  const M11 = { cols:6, rows:5, selected:null };
  const M11_ICONS = ['🍎','🍌','🍇','🍓','🍊','🍒','🐶','🐱','🐰','🐼','🦊','🐸','🚗','🚀','✈️','🚢','⚽','🏀','🎈','🎁','📚','✏️','🎨','🌻','🌈','⭐','🍕','🍰','🍦','🍩'];

  function m11Render() {
    const { cols, rows } = M11;
    let html = `<div class="coord-grid" style="grid-template-columns:40px repeat(${cols},52px);">`;
    html += '<div></div>';
    for (let c = 1; c <= cols; c++) html += `<div class="coord-axis">第${c}列</div>`;
    for (let r = 1; r <= rows; r++) {
      html += `<div class="coord-axis">第${r}行</div>`;
      for (let c = 1; c <= cols; c++) {
        const idx = (r-1)*cols + (c-1);
        const icon = M11_ICONS[idx % M11_ICONS.length];
        const sel = (M11.selected && M11.selected.c === c && M11.selected.r === r) ? ' selected' : '';
        html += `<div class="coord-cell${sel}" data-c="${c}" data-r="${r}">${icon}</div>`;
      }
    }
    html += '</div>';
    $('#m11grid-wrap').innerHTML = html;
    if (M11.selected) {
      $('#m11result').innerHTML = `你选的是 <b>第 ${M11.selected.c} 列，第 ${M11.selected.r} 行</b>`;
      ctx.data.activityAdd('m11', `第 ${M11.selected.c} 列 第 ${M11.selected.r} 行`, '');
    } else {
      $('#m11result').textContent = '还没有选位置';
    }
    document.querySelector('#m11grid-wrap .coord-grid')?.style.setProperty('--cols', M11.cols);
  }

  $('#m11grid-wrap')?.addEventListener('click', e => {
    const cell = e.target.closest('.coord-cell');
    if (!cell) return;
    M11.selected = { c:+cell.dataset.c, r:+cell.dataset.r };
    m11Render();
  });

  m11Render();
  return () => { container.innerHTML = ''; };
}