/* S3：优先在 #page-lesson 内查找（本模块就挂在这里），找不到退回全局。 */
const _pageQ = (id) => {
  const root = document.getElementById('page-lesson');
  const el = root && typeof root.querySelector === 'function' ? root.querySelector('#' + id) : null;
  return el || document.getElementById(id);
};

/* m5.js 面积与周长 */
import { getTemplate } from '../../../core/ui/template.js';
import { aji } from '../../../core/ui/aji.js';

export const meta = { title: '面积与周长', icon: '📐' };

export default async function mount(container, ctx) {
  const tpl = getTemplate('tpl-m5');
  if (!tpl) return;
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  // ---------- Aji 全站陪学助教（模块只报数据，不画 UI） ----------
  aji.registerModuleContext({
    moduleId: 'm5',
    topic: '面积与周长',
    knowledgeCards: [
      { title: '面积是什么', content: '面积是图形<b>占了多大一块地方</b>。用方格铺一铺，数一数有多少格。' },
      { title: '长方形面积', content: '长方形面积 = <b>长 × 宽</b>：长 5 宽 3 → 5 × 3 = 15 平方厘米。' },
      { title: '周长和面积别混', content: '周长是<b>外面一圈的总长</b>（长 + 宽）× 2；面积是<b>里面的大小</b>，长 × 宽。两个不一样！' },
      { title: '别忘了平方', content: '面积单位要带「平方」：平方厘米、平方米。' },
    ],
    problemText: () => {
      const w = $('#m5w'), h = $('#m5h');
      return (w && h) ? `长 ${w.value}、宽 ${h.value} 的长方形：面积是多少？周长是多少？` : '';
    },
    progress: () => {
      const a = $('#m5area'), p = $('#m5perim');
      return `已答对 ${m5RecordIdx} 题${a ? `；当前图形面积 ${a.textContent} 平方米、周长 ${p.textContent} 米` : ''}`;
    },
  });

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

  function m5Render(isUserAction = false) {
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

    if (isUserAction) {
      // ⭐ 新增：拖滑块也算体验
      ctx.data.recordActivity('m5', `长方形 ${w}×${h}`, `面积 ${w*h}`);
    }
  }

  function m5NewChallenge() {
    const el = _pageQ('m5Challenge');
    if (!el) return;

    const type = M5_CHAL_TYPES[Math.floor(Math.random() * M5_CHAL_TYPES.length)];
    const q = type.gen();

    if (q.type === 'choice') {
      // M3：DOM 构建（question / options 走 textContent，不进 HTML 解析器）
      el.textContent = '';
      const qLine = document.createElement('div');
      qLine.className = 'm5-chal-question';
      qLine.textContent = q.question;
      const optsBox = document.createElement('div');
      optsBox.className = 'm5-chal-options';
      q.options.forEach((opt, i) => {
        const b = document.createElement('button');
        b.className = 'm5-chal-opt';
        b.dataset.idx = String(i);
        b.textContent = opt;
        optsBox.append(b);
      });
      const fbBox = document.createElement('div');
      fbBox.className = 'm5-chal-fb';
      fbBox.id = 'm5ChalFb';
      el.append(qLine, optsBox, fbBox);
      const fb = fbBox;
      el.querySelectorAll('.m5-chal-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = +btn.dataset.idx;
          el.querySelectorAll('.m5-chal-opt').forEach(b => b.classList.remove('correct', 'wrong'));
          if (idx === q.correctIndex) {
            btn.classList.add('correct');
            fb.textContent = `✓ 对！${q.answerText}，${q.answerText.split(' × ').map(s => parseInt(s)).reduce((a,b) => a * b)} 平方米`;
            fb.className = 'm5-chal-fb ok';
          } else {
            btn.classList.add('wrong');
            fb.textContent = '❌ 再想想～ ' + q.hint;
            fb.className = 'm5-chal-fb error';
            setTimeout(() => btn.classList.remove('wrong'), 800);
          }
        });
      });
    } else {
      // M3：DOM 构建（question / unit 走 textContent）
      el.textContent = '';
      const qLine = document.createElement('div');
      qLine.className = 'm5-chal-question';
      qLine.textContent = q.question;
      const input = document.createElement('input');
      input.type = 'text'; input.inputMode = 'decimal'; input.className = 'm5-chal-input';
      input.id = 'm5ChalInput'; input.placeholder = '?'; input.autocomplete = 'off';
      const unitSpan = document.createElement('span');
      unitSpan.style.cssText = 'font-size:18px;font-weight:700;color:var(--muted);';
      unitSpan.textContent = q.unit;
      const submitBtn = document.createElement('button');
      submitBtn.className = 'btn'; submitBtn.id = 'm5ChalSubmit'; submitBtn.textContent = '✓ 确认';
      const inputRow = document.createElement('div');
      inputRow.className = 'm5-chal-input-row';
      inputRow.append(input, unitSpan, submitBtn);
      const fb = document.createElement('div');
      fb.className = 'm5-chal-fb'; fb.id = 'm5ChalFb';
      el.append(qLine, inputRow, fb);
      const submit = () => {
        const val = parseFloat(input.value);
        if (isNaN(val)) {
          fb.textContent = '❌ 请输入一个数字';
          fb.className = 'm5-chal-fb error';
          return;
        }
        if (Math.abs(val - q.answer) < 0.001) {
          input.classList.add('correct');
          fb.textContent = `✓ 对！答案是 ${q.answer} ${q.unit}`;
          fb.className = 'm5-chal-fb ok';
          // ⭐ 新增
          ctx.data.recordActivity('m5', `逆向挑战`, `答对 ${q.answer} ${q.unit}`, 0);
        } else {
          input.classList.add('wrong');
          fb.textContent = '❌ 再想想～ ' + q.hint;
          fb.className = 'm5-chal-fb error';
          setTimeout(() => input.classList.remove('wrong'), 800);
        }
      };
      _pageQ('m5ChalSubmit').addEventListener('click', submit);
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
    // M3：DOM 构建表格行（面积/周长两列里的 <b> 也建节点）
    const mkTd = (text) => { const td = document.createElement('td'); td.textContent = String(text); return td; };
    const mkStrongTd = (prefix, strongText, suffix, color) => {
      const td = document.createElement('td');
      td.append(prefix);
      const b = document.createElement('b');
      b.style.color = color;
      b.textContent = String(strongText);
      td.append(b, suffix);
      return td;
    };
    tr.append(
      mkTd(m5RecordIdx),
      mkTd(w),
      mkTd(h),
      mkStrongTd(w + ' × ' + h + ' = ', w * h, '', '#2563eb'),
      mkStrongTd('(' + w + ' + ' + h + ') × 2 = ', (w + h) * 2, '', '#d97706'),
    );
    $('#m5table tbody').appendChild(tr);
    ctx.data.recordActivity('m5', `长方形 ${w}×${h}`, `面积 ${w*h}`);
  });
  $('#m5cleartable')?.addEventListener('click', () => {
    $('#m5table tbody').innerHTML = '';
    m5RecordIdx = 0;
  });

  m5Render();
  m5NewChallenge();
  return () => { container.innerHTML = ''; };
}