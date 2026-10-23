/* m11.js 方向 */
export const meta = { title: '位置方向', icon: '📍' };

export default async function mount(container, ctx) {
  const tpl = document.getElementById('tpl-m11');
  if (!tpl) return;
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
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