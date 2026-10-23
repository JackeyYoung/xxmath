/* m5.js 面积与周长 */
export const meta = { title: '面积与周长', icon: '📐' };

export default async function mount(container, ctx) {
  const tpl = document.getElementById('tpl-m5');
  if (!tpl) return;
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  const $ = sel => container.querySelector(sel);

  let m5RecordIdx = 0;
  const M5_CHAL_TYPES = [
    {
      key: 'findW',
      label: '已知面积和长，求宽',
      gen: () => {
        const w = 2 + Math.floor(Math.random() * 8);   // 2~9
        const h = 2 + Math.floor(Math.random() * 8);
        const area = w * h;
        return {
          question: `长方形花坛，面积是 <b>${area}</b> 平方米，长是 <b>${w}</b> 米，宽是多少米？`,
          answer: h,
          unit: '米',
          hint: `宽 = 面积 ÷ 长 = ${area} ÷ ${w} = ?`,
        };
      }
    },
    {
      key: 'findH',
      label: '已知面积和宽，求长',
      gen: () => {
        const w = 2 + Math.floor(Math.random() * 8);
        const h = 2 + Math.floor(Math.random() * 8);
        const area = w * h;
        return {
          question: `长方形花坛，面积是 <b>${area}</b> 平方米，宽是 <b>${h}</b> 米，长是多少米？`,
          answer: w,
          unit: '米',
          hint: `长 = 面积 ÷ 宽 = ${area} ÷ ${h} = ?`,
        };
      }
    },
    {
      key: 'perimToLW',
      label: '已知周长，反推长宽',
      gen: () => {
        const w = 2 + Math.floor(Math.random() * 8);
        const h = 2 + Math.floor(Math.random() * 8);
        const perim = (w + h) * 2;
        return {
          question: `长方形花坛，周长是 <b>${perim}</b> 米，长和宽之和是多少米？`,
          answer: w + h,
          unit: '米',
          hint: `长 + 宽 = 周长 ÷ 2 = ${perim} ÷ 2 = ?`,
        };
      }
    },
    {
      key: 'squareArea',
      label: '已知正方形面积，求边长',
      gen: () => {
        const side = 2 + Math.floor(Math.random() * 8);   // 2~9
        const area = side * side;
        return {
          question: `正方形花坛，面积是 <b>${area}</b> 平方米，边长是多少米？`,
          answer: side,
          unit: '米',
          hint: `边长 × 边长 = ${area}，想一想几乘几等于 ${area}？`,
        };
      }
    },
    {
      key: 'squarePerim',
      label: '已知正方形周长，求边长',
      gen: () => {
        const side = 2 + Math.floor(Math.random() * 8);
        const perim = side * 4;
        return {
          question: `正方形花坛，周长是 <b>${perim}</b> 米，边长是多少米？`,
          answer: side,
          unit: '米',
          hint: `边长 = 周长 ÷ 4 = ${perim} ÷ 4 = ?`,
        };
      }
    },
    {
      key: 'areaOptions',
      label: '给定面积，选出可能的长宽（选择）',
      gen: () => {
        // 随机一个面积（完全平方数或其他）
        const targetArea = [12, 16, 20, 24, 36][Math.floor(Math.random() * 5)];
        // 找出所有整数因子对
        const pairs = [];
        for (let w = 1; w <= targetArea; w++) {
          if (targetArea % w === 0 && w <= targetArea / w) {
            pairs.push([w, targetArea / w]);
          }
        }
        // 随机选一对作为正确答案
        const [cw, ch] = pairs[Math.floor(Math.random() * pairs.length)];
        // 生成 3 个错误选项（和不为目标面积，或乘积不为目标面积）
        const options = [[cw, ch]];
        while (options.length < 4) {
          const ow = 1 + Math.floor(Math.random() * 12);
          const oh = 1 + Math.floor(Math.random() * 12);
          if (ow * oh !== targetArea && !options.some(([a,b]) => a===ow && b===oh)) {
            options.push([ow, oh]);
          }
        }
        // 打乱
        options.sort(() => Math.random() - 0.5);

        return {
          type: 'choice',
          question: `面积是 <b>${targetArea}</b> 平方米的长方形，可能是下列哪一组长和宽？`,
          options: options.map(([w, h]) => `${w} × ${h}`),
          correctIndex: options.findIndex(([w, h]) => w === cw && h === ch),
          hint: `长方形的面积 = 长 × 宽，哪一组长 × 宽 = ${targetArea}？`,
          answerText: `${cw} 米 × ${ch} 米`,
        };
      }
    }
  ];

  // TODO: 复制 main.js 里的 m5Render, m5NewChallenge 函数过来
  // 把 recordActivity 改为 ctx.data.activityAdd

  function m5Render() {
    const w = +$('#m5w').value, h = +$('#m5h').value;
    $('#m5wval').textContent = w; $('#m5hval').textContent = h;
    let html = '';
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
      const inRect = r < h && c < w;
      const isEdge = inRect && (r === 0 || c === 0 || r === h-1 || c === w-1);
      html += `<div class="cell${inRect ? ' on' : ''}${isEdge ? ' edge' : ''}"></div>`;
    }
    $('#m5grid').innerHTML = html;
    $('#m5area').textContent = w * h;
    $('#m5perim').textContent = (w + h) * 2;

    // ⭐ 新增：拖滑块也算体验
    ctx.data.activityAdd('m5', `长方形 ${w}×${h}`, `面积 ${w*h}`);
  }

  function m5NewChallenge() {
    const el = document.getElementById('m5Challenge');
    if (!el) return;

    const type = M5_CHAL_TYPES[Math.floor(Math.random() * M5_CHAL_TYPES.length)];
    const q = type.gen();

    if (q.type === 'choice') {
      el.innerHTML = `
        <div class="m5-chal-question">${q.question}</div>
        <div class="m5-chal-options">
          ${q.options.map((opt, i) =>
            `<button class="m5-chal-opt" data-idx="${i}">${opt}</button>`
          ).join('')}
        </div>
        <div class="m5-chal-fb" id="m5ChalFb"></div>
      `;
      const fb = document.getElementById('m5ChalFb');
      el.querySelectorAll('.m5-chal-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = +btn.dataset.idx;
          el.querySelectorAll('.m5-chal-opt').forEach(b => b.classList.remove('correct', 'wrong'));
          if (idx === q.correctIndex) {
            btn.classList.add('correct');
            fb.innerHTML = `✓ 对！${q.answerText}，${q.answerText.split(' × ').map(s => parseInt(s)).reduce((a,b) => a * b)} 平方米`;
            fb.className = 'm5-chal-fb ok';
          } else {
            btn.classList.add('wrong');
            fb.innerHTML = '❌ 再想想～ ' + q.hint;
            fb.className = 'm5-chal-fb error';
            setTimeout(() => btn.classList.remove('wrong'), 800);
          }
        });
      });
    } else {
      el.innerHTML = `
        <div class="m5-chal-question">${q.question}</div>
        <div class="m5-chal-input-row">
          <input type="text" inputmode="decimal" class="m5-chal-input" id="m5ChalInput" placeholder="?" autocomplete="off">
          <span style="font-size:18px;font-weight:700;color:#64748b;">${q.unit}</span>
          <button class="btn" id="m5ChalSubmit">✓ 确认</button>
        </div>
        <div class="m5-chal-fb" id="m5ChalFb"></div>
      `;
      const input = document.getElementById('m5ChalInput');
      const fb = document.getElementById('m5ChalFb');
      const submit = () => {
        const val = parseFloat(input.value);
        if (isNaN(val)) {
          fb.textContent = '❌ 请输入一个数字';
          fb.className = 'm5-chal-fb error';
          return;
        }
        if (Math.abs(val - q.answer) < 0.001) {
          input.classList.add('correct');
          fb.innerHTML = `✓ 对！答案是 ${q.answer} ${q.unit}`;
          fb.className = 'm5-chal-fb ok';
          // ⭐ 新增
          ctx.data.activityAdd('m5', `逆向挑战`, `答对 ${q.answer} ${q.unit}`, 0);
        } else {
          input.classList.add('wrong');
          fb.innerHTML = '❌ 再想想～ ' + q.hint;
          fb.className = 'm5-chal-fb error';
          setTimeout(() => input.classList.remove('wrong'), 800);
        }
      };
      document.getElementById('m5ChalSubmit').addEventListener('click', submit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      input.focus();
    }
  }


  $('#m5NewChallenge')?.addEventListener('click', m5NewChallenge);
  $('#m5w')?.addEventListener('input', m5Render);
  $('#m5h')?.addEventListener('input', m5Render);
  $('#m5record')?.addEventListener('click', () => {
    const w = +$('#m5w').value, h = +$('#m5h').value;
    m5RecordIdx++;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m5RecordIdx}</td><td>${w}</td><td>${h}</td><td>${w} × ${h} = <b style="color:#2563eb">${w*h}</b></td><td>(${w} + ${h}) × 2 = <b style="color:#d97706">${(w+h)*2}</b></td>`;
    $('#m5table tbody').appendChild(tr);
    ctx.data.activityAdd('m5', `长方形 ${w}×${h}`, `面积 ${w*h}`);
  });
  $('#m5cleartable')?.addEventListener('click', () => {
    $('#m5table tbody').innerHTML = '';
    m5RecordIdx = 0;
  });

  m5Render();
  m5NewChallenge();
  return () => { container.innerHTML = ''; };
}