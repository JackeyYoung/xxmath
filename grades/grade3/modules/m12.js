/* m12.js 吨 */
export const meta = { title: '质量单位', icon: '⚖️' };

export default async function mount(container, ctx) {
  const tpl = document.getElementById('tpl-m12');
  if (!tpl) return;
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  const $ = sel => container.querySelector(sel);

  const MASS_UNITS = [
    { key:'t', name:'吨', toG:1000000 }, { key:'kg', name:'千克', toG:1000 }, { key:'g', name:'克', toG:1 }
  ];
  function fmt(n) { if (!isFinite(n)) return '—'; if (n === 0) return '0'; return n.toFixed(6).replace(/\.?0+$/, ''); }

  // TODO: 拷贝 main.js 中的 m12Update
  // 注意 recordActivity 改为 ctx.data.recordActivity
  function m12Update(isUserAction = false) {
    const val = parseFloat($('#m12val').value), unit = $('#m12unit').value;
    const wrap = $('#m12results');
    if (isNaN(val)) { wrap.innerHTML = '<div class="result-item"><span class="k">请输入一个数字</span></div>'; return; }
    const u = MASS_UNITS.find(x => x.key === unit);
    const inG = val * u.toG;
    if (isUserAction) {
      // M12：换算变化
      ctx.data.recordActivity('m12', `${val} ${unit}`, '');
    }
    wrap.innerHTML = MASS_UNITS.map(x => {
      const v = inG / x.toG;
      const hl = x.key === unit ? ' hl' : '';
      return `<div class="result-item${hl}"><span class="k">${x.name} ${x.key}</span><span class="v">${fmt(v)}</span></div>`;
    }).join('');
  }

  $('#m12val')?.addEventListener('input', () => m12Update(true));
  $('#m12unit')?.addEventListener('change', () => m12Update(true));
  m12Update(); // 初始化
  
  return () => { container.innerHTML = ''; };
}