/* m4.js 长度单位 —— 第一个真正的 Vue 组件

   无构建工具方案：用 vendor 进来的 vue.esm-browser.prod.js（含运行时编译器），
   所以可以直接写 template 字符串，不需要 .vue / 不需要 Vite。

   对外契约不变：export const meta + export default async mount(container, ctx)
   cleanup 就是 app.unmount()，壳层会 await Promise<cleanup>。

   setupLength() 被单独导出，是为了能在 Node 里对响应式逻辑做真实测试（不需要 DOM）。
*/
import { createApp, defineComponent, ref, computed } from '../../../js/vendor/vue.esm-browser.prod.js';
import { createJudge } from '../../../core/lesson/judge.js';
import { aji } from '../../../core/ui/aji.js';

export const meta = { title: '长度单位', icon: '📏' };

const UNITS = [
  { key: 'km', name: '千米', toM: 1000 },
  { key: 'm',  name: '米',   toM: 1 },
  { key: 'dm', name: '分米', toM: 0.1 },
  { key: 'cm', name: '厘米', toM: 0.01 },
  { key: 'mm', name: '毫米', toM: 0.001 },
];

function fmt(n) {
  if (!isFinite(n)) return '—';
  if (n === 0) return '0';
  return n.toFixed(6).replace(/\.?0+$/, '');
}

/** 响应式状态 + 纯逻辑（不碰 DOM，可单测） */
export function setupLength({ onActivity = () => {} } = {}) {
  const valInput = ref('3');
  const unitKey = ref('m');
  const quiz = ref(null);
  const answer = ref('');
  const fb = ref({ show: false, type: '', text: '' });

  const parsed = computed(() => {
    const s = String(valInput.value == null ? '' : valInput.value).trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  });

  const rows = computed(() => {
    if (parsed.value == null) return null;
    const u = UNITS.find((x) => x.key === unitKey.value) || UNITS[1];
    const inM = parsed.value * u.toM;
    return UNITS.map((x) => ({
      name: x.name,
      key: x.key,
      v: fmt(inM / x.toM),
      hl: x.key === unitKey.value,
    }));
  });

  const judge = createJudge({ answer: () => (quiz.value ? quiz.value.ans : null) });

  function newQuiz() {
    // 任取两个不同单位，双向都能出题（保留 M7 的修复）
    const i = Math.floor(Math.random() * UNITS.length);
    let j = Math.floor(Math.random() * (UNITS.length - 1));
    if (j >= i) j += 1;
    const from = UNITS[i];
    const to = UNITS[j];
    const val = 1 + Math.floor(Math.random() * 9);
    quiz.value = {
      from,
      to,
      val,
      ans: (val * from.toM) / to.toM,
      text: val + ' ' + from.name + ' = ( ? ) ' + to.name,
    };
    answer.value = '';
    fb.value = { show: false, type: '', text: '' };
  }

  function notify() {
    if (parsed.value == null) return;
    const u = UNITS.find((x) => x.key === unitKey.value);
    if (u) onActivity(parsed.value + ' ' + u.name, '');
  }

  function check() {
    if (!quiz.value) return;
    const r = judge.submit(answer.value);
    if (r.state === 'invalid') {
      fb.value = { show: true, type: 'error', text: '请先输入答案～' };
      return;
    }
    if (r.ok) {
      fb.value = {
        show: true, type: 'ok',
        text: '🎉 完全正确！' + quiz.value.val + ' ' + quiz.value.from.name + ' = ' + fmt(quiz.value.ans) + ' ' + quiz.value.to.name,
      };
      onActivity('小测：' + quiz.value.val + ' ' + quiz.value.from.name, '答对');
    } else {
      fb.value = {
        show: true, type: 'error',
        text: '再想想～ 提示：' + quiz.value.from.name + '换成' + quiz.value.to.name + '要 ' + fmt(quiz.value.from.toM / quiz.value.to.toM) + ' 倍',
      };
    }
  }

  return { units: UNITS, valInput, unitKey, quiz, answer, fb, parsed, rows, newQuiz, notify, check };
}

