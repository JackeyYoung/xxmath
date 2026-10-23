/* m3.js 分数披萨 */
export const meta = { title: '分数披萨', icon: '🍕' };

export default async function mount(container, ctx) {
  const tpl = document.getElementById('tpl-m3');
  if (!tpl) return;
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  const $ = sel => container.querySelector(sel);

  const M3 = { den:4, selected:[], geom:{} };
  const CN_NUM = ['零','一','二','三','四','五','六','七','八','九','十','十一','十二'];
  let M3_EXTRA = { mode: 'compare', quiz: null };

  // TODO: 将 main.js 中的 m3Geometry, m3Draw, m3Update, m3Reset, m3RenderExtra, m3RenderCompare, m3RenderAddSub, m3RenderEquiv 全量拷贝到这里。
  // 注意：把里面的 document.getElementById / document.querySelector 替换成 $
  // 把 document.querySelectorAll('.frac-tab') 替换成 container.querySelectorAll('.frac-tab')

  function m3Geometry() {
    const c = $('#m3canvas');
    return { cx:c.width/2, cy:c.height/2, r:Math.min(c.width, c.height)/2 - 26 };
  }
  function m3Draw() {
    const c = $('#m3canvas'), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const { cx, cy, r } = M3.geom, n = M3.den;
    const step = Math.PI*2/n, start = -Math.PI/2;
    for (let i = 0; i < n; i++) {
      const a0 = start + i*step, a1 = a0 + step;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a1); ctx.closePath();
      if (M3.selected[i]) {
        const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, r);
        g.addColorStop(0, '#fcd34d'); g.addColorStop(1, '#f59e0b');
        ctx.fillStyle = g;
      } else ctx.fillStyle = '#f1f5f9';
      ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3; ctx.stroke();
  }

  function m3Update() {
    const num = M3.selected.filter(Boolean).length, den = M3.den;
    $('#m3num').textContent = num;
    $('#m3denText').textContent = den;
    const t = $('#m3text');
    if (num === 0) { t.textContent = '还没有选任何一份'; t.style.color = '#94a3b8'; }
    else if (num === den) { t.textContent = `取了全部 ${den} 份，就是 1 个整体`; t.style.color = '#15803d';
                              ctx.data.activityAdd('m3', `分数披萨 ${num}/${den}`, `分成 ${den} 份`);}
    else { t.textContent = `${CN_NUM[den]}分之${CN_NUM[num]}`; t.style.color = '#334155'; }
  }
  function m3Reset() {
    M3.den = +$('#m3denRange').value;
    $('#m3denval').textContent = M3.den;
    M3.selected = Array(M3.den).fill(false);
    M3.geom = m3Geometry();
    m3Draw(); m3Update();
  }

  function m3RenderExtra() {
    const el = $('fracExtraContent');
    if (!el) return;
    const mode = M3_EXTRA.mode;
    if (mode === 'compare') m3RenderCompare(el);
    else if (mode === 'add') m3RenderAddSub(el, '+');
    else if (mode === 'sub') m3RenderAddSub(el, '−');
    else if (mode === 'equiv') m3RenderEquiv(el);
  }

  /* 分数显示 HTML */
  function fracHtml(num, den) {
    return `<span class="frac-inline"><span>${num}</span><span class="frac-line"></span><span>${den}</span></span>`;
  }

  /* ---- 比大小 ---- */
  function m3RenderCompare(el) {
    const d1 = 2 + Math.floor(Math.random() * 6);   // 2~7
    const d2 = 2 + Math.floor(Math.random() * 6);
    const n1 = 1 + Math.floor(Math.random() * (d1 - 1));
    const n2 = 1 + Math.floor(Math.random() * (d2 - 1));

    const v1 = n1 / d1, v2 = n2 / d2;
    const correct = Math.abs(v1 - v2) < 1e-9 ? 'eq' : (v1 > v2 ? 'gt' : 'lt');

    el.innerHTML = `
      <div style="text-align:center;">
        <div style="font-size:15px;color:#64748b;font-weight:700;margin-bottom:16px;">
          ⚖️ 比较两个分数的大小
        </div>
        <div style="display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap;">
          ${fracHtml(n1, d1)}
          <span style="font-size:28px;color:#94a3b8;font-weight:800;">?</span>
          ${fracHtml(n2, d2)}
        </div>
        <div class="frac-cmp-options">
          <button class="frac-cmp-btn" data-cmp="gt">&gt;</button>
          <button class="frac-cmp-btn" data-cmp="eq">=</button>
          <button class="frac-cmp-btn" data-cmp="lt">&lt;</button>
        </div>
        <div id="fracCmpFb" class="priority-feedback" style="margin-top:14px;"></div>
        <div style="margin-top:16px;">
          <button class="btn-secondary" id="fracCmpNext">🎲 下一题</button>
        </div>
      </div>
    `;

    const fb = $('fracCmpFb');
    el.querySelectorAll('.frac-cmp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const user = btn.dataset.cmp;
        el.querySelectorAll('.frac-cmp-btn').forEach(b => b.classList.remove('correct', 'wrong'));
        if (user === correct) {
          btn.classList.add('correct');
          fb.textContent = `✓ 对！${n1}/${d1} ${correct === 'gt' ? '>' : correct === 'lt' ? '<' : '='} ${n2}/${d2}`;
          fb.className = 'priority-feedback ok';
        } else {
          btn.classList.add('wrong');
          const hint = `提示：可以先通分再比较——${n1}/${d1} ≈ ${v1.toFixed(3)}，${n2}/${d2} ≈ ${v2.toFixed(3)}`;
          fb.textContent = '❌ ' + hint;
          fb.className = 'priority-feedback error';
        }
      });
    });
    $('fracCmpNext').addEventListener('click', () => m3RenderCompare(el));
  }

  /* ---- 分数加减 ---- */
  function m3RenderAddSub(el, op) {
    // 同分母（三年级只学同分母加减）
    const den = 3 + Math.floor(Math.random() * 6);   // 3~8
    let n1, n2, resultNum;

    if (op === '+') {
      n1 = 1 + Math.floor(Math.random() * (den - 2));
      n2 = 1 + Math.floor(Math.random() * (den - n1));   // 保证和 <= den
      resultNum = n1 + n2;
    } else {
      n1 = 2 + Math.floor(Math.random() * (den - 1));
      n2 = 1 + Math.floor(Math.random() * (n1 - 1));   // 保证 n2 < n1
      resultNum = n1 - n2;
    }

    const opSymbol = op === '+' ? '+' : '−';

    el.innerHTML = `
      <div style="text-align:center;">
        <div style="font-size:15px;color:#64748b;font-weight:700;margin-bottom:16px;">
          ${op === '+' ? '➕ 同分母分数加法' : '➖ 同分母分数减法'}
        </div>
        <div class="frac-calc-row">
          ${fracHtml(n1, den)}
          <span style="font-size:28px;color:#64748b;font-weight:800;">${opSymbol}</span>
          ${fracHtml(n2, den)}
          <span style="font-size:28px;color:#64748b;font-weight:800;">=</span>
          <div style="display:inline-flex;flex-direction:column;align-items:center;">
            <input type="text" inputmode="decimal" class="frac-calc-input" id="fracNum" placeholder="?" min="0" max="20">
            <span style="width:60px;height:2.5px;background:var(--primary-d);margin:4px 0;border-radius:1px;"></span>
            <input type="text" inputmode="decimal" class="frac-calc-input" id="fracDen" placeholder="?" min="1" max="20" style="font-size:16px;padding:6px;">
          </div>
        </div>
        <div style="text-align:center;margin:12px 0;">
          <button class="btn" id="fracCalcSubmit">✓ 确认</button>
        </div>
        <div id="fracCalcFb" class="priority-feedback"></div>
        <div style="margin-top:16px;">
          <button class="btn-secondary" id="fracCalcNext">🎲 下一题</button>
        </div>
      </div>
    `;

    const fb = $('fracCalcFb');
    const numInput = $('fracNum');
    const denInput = $('fracDen');

    function submit() {
      const userNum = parseInt(numInput.value, 10);
      const userDen = parseInt(denInput.value, 10);

      if (isNaN(userNum) || isNaN(userDen)) {
        fb.textContent = '❌ 请填写分子和分母';
        fb.className = 'priority-feedback error';
        return;
      }

      // 严格判断：分子对且分母对
      if (userNum === resultNum && userDen === den) {
        numInput.classList.add('correct');
        denInput.classList.add('correct');
        fb.textContent = `✓ 对！${n1}/${den} ${opSymbol} ${n2}/${den} = ${resultNum}/${den}`;
        fb.className = 'priority-feedback ok';
      } else {
        numInput.classList.add('wrong');
        denInput.classList.add('wrong');
        // 提示
        let hint = '';
        if (userDen !== den) {
          hint = `同分母分数${op === '+' ? '加' : '减'}，分母不变，还是 ${den}`;
        } else {
          hint = `分子${op === '+' ? '相加' : '相减'}：${n1} ${opSymbol} ${n2} = ${resultNum}`;
        }
        fb.textContent = '❌ 再想想～ ' + hint;
        fb.className = 'priority-feedback error';
        setTimeout(() => {
          numInput.classList.remove('wrong');
          denInput.classList.remove('wrong');
        }, 800);
      }
    }

    $('fracCalcSubmit').addEventListener('click', submit);
    numInput.addEventListener('keydown', e => { if (e.key === 'Enter') denInput.focus(); });
    denInput.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    $('fracCalcNext').addEventListener('click', () => m3RenderAddSub(el, op));
  }

  /* ---- 等值分数 ---- */
  function m3RenderEquiv(el) {
    // 选一个基准分数，如 1/2
    const baseNum = 1;
    const baseDen = 2 + Math.floor(Math.random() * 3);   // 2~4
    const multiplier = 2 + Math.floor(Math.random() * 3); // 2~4

    const eqNum = baseNum * multiplier;
    const eqDen = baseDen * multiplier;

    // 渲染两个条形图，每段代表一个分数单位
    const baseBar = Array(baseDen).fill(false).map((_, i) =>
      `<div class="equiv-seg ${i < baseNum ? 'filled' : ''}">${i + 1}</div>`
    ).join('');
    const eqBar = Array(eqDen).fill(false).map((_, i) =>
      `<div class="equiv-seg ${i < eqNum ? 'filled' : ''}">${i + 1}</div>`
    ).join('');

    el.innerHTML = `
      <div style="text-align:center;">
        <div style="font-size:15px;color:#64748b;font-weight:700;margin-bottom:16px;">
          🟰 等值分数：观察两个分数是否相等
        </div>
          <div class="equiv-row">
          <div class="equiv-item">
            <div class="equiv-bar" style="width:360px;">${baseBar}</div>
            <div class="equiv-label">${fracHtml(baseNum, baseDen)}</div>
          </div>
          <div class="equiv-item">
            <div class="equiv-bar" style="width:360px;">${eqBar}</div>
            <div class="equiv-label">${fracHtml(eqNum, eqDen)}</div>
          </div>
        </div>
        <div style="background:#fffbeb;padding:12px 16px;border-radius:10px;display:inline-block;margin:12px 0;font-size:14px;color:#92400e;font-weight:600;">
          💡 观察：${baseNum}/${baseDen} 的每一份 = ${eqNum}/${eqDen} 的两份吗？
        </div>
        <div style="margin-top:12px;">
          <button class="btn" id="equivReveal">🤔 它们相等吗？点我看答案</button>
        </div>
        <div id="equivFb" class="priority-feedback" style="margin-top:12px;"></div>
        <div style="margin-top:16px;">
          <button class="btn-secondary" id="equivNext">🎲 下一题</button>
        </div>
      </div>
    `;

    $('equivReveal').addEventListener('click', () => {
      const fb = $('equivFb');
      fb.innerHTML = `
        <div style="text-align:left;background:#f0f9ff;padding:14px 18px;border-radius:10px;line-height:1.9;">
          <div style="font-weight:800;color:#2563eb;margin-bottom:8px;">✓ 它们是等值的！</div>
          <div><b>${baseNum}/${baseDen}</b> 就是把整体平均分成 ${baseDen} 份，取 ${baseNum} 份</div>
          <div><b>${eqNum}/${eqDen}</b> 就是把整体平均分成 ${eqDen} 份（每份更小），取 ${eqNum} 份</div>
          <div>但 <b>${eqDen} ÷ ${baseDen} = ${multiplier}</b>，所以 1 个 ${baseNum}/${baseDen} = ${multiplier} 个 ${eqNum}/${eqDen}</div>
          <div style="color:#15803d;font-weight:800;margin-top:6px;">
            ${baseNum}/${baseDen} = (${baseNum} × ${multiplier}) / (${baseDen} × ${multiplier}) = ${eqNum}/${eqDen}
          </div>
        </div>
      `;
      fb.className = 'priority-feedback ok';
    });
    $('equivNext').addEventListener('click', () => m3RenderEquiv(el));
  }

  // 事件绑定
  container.querySelectorAll('.frac-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.frac-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      M3_EXTRA.mode = tab.dataset.fracMode;
      m3RenderExtra();
    });
  });

  $('#m3canvas')?.addEventListener('click', e => {
    const c = e.currentTarget, rect = c.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (c.width / rect.width);
    const y = (e.clientY - rect.top) * (c.height / rect.height);
    const { cx, cy, r } = M3.geom;
    const dx = x - cx, dy = y - cy;
    if (Math.hypot(dx, dy) > r) return;
    let ang = Math.atan2(dy, dx) + Math.PI/2;
    if (ang < 0) ang += Math.PI*2;
    const idx = Math.floor(ang / (Math.PI*2/M3.den)) % M3.den;
    M3.selected[idx] = !M3.selected[idx];
    m3Draw(); m3Update();
  });

  $('#m3denRange')?.addEventListener('input', m3Reset);
  $('#m3clear')?.addEventListener('click', () => {
    M3.selected = Array(M3.den).fill(false);
    m3Draw(); m3Update();
  });

  m3RenderExtra();
  m3Reset();

  return () => { container.innerHTML = ''; };
}