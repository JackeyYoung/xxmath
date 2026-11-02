// grades/grade3/modules/__tests__/m1.smoke.test.js
// m1 模块冒烟测试：挂载 → 点运算符 → 虚拟键盘输入 → 判卷 → 合并动画 → 键盘持久性 → 清理
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ⭐ 绕开 shell.js 的重依赖链，只桩掉模块注册接口
vi.mock('../../../app/shell.js', () => ({
  registerActiveModule: vi.fn(),
  unregisterActiveModule: vi.fn(),
}));

// jsdom 不实现 SVG 路径长度 API 与 scrollIntoView，桩掉
if (typeof window !== 'undefined' && window.SVGElement) {
  window.SVGElement.prototype.getTotalLength = function () { return 100; };
  window.SVGElement.prototype.getPointAtLength = function (l) { return { x: l, y: 50 }; };
}
if (typeof window !== 'undefined' && window.Element && !window.Element.prototype.scrollIntoView) {
  window.Element.prototype.scrollIntoView = function () {};
}

const TPL = `
<template id="tpl-m1">
  <div class="card b1-card">
    <div class="b1-topbar">
      <h2>① 混合运算</h2>
      <div class="b1-actions">
        <button id="m1reset">↻</button>
        <button id="m1gear">⚙</button>
      </div>
    </div>
    <div class="problem-bar b1-sheet" id="m1sheet" style="display:none;">
      <select id="m1Select"></select>
      <button id="m1Load"></button>
      <input id="m1Custom">
      <button id="m1UseCustom"></button>
      <input type="file" id="m1Upload">
      <button id="m1Random"></button>
    </div>
    <div class="b1-board" id="m1board">
      <svg class="b1-arcs" id="m1arcs"></svg>
      <div class="b1-rows" id="m1rows"></div>
      <div class="b1-inputrow" id="m1inputrow" style="display:none;">
        <span class="b1-eq">=</span>
        <span class="b1-pending" id="m1pending"></span>
        <span class="b1-arrow">→</span>
        <span class="b1-answer" id="m1answer" data-empty="1"></span>
      </div>
    </div>
    <div id="m1PriorityBox" style="display:none;">
      <div class="priority-options" id="m1PriorityOptions"></div>
      <div id="m1PriorityFeedback"></div>
    </div>
    <div class="feedback b1-hint" id="m1fb"></div>
  </div>
</template>`;

function makeCtx() {
  return {
    storage: { get: vi.fn(() => null), set: vi.fn() },
    registerLevelHandler: vi.fn(),
    showThumbBar: vi.fn(),
    focusWhenReady: vi.fn(),
    data: { historyAdd: vi.fn(), masteryRecord: vi.fn(), recordActivity: vi.fn() },
  };
}

const { default: mount, reduceWithSrc, cellMetrics, computeRowLayout, mergedGlyphShift } = await import('../m1.js');
const { parseExpression, cleanParens } = await import('../../scoring/m1.js');

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const keypadEl = () => document.querySelector('.vkp');
const keypadVisible = () => !!keypadEl() && keypadEl().style.visibility === 'visible';
// 键盘监听 pointerdown（真实设备响应更快），jsdom 里手动派发
const pressKeyEl = (el) => el.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
const pressDigit = (d) => pressKeyEl(keypadEl().querySelector(`.vkp-key[data-digit="${d}"]`));
const pressConfirm = () => pressKeyEl(keypadEl().querySelector('.vkp-key[data-confirm]'));

