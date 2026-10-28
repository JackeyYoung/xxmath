/* m8.js 倍数 */
export const meta = { title: '倍的认识', icon: '🍎' };

export default async function mount(container, ctx) {
  const tpl = document.getElementById('tpl-m8');
  if (!tpl) return;
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  const $ = sel => container.querySelector(sel);

  const M8 = { base: 3, times: 3, maxBase: 5, maxTimes: 20 };

  // TODO: 拷贝 main.js 中的 m8Render
  // 拷贝 main.js 中的 m8Render
  function m8Render() {
    const { base, times } = M8;
    const total = base * times;

    // 第一行
    $('#m8row1').innerHTML = Array(base).fill('<span class="bei-shape">🍎</span>').join('');

    // 第二行：times 个虚线框，每个框里 base 个
    let row2 = '';
    for (let g = 0; g < times; g++) {
      row2 += '<div class="bei-group">';
      for (let i = 0; i < base; i++) {
        row2 += '<span class="bei-shape">🍎</span>';
      }
      row2 += '</div>';
    }
    $('#m8row2').innerHTML = row2;

    $('#m8result').innerHTML = `
      <div style="font-size:17px;font-weight:700;color:var(--text-soft);margin-bottom:16px;">
        第二行有 <b style="color:var(--primary-d);">${total}</b> 个，是第一行 <b style="color:var(--primary-d);">${base}</b> 个的
        <b style="color:var(--amber-text);">${times}</b> 倍
      </div>
      <div class="div-demo">
        <div class="div-row mul">
          <span class="op-badge">📐 乘法求第二行</span>
          ${base} × ${times} = <b>${total}</b>
        </div>
        <div class="div-row div">
          <span class="op-badge">➗ 除法求倍数</span>
          ${total} ÷ ${base} = <b>${times}</b>
        </div>
      </div>
    `;
  }

   // 第一行数量滑块
  $('#m8base')?.addEventListener('input', () => {
    M8.base = +$('#m8base').value;
    $('#m8baseval').textContent = M8.base;
    m8Render();
  });
  $('#m8base')?.addEventListener('change', () => {
    // 用户松开滑块时记录
    if (ctx?.data?.recordActivity) {
      ctx.data.recordActivity('m8', `${M8.base} 的 ${M8.times} 倍`, `共 ${M8.base * M8.times} 个`);
    } else if (ctx?.data?.activityAdd) {
      ctx.data.activityAdd('m8', `${M8.base} 的 ${M8.times} 倍`, `共 ${M8.base * M8.times} 个`);
    }
  });

  // 倍数滑块
  $('#m8times')?.addEventListener('input', () => {
    M8.times = +$('#m8times').value;
    $('#m8timesval').textContent = M8.times;
    m8Render();
  });
  $('#m8times')?.addEventListener('change', () => {
    if (ctx?.data?.recordActivity) {
      ctx.data.recordActivity('m8', `${M8.base} 的 ${M8.times} 倍`, `共 ${M8.base * M8.times} 个`);
    } else if (ctx?.data?.activityAdd) {
      ctx.data.activityAdd('m8', `${M8.base} 的 ${M8.times} 倍`, `共 ${M8.base * M8.times} 个`);
    }
  });
  
  $('#m8baseMax')?.addEventListener('input', () => {
    let v = +$('#m8baseMax').value;
    if (isNaN(v)) return;
    v = Math.max(1, Math.min(20, v));
    M8.maxBase = v;
    const slider = $('#m8base');
    slider.max = v;
    if (M8.base > v) { M8.base = v; slider.value = v; $('#m8baseval').textContent = v; }
    m8Render();
  });
  $('#m8max')?.addEventListener('input', () => {
    let v = +$('#m8max').value;
    if (isNaN(v)) return;
    v = Math.max(2, Math.min(50, v));
    M8.maxTimes = v;
    const slider = $('#m8times');
    slider.max = v;
    if (M8.times > v) { M8.times = v; slider.value = v; $('#m8timesval').textContent = v; }
    m8Render();
  });

  m8Render();
  return () => { container.innerHTML = ''; };
}