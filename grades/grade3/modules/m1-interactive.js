/* grades/grade3/modules/m1-interactive.js —— m1「连击变形」v3

   v3 解决的体验缺陷：
   ✗ v1 因果丢失：合并后连线消失，看不出"36 是哪来的"
   ✗ v2 焦点涣散：多行一样重，不知道现在该操作哪行

   v3 规范：
   ① 视觉层级  当前行最大最亮 / 历史行整体压暗 / 被消耗段：透明度 0.3 + 删除线 + 虚线框
   ② 因果锚点  连线**永久保留**：两条斜线汇聚 + 一条垂直引导线（漏斗形），从 12/3 连到 36 头顶
              优先用 MorphSVG 让活动线「变成」引导线；没有插件则交叉淡出（视觉等价）
   ③ 时间轴    画线 0.3s → 停顿 0.1s → 碰撞 0.3s(back.out) → 原式变暗 → 新行滑入 + 36 弹跳 → 线 morph
   ④ 操作权    只有最后一行可点；新行成为唯一可操作行

   回滚：m1.js 里 `?m1i` 开关删掉即回原交互。

   【判分链完整性】三条都不能断：
   1. 答错 → emitUI('WRONG', { moduleId: 'm1' })
   2. 全部算完 → ctx.data.historyAdd({...})
   3. 全部算完 → ctx.data.masteryRecord(original, true)
   不发 CORRECT（壳层挂在 historyAdd 上，M10）。
*/

import { defineComponent, shallowReactive, ref, nextTick, onMounted, onUnmounted } from '../../../js/vendor/vue.esm-browser.prod.js';
import { loadGsap } from '../../../js/vendor/gsap-esm.js';
import { GOLDEN, EASE, DUR } from '../../../core/ui/golden-motion.js';
import { emitUI } from '../../../core/ui/bus-ui.js';
import { getEncouragement } from '../../../core/ui/encourage.js';

let gsap = null;
let hasMorph = false;

/* ============================================================
   一、纯函数层
   ============================================================ */

const OPS = { '×': (a, b) => a * b, '÷': (a, b) => a / b, '+': (a, b) => a + b, '-': (a, b) => a - b };
const MUL_DIV = new Set(['×', '÷']);

export function fmtNum(n) {
  if (!Number.isFinite(n)) return '—';
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(4)));
}

export function canOperate(tokens, opIndex) {
  const op = tokens[opIndex];
  if (!op || op.type !== 'op') return false;
  const hasMD = tokens.some((t) => t.type === 'op' && MUL_DIV.has(t.val) && !t.evaluated);
  const hasAS = tokens.some((t) => t.type === 'op' && (t.val === '+' || t.val === '-') && !t.evaluated);
  if (!(hasMD && hasAS)) return true;
  return MUL_DIV.has(op.val);
}

/** 合并不改入参；返回新行 Token（结果复用左 id）+ 表达式文本 */
export function computeStep(tokens, opIndex) {
  const left = tokens[opIndex - 1];
  const op = tokens[opIndex];
  const right = tokens[opIndex + 1];
  if (!left || !op || !right) return { nextTokens: null, result: null, exprText: '', merged: false };
  const fn = OPS[op.val];
  if (!fn) return { nextTokens: null, result: null, exprText: '', merged: false };

  const value = fn(left.val, right.val);
  const result = { id: left.id, type: 'num', val: value, evaluated: false, fromResult: true };
  const nextTokens = [...tokens.slice(0, opIndex - 1), result, ...tokens.slice(opIndex + 2)]
    .map((t) => ({ ...t, evaluated: false }));

  return { nextTokens, result, exprText: `${fmtNum(left.val)} ${op.val} ${fmtNum(right.val)}`, merged: true };
}

export function tokensToText(tokens) {
  return tokens.map((t) => (t.type === 'num' ? fmtNum(t.val) : t.val)).join(' ');
}

/**
 * 漏斗形因果线（**全曲线，无折线**）：两条三次贝塞尔从被消耗数字底部汇聚，
 * 再用一条 S 形曲线落到结果头顶。用 C 指令 + 垂直切线起笔/收笔，避免折角。
 */