const M4View = defineComponent({
  name: 'M4Length',
  props: { onActivity: { type: Function, default: () => () => {} } },
  setup(props) {
    return setupLength({ onActivity: props.onActivity });
  },
  template: `
<div class="card">
  <div class="ladder">
    <div class="rung"><span class="unit-name">千米</span><span class="unit-sym">km</span></div>
    <div class="arrow-row">↓ × 1000 &nbsp;&nbsp; ↑ ÷ 1000</div>
    <div class="rung"><span class="unit-name">米</span><span class="unit-sym">m</span></div>
    <div class="arrow-row">↓ × 10 &nbsp;&nbsp; ↑ ÷ 10</div>
    <div class="rung"><span class="unit-name">分米</span><span class="unit-sym">dm</span></div>
    <div class="arrow-row">↓ × 10 &nbsp;&nbsp; ↑ ÷ 10</div>
    <div class="rung"><span class="unit-name">厘米</span><span class="unit-sym">cm</span></div>
    <div class="arrow-row">↓ × 10 &nbsp;&nbsp; ↑ ÷ 10</div>
    <div class="rung"><span class="unit-name">毫米</span><span class="unit-sym">mm</span></div>
  </div>

  <div class="converter">
    <input type="text" inputmode="decimal" v-model="valInput" @input="notify" aria-label="数值">
    <select v-model="unitKey" @change="notify" aria-label="单位">
      <option v-for="u in units" :key="u.key" :value="u.key">{{ u.name }}</option>
    </select>
    <span class="math-op" style="font-size:16px;color:var(--muted);">= ?</span>
  </div>

  <div class="result-list">
    <template v-if="!rows">
      <div class="result-item"><span class="k">请输入一个数字</span></div>
    </template>
    <template v-else>
      <div v-for="r in rows" :key="r.key" class="result-item" :class="{ hl: r.hl }">
        <span class="k">{{ r.name }} {{ r.key }}</span><span class="v">{{ r.v }}</span>
      </div>
    </template>
  </div>

  <div class="quiz-box">
    <div class="quiz-q">{{ quiz ? quiz.text : '点击下方按钮开始小测' }}</div>
    <div class="quiz-row">
      <button class="btn" @click="newQuiz">🎲 出题</button>
      <input type="text" inputmode="decimal" v-model="answer" placeholder="答案" @keydown.enter="check">
      <button class="btn-secondary" @click="check">✔ 检查</button>
    </div>
    <div class="feedback" :class="fb.type" :style="{ marginTop: '14px', display: fb.show ? 'block' : 'none' }">{{ fb.text }}</div>
  </div>
</div>
  `,
});

export default async function mount(container, ctx) {
  container.innerHTML = '';

  // ---------- Aji 全站陪学助教（模块只报数据，不画 UI） ----------
  // m4 的状态在 Vue 组件内部（setupLength），这里通过 DOM 只读取当前输入值。
  aji.registerModuleContext({
    moduleId: 'm4',
    topic: '长度单位',
    knowledgeCards: [
      { title: '单位阶梯', content: '千米 > 米 > 分米 > 厘米 > 毫米，<b>相邻两个单位之间是 10 倍</b>（米到千米是 1000）。' },
      { title: '大化小乘', content: '大单位换小单位要<b>乘</b>进率：3 米 = 3 × 100 = 300 厘米。' },
      { title: '小化大除', content: '小单位换大单位要<b>除</b>进率：500 厘米 = 500 ÷ 100 = 5 米。' },
      { title: '别忘了单位', content: '换算完一定要把单位写上，再回头看看方向有没有换反。' },
    ],
    problemText: () => {
      const v = container.querySelector('.converter input');
      const u = container.querySelector('.converter select');
      return (v && v.value) ? `${v.value} ${(u && u.selectedOptions[0] && u.selectedOptions[0].textContent) || ''} 换算成其他单位` : '';
    },
    progress: () => {
      const q = container.querySelector('.quiz-q');
      const a = container.querySelector('.quiz-row input');
      if (!q) return '（尚未开始小测）';
      return `小测题：${q.textContent.trim()}；已填答案：${(a && a.value) || '（还未填写）'}`;
    },
  });

  const app = createApp(M4View, {
    onActivity: (label, detail) => {
      if (ctx && ctx.data && typeof ctx.data.recordActivity === 'function') {
        ctx.data.recordActivity('m4', label, detail);
      }
    },
  });

  app.mount(container);

  return () => {
    try { app.unmount(); } catch (e) { console.warn('[m4] unmount 失败', e); }
    container.innerHTML = '';
  };
}
