/* m6.js 小数 */
export const meta = { title: '小数认识', icon: '💰' };

export default async function mount(container, ctx) {
  const tpl = document.getElementById('tpl-m6');
  if (!tpl) return;
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  const $ = sel => container.querySelector(sel);

  const M6 = { yuan:0, jiao:0, fen:0 };
  const COIN_DEF = [
    { key:'yuan', label:'1 元', cls:'yuan' },
    { key:'jiao', label:'1 角', cls:'jiao' },
    { key:'fen', label:'1 分', cls:'fen' }
  ];

  // TODO: 复制 main.js 里的 m6RenderCoins, m6PickScale, m6FmtLabel, m6RenderNumline, m6Update
  function m6RenderCoins() {
    $('#m6coins').innerHTML = COIN_DEF.map(c => {
      const max = c.key === 'yuan' ? 1000 : 9;
      return `
        <div class="coin-item">
          <div class="coin ${c.cls}">${c.label}</div>
          <div class="qty-ctrl">
            <button data-coin="${c.key}" data-d="-1">−</button>
            <input type="text" inputmode="numeric" data-coin="${c.key}" value="${M6[c.key]}">
            <button data-coin="${c.key}" data-d="1">+</button>
          </div>
        </div>`;
    }).join('');
  }

  /* 数轴总长：以 10 为单位向上取整（0~9 → 10，10~19 → 20，以此类推） */
  function m6PickScale(value) {
    const v = Math.max(value, 0);
    if (v <= 10) return 10;
    return Math.ceil(v / 10) * 10;
  }

  /* 刻度标签格式：根据主刻度间距决定小数位，避免四舍五入后重复 */
  function m6FmtLabel(v, majorStep) {
    if (v === 0) return '0';
    if (majorStep >= 1)      return String(Math.round(v));
    if (majorStep >= 0.1)    return v.toFixed(1);
    if (majorStep >= 0.01)   return v.toFixed(2);
    return v.toFixed(3);
  }

  function m6RenderNumline() {
    const line = $('#m6numline');
    const value = M6.yuan + M6.jiao / 10 + M6.fen / 100;
    const scale = m6PickScale(value);

    const majorSteps = 10;                          // 10 大格
    const subPerMajor = 10;                          // 每大格分 10 小格
    const totalSub = majorSteps * subPerMajor;      // 共 100 小格
    const stepPerSub = scale / totalSub;            // 每小格代表的值
    const majorStep = scale / majorSteps;           // 每大格代表的值

    let html = '';
    for (let i = 0; i <= totalSub; i++) {
      const pct = (i / totalSub) * 100;
      const isMajor = (i % subPerMajor === 0);
      html += `<div class="nl-tick${isMajor ? ' major' : ''}" style="left:${pct}%"></div>`;
      if (isMajor) {
        const val = i * stepPerSub;
        html += `<div class="nl-label" style="left:${pct}%">${m6FmtLabel(val, majorStep)}</div>`;
      }
    }

    if (value > 0) {
      const pct = Math.min((value / scale) * 100, 99.5);
      html += `<div class="nl-marker" style="left:${pct}%" data-label="${value.toFixed(2)}"></div>`;
    }

    line.innerHTML = html;
  }

  function m6Update() {
    const { yuan, jiao, fen } = M6;
    const total = yuan + jiao/10 + fen/100;
    $('#m6total').innerHTML = total.toFixed(2) + '<small>元</small>';
    const sub = $('#m6sub');
    if (total === 0) sub.textContent = '还没有放硬币';
    else {
      const parts = [`<b>${yuan}</b> 元`];
      if (jiao) parts.push(`<b>${jiao}</b> 角`);
      if (fen) parts.push(`<b>${fen}</b> 分`);
      let detail = '';
      if (jiao) detail += `<br>${jiao} 角 = ${jiao}/10 元 = ${(jiao/10).toFixed(1)} 元`;
      if (fen) detail += `<br>${fen} 分 = ${fen}/100 元 = ${(fen/100).toFixed(2)} 元`;
      sub.innerHTML = parts.join(' + ') + ' = ' + total.toFixed(2) + ' 元' + detail;
      // M6：放硬币（total > 0）
      ctx.data.activityAdd('m6', `钱包 ${total.toFixed(2)} 元`, `${yuan}元${jiao}角${fen}分`);
    }
    m6RenderNumline();
  }

  $('#m6coins')?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-coin]');
    if (!btn) return;
    const key = btn.dataset.coin, d = +btn.dataset.d;
    const max = key === 'yuan' ? 1000 : 9;
    M6[key] = Math.max(0, Math.min(max, M6[key] + d));
    const input = container.querySelector(`#m6coins input[data-coin="${key}"]`);
    if (input) input.value = M6[key];
    m6Update();
  });

  $('#m6coins')?.addEventListener('input', e => {
    const input = e.target.closest('input[data-coin]');
    if (!input) return;
    const key = input.dataset.coin;
    const max = key === 'yuan' ? 1000 : 9;
    let v = parseInt(input.value, 10);
    if (isNaN(v)) v = 0;
    M6[key] = Math.max(0, Math.min(max, v));
    m6Update();
  });

  $('#m6coins')?.addEventListener('blur', e => {
    const input = e.target.closest('input[data-coin]');
    if (!input) return;
    input.value = M6[input.dataset.coin];
  }, true);

  $('#m6clear')?.addEventListener('click', () => {
    M6.yuan = M6.jiao = M6.fen = 0;
    m6RenderCoins(); m6Update();
  });

  m6RenderCoins(); m6Update();
  return () => { container.innerHTML = ''; };
}