/* grades/grade3/modules/m2.js */
export const meta = { title: '面积模型', icon: '🧱' };

export default async function mount(container, ctx) {
  const tpl = document.getElementById('tpl-m2');
  if (!tpl) return;
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));

  const $ = sel => container.querySelector(sel);
  const M2 = { a:12, b:3, filled:0, split:false, busy:false };

  function m2Draw() {
    const c = $('#m2canvas'), ctx2d = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx2d.clearRect(0, 0, W, H);
    const { a, b, filled, split } = M2;
    const padL=70, padT=56, padR=44, padB=52;
    const availW = W - padL - padR, availH = H - padT - padB;
    const cw = Math.min(availW / a, 44), ch = Math.min(availH / b, 44);
    const gw = cw * a, gh = ch * b;
    const ox = padL + (availW - gw) / 2, oy = padT + (availH - gh) / 2;
    const splitAt = Math.floor(a / 10) * 10;
    for (let r = 0; r < b; r++) for (let col = 0; col < a; col++) {
      const idx = r * a + col;
      const x = ox + col * cw, y = oy + r * ch;
      if (idx < filled) {
        ctx2d.fillStyle = split ? (col < splitAt ? '#60a5fa' : '#fbbf24') : '#60a5fa';
      } else ctx2d.fillStyle = '#f8fafc';
      ctx2d.fillRect(x, y, cw, ch);
      ctx2d.strokeStyle = idx < filled ? 'rgba(255,255,255,0.75)' : '#e2e8f0';
      ctx2d.lineWidth = 1;
      ctx2d.strokeRect(x + .5, y + .5, cw - 1, ch - 1);
    }
    ctx2d.strokeStyle = '#94a3b8'; ctx2d.lineWidth = 2;
    ctx2d.strokeRect(ox, oy, gw, gh);
    ctx2d.fillStyle = '#475569'; ctx2d.font = 'bold 15px system-ui,sans-serif';
    ctx2d.textAlign = 'center';
    ctx2d.fillText(a + ' 块', ox + gw/2, oy - 18);
    ctx2d.save(); ctx2d.translate(ox - 26, oy + gh/2); ctx2d.rotate(-Math.PI/2);
    ctx2d.fillText(b + ' 行', 0, 0); ctx2d.restore();
    if (split && a > splitAt) {
      ctx2d.textAlign = 'center'; ctx2d.font = 'bold 13px system-ui,sans-serif';
      ctx2d.fillStyle = '#2563eb';
      ctx2d.fillText('10', ox + splitAt * cw / 2, oy + gh + 24);
      ctx2d.fillStyle = '#d97706';
      ctx2d.fillText(String(a - splitAt), ox + splitAt * cw + (a - splitAt) * cw / 2, oy + gh + 24);
    }
  }

  function m2Calc() {
    const el = $('#m2calc');
    const { a, b, filled, split } = M2;
    const total = a * b;
    if (filled === 0) { el.innerHTML = `<span class="calc-hint">点击「铺一行」，看看 <b>${a} × ${b}</b> 到底是多少</span>`; return; }
    if (filled < total) { el.innerHTML = `<span class="calc-hint">已经铺了 <b>${filled}</b> 块，还剩 <b>${total - filled}</b> 块没铺</span>`; return; }
    if (!split) { el.innerHTML = `<span class="calc-final">${a} × ${b} = <b>${total}</b></span>`; }
    else {
      const splitAt = Math.floor(a / 10) * 10;
      const p1 = splitAt * b, p2 = (a - splitAt) * b;
      el.innerHTML = `<div class="calc-line"><span class="tag blue">10 × ${b} = ${p1}</span><span class="tag amber">${a - splitAt} × ${b} = ${p2}</span></div><div class="calc-final">${p1} + ${p2} = <b>${total}</b></div>`;
    }
  }

  async function m2FillRow() {
    if (M2.busy) return;
    const total = M2.a * M2.b;
    if (M2.filled >= total) return;
    M2.busy = true;
    const start = M2.filled, end = Math.min(total, start + M2.a);
    for (let i = start; i < end; i++) {
      M2.filled = i + 1;
      m2Draw();
      await new Promise(r => setTimeout(r, 26));
    }
    M2.busy = false;
    m2Calc();
    if (M2.filled >= total && ctx.data.activityAdd) {
      ctx.data.activityAdd('m2', `${M2.a} × ${M2.b}`, `铺满 ${total} 块`);
    }
  }

  // 事件绑定
  $('#m2a')?.addEventListener('input', () => {
    M2.a = +$('#m2a').value; $('#m2aval').textContent = M2.a;
    M2.filled = 0; m2Draw(); m2Calc();
  });
  $('#m2b')?.addEventListener('input', () => {
    M2.b = +$('#m2b').value; $('#m2bval').textContent = M2.b;
    M2.filled = 0; m2Draw(); m2Calc();
  });
  $('#m2fill')?.addEventListener('click', m2FillRow);
  $('#m2split')?.addEventListener('click', () => {
    M2.split = !M2.split;
    $('#m2split').classList.toggle('on', M2.split);
    m2Draw(); m2Calc();
  });
  $('#m2clear')?.addEventListener('click', () => { M2.filled = 0; m2Draw(); m2Calc(); });

  m2Draw(); m2Calc();

  return () => { container.innerHTML = ''; };
}