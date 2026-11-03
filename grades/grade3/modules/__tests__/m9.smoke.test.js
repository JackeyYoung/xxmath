// grades/grade3/modules/__tests__/m9.smoke.test.js
// m9 竖式冒烟：338 ÷ 7 全流程（估算→商→乘积→余数→落位→…→完成）
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../app/shell.js', () => ({
  registerActiveModule: vi.fn(),
  unregisterActiveModule: vi.fn(),
}));

const TPL = `
<template id="tpl-m9">
  <div class="card b1-card b9-card">
    <div class="b1-topbar">
      <h2>⑨ 竖式运算</h2>
      <div class="b1-actions">
        <button id="m9step">▶</button>
        <button id="m9reset">↻</button>
        <button id="m9gear">⚙</button>
      </div>
    </div>
    <div class="controls b1-sheet" id="m9sheet" style="display:none;">
      <input id="m9a" type="text" value="348">
      <select id="m9op"><option>+</option><option>−</option><option>×</option><option>÷</option></select>
      <input id="m9b" type="text" value="176">
      <button id="m9random">随机</button>
    </div>
    <div id="m9display"></div>
    <div id="m9EstimateBox" style="display:none;">
      <div id="m9EstimateOptions"></div>
      <div id="m9EstimateFeedback"></div>
    </div>
    <div class="feedback b1-hint" id="m9fb"></div>
  </div>
</template>`;

function makeCtx() {
  return {
    storage: { get: vi.fn(() => null), set: vi.fn() },
    registerLevelHandler: vi.fn(),
    showThumbBar: vi.fn(),
    focusWhenReady: (id) => { const el = document.getElementById(id); if (el) el.focus(); },
    toast: vi.fn(),
    showMasteryCard: vi.fn(),
    data: { historyAdd: vi.fn(), masteryRecord: vi.fn(), recordActivity: vi.fn() },
  };
}

const { default: mount } = await import('../m9.js');
const { divisionSteps, computeAnswerMap } = await import('../../scoring/m9.js');

const key = (container, k) => container.querySelector(`[data-m9key="${k}"]`);
const tier = (container, k) => key(container, k)?.dataset.b1Tier;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const keypadEl = () => document.querySelector('.vkp');
const keypadVisible = () => !!keypadEl() && keypadEl().style.visibility === 'visible';
const pressKeyEl = (el) => el.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
const pressDigits = (str) => { for (const d of str) pressKeyEl(keypadEl().querySelector('.vkp-key[data-digit="' + d + '"]')); };
const pressConfirm = () => pressKeyEl(keypadEl().querySelector('.vkp-key[data-confirm]'));
const tapOutside = () => document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
const slot = (container) => container.querySelector('[data-m9slot]');
const currentTargetOf = (container) => slot(container)?.closest('[data-m9key]')?.dataset.m9key;