describe('m1 · Brilliant 重构冒烟', () => {
  let container, ctx;

  beforeEach(() => {
    document.body.innerHTML = TPL;
    container = document.createElement('div');
    document.body.appendChild(container);
    ctx = makeCtx();
  });

  it('挂载后：首行算式渲染，格子数正确，可点运算符只有括号内的；原生 input 已移除', async () => {
    const cleanup = await mount(container, ctx);
    const rows = container.querySelectorAll('.b1-row');
    expect(rows.length).toBe(1);
    // ( 3 + 6 ) ÷ ( 4 - 1 ) = 11 个 token
    expect(rows[0].querySelectorAll('.b1-cell').length).toBe(11);
    // 括号优先：可点的只有内层的 + 和 -，÷ 与外层被锁
    expect(rows[0].querySelectorAll('.b1-op.b1-clickable').length).toBe(2);
    expect(rows[0].querySelectorAll('.b1-op.b1-locked').length).toBe(1);
    // ⭐ 场景化：无原生输入框
    expect(container.querySelector('input.b1-input')).toBeNull();
    expect(container.querySelector('#m1answer')).toBeTruthy();
    cleanup();
  });

  it('点击运算符：键盘弹出、聚光灯开启、答案槽就位', async () => {
    const cleanup = await mount(container, ctx);
    const row = container.querySelector('.b1-row');
    row.querySelectorAll('.b1-op.b1-clickable')[0].click();

    expect(container.querySelector('#m1inputrow').style.display).toBe('flex');
    expect(container.querySelector('#m1pending').textContent).toBe('( 3 + 6 )');
    expect(container.querySelector('#m1fb').textContent).toContain('得数');
    // ⭐ 虚拟键盘弹出 + 聚光灯
    expect(keypadVisible()).toBe(true);
    expect(container.querySelector('.b1-card').classList.contains('b1-awaiting')).toBe(true);
    // 键盘按键：点 9 → 答案槽显示 9
    pressDigit('9');
    expect(container.querySelector('#m1answer').textContent).toBe('9');
    cleanup();
  });

  it('判卷：答错提示且键盘保持；Esc 取消键盘收起', async () => {
    const cleanup = await mount(container, ctx);
    const row = container.querySelector('.b1-row');
    row.querySelectorAll('.b1-op.b1-clickable')[0].click();

    pressDigit('8');
    pressConfirm();
    expect(container.querySelector('#m1fb').textContent).toContain('再想想');
    // ⭐ 持久性：答错键盘绝不收起
    expect(keypadVisible()).toBe(true);

    // Esc 取消 → 键盘收起
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    await wait(450);
    expect(keypadVisible()).toBe(false);
    expect(inputRow_state(container)).toBe('none');
    cleanup();
  });

  it('点键盘以外区域 = 自动确认（保留原失焦提交习惯）', async () => {
    const cleanup = await mount(container, ctx);
    const row = container.querySelector('.b1-row');
    row.querySelectorAll('.b1-op.b1-clickable')[0].click();

    // 空缓冲点外部 → 不提交
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
    expect(container.querySelector('#m1fb').textContent).toContain('得数');

    // 有缓冲点外部 → 自动提交（8 是错答案 → 再想想，键盘不收）
    pressDigit('8');
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
    expect(container.querySelector('#m1fb').textContent).toContain('再想想');
    expect(keypadVisible()).toBe(true);

    // 键盘内部按下 → 不触发外部确认（改输 9 确认 → 正确）
    pressDigit('9');
    pressConfirm();
    await wait(800);
    const rows = container.querySelectorAll('.b1-row');
    expect(rows.length).toBe(2);   // 提交成功，合并开始
    await wait(1600);              // 等提交定时器走完再清理，避免迟到回调
    cleanup();
  });

  it('答对：键盘保持原位（持久）；终局算完才滑下；新行对位 256px', { timeout: 20000 }, async () => {
    const cleanup = await mount(container, ctx);
    const row = container.querySelector('.b1-row');
    row.querySelectorAll('.b1-op.b1-clickable')[0].click();

    pressDigit('9');
    pressConfirm();
    // 新行已追加（合并动画的状态提交在 onComplete，这里先验证 DOM 骨架）
    const rows = container.querySelectorAll('.b1-row');
    expect(rows.length).toBe(2);
    // cleanParens 消掉 (9) 的括号：9 ÷ ( 4 - 1 ) = 7 个 token
    expect(rows[1].querySelectorAll('.b1-cell').length).toBe(7);
    // ⭐ 对位锁定：合并格 9 横跨 ( 3 + 6 ) 全区间（含括号对）并居中 → 中心 = 弧底
    const mergedCell = rows[1].querySelector('.b1-num');
    const expectWidth = 2 * 26 + 2 * 64 + 44 + 4 * 8;   // parenW×2 + numW×2 + opW + gap×4 = 256
    expect(mergedCell.style.width).toBe(expectWidth + 'px');
    // SVG：贝塞尔弧 + 垂直指示线
    expect(container.querySelectorAll('#m1arcs path').length).toBe(2);

    // ⭐ 键盘持久性：确认后动画期间保持弹出
    expect(keypadVisible()).toBe(true);

    // 继续完成整题（÷ 无进位陷阱：(4-1) 内层 - → 3 → ÷ → 3）
    await wait(2300);   // 等合并动画 + 留白完成
    const clickable = container.querySelectorAll('.b1-op.b1-clickable');
    // 剩下 ÷（外层，此时括号已消）与内层 -：内层 - 可点
    expect(clickable.length).toBeGreaterThan(0);
    clickable[0].click();
    pressDigit('3');
    pressConfirm();
    await wait(2300);
    // 还剩 ÷：再一步
    const clickable2 = container.querySelectorAll('.b1-op.b1-clickable');
    if (clickable2.length) {
      clickable2[0].click();
      pressDigit('3');
      pressConfirm();
      await wait(2300);
    }
    // ⭐ 终局：算完 → 键盘平滑滑下
    await wait(400);
    expect(container.querySelector('#m1fb').textContent).toContain('全部算完');
    expect(keypadVisible()).toBe(false);
    expect(container.querySelector('.b1-card').classList.contains('b1-awaiting')).toBe(false);
    cleanup();
  });

  it('换题抽屉：齿轮开、遮罩关、载入后自动收', async () => {
    const cleanup = await mount(container, ctx);
    const sheet = container.querySelector('#m1sheet');
    container.querySelector('#m1gear').click();
    await wait(50);
    expect(sheet.classList.contains('open')).toBe(true);
    expect(document.querySelector('.b1-mask')).toBeTruthy();
    // 载入第一题 → 自动收起
    container.querySelector('#m1Load').click();
    await wait(50);
    expect(sheet.classList.contains('open')).toBe(false);
    cleanup();
  });

  it('清理函数：清空容器、可安全重复调用', async () => {
    const cleanup = await mount(container, ctx);
    cleanup();
    expect(container.innerHTML).toBe('');
    expect(() => cleanup()).not.toThrow();
  });

  it('reduceWithSrc 与 cleanParens 语义一致（防双重实现漂移）', () => {
    const cases = [
      { toks: parseExpression('(3 + 6) ÷ (4 - 1)'), opIdx: 2, val: 9 },
      { toks: parseExpression('12 × 3 + 15'),       opIdx: 1, val: 36 },
      { toks: parseExpression('((8 + 7)) × 2'),     opIdx: 3, val: 15 },
      { toks: parseExpression('20 - (3 + 2) × 4'),  opIdx: 4, val: 5 },
    ];
    for (const { toks, opIdx, val } of cases) {
      const items = reduceWithSrc(toks, opIdx, val);
      const viaSrc = items.map(x => x.t);
      const viaPure = cleanParens([...toks.slice(0, opIdx - 1), { type: 'num', val }, ...toks.slice(opIdx + 2)]);
      expect(viaSrc).toEqual(viaPure);
      const fresh = items.find(x => x.fresh);
      expect(fresh).toBeTruthy();
      expect(fresh.src[0]).toBeLessThanOrEqual(opIdx - 1);
      expect(fresh.src[1]).toBeGreaterThanOrEqual(opIdx + 1);
    }
  });

  it('cellMetrics：确定性布局（与 CSS 固定格宽一致，超大字号 38/64/44/26）', () => {
    const { L, R } = cellMetrics(parseExpression('(3 + 6) ÷ 2'));
    expect(L[0]).toBe(0);
    expect(R[0]).toBe(26);              // parenW
    expect(L[2]).toBe(26 + 8 + 64 + 8); // ( + gap + num + gap
    expect(R[6]).toBe(26 * 2 + 64 * 3 + 44 * 2 + 8 * 6); // = 380
  });

  it('三行链式合并：结果恒在弧底正下方，掉落数字与上一行逐列对齐', () => {
    const t1 = parseExpression('8 × 5 + 8 × 3');
    const m1 = cellMetrics(t1);

    const it1 = reduceWithSrc(t1, 1, 40);
    const lay2 = computeRowLayout(it1.map(x => x.src), m1);
    expect(lay2.L[1]).toBe(m1.L[3]);

    const t2 = it1.map(x => x.t);
    const opIdx2 = t2.findIndex(x => x.type === 'op' && x.val === '×');
    const it2 = reduceWithSrc(t2, opIdx2, 24);
    const lay3 = computeRowLayout(it2.map(x => x.src), { L: lay2.L, R: lay2.R });

    const arcBottomX = (lay2.L[opIdx2 - 1] + lay2.R[opIdx2 + 1]) / 2;
    const freshIdx3 = it2.findIndex(x => x.fresh);
    const freshCenter = (lay3.L[freshIdx3] + lay3.R[freshIdx3]) / 2;
    expect(Math.abs(freshCenter - arcBottomX)).toBeLessThan(0.001);
    expect(lay3.L[0]).toBe(lay2.L[0]);
    expect(lay3.L[1]).toBe(lay2.L[1]);
  });

  it('不对称合并（左操作数是加宽格）：字形校准量把结果压回弧底正下方', () => {
    const t1 = parseExpression('40 ÷ 5 + 12');
    const m1 = cellMetrics(t1);
    const it1 = reduceWithSrc(t1, 1, 8);
    const lay2 = computeRowLayout(it1.map(x => x.src), m1);
    const t2 = it1.map(x => x.t);
    const it2 = reduceWithSrc(t2, 1, 20);
    const lay3 = computeRowLayout(it2.map(x => x.src), { L: lay2.L, R: lay2.R });

    expect(lay2.R[0]).toBe(188);   // 64 + 8 + 44 + 8 + 64
    // 弧底 = (8中心 94 + 12中心 280)/2 = 187；区间中心 = (0+312)/2 = 156
    const shift = mergedGlyphShift({ L: lay2.L, R: lay2.R }, 0, 2, lay3.L[0], lay3.R[0]);
    expect(shift).toBe(31);        // 187 - 156
    const tSym = parseExpression('8 × 3');
    const mSym = cellMetrics(tSym);
    expect(mergedGlyphShift(mSym, 0, 2, mSym.L[0], mSym.R[2])).toBe(0);
  });
});

function inputRow_state(container) {
  return container.querySelector('#m1inputrow').style.display;
}
