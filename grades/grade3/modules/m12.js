/* m12.js 吨 */
import { getTemplate } from '../../../core/ui/template.js';
import { aji } from '../../../core/ui/aji.js';

export const meta = { title: '质量单位', icon: '⚖️' };

export default async function mount(container, ctx) {
  const tpl = getTemplate('tpl-m12');
  if (!tpl) return;
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  // ---------- Aji 全站陪学助教（模块只报数据，不画 UI） ----------
  aji.registerModuleContext({
    moduleId: 'm12',
    topic: '质量单位',
    knowledgeCards: [
      { title: '单位阶梯', content: '吨 > 千克 > 克，<b>相邻两个单位之间是 1000 倍</b>。' },
      { title: '大化小乘', content: '大单位换小单位要<b>乘 1000</b>：2 千克 = 2000 克。' },
      { title: '小化大除', content: '小单位换大单位要<b>除 1000</b>：3000 千克 = 3 吨。' },
      { title: '先估一估', content: '一个苹果约 200 克，一袋米约 25 千克——先估再算，不容易差得离谱。' },
    ],
    problemText: () => {
      const v = $('#m12val'), u = $('#m12unit');
      if (!v || !v.value) return '';
      const label = u && u.selectedOptions[0] ? u.selectedOptions[0].textContent : '';
      return `${v.value} ${label} 换算成其他质量单位是多少？`;
    },
    progress: () => {
      const box = $('#m12results');
      return box ? `换算结果：${box.textContent.replace(/\s+/g, ' ').trim()}` : '（尚未开始换算）';
    },
  });

  const $ = sel => container.querySelector(sel);

  const MASS_UNITS = [
    { key:'t', name:'吨', toG:1000000 }, { key:'kg', name:'千克', toG:1000 }, { key:'g', name:'克', toG:1 }
  ];
  function fmt(n) { if (!isFinite(n)) return '—'; if (n === 0) return '0'; return n.toFixed(6).replace(/\.?0+$/, ''); }

  function m12Update(isUserAction = false) {
    // ⭐ 修复：parseFloat('12abc') → 12，会静默接受半截输入；Number('') 又是 0。两级都要挡。
    const valRaw = String($('#m12val').value).trim();
    const val = valRaw === '' ? NaN : Number(valRaw);
    const unit = $('#m12unit').value;
    const wrap = $('#m12results');
    if (!Number.isFinite(val)) { wrap.innerHTML = '<div class="result-item"><span class="k">请输入一个数字</span></div>'; return; }
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