async function fillAnswer(container, input, value) {
  input.value = value;
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

describe('m9 · divisionSteps 纯函数', () => {
  it('338 ÷ 7 → 两步：33÷7=4…5，58÷7=8…2', () => {
    const steps = divisionSteps(338, 7);
    // start 语义与 computeAnswerMap 一致：工作值起写的列（不含被跳过的首位）
    expect(steps).toEqual([
      { start: 1, end: 1, q: 4, prod: 28, rem: 5 },
      { start: 2, end: 2, q: 8, prod: 56, rem: 2 },
    ]);
  });
  it('与 computeAnswerMap 一致（防双实现漂移）', () => {
    const steps = divisionSteps(338, 7);
    const map = computeAnswerMap({ a: 338, b: 7, op: '÷' });
    steps.forEach((s, i) => {
      expect(map[`quotient-${i}`]).toBe(String(s.q));
      expect(map[`product-${i}`]).toBe(String(s.prod));
      expect(map[`remainder-${i}`]).toBe(String(s.rem));
    });
  });
  it('被除数 < 除数 → 空数组', () => {
    expect(divisionSteps(5, 7)).toEqual([]);
  });
});

describe('m9 · 竖式交互（338 ÷ 7 全流程）', () => {
  let container, ctx, cleanup;

  beforeEach(async () => {
    document.body.innerHTML = TPL;
    container = document.createElement('div');
    document.body.appendChild(container);
    ctx = makeCtx();
    cleanup = await mount(container, ctx);
    // 设题为 338 ÷ 7
    const a = container.querySelector('#m9a');
    const b = container.querySelector('#m9b');
    const op = container.querySelector('#m9op');
    a.value = '338'; b.value = '7'; op.value = '÷';
    a.dispatchEvent(new Event('input', { bubbles: true }));
    b.dispatchEvent(new Event('input', { bubbles: true }));
    op.dispatchEvent(new Event('change', { bubbles: true }));
  });

  it('建格一次：商/除数/被除数/乘积/余数/落位格全部就位', () => {
    expect(key(container, 'divisor').textContent).toBe('7');
    expect(key(container, 'd-0').textContent).toBe('3');
    expect(key(container, 'd-2').textContent).toBe('8');
    expect(key(container, 'q-0')).toBeTruthy();
    expect(key(container, 'p-0-0')).toBeTruthy();
    expect(key(container, 'r-0-0')).toBeTruthy();
    expect(key(container, 'bd-0')).toBeTruthy();   // 落位格
    expect(key(container, 'rf-0')).toBeTruthy();
    // 被除数是初始常量 → init 档（绝不能是黄色 focus）
    expect(tier(container, 'd-0')).toBe('init');
    expect(container.querySelector('#m9display input')).toBeNull();   // ⭐ 无原生输入框
    expect(container.querySelector('#m9gear')).toBeTruthy();
    expect(container.querySelector('#m9sheet')).toBeTruthy();
  });

  it('落位：step0 完成后，被除数的 8 摘进余数行，源数字原地变灰，且不重复动画', { timeout: 20000 }, async () => {
    // 通过估算 → step0
    container.querySelector('#m9step').click();
    await wait(50);
    // 答估算：精确 48 → 找包含它的区间按钮
    const exact = Math.floor(338 / 7);
    const optBtns = [...container.querySelectorAll('#m9EstimateOptions .priority-opt')];
    const correct = optBtns.find(b => {
      const [lo, hi] = b.textContent.split('~').map(Number);
      return exact >= lo && exact <= hi;
    });
    correct.click();
    await wait(900);   // 估算通过 → step0 商输入

    // ⭐ 键盘弹出,答案槽在商格
    expect(keypadVisible()).toBe(true);
    expect(slot(container)).toBeTruthy();
    // 商 4
    pressDigits('4'); pressConfirm();
    await wait(800);   // flash + advance
    expect(key(container, 'q-0').textContent).toBe('4');
    expect(tier(container, 'q-0')).toBe('history');

    // 乘积 28(键盘保持弹出 —— 持久性)
    expect(keypadVisible()).toBe(true);
    pressDigits('28'); pressConfirm();
    await wait(800);
    expect(key(container, 'p-0-0').textContent).toBe('2');
    expect(key(container, 'p-0-1').textContent).toBe('8');
    expect(tier(container, 'p-0-0')).toBe('consumed');   // 减数 → 被消耗档

    // 余数 5
    pressDigits('5'); pressConfirm();
    await wait(800);

    // ⭐ 落位发生：bd-0 = 8，源 d-2 变灰（consumed），工作值行亮黄
    await wait(700);   // 等落位动画 onComplete
    expect(key(container, 'bd-0').textContent).toBe('8');
    expect(tier(container, 'd-2')).toBe('consumed');
    expect(tier(container, 'bd-0')).toBe('focus');       // 58 的工作值亮黄
    expect(tier(container, 'r-0-0')).toBe('focus');      // 余数 5 同属工作值

    // 商 8（step1,键盘不落地）
    expect(keypadVisible()).toBe(true);
    pressDigits('8'); pressConfirm();
    await wait(800);
    expect(key(container, 'q-1').textContent).toBe('8');

    // 乘积 56
    pressDigits('56'); pressConfirm();
    await wait(800);

    // 余数 2（末步）→ 完成
    pressDigits('2'); pressConfirm();
    await wait(900);
    expect(tier(container, 'rf-0')).toBe('history');     // 最终余数 → 历史档
    // ⭐ 完成后工作值 58 必须立刻褪成极暗灰（被消耗档）
    expect(tier(container, 'bd-0')).toBe('consumed');
    expect(tier(container, 'r-0-0')).toBe('consumed');
    expect(container.querySelector('#m9fb').textContent).toContain('算出来啦');
    // ⭐ 终局:键盘滑下 + 无残留答案槽
    await wait(500);
    expect(keypadVisible()).toBe(false);
    expect(slot(container)).toBeNull();
    expect(ctx.data.historyAdd).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('填错：绿框变红 + 不推进状态', async () => {
    container.querySelector('#m9step').click();
    await wait(50);
    const exact = Math.floor(338 / 7);
    const optBtns = [...container.querySelectorAll('#m9EstimateOptions .priority-opt')];
    optBtns.find(b => {
      const [lo, hi] = b.textContent.split('~').map(Number);
      return exact >= lo && exact <= hi;
    }).click();
    await wait(900);

    pressDigits('5');   // 错，应为 4
    // ⭐ 点键盘以外区域 = 自动确认（沿用原失焦提交习惯）
    tapOutside();
    await wait(100);
    expect(slot(container).classList.contains('b9-wrong')).toBe(true);
    expect(container.querySelector('#m9fb').textContent).toContain('再想想');
    // 持久性：答错键盘不收
    expect(keypadVisible()).toBe(true);
    cleanup();
  });

  it('加减法算完：最终结果旁不得残留绿色输入框', { timeout: 20000 }, async () => {
    // 12 + 34 = 46（无进位，两步）
    const a = container.querySelector('#m9a'), b = container.querySelector('#m9b'), op = container.querySelector('#m9op');
    a.value = '12'; b.value = '34'; op.value = '+';
    a.dispatchEvent(new Event('input', { bubbles: true }));
    b.dispatchEvent(new Event('input', { bubbles: true }));
    op.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(200);

    container.querySelector('#m9step').click();
    await wait(50);
    const exact = 12 + 34;
    const optBtns = [...container.querySelectorAll('#m9EstimateOptions .priority-opt')];
    optBtns.find(btn => {
      const [lo, hi] = btn.textContent.split('~').map(Number);
      return exact >= lo && exact <= hi;
    }).click();
    await wait(900);

    pressDigits('6'); pressConfirm();   // 个位
    await wait(800);
    pressDigits('4'); pressConfirm();   // 十位 → 完成
    await wait(1200);

    expect(container.querySelector('#m9fb').textContent).toContain('算出来啦');
    expect(keypadVisible()).toBe(false);                              // ⭐ 终局键盘滑下
    expect(container.querySelector('[data-m9slot]')).toBeNull();      // 无残留答案槽
    expect(tier(container, 'r-0')).toBe('history');
    expect(tier(container, 'r-1')).toBe('history');
    cleanup();
  });

  it('减法借位：输入槽挂在左侧数字上方（列映射差一回归）', { timeout: 20000 }, async () => {
    // 50 - 3 = 47：个位 0-3 需借位，借位写在十位（左侧）数字上方
    const a = container.querySelector('#m9a'), b = container.querySelector('#m9b'), op = container.querySelector('#m9op');
    a.value = '50'; b.value = '3'; op.value = '−';
    a.dispatchEvent(new Event('input', { bubbles: true }));
    b.dispatchEvent(new Event('input', { bubbles: true }));
    op.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(200);
    container.querySelector('#m9step').click();
    await wait(50);
    const exact = 50 - 3;
    const optBtns = [...container.querySelectorAll('#m9EstimateOptions .priority-opt')];
    optBtns.find(btn => {
      const [lo, hi] = btn.textContent.split('~').map(Number);
      return exact >= lo && exact <= hi;
    }).click();
    await wait(900);
    // ⭐ 借位写在左侧（十位）数字上方：carry-1（个位产生）→ 槽挂 c-0
    //    （修复前差一列挂在 c-1，即用户报告的"没在左边数字上面"）
    const t = currentTargetOf(container);
    expect(t).toBe('c-0');
    cleanup();
  });

  it('点随机出题：键盘随之收起，不再弹回（不残留）', { timeout: 20000 }, async () => {
    // 12 + 34，进入等待态（键盘弹出），输入一位数字后点「随机」
    const a = container.querySelector('#m9a'), b = container.querySelector('#m9b'), op = container.querySelector('#m9op');
    a.value = '12'; b.value = '34'; op.value = '+';
    a.dispatchEvent(new Event('input', { bubbles: true }));
    b.dispatchEvent(new Event('input', { bubbles: true }));
    op.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(200);

    container.querySelector('#m9step').click();
    await wait(50);
    const exact = 12 + 34;
    const optBtns = [...container.querySelectorAll('#m9EstimateOptions .priority-opt')];
    optBtns.find(btn => {
      const [lo, hi] = btn.textContent.split('~').map(Number);
      return exact >= lo && exact <= hi;
    }).click();
    await wait(900);

    expect(keypadVisible()).toBe(true);
    pressDigits('6');            // 缓冲里留一位数字
    await wait(50);

    // 真实点按：先 pointerdown（触发"点外确认"），再 click（触发随机出题）
    const rand = container.querySelector('#m9random');
    rand.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    rand.click();
    await wait(1100);            // 越过 submitBuffer 的 700ms 延时与 hide 动画

    expect(keypadVisible()).toBe(false);   // ⭐ 随机后键盘收起且不再弹回
    expect(slot(container)).toBeNull();
    cleanup();
  });

  it('清理函数：清空容器、可安全重复调用', async () => {
    cleanup = cleanup || null;
    expect(() => cleanup()).not.toThrow();
    expect(container.innerHTML).toBe('');
    expect(() => cleanup()).not.toThrow();
  });
});
