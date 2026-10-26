/* m4.js 长度单位 */
export const meta = { title: '长度单位', icon: '📏' };

export default async function mount(container, ctx) {
  const tpl = document.getElementById('tpl-m4');
  if (!tpl) return;
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  const $ = sel => container.querySelector(sel);

  const UNITS = [
    { key:'km', name:'千米', toM:1000 }, { key:'m', name:'米', toM:1 },
    { key:'dm', name:'分米', toM:0.1 }, { key:'cm', name:'厘米', toM:0.01 },
    { key:'mm', name:'毫米', toM:0.001 }
  ];
  let m4Quiz = null;

  function fmt(n) { if (!isFinite(n)) return '—'; if (n === 0) return '0'; return n.toFixed(6).replace(/\.?0+$/, ''); }
  
  // TODO: 拷贝 main.js 里的 m4Update 和 m4NewQuiz 函数到这里
  // m4Update 里的 recordActivity 改为 ctx.data.activityAdd

  function m4Update(isUserAction = false) {
    const val = parseFloat($('#m4val').value), unit = $('#m4unit').value;
    const wrap = $('#m4results');
    if (isNaN(val)) { wrap.innerHTML = '<div class="result-item"><span class="k">请输入一个数字</span></div>'; return; }
    const u = UNITS.find(x => x.key === unit);
    const inMeters = val * u.toM;
    wrap.innerHTML = UNITS.map(x => {
      const v = inMeters / x.toM;
      const hl = x.key === unit ? ' hl' : '';
      return `<div class="result-item${hl}"><span class="k">${x.name} ${x.key}</span><span class="v">${fmt(v)}</span></div>`;
    }).join('');
    if (isUserAction) {
      // ⭐ 新增：体验记录（防抖 2 秒）
      ctx.data.recordActivity('m4', `${val} ${u.name}`, '');
    }
  }

  function m4NewQuiz() {
    const i = Math.floor(Math.random() * (UNITS.length - 1));
    const j = i + 1 + Math.floor(Math.random() * (UNITS.length - i - 1));
    const from = UNITS[i], to = UNITS[j];
    const val = 1 + Math.floor(Math.random() * 9);
    const ans = (val * from.toM) / to.toM;
    m4Quiz = { from, to, val, ans };
    $('#m4quizq').innerHTML = `${val} ${from.name} = ( <b>?</b> ) ${to.name}`;
    $('#m4answer').value = '';
    $('#m4fb').style.display = 'none';
  }

  $('#m4val')?.addEventListener('input', m4Update);
  $('#m4unit')?.addEventListener('change', m4Update);
  $('#m4newq')?.addEventListener('click', m4NewQuiz);
  $('#m4check')?.addEventListener('click', () => {
    if (!m4Quiz) return;
    const user = parseFloat($('#m4answer').value);
    const fb = $('#m4fb'); fb.style.display = 'block';
    if (isNaN(user)) { fb.className = 'feedback error'; fb.textContent = '请先输入答案～'; return; }
    if (Math.abs(user - m4Quiz.ans) < 1e-9) {
      fb.className = 'feedback ok';
      fb.textContent = `🎉 完全正确！${m4Quiz.val} ${m4Quiz.from.name} = ${fmt(m4Quiz.ans)} ${m4Quiz.to.name}`;
      ctx.data.recordActivity('m4', `小测：${m4Quiz.val} ${m4Quiz.from.name}`, '答对');
    } else {
      fb.className = 'feedback error';
      fb.textContent = `再想想～ 提示：${m4Quiz.from.name}换成${m4Quiz.to.name}要 ${fmt(m4Quiz.from.toM / m4Quiz.to.toM)} 倍`;
    }
  });
  $('#m4answer')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('#m4check').click(); });

  m4Update();
  return () => { container.innerHTML = ''; };
}