/* m7.js 时钟 */
export const meta = { title: '时分秒', icon: '🕐' };

export default async function mount(container, ctx) {
  const tpl = document.getElementById('tpl-m7');
  if (!tpl) return;
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  const $ = sel => container.querySelector(sel);

  const M7 = {
    hour: 3, 
    minute: 0, 
    second: 0, 
    running: false, 
    soundOn: false,
    mode: 'clock', swElapsed: 0, swRunning: false, swTarget: 60000,
    swLastFrame: 0, swLastTickSec: -1, _lastDangerState: null
  };
  const CN_HOUR = ['十二','一','二','三','四','五','六','七','八','九','十','十一'];
  let m7AudioCtx = null;
  let m7Dragging = false;

  // TODO: 复制 main.js 里的 m7InitAudio, m7PlayTick, m7Draw, m7UpdateDigital, M7_CALC_TYPES, m7NewCalcChallenge, m7ClockTick, m7FmtStopwatch, m7UpdateSwDisplay, m7SwFrame, m7SwStart, m7SwReset, m7FromPoint

  function m7InitAudio() {
    if (!m7AudioCtx) {
      try { m7AudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (m7AudioCtx && m7AudioCtx.state === 'suspended') m7AudioCtx.resume();
  }
  function m7PlayTick(isLast) {
    if (!M7.soundOn) return;
    m7InitAudio();
    if (!m7AudioCtx) return;
    const t = m7AudioCtx.currentTime;
    const osc = m7AudioCtx.createOscillator();
    const gain = m7AudioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = isLast ? 1600 : 1000;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(isLast ? 0.18 : 0.10, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (isLast ? 0.25 : 0.06));
    osc.connect(gain); gain.connect(m7AudioCtx.destination);
    osc.start(t); osc.stop(t + 0.3);
  }

  /* ---------- 时钟绘制 ---------- */
  function m7Draw() {
    const c = $('#m7canvas'); 
    if (!c) return; // ⭐ 加这一句：如果画布没了，直接退出
    const canvasCtx = c.getContext('2d');
    const W = c.width, H = c.height, cx = W/2, cy = H/2, r = Math.min(W, H)/2 - 16;
    canvasCtx.clearRect(0, 0, W, H);

    canvasCtx.beginPath(); canvasCtx.arc(cx, cy, r, 0, Math.PI*2);
    canvasCtx.fillStyle = '#f8fafc'; canvasCtx.fill();
    canvasCtx.strokeStyle = '#94a3b8'; canvasCtx.lineWidth = 4; canvasCtx.stroke();

    for (let i = 0; i < 60; i++) {
      const ang = (i/60)*Math.PI*2 - Math.PI/2;
      const isHour = i % 5 === 0;
      const r1 = isHour ? r - 16 : r - 9, r2 = r - 5;
      canvasCtx.beginPath();
      canvasCtx.moveTo(cx + Math.cos(ang)*r1, cy + Math.sin(ang)*r1);
      canvasCtx.lineTo(cx + Math.cos(ang)*r2, cy + Math.sin(ang)*r2);
      canvasCtx.strokeStyle = isHour ? '#334155' : '#cbd5e1';
      canvasCtx.lineWidth = isHour ? 3 : 1;
      canvasCtx.stroke();
    }

    canvasCtx.fillStyle = '#1e293b'; canvasCtx.font = 'bold 22px system-ui,sans-serif';
    canvasCtx.textAlign = 'center'; canvasCtx.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const ang = (i/12)*Math.PI*2 - Math.PI/2;
      canvasCtx.fillText(i, cx + Math.cos(ang)*(r-32), cy + Math.sin(ang)*(r-32));
    }

    const hAng = ((M7.hour % 12) + M7.minute/60 + M7.second/3600)/12*Math.PI*2 - Math.PI/2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(cx - Math.cos(hAng)*14, cy - Math.sin(hAng)*14);
    canvasCtx.lineTo(cx + Math.cos(hAng)*(r*0.48), cy + Math.sin(hAng)*(r*0.48));
    canvasCtx.strokeStyle = '#1e293b'; canvasCtx.lineWidth = 8; canvasCtx.lineCap = 'round'; canvasCtx.stroke();

    const mAng = (M7.minute/60 + M7.second/3600)*Math.PI*2 - Math.PI/2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(cx - Math.cos(mAng)*18, cy - Math.sin(mAng)*18);
    canvasCtx.lineTo(cx + Math.cos(mAng)*(r*0.78), cy + Math.sin(mAng)*(r*0.78));
    canvasCtx.strokeStyle = '#2563eb'; canvasCtx.lineWidth = 5; canvasCtx.lineCap = 'round'; canvasCtx.stroke();

    const sAng = (M7.second/60)*Math.PI*2 - Math.PI/2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(cx - Math.cos(sAng)*26, cy - Math.sin(sAng)*26);
    canvasCtx.lineTo(cx + Math.cos(sAng)*(r*0.88), cy + Math.sin(sAng)*(r*0.88));
    canvasCtx.strokeStyle = '#ef4444'; canvasCtx.lineWidth = 2; canvasCtx.lineCap = 'round'; canvasCtx.stroke();
    canvasCtx.beginPath();
    canvasCtx.arc(cx - Math.cos(sAng)*26, cy - Math.sin(sAng)*26, 4, 0, Math.PI*2);
    canvasCtx.fillStyle = '#ef4444'; canvasCtx.fill();

    canvasCtx.beginPath(); canvasCtx.arc(cx, cy, 9, 0, Math.PI*2); canvasCtx.fillStyle = '#1e293b'; canvasCtx.fill();
    canvasCtx.beginPath(); canvasCtx.arc(cx, cy, 4, 0, Math.PI*2); canvasCtx.fillStyle = '#fff'; canvasCtx.fill();
  }

  function m7UpdateDigital() {
    const h = M7.hour % 12 || 12, m = M7.minute, s = M7.second;
    $('#m7digital').textContent = `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    let mt;
    if (m === 0) mt = '整';
    else if (m === 15) mt = '一刻';
    else if (m === 30) mt = '半';
    else if (m === 45) mt = '三刻';
    else mt = m + ' 分';
    $('#m7chinese').textContent = `${CN_HOUR[h % 12]}时${mt}`;
  }

  /* ============ 时间推算挑战 ============ */
  const M7_CALC_TYPES = [
    {
      label: '经过时间（同一天，分钟不进位）',
      gen: () => {
        const h1 = 6 + Math.floor(Math.random() * 6);    // 6~11
        const m1 = Math.floor(Math.random() * 6) * 10;   // 0,10,...,50
        const addMin = 10 + Math.floor(Math.random() * 5) * 10; // 10,20,...,50
        const m2 = m1 + addMin;
        // 保证不跨小时
        if (m2 >= 60) return null;   // 重来
        return {
          question: `从 <b>${h1}:${String(m1).padStart(2,'0')}</b> 到 <b>${h1}:${String(m2).padStart(2,'0')}</b>，经过了多少分钟？`,
          answer: addMin,
          unit: '分钟',
          hint: `${m2} − ${m1} = ?`,
        };
      }
    },
    {
      label: '经过时间（跨小时）',
      gen: () => {
        const h1 = 6 + Math.floor(Math.random() * 4);   // 6~9
        const m1 = 30 + Math.floor(Math.random() * 3) * 10;  // 30,40,50
        const totalMin = (60 - m1) + 10 + Math.floor(Math.random() * 5) * 10;
        // 结果应该在 10~50 分钟
        if (totalMin > 60) return null;
        const h2 = h1 + 1;
        const m2 = totalMin - (60 - m1);
        return {
          question: `从 <b>${h1}:${String(m1).padStart(2,'0')}</b> 到 <b>${h2}:${String(m2).padStart(2,'0')}</b>，经过了多少分钟？`,
          answer: totalMin,
          unit: '分钟',
          hint: `先算到整点：${60} − ${m1} = ${60 - m1} 分钟；再加上 ${m2} 分钟`,
        };
      }
    },
    {
      label: '推算未来时间',
      gen: () => {
        const h = 6 + Math.floor(Math.random() * 8);   // 6~13
        const m = Math.floor(Math.random() * 6) * 10;   // 0,10,...,50
        const addMin = 20 + Math.floor(Math.random() * 5) * 10;   // 20~60
        const totalMin = h * 60 + m + addMin;
        const newH = Math.floor(totalMin / 60) % 24;
        const newM = totalMin % 60;
        return {
          question: `现在是 <b>${h}:${String(m).padStart(2,'0')}</b>，再过 <b>${addMin}</b> 分钟是几点几分？`,
          answer: { h: newH, m: newM },
          type: 'time',
          hint: `${m} + ${addMin} = ${m + addMin} 分钟；${m + addMin >= 60 ? `${m + addMin} − 60 = ${m + addMin - 60} 分，同时进 1 小时` : ''}`,
        };
      }
    },
    {
      label: '推算过去时间',
      gen: () => {
        const h = 12 + Math.floor(Math.random() * 6);   // 12~17
        const m = 10 + Math.floor(Math.random() * 5) * 10;   // 10~50
        const subMin = 20 + Math.floor(Math.random() * 5) * 10;
        let totalMin = h * 60 + m - subMin;
        if (totalMin < 0) return null;
        const newH = Math.floor(totalMin / 60);
        const newM = totalMin % 60;
        return {
          question: `现在是 <b>${h}:${String(m).padStart(2,'0')}</b>，<b>${subMin}</b> 分钟前是几点几分？`,
          answer: { h: newH, m: newM },
          type: 'time',
          hint: `${m} − ${subMin} = ${m - subMin} 分钟；${m - subMin < 0 ? `${m} + 60 − ${subMin} = ${m + 60 - subMin} 分，同时退 1 小时` : ''}`,
        };
      }
    }
  ];

  function m7NewCalcChallenge() {
    const el = document.getElementById('m7CalcChallenge');
    if (!el) return;

    // 最多尝试 20 次生成有效题
    let q = null;
    for (let tries = 0; tries < 20; tries++) {
      const type = M7_CALC_TYPES[Math.floor(Math.random() * M7_CALC_TYPES.length)];
      q = type.gen();
      if (q) break;
    }
    if (!q) { el.innerHTML = '<div style="text-align:center;color:#94a3b8;">生成失败，请再点"出新题"</div>'; return; }

    if (q.type === 'time') {
      // 答案是"几点几分"
      el.innerHTML = `
        <div class="m7-calc-question">${q.question}</div>
        <div class="m7-calc-input-row">
          <input type="text" inputmode="decimal" class="m7-calc-input" id="m7CalcH" placeholder="时" min="0" max="23" autocomplete="off">
          <span class="m7-calc-unit">时</span>
          <input type="text" inputmode="decimal" class="m7-calc-input" id="m7CalcM" placeholder="分" min="0" max="59" autocomplete="off">
          <span class="m7-calc-unit">分</span>
          <button class="btn" id="m7CalcSubmit">✓ 确认</button>
        </div>
        <div class="m7-calc-fb" id="m7CalcFb"></div>
      `;
      const hIn = document.getElementById('m7CalcH');
      const mIn = document.getElementById('m7CalcM');
      const fb = document.getElementById('m7CalcFb');
      const submit = () => {
        const uh = parseInt(hIn.value, 10);
        const um = parseInt(mIn.value, 10);
        if (isNaN(uh) || isNaN(um)) {
          fb.textContent = '❌ 请填写小时和分钟';
          fb.className = 'm7-calc-fb error';
          return;
        }
        if (uh === q.answer.h && um === q.answer.m) {
          hIn.classList.add('correct');
          mIn.classList.add('correct');
          fb.innerHTML = `✓ 对！${q.answer.h} 时 ${q.answer.m} 分`;
          fb.className = 'm7-calc-fb ok';
          // ⭐ 新增
          ctx.data.activityAdd('m7', `时间推算`, `答对 ${q.answer.h}时${q.answer.m}分`);
        } else {
          hIn.classList.add('wrong');
          mIn.classList.add('wrong');
          fb.innerHTML = '❌ 再想想～ ' + q.hint;
          fb.className = 'm7-calc-fb error';
          setTimeout(() => {
            hIn.classList.remove('wrong');
            mIn.classList.remove('wrong');
          }, 800);
        }
      };
      document.getElementById('m7CalcSubmit').addEventListener('click', submit);
      hIn.addEventListener('keydown', e => { if (e.key === 'Enter') mIn.focus(); });
      mIn.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      hIn.focus();
    } else {
      // 答案是分钟数
      el.innerHTML = `
        <div class="m7-calc-question">${q.question}</div>
        <div class="m7-calc-input-row">
          <input type="text" inputmode="decimal" class="m7-calc-input" id="m7CalcAns" placeholder="?" min="0" max="600" autocomplete="off">
          <span class="m7-calc-unit">${q.unit}</span>
          <button class="btn" id="m7CalcSubmit">✓ 确认</button>
        </div>
        <div class="m7-calc-fb" id="m7CalcFb"></div>
      `;
      const inp = document.getElementById('m7CalcAns');
      const fb = document.getElementById('m7CalcFb');
      const submit = () => {
        const v = parseInt(inp.value, 10);
        if (isNaN(v)) {
          fb.textContent = '❌ 请输入一个数字';
          fb.className = 'm7-calc-fb error';
          return;
        }
        if (v === q.answer) {
          inp.classList.add('correct');
          fb.innerHTML = `✓ 对！答案是 ${q.answer} ${q.unit}`;
          fb.className = 'm7-calc-fb ok';
        } else {
          inp.classList.add('wrong');
          fb.innerHTML = '❌ 再想想～ ' + q.hint;
          fb.className = 'm7-calc-fb error';
          setTimeout(() => inp.classList.remove('wrong'), 800);
        }
      };
      document.getElementById('m7CalcSubmit').addEventListener('click', submit);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      inp.focus();
    }
  }

  function m7ClockTick() {
    // ⭐ 如果是暂停状态，直接返回，不更新
    if (M7.mode !== 'clock' || !M7.running) return;
    
    M7.second++;
    if (M7.second >= 60) {
      M7.second = 0; M7.minute++;
      if (M7.minute >= 60) { M7.minute = 0; M7.hour = (M7.hour % 12) + 1; }
    }
    m7Draw(); 
    m7UpdateDigital();
    
    if (M7.second === 0) {
      ctx.data.recordActivity('m7', `时钟 ${M7.hour}:${String(M7.minute).padStart(2,'0')}`, '', 5000);
    }
    m7PlayTick(false);
  }

  /* ---------- 秒表 ---------- */
  function m7FmtStopwatch(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60), s = totalSec % 60;
    const tenths = Math.floor((ms % 1000) / 100);
    return { main: `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`, dec: `.${tenths}` };
  }

  function m7UpdateSwDisplay() {
    const el = $('#swDisplay');
    if (!el) return;

    if (M7.mode === 'up') {
      el.classList.remove('warn','danger');
      const t = m7FmtStopwatch(M7.swElapsed);
      el.innerHTML = `${t.main}<small>${t.dec}</small>`;
      return;
    }

    if (M7.mode === 'down') {
      const remain = M7.swTarget - M7.swElapsed;
      const t = m7FmtStopwatch(remain);
      el.innerHTML = `${t.main}<small>${t.dec}</small>`;

      // ⭐ 用 _lastDangerState 缓存，避免每帧 DOM 操作
      let newState = 'normal';
      if (remain <= 10000) newState = 'danger';
      else if (remain <= 30000) newState = 'warn';

      if (M7._lastDangerState !== newState) {
        M7._lastDangerState = newState;
        el.classList.toggle('danger', newState === 'danger');
        el.classList.toggle('warn', newState === 'warn');
      }
      return;
    }

    // clock 模式
    el.classList.remove('warn','danger');
    el.innerHTML = `00:00<small>.0</small>`;
  }

  function m7SwFrame(now) {
    if (M7.mode === 'clock' || !M7.swRunning) { M7.swLastFrame = now; return; }
    const dt = now - M7.swLastFrame;
    M7.swLastFrame = now;
    M7.swElapsed += dt;

    if (M7.mode === 'down' && M7.swElapsed >= M7.swTarget) {
      M7.swElapsed = M7.swTarget;
      M7.swRunning = false;
      $('#swToggle').textContent = '▶ 开始';
      m7PlayTick(true);
      m7UpdateSwDisplay();
      $('#swHint').innerHTML = '⏰ <b style="color:#dc2626;">时间到！</b> 点击「归零」可重新开始。';
      // ⭐ 新增
      ctx.data.recordActivity('m7', `倒计时 ${M7.swTarget/1000} 秒`, '完成', 0);
      return;
    }

    const curSec = Math.floor(M7.swElapsed / 1000);
    if (curSec !== M7.swLastTickSec) {
      M7.swLastTickSec = curSec;
      m7PlayTick(false);
    }
    m7UpdateSwDisplay();
    requestAnimationFrame(m7SwFrame);
  }

  function m7SwStart() {
    M7.swRunning = true;
    M7.swLastFrame = performance.now();
    M7.swLastTickSec = Math.floor(M7.swElapsed / 1000);
    $('#swToggle').textContent = '⏸ 暂停';
    $('#swHint').innerHTML = M7.mode === 'up'
      ? '⏱ 正在计时…每秒响一次滴答声。'
      : '⏳ 倒计时进行中…';
    requestAnimationFrame(m7SwFrame);
  }

  function m7SwReset() {
    M7.swRunning = false;
    M7.swElapsed = 0;
    M7.swLastTickSec = -1;
    $('#swToggle').textContent = '▶ 开始';
    if (M7.mode === 'down') {
      const m = +$('#swMin').value || 0;
      const s = +$('#swSec').value || 0;
      M7.swTarget = (m * 60 + s) * 1000;
      if (M7.swTarget <= 0) M7.swTarget = 60000;
    }
    m7UpdateSwDisplay();
    if (M7.mode === 'up') {
      $('#swHint').innerHTML = '💡 点击「开始」，秒表从 0 往上计时。';
    } else if (M7.mode === 'down') {
      $('#swHint').innerHTML = `💡 倒计时目标：${Math.floor(M7.swTarget/60000)} 分 ${Math.floor((M7.swTarget%60000)/1000)} 秒。`;
    }
  }



  // 事件
  container.querySelectorAll('.sw-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.sw-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      M7.mode = tab.dataset.mode;
      M7.swRunning = false;
      M7.swElapsed = 0;
      M7.swLastTickSec = -1;
      $('#swToggle').textContent = '▶ 开始';

      const setup = $('#swSetup');
      if (M7.mode === 'clock') {
        setup.style.display = 'none';
        $('#swDisplay').innerHTML = '00:00<small>.0</small>';
        $('#swDisplay').classList.remove('warn','danger');
        $('#swHint').innerHTML = '🕐 时钟模式下，秒针每秒走一格（上方可开启「滴答声」）。';
      } else if (M7.mode === 'up') {
        setup.style.display = 'none';
        m7UpdateSwDisplay();
        $('#swHint').innerHTML = '💡 点击「开始」，秒表从 0 往上计时。';
      } else {
        setup.style.display = 'inline-flex';
        const m = +$('#swMin').value || 0;
        const s = +$('#swSec').value || 0;
        M7.swTarget = (m * 60 + s) * 1000;
        if (M7.swTarget <= 0) M7.swTarget = 60000;
        m7UpdateSwDisplay();
        $('#swHint').innerHTML = `💡 倒计时目标：${m} 分 ${s} 秒，点击「开始」倒计时。`;
      }
    });
  });

  $('#swToggle')?.addEventListener('click', () => {
    if (M7.mode === 'clock') return;
    if (M7.swRunning) {
      M7.swRunning = false;
      $('#swToggle').textContent = '▶ 继续';
    } else {
      if (M7.mode === 'down' && M7.swElapsed >= M7.swTarget) M7.swElapsed = 0;
      m7SwStart();
    }
  });

  $('#swReset')?.addEventListener('click', () => {
    if (M7.mode === 'clock') {
      M7.hour = 3; M7.minute = 0; M7.second = 0; M7.running = true;
      $('#m7toggle').textContent = '⏸ 暂停';
      m7Draw(); m7UpdateDigital();
      return;
    }
    m7SwReset();
  });

  ['swMin','swSec'].forEach(id => {
    $('#' + id)?.addEventListener('input', () => {
      if (M7.mode !== 'down' || M7.swRunning) return;
      const m = +$('#swMin').value || 0;
      const s = +$('#swSec').value || 0;
      M7.swTarget = (m * 60 + s) * 1000;
      if (M7.swTarget <= 0) M7.swTarget = 60000;
      M7.swElapsed = 0;
      m7UpdateSwDisplay();
    });
  });

  function m7FromPoint(clientX, clientY) {
    const c = $('#m7canvas'), rect = c.getBoundingClientRect();
    const x = (clientX - rect.left) * (c.width / rect.width);
    const y = (clientY - rect.top) * (c.height / rect.height);
    const cx = c.width/2, cy = c.height/2;
    let ang = Math.atan2(y - cy, x - cx) + Math.PI/2;
    if (ang < 0) ang += Math.PI*2;
    return Math.round(ang / (Math.PI*2) * 60) % 60;
  }

  $('#m7canvas')?.addEventListener('mousedown', e => {
    m7Dragging = true;
    M7.minute = m7FromPoint(e.clientX, e.clientY);
    M7.second = 0;
    m7Draw(); m7UpdateDigital();
    // ⭐ 新增：拖分针
    ctx.data.recordActivity('m7', `拖分针到 ${M7.minute} 分`, '', 1000);
  });
  window.addEventListener('mousemove', e => {
    if (!m7Dragging) return;
    const newMin = m7FromPoint(e.clientX, e.clientY);
    if (M7.minute > 45 && newMin < 15) M7.hour = (M7.hour % 12) + 1;
    else if (M7.minute < 15 && newMin > 45) M7.hour = ((M7.hour - 2 + 12) % 12) + 1;
    M7.minute = newMin; M7.second = 0;
    m7Draw(); m7UpdateDigital();
  });
  window.addEventListener('mouseup', () => { m7Dragging = false; });

  $('#m7toggle')?.addEventListener('click', () => {
    M7.running = !M7.running;
    $('#m7toggle').textContent = M7.running ? '⏸ 暂停' : '▶ 开始';
  });
  $('#m7sound')?.addEventListener('click', () => {
    M7.soundOn = !M7.soundOn;
    $('#m7sound').textContent = M7.soundOn ? '🔊 滴答声' : '🔇 滴答声';
    $('#m7sound').classList.toggle('on', M7.soundOn);
    if (M7.soundOn) { m7InitAudio(); m7PlayTick(false); }
  });
  $('#m7reset')?.addEventListener('click', () => {
    M7.hour = 3; M7.minute = 0; M7.second = 0; M7.running = false;
    $('#m7toggle').textContent = '⏸ 开始';
    m7Draw(); m7UpdateDigital();
  });

  document.getElementById('m7NewCalcChallenge')?.addEventListener('click', m7NewCalcChallenge);
  const timer = setInterval(m7ClockTick, 1000);

  m7Draw(); 
  m7UpdateDigital(); 
  m7NewCalcChallenge();

  return () => { 
    clearInterval(timer); 
    container.innerHTML = ''; 
  };
}