export function funnelPath({ lx, rx, yTop, yJoin, yEnd, tx }) {
  const midX = (lx + rx) / 2;
  const tX = (tx == null ? midX : tx);          // 落点对准下方结果的中心
  const k1 = Math.max(6, (yJoin - yTop) * 0.6);
  const k2 = Math.max(6, (yEnd - yJoin) * 0.5);
  const a = 4.5;                                 // 箭头半宽

  // 两条贝塞尔汇聚 + 一条垂直下落的 S 形线
  const body = `M ${lx} ${yTop} C ${lx} ${yTop + k1}, ${midX} ${yJoin - k1}, ${midX} ${yJoin} `
             + `M ${rx} ${yTop} C ${rx} ${yTop + k1}, ${midX} ${yJoin - k1}, ${midX} ${yJoin} `
             + `M ${midX} ${yJoin} C ${midX} ${yJoin + k2}, ${tX} ${yEnd - k2}, ${tX} ${yEnd}`;

  // 极细的箭头（两条短线组成的箭头尖），让"指向 36"闭环
  const head = ` M ${tX - a} ${yEnd - a * 1.7} L ${tX} ${yEnd} L ${tX + a} ${yEnd - a * 1.7}`;

  return body + head;
}

/* ============================================================
   二、状态
   ============================================================ */

const CELL_W = 68;
const CELL_H = 72;
const GAP = 10;

function makeTokens(spec) {
  return spec.map((t, i) => (t.op
    ? { id: 'o' + i, type: 'op', val: t.op, evaluated: false }
    : { id: 'n' + i, type: 'num', val: t.val, evaluated: false }));
}

const DEFAULT_EXPR = [{ val: 12 }, { op: '×' }, { val: 3 }, { op: '+' }, { val: 15 }];

const store = shallowReactive({
  rows: [],
  links: [],       // 因果锚点：{ id, from:{row,cells}, to:{row,tokenId}, d }
  steps: [],
  original: '',
  pendingOpIdx: -1,
  inputValue: '',
  feedback: { text: '', kind: '' },
  done: false,
  comboCount: 0,
  animating: false,
});

/* ============================================================
   三、组件
   ============================================================ */

