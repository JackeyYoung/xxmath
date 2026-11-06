/* S3：优先在 #page-lesson 内查找（本模块就挂在这里），找不到退回全局。 */
const _pageQ = (id) => {
  const root = document.getElementById('page-lesson');
  const el = root && typeof root.querySelector === 'function' ? root.querySelector('#' + id) : null;
  return el || document.getElementById(id);
};

/* m7.js 时钟 */
import { getTemplate } from '../../../core/ui/template.js';
import { aji } from '../../../core/ui/aji.js';

export const meta = { title: '时分秒', icon: '🕐' };

export default async function mount(container, ctx) {
  const tpl = getTemplate('tpl-m7');
  if (!tpl) return;
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  // ---------- Aji 全站陪学助教（模块只报数据，不画 UI） ----------
  aji.registerModuleContext({
    moduleId: 'm7',
    topic: '时间（时分秒）',
    knowledgeCards: [
      { title: '时分秒进率', content: '1 时 = 60 分，1 分 = 60 秒。<b>时间满 60 才进 1，不是满 100</b>。' },
      { title: '读钟表', content: '短针是时针（几时），长针是分针（几分）。分针指 6 就是 30 分。' },
      { title: '算经过时间', content: '<b>先看时、再看分</b>；分钟不够减，就向前借 1 时 = 60 分。' },
      { title: '别忘了换算', content: '80 分 = 1 时 20 分——满 60 分就要换成 1 时。' },
    ],
    problemText: () => `钟面显示 ${M7.hour} 时 ${M7.minute} 分 ${M7.second} 秒`,
    progress: () => (M7.mode === 'stopwatch'
      ? `秒表模式：已计时 ${(M7.swElapsed / 1000).toFixed(1)} 秒`
      : (M7.running ? '钟表正在走时' : '钟表已暂停（可点击开始）')),
  });

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

  let m7SwRafId = 0;      // ⭐ 秒表 rAF 帧句柄
  let m7Stopped = false;  // ⭐ 卸载标志：rAF/监听一律停火

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

  /* M3：把「主文本 + 小字单位」两段文本写进元素，替代字符串拼 innerHTML */
  function _setSmall(node, main, dec) {
    if (!node) return;
    node.textContent = '';
    node.append(String(main));
    const s = document.createElement('small');
    s.textContent = String(dec);
    node.append(s);
  }

  function m7NewCalcChallenge() {
    const el = _pageQ('m7CalcChallenge');
    if (!el) return;

    // 最多尝试 20 次生成有效题
    let q = null;
    for (let tries = 0; tries < 20; tries++) {
      const type = M7_CALC_TYPES[Math.floor(Math.random() * M7_CALC_TYPES.length)];
      q = type.gen();
      if (q) break;
    }
    if (!q) {
          el.textContent = '生成失败，请再点"出新题"';
          el.style.textAlign = 'center';
          el.style.color = '#94a3b8';
          return;
        }

    if (q.type === 'time') {
      // 答案是"几点几分"
      // M3：用 DOM 构建替代字符串模板（q.question 不再进 HTML 解析器）
      el.textContent = '';
      const qLine = document.createElement('div');
      qLine.className = 'm7-calc-question';
      qLine.textContent = q.question;
      const mkInput = (id, ph, max) => {
        const n = document.createElement('input');
        n.type = 'text'; n.inputMode = 'decimal'; n.className = 'm7-calc-input';
        n.id = id; n.placeholder = ph; n.max = max; n.autocomplete = 'off';
        return n;
      };
      const mkUnit = (t) => { const s = document.createElement('span'); s.className = 'm7-calc-unit'; s.textContent = t; return s; };
      const hIn = mkInput('m7CalcH', '时', 23);
      const mIn = mkInput('m7CalcM', '分', 59);
      const calcBtn = document.createElement('button');
      calcBtn.className = 'btn'; calcBtn.id = 'm7CalcSubmit'; calcBtn.textContent = '✓ 确认';
      const row = document.createElement('div');
      row.className = 'm7-calc-input-row';
      row.append(hIn, mkUnit('时'), mIn, mkUnit('分'), calcBtn);
      const fb = document.createElement('div');
      fb.id = 'm7CalcFb'; fb.className = 'm7-calc-fb';
      el.append(qLine, row, fb);
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
          fb.textContent = `✓ 对！${q.answer.h} 时 ${q.answer.m} 分`;
          fb.className = 'm7-calc-fb ok';
          // ⭐ 新增
          ctx.data.activityAdd('m7', `时间推算`, `答对 ${q.answer.h}时${q.answer.m}分`);
        } else {
          hIn.classList.add('wrong');
          mIn.classList.add('wrong');
          fb.textContent = '❌ 再想想～ ' + q.hint;
          fb.className = 'm7-calc-fb error';
          setTimeout(() => {
            hIn.classList.remove('wrong');
            mIn.classList.remove('wrong');
          }, 800);
        }
      };
      _pageQ('m7CalcSubmit').addEventListener('click', submit);
      hIn.addEventListener('keydown', e => { if (e.key === 'Enter') mIn.focus(); });
      mIn.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      hIn.focus();
    } else {
      // 答案是分钟数
      // M3：同上，DOM 构建替代字符串模板
      el.textContent = '';
      const qLine = document.createElement('div');
      qLine.className = 'm7-calc-question';
      qLine.textContent = q.question;
      const inp = document.createElement('input');
      inp.type = 'text'; inp.inputMode = 'decimal'; inp.className = 'm7-calc-input';
      inp.id = 'm7CalcAns'; inp.placeholder = '?'; inp.max = 600; inp.autocomplete = 'off';
      const unitSpan = document.createElement('span');
      unitSpan.className = 'm7-calc-unit'; unitSpan.textContent = q.unit;
      const calcBtn = document.createElement('button');
      calcBtn.className = 'btn'; calcBtn.id = 'm7CalcSubmit'; calcBtn.textContent = '✓ 确认';
      const row = document.createElement('div');
      row.className = 'm7-calc-input-row';
      row.append(inp, unitSpan, calcBtn);
      const fb = document.createElement('div');
      fb.id = 'm7CalcFb'; fb.className = 'm7-calc-fb';
      el.append(qLine, row, fb);
      const submit = () => {
        const v = parseInt(inp.value, 10);
        if (isNaN(v)) {
          fb.textContent = '❌ 请输入一个数字';
          fb.className = 'm7-calc-fb error';
          return;
        }
        if (v === q.answer) {
          inp.classList.add('correct');
          fb.textContent = `✓ 对！答案是 ${q.answer} ${q.unit}`;
          fb.className = 'm7-calc-fb ok';
        } else {
          inp.classList.add('wrong');
          fb.textContent = '❌ 再想想～ ' + q.hint;
          fb.className = 'm7-calc-fb error';
          setTimeout(() => inp.classList.remove('wrong'), 800);
        }
      };
      _pageQ('m7CalcSubmit').addEventListener('click', submit);
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
      _setSmall(el, t.main, t.dec);
      return;
    }

    if (M7.mode === 'down') {
      const remain = M7.swTarget - M7.swElapsed;
      const t = m7FmtStopwatch(remain);
      _setSmall(el, t.main, t.dec);

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
    _setSmall(el, '00:00', '.0');
  }

  function m7SwFrame(now) {
    if (m7Stopped) return;   // ⭐ 卸载后立即停帧
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
      {
            const h = $('#swHint');
            if (h) {
              h.textContent = '';
              h.append('⏰ ');
              const b = document.createElement('b');
              b.style.color = '#dc2626';
              b.textContent = '时间到！';
              h.append(b, ' 点击「归零」可重新开始。');
            }
          }
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
    m7SwRafId = requestAnimationFrame(m7SwFrame);
  }

  function m7SwStart() {
    M7.swRunning = true;
    M7.swLastFrame = performance.now();
    M7.swLastTickSec = Math.floor(M7.swElapsed / 1000);
    $('#swToggle').textContent = '⏸ 暂停';
    $('#swHint').textContent = M7.mode === 'up'
      ? '⏱ 正在计时…每秒响一次滴答声。'
      : '⏳ 倒计时进行中…';
    m7SwRafId = requestAnimationFrame(m7SwFrame);
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
      $('#swHint').textContent = '💡 点击「开始」，秒表从 0 往上计时。';
    } else if (M7.mode === 'down') {
      $('#swHint').textContent = `💡 倒计时目标：${Math.floor(M7.swTarget/60000)} 分 ${Math.floor((M7.swTarget%60000)/1000)} 秒。`;
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
        _setSmall($('#swDisplay'), '00:00', '.0');
        $('#swDisplay').classList.remove('warn','danger');
        $('#swHint').textContent = '🕐 时钟模式下，秒针每秒走一格（上方可开启「滴答声」）。';
      } else if (M7.mode === 'up') {
        setup.style.display = 'none';
        m7UpdateSwDisplay();
        $('#swHint').textContent = '💡 点击「开始」，秒表从 0 往上计时。';
      } else {
        setup.style.display = 'inline-flex';
        const m = +$('#swMin').value || 0;
        const s = +$('#swSec').value || 0;
        M7.swTarget = (m * 60 + s) * 1000;
        if (M7.swTarget <= 0) M7.swTarget = 60000;
        m7UpdateSwDisplay();
        $('#swHint').textContent = `💡 倒计时目标：${m} 分 ${s} 秒，点击「开始」倒计时。`;
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

  // ⭐ S6：原来只绑 mousedown —— 触摸屏不产生鼠标事件，分针根本拖不动。
  //    改用 Pointer Events（鼠标/触摸/手写笔一套逻辑）；并给 canvas 加 touch-action:none，
  //    否则 Safari 会把这个手势当成页面滚动，拖动变成滚页。
  const m7CanvasEl = $('#m7canvas');
  if (m7CanvasEl) m7CanvasEl.style.touchAction = 'none';
  m7CanvasEl?.addEventListener('pointerdown', e => {
    e.preventDefault();
    m7Dragging = true;
    M7.minute = m7FromPoint(e.clientX, e.clientY);
    M7.second = 0;
    m7Draw(); m7UpdateDigital();
    // ⭐ 新增：拖分针
    ctx.data.recordActivity('m7', `拖分针到 ${M7.minute} 分`, '', 1000);
  });
  // ⭐ S7：window 监听必须命名并保存引用，否则每次进出 m7 都会多一份且永不解绑
  function onM7DragMove(e) {
    if (!m7Dragging) return;
    const newMin = m7FromPoint(e.clientX, e.clientY);
    if (M7.minute > 45 && newMin < 15) M7.hour = (M7.hour % 12) + 1;
    else if (M7.minute < 15 && newMin > 45) M7.hour = ((M7.hour - 2 + 12) % 12) + 1;
    M7.minute = newMin; M7.second = 0;
    m7Draw(); m7UpdateDigital();
  }
  function onM7DragEnd() { m7Dragging = false; }
  // ⭐ S6：pointermove/pointerup 让触摸与鼠标共用同一套拖拽逻辑
  window.addEventListener('pointermove', onM7DragMove);
  window.addEventListener('pointerup', onM7DragEnd);
  window.addEventListener('pointercancel', onM7DragEnd);

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

  _pageQ('m7NewCalcChallenge')?.addEventListener('click', m7NewCalcChallenge);
  const timer = setInterval(m7ClockTick, 1000);

  m7Draw(); 
  m7UpdateDigital(); 
  m7NewCalcChallenge();

  return () => {
    // ⭐ S7：停掉所有外部副作用，否则退出课页后仍在跑
    M7.swRunning = false;   // m7SwFrame 下一帧检测到后自然终止 rAF 链
    M7.running = false;
    m7Stopped = true;       // ⭐ 卸载标志：rAF/监听一律停火
    clearInterval(timer);
    if (m7SwRafId) cancelAnimationFrame(m7SwRafId);   // ⭐ 立即取消在途帧
    window.removeEventListener('pointermove', onM7DragMove);
    window.removeEventListener('pointerup', onM7DragEnd);
    if (m7AudioCtx) { try { m7AudioCtx.close(); } catch (e) {} m7AudioCtx = null; }
    container.innerHTML = '';
  };
}