const M1Interactive = defineComponent({
  name: 'M1InteractiveV3',
  setup() {
    const outer = ref(null);
    const path = ref(null);
    const drop = ref(null);
    const inputEl = ref(null);

    const rowElAt = (ri) => (outer.value ? outer.value.querySelector(`.m1i-row[data-row="${ri}"]`) : null);
    const cellAt = (ri, i) => (outer.value
      ? outer.value.querySelector(`.m1i-cell[data-row="${ri}"][data-cell="${i}"]`) : null);

    /** 虚线框：被消耗区间的首/中/尾 */
    function consumedClass(row, i) {
      const t = row.tokens[i];
      if (!t || !t.evaluated) return '';
      const prev = row.tokens[i - 1];
      const next = row.tokens[i + 1];
      const prevOn = prev && prev.evaluated;
      const nextOn = next && next.evaluated;
      if (!prevOn && !nextOn) return 'consumed-single';
      if (!prevOn) return 'consumed-start';
      if (!nextOn) return 'consumed-end';
      return 'consumed-mid';
    }

    /** 重算所有历史连线的 d（新行插入后上方布局会变，不能缓存 d） */
    function measureLinks() {
      if (!outer.value) return;
      const box = outer.value.getBoundingClientRect();
      for (const lk of store.links) {
        const lEl = cellAt(lk.from.row, lk.from.cells[0]);
        const rEl = cellAt(lk.from.row, lk.from.cells[2]);
        const tEl = outer.value.querySelector(`.m1i-cell[data-row="${lk.to.row}"][data-id="${lk.to.tokenId}"]`);
        if (!lEl || !rEl || !tEl) { lk.d = ''; continue; }
        const L = lEl.getBoundingClientRect();
        const R = rEl.getBoundingClientRect();
        const T = tEl.getBoundingClientRect();
        lk.d = funnelPath({
          lx: L.left + L.width / 2 - box.left,
          rx: R.left + R.width / 2 - box.left,
          tx: T.left + T.width / 2 - box.left,
          yTop: L.bottom - box.top,
          yJoin: L.bottom - box.top + 13,
          yEnd: T.top - box.top - 4,
        });
      }
    }

    function setFeedback(text, kind = '') { store.feedback = { text, kind }; }

    /**
     * 因果线统一过渡：圆弧段与漏斗段**同时**由亮黄转灰，视觉上是一条线。
     * 漏斗先以黄色"长出来"，再和圆弧一起变暗——避免"起笔黄、漏斗灰"的断裂。
     */
    function transitionLinkToHistory(arcP, dropP, guideD, onDone) {
      dropP.setAttribute('d', guideD);
      const dlen = dropP.getTotalLength ? dropP.getTotalLength() : 80;
      gsap.set(dropP, { strokeDasharray: dlen, strokeDashoffset: dlen, opacity: 1, stroke: GOLDEN.lineFocus, strokeWidth: 4 });

      const tl = gsap.timeline({ onComplete: onDone });
      // 漏斗在黄色状态下生长
      tl.to(dropP, { strokeDashoffset: 0, duration: 0.26, ease: 'power2.out' });
      // 整条线一起转灰变细（同一 tween 控两个元素 → 不会分叉）
      tl.to([arcP, dropP], {
        duration: DUR.land, ease: 'power2.inOut',
        stroke: GOLDEN.lineHistory, strokeWidth: 2, opacity: 0.75,   /* 与历史文字同灰 */
      }, '-=0.04');
    }

    /** 终极谢幕：历史行沉底 + 结果 elastic 弹出 */
    function playFinale(finalCellEl) {
      if (!gsap || !outer.value) return;
      const tl = gsap.timeline();
      tl.to(outer.value.querySelectorAll('.m1i-row.is-history'),
        { y: -10, opacity: 0.2, duration: 0.45, ease: 'power2.inOut' }, 0);
      if (finalCellEl) {
        tl.fromTo(finalCellEl,
          { scale: 0.4, opacity: 0, y: 10 },
          { scale: 1, opacity: 1, y: 0, duration: 0.85, ease: EASE.pop }, 0.10);
      }
      if (inputEl.value && inputEl.value.blur) inputEl.value.blur();
    }

    /* ---------- 点运算符 ---------- */
    function clickOp(i) {
      if (store.animating || store.done) return;
      const row = store.rows[store.rows.length - 1];
      if (!row) return;
      const op = row.tokens[i];
      if (!op || op.type !== 'op' || op.evaluated) return;

      if (!canOperate(row.tokens, i)) {
        setFeedback('先算乘除，再算加减哦 👆', 'error');
        const el = cellAt(store.rows.length - 1, i);
        if (el && gsap) gsap.fromTo(el, { x: -6 }, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.3)' });
        return;
      }

      store.pendingOpIdx = i;
      store.inputValue = '';
      setFeedback(`先算 ${fmtNum(row.tokens[i - 1].val)} ${op.val} ${fmtNum(row.tokens[i + 1].val)} = ?`);
      nextTick(() => { if (inputEl.value) inputEl.value.focus(); });
    }

    /* ---------- 提交 ---------- */
    function submit() {
      if (store.animating || store.pendingOpIdx < 0) return;
      const row = store.rows[store.rows.length - 1];
      if (!row) return;

      const raw = String(store.inputValue || '').trim();
      let userVal;
      if (/^-?\d+(\.\d+)?$/.test(raw)) userVal = parseFloat(raw);
      else if (/^\d+\/\d+$/.test(raw)) {
        const [a, b] = raw.split('/').map(Number);
        if (b === 0) { setFeedback('分母不能是 0 哦', 'error'); return; }
        userVal = a / b;
      } else { setFeedback('请输入一个数字', 'error'); return; }

      const i = store.pendingOpIdx;
      const left = row.tokens[i - 1];
      const op = row.tokens[i];
      const right = row.tokens[i + 1];
      const expected = OPS[op.val](left.val, right.val);

      if (Math.abs(userVal - expected) > 0.001) {
        setFeedback(`❌ 再想想～ 提示：${op.val === '÷' ? '用乘法验算一下' : '再算一遍'}`, 'error');
        emitUI('WRONG', { moduleId: 'm1' });        // 判分链 1/3
        store.comboCount = 0;
        return;
      }

      store.comboCount += 1;
      setFeedback(getEncouragement('m1', store.comboCount) || '✅ 正确！', 'ok');
      runMerge(i, expected);
    }

    /* ---------- ③ 时间轴 ---------- */
    function runMerge(opIndex, expected) {
      store.animating = true;
      const ri = store.rows.length - 1;
      const leftEl = cellAt(ri, opIndex - 1);
      const opEl = cellAt(ri, opIndex);
      const rightEl = cellAt(ri, opIndex + 1);
      const rowEl = rowElAt(ri);
      const activeP = path.value;

      if (!gsap || !leftEl || !opEl || !rightEl || !activeP) { commit(opIndex, expected); return; }

      const box = outer.value.getBoundingClientRect();
      const L = leftEl.getBoundingClientRect();
      const R = rightEl.getBoundingClientRect();
      const lx = L.left + L.width / 2 - box.left;
      const rx = R.left + R.width / 2 - box.left;
      const yTop = L.bottom - box.top;

      // 活动线先画成 U 型；并在最低点正下方补一条 9px 的下垂短线，
      // 让圆弧在动画阶段就"指向下方"，而不是一张悬空的笑脸。
      //   对称控制点 → 最低点 yLow = yTop + 0.75 * 22 = yTop + 16.5
      const midX = (lx + rx) / 2;
      const yLow = yTop + 16.5;
      const tickLen = 9;
      activeP.setAttribute('d',
        `M ${lx} ${yTop} C ${lx} ${yTop + 22}, ${rx} ${yTop + 22}, ${rx} ${yTop}`
        + ` M ${midX} ${yLow} L ${midX} ${yLow + tickLen}`);
      const len = activeP.getTotalLength ? activeP.getTotalLength() : 200;
      gsap.set(activeP, { strokeDasharray: len, strokeDashoffset: len, opacity: 1, strokeWidth: 4, stroke: GOLDEN.lineFocus });

      const dx = (rx - lx) / 2;

      // ② 呼吸式降噪：同行未参与运算的 Token（如 + 15）降到 0.4，聚焦视线
      const others = [...outer.value.querySelectorAll(`.m1i-cell[data-row="${ri}"]`)]
        .filter((el, i) => i !== opIndex - 1 && i !== opIndex && i !== opIndex + 1);

      const tl = gsap.timeline({
        onComplete: () => {
          // 数字与运算符**保留**缩小/变暗的终态（不 clearProps），它们要留在历史里
          commit(opIndex, expected);      // 数据推进 + 新行滑入 + 36 弹跳 + 线 morph
        },
      });

      // ① 画线 0.3s
      tl.to(activeP, { strokeDashoffset: 0, duration: 0.30, ease: 'power2.out' }, 0);
      // ② 停顿 0.1s（不许提前撞数字）
      tl.to({}, { duration: 0.10 });
      // ② 呼吸式降噪：平滑降到 0.4（power1.inOut，不对抗视线）
      if (others.length) tl.to(others, { opacity: 0.4, duration: 0.30, ease: EASE.breathe }, 0.05);

      // ③ 重力吸收：向中心汇聚并缩小，但**缩小后停住**（数字要留着当历史）。
      //    power3.in = 越靠近越快，像被吸进去；随后 x 回落原位、scale 保留 0.8。
      tl.to(leftEl, { x: dx, scale: 0.8, duration: DUR.land, ease: EASE.absorb })
        .to(rightEl, { x: -dx, scale: 0.8, duration: DUR.land, ease: EASE.absorb }, '<')
        .to(opEl, { scale: 0.8, opacity: 0.3, duration: 0.30, ease: EASE.absorb }, '<')
      // 回落：回到原位的 0.8 大小（不回到 1，保持"被消耗"的体量）
      .to([leftEl, rightEl], { x: 0, duration: 0.22, ease: 'power2.out' }, '>-0.06');
      // ④ 强制留白 0.25s —— 吸收完全结束后才允许下行出现
      tl.to({}, { duration: 0.25 });
      // ④ 上方原式整体变暗到 0.3
      // 历史行只轻微压暗到 0.92，主要靠 Token 自身的中灰表达"已算过"
      if (rowEl) tl.to(rowEl, { opacity: 0.92, duration: 0.26, ease: EASE.breathe }, '-=0.06');
    }

    /* ---------- 数据推进 + ⑤⑥ ---------- */
    function commit(opIndex, expected) {
      const ri = store.rows.length - 1;
      const row = store.rows[ri];
      const { nextTokens, result, exprText, merged } = computeStep(row.tokens, opIndex);
      if (!merged) { store.animating = false; return; }

      // 被消耗段标记
      store.rows[ri] = {
        ...row,
        tokens: row.tokens.map((t, i) => (i >= opIndex - 1 && i <= opIndex + 1 ? { ...t, evaluated: true } : t)),
      };

      // 新行（成为唯一可操作行）
      const newRi = store.rows.length;
      store.rows.push({ id: 'r' + newRi, tokens: nextTokens });
      store.steps.push({ exprText, resultText: fmtNum(expected) });

      store.pendingOpIdx = -1;
      store.inputValue = '';

      nextTick(() => {
        const newRowEl = rowElAt(newRi);
        const resEl = outer.value.querySelector(`.m1i-cell[data-row="${newRi}"][data-id="${result.id}"]`);

        if (gsap && newRowEl) {
          // ⑤ 新行从下方滑入
          gsap.fromTo(newRowEl, { y: 26, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.36, ease: 'back.out(1.4)' });
        }
        if (gsap && resEl) {
          // 36 的强调弹跳：0 → 1.2 → 1
          gsap.fromTo(resEl, { scale: 0, opacity: 0 },
            { scale: 1.2, opacity: 1, duration: 0.28, ease: 'power2.out',
              onComplete: () => gsap.to(resEl, { scale: 1, duration: 0.22, ease: 'back.out(2)' }) });
        }

        // ② 恢复：新行的运算符回到 1.0 并轻微脉冲，提示"这里可以点"
        if (gsap && newRowEl) {
          const newCells = [...newRowEl.querySelectorAll('.m1i-cell')];
          const newOps = newCells.filter((el) => el.classList.contains('is-op'));
          if (newOps.length) {
            gsap.set(newOps, { opacity: 1 });
            gsap.fromTo(newOps, { scale: 1 }, { scale: 1.05, duration: 0.16, ease: 'power2.out',
              yoyo: true, repeat: 1, onComplete: () => gsap.set(newOps, { clearProps: 'transform' }) });
          }
          // 旧行的内联 0.4 交给行级 opacity 统一管理
          if (others.length) gsap.set(others, { clearProps: 'opacity' });
        }

        // ⑥ 建立因果锚点
        const lEl = cellAt(ri, opIndex - 1);
        const rEl = cellAt(ri, opIndex + 1);
        const tEl = resEl;
        const activeP = path.value;

        if (lEl && rEl && tEl && outer.value) {
          const box = outer.value.getBoundingClientRect();
          const L = lEl.getBoundingClientRect();
          const R = rEl.getBoundingClientRect();
          const T = tEl.getBoundingClientRect();
          const guideD = funnelPath({
            lx: L.left + L.width / 2 - box.left,
            rx: R.left + R.width / 2 - box.left,
            tx: T.left + T.width / 2 - box.left,
            yTop: L.bottom - box.top,
            yJoin: L.bottom - box.top + 13,
            yEnd: T.top - box.top - 4,
          });

          const pushLink = () => {
            store.links.push({
              id: 'lk' + (store.links.length + 1),
              from: { row: ri, cells: [opIndex - 1, opIndex, opIndex + 1] },
              to: { row: newRi, tokenId: result.id },
              d: guideD,
            });
            if (activeP) gsap.set(activeP, { opacity: 0 });
          };

          if (gsap && activeP && drop.value) {
            transitionLinkToHistory(activeP, drop.value, guideD, pushLink);
          } else if (false) {
            // 真 morph：U 型 → 漏斗，同时变成"历史样式"（暗、细）
            gsap.to(activeP, {
              duration: DUR.draw, ease: 'power2.inOut',
              morphSVG: { shape: guideD, shapeIndex: 'auto' },
              strokeWidth: 2, stroke: GOLDEN.historyMid, opacity: 0.85,
              onComplete: pushLink,
            });
          } else if (gsap && activeP) {
            // 无 MorphSVG：交叉淡出（视觉上读作"线落到新位置"）
            gsap.to(activeP, { opacity: 0, duration: 0.18, onComplete: pushLink });
          } else {
            pushLink();
          }
        }

        if (nextTokens.length === 1) finishAll();
        store.animating = false;
        // 新行滚进视野
        if (newRowEl && newRowEl.scrollIntoView) {
          try { newRowEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
        }
      });
    }

    /* ---------- 收尾：判分链 2/3 + 3/3 ---------- */
    function finishAll() {
      store.done = true;
      const finalVal = store.rows[store.rows.length - 1].tokens[0].val;
      setFeedback(`🎉 全部算完！结果是 ${fmtNum(finalVal)}。`, 'ok');
      // ③ 终极谢幕：历史沉底 + 51 弹性弹出
      const lastCell = outer.value && outer.value.querySelector('.m1i-row.is-current .m1i-cell');
      playFinale(lastCell);

      const problemText = store.original || tokensToText(store.rows[0].tokens);

      if (ctx && ctx.data && ctx.data.historyAdd) {
        ctx.data.historyAdd({
          problemText,
          problemSource: 'm1',
          moduleId: 'm1',
          studentSteps: store.steps.map((s, idx) => ({ rel: `第 ${idx + 1} 步`, sub: s.exprText, res: s.resultText })),
          studentAnswer: fmtNum(finalVal),
          isCorrect: true,
          correctAnswer: fmtNum(finalVal),
          aiFeedback: null,
        });
      }
      if (ctx && ctx.data && ctx.data.masteryRecord) ctx.data.masteryRecord(problemText, true);
    }

    function reset(spec = DEFAULT_EXPR) {
      store.rows = [{ id: 'r0', tokens: makeTokens(spec) }];
      store.links = [];
      store.steps = [];
      store.original = tokensToText(store.rows[0].tokens);
      store.pendingOpIdx = -1;
      store.inputValue = '';
      store.done = false;
      store.comboCount = 0;
      setFeedback('点击算式中的运算符，把它先算出来 👆');
    }

    onMounted(() => {
      if (!store.rows.length) reset();
      if (typeof window !== 'undefined') window.addEventListener('resize', measureLinks);
    });
    onUnmounted(() => {
      if (typeof window !== 'undefined') window.removeEventListener('resize', measureLinks);
      if (gsap && gsap.globalTimeline) { try { gsap.globalTimeline.clear(); } catch (e) {} }
    });

    return { s: store, outer, path, drop, inputEl, GOLDEN, CELL_W, CELL_H, GAP, consumedClass, clickOp, submit, reset };
  },

  template: `
<div class="m1i-wrap" style="padding: 8px 0 4px;">
  <div class="m1i-rows" ref="outer" style="position:relative; display:flex; flex-direction:column; gap:10px;">

    <div v-for="(row, ri) in s.rows" :key="row.id"
         :data-row="ri"
         class="m1i-row"
         :class="{ 'is-current': ri === s.rows.length - 1, 'is-history': ri < s.rows.length - 1 }"
         :style="{ display:'flex', alignItems:'center', justifyContent:'center',
                   transition: 'opacity .2s' }">

      <!-- token 组：整体居中；= 绝对定位到左侧，不挤占布局 -->
      <div class="m1i-inner" style="position:relative; display:flex; align-items:center; gap: GAP + 'px';">
      <span v-if="ri > 0" class="m1i-eq"
            style="position:absolute; right:100%; margin-right:8px; font-size:22px; font-weight:800; color:var(--muted);">=</span>

      <div v-for="(t, i) in row.tokens"
           :key="t.id"
           :data-row="ri" :data-cell="i" :data-id="t.id"
           class="m1i-cell"
           :class="['is-' + t.type, consumedClass(row, i), { evaluated: t.evaluated,
                    'is-pending': s.pendingOpIdx === i && ri === s.rows.length - 1 }]"
           :style="{
             width: CELL_W + 'px', height: CELL_H + 'px',
             display:'flex', alignItems:'center', justifyContent:'center',
             fontSize: (t.type === 'op' ? '28px' : (t.fromResult ? '38px' : '34px')),
             fontWeight: 800,
             /* ② 强对比：历史态中灰 / 焦点亮黄 / 新结果纯白 + 绿色微光 */
             color: t.evaluated ? GOLDEN.history
                  : (t.fromResult ? GOLDEN.result
                  : (ri === s.rows.length - 1 ? GOLDEN.focus : 'var(--text)')),
             textShadow: t.fromResult ? '0 0 10px rgba(41, 204, 87, 0.30)'
                       : (!t.evaluated && ri === s.rows.length - 1 ? '0 0 12px rgba(245, 197, 66, 0.45)' : 'none'),
             borderRadius:'16px', userSelect:'none', willChange:'transform, opacity',
             opacity: t.evaluated ? GOLDEN.opacityHistory : 1,
             cursor: (t.type === 'op' && !t.evaluated && ri === s.rows.length - 1) ? 'pointer' : 'default',
           }"
           @click="t.type === 'op' && ri === s.rows.length - 1 && !t.evaluated && clickOp(i)">
        {{ t.val }}
      </div>
      </div>
    </div>

    <svg class="m1i-svg" style="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible;">
      <path v-for="lk in s.links" :key="lk.id" :d="lk.d"
            fill="none" :stroke="GOLDEN.lineHistory" stroke-width="2" stroke-linecap="round" opacity="0.85" />
      <path ref="path" d="" fill="none" :stroke="GOLDEN.lineFocus" stroke-width="4" stroke-linecap="round" style="opacity:0;" />
      <path ref="drop" d="" fill="none" :stroke="GOLDEN.lineFocus" stroke-width="4" stroke-linecap="round" style="opacity:0;" />
    </svg>
  </div>

  <div v-if="s.pendingOpIdx >= 0"
       style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:12px;">
    <span style="font-size:15px;font-weight:700;color:var(--muted);">=</span>
    <input ref="inputEl" v-model="s.inputValue" type="text" inputmode="decimal" autocomplete="off" placeholder="?"
           @keydown.enter.prevent="submit"
           style="width:110px;height:46px;padding:0 12px;text-align:center;font-size:20px;font-weight:800;
                  font-family:inherit;border:2px solid var(--border);border-radius:12px;
                  background:var(--input-bg);color:var(--text-soft);outline:none;">
    <button class="btn" @click="submit" style="height:46px;padding:0 18px;border-radius:12px;font-weight:800;">✓ 确认</button>
  </div>

  <div :class="s.feedback.kind"
       :style="{ minHeight:'24px', marginTop:'10px', textAlign:'center', fontSize:'14px', fontWeight:700,
                 color: s.feedback.kind === 'ok' ? 'var(--green-text)' : (s.feedback.kind === 'error' ? 'var(--red-text)' : 'var(--muted)') }">
    {{ s.feedback.text }}
  </div>

  <!-- ③ 沉浸感：全部算完（谢幕）之后才淡入「换一题」，避免中途分心 -->
  <div v-if="s.done" style="display:flex;gap:10px;justify-content:center;margin-top:2px;
            animation: m1iFadeIn .45s ease .35s both;">
    <button class="btn-secondary" @click="reset()" style="padding:10px 16px;border-radius:12px;">换一题</button>
  </div>
</div>
  `,
});

/* ============================================================
   四、对外契约
   ============================================================ */

/** 注入一次淡入动画（幂等） */
let _fadeStyleDone = false;
function injectFadeInStyle() {
  if (_fadeStyleDone || typeof document === 'undefined') return;
  _fadeStyleDone = true;
  const st = document.createElement('style');
  st.textContent = '@keyframes m1iFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}';
  document.head.appendChild(st);
}

let ctx = null;

export const meta = { title: '混合运算 · 连击变形', icon: '🎯' };

export default async function mount(container, context) {
  ctx = context;
  if (!container) return null;
  container.textContent = '';

  try { gsap = (await loadGsap()) || null; } catch (e) { gsap = null; }
  // MorphSVG 是 GSAP Club 付费插件：只有 vendor 里放了才会被注册
  hasMorph = !!(gsap && gsap.plugins && gsap.plugins.morphSVG);
  if (gsap && !hasMorph) {
    console.info('[m1i] 未检测到 MorphSVG，因果线用交叉淡出（视觉等价）');
  }

  // 「换一题」淡入用的关键帧（template 里的 <style> 不会被浏览器应用，必须注入 head）
  injectFadeInStyle();

  const V = await import('../../../js/vendor/vue.esm-browser.prod.js');
  const vm = V.createApp(M1Interactive);
  vm.mount(container);

  return () => {
    try { vm.unmount(); } catch (e) { /* 已卸载 */ }
    ctx = null;
  };
}
