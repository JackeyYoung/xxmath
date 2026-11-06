// grades/grade3/modules/__tests__/m9.smoke.test.js
// m9 竖式冒烟：338 ÷ 7 全流程（估算→商→乘积→余数→落位→…→完成）
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../app/shell.js', () => ({
  registerActiveModule: vi.fn(),
  unregisterActiveModule: vi.fn(),
}));

const { getAji } = await import('../../../../core/ui/aji.js');

const TPL = `
<template id="tpl-m9">
  <div class="card b1-card b9-card">
    <div class="b1-topbar">
      <div class="b1-actions">
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
// ⭐ 无「下一步」按钮：点击竖式待填格 = 启动/继续（统一点击心智）
const startFlow = (container) => (key(container, 'q-0') || key(container, 'r-1')).click();
// ⭐ Aji 浮条（唯一求助入口）：右下角气泡
const ajiToastVisible = () => getAji().isToastVisible;

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
    getAji().hideToast();   // ⭐ 清掉上一个用例遗留的 Aji 空闲计时/浮条
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
    // ⭐ 统一点击心智：「下一步」按钮已移除，点待填格直接进入输入态
    expect(container.querySelector('#m9step')).toBeNull();
  });

  it('级联精准命中：修改第二个进位，第一个进位与已完成步骤原样保留', { timeout: 30000 }, async () => {
    // 348 + 176 = 524：carry-2(step0)→result-2→carry-1(step1)→result-1→result-0(step2)
    const a = container.querySelector('#m9a'), b = container.querySelector('#m9b'), op = container.querySelector('#m9op');
    a.value = '348'; b.value = '176'; op.value = '+';
    a.dispatchEvent(new Event('input', { bubbles: true }));
    b.dispatchEvent(new Event('input', { bubbles: true }));
    op.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(200);
    startFlow(container);
    await wait(50);

    pressDigits('1'); pressConfirm();   // carry-2 → 1（对）
    await wait(800);
    pressDigits('4'); pressConfirm();   // result-2 → 4（对）
    await wait(800);
    pressDigits('1'); pressConfirm();   // carry-1 → 1（对）
    await wait(800);
    pressDigits('2'); pressConfirm();   // result-1 → 2（对）
    await wait(800);
    pressDigits('6'); pressConfirm();   // result-0 → 6（错，应 5）→ 终局回溯
    await wait(1300);
    expect(container.querySelector('#m9fb').textContent).toContain('最终的得数好像不对');

    // 全盘可编辑：点击第二个进位（carry-1，格 c-0）→ 只级联删除 step≥1，第一个进位保留
    key(container, 'c-0').click();
    await wait(100);
    expect(key(container, 'c-1').textContent).toBe('1');   // ⭐ 第一个进位（carry-2）原样保留
    expect(key(container, 'r-2').textContent).toBe('4');   // ⭐ 已完成的个位得数原样保留
    expect(key(container, 'c-0').textContent).toBe('');    // 第二个进位已清空重填
    expect(key(container, 'r-1').textContent).toBe('');    // 其依赖的十位得数已级联清空
    expect(key(container, 'r-0').textContent).toBe('');    // 百位得数已级联清空
    expect(currentTargetOf(container)).toBe('c-0');        // 重新询问第二个进位
    expect(keypadVisible()).toBe(true);
    cleanup();
  });

  it('落位：step0 完成后，被除数的 8 摘进余数行，源数字原地变灰，且不重复动画', { timeout: 20000 }, async () => {
    // 点击待填格 → 直通 step0（估算已下沉 Aji，开算无阻断）
    startFlow(container);
    await wait(50);

    // 商 4
    pressDigits('4'); pressConfirm();
    await wait(800);   // flash + advance
    expect(key(container, 'q-0').textContent).toBe('4');
    expect(tier(container, 'q-0')).toBe('history');

    // 乘积 28（键盘保持弹出 —— 持久性）
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

    // 商 8（step1，键盘不落地）
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

  it('答错放行：错误值照常落位推进，无红无抖无阻断', { timeout: 20000 }, async () => {
    startFlow(container);
    await wait(50);

    pressDigits('5');   // 商应 4，故意答 5（错）
    pressConfirm();
    await wait(900);    // 等 flashFilled + 700ms 推进

    // ⭐ 探究式放行：商格显示错误值 5，无红无抖，已推进到乘积
    expect(key(container, 'q-0').textContent).toBe('5');
    const fb = container.querySelector('#m9fb');
    expect(fb.className).not.toContain('error');
    expect(container.querySelector('.b9-slot.b9-wrong')).toBeNull();   // 无红框无抖
    expect(keypadVisible()).toBe(true);                                 // 键盘保持
    // 已推进到乘积（等待格是乘积最高位槽）
    expect(currentTargetOf(container)).toBe('p-0-1');
    cleanup();
  });

  it('填错乘积：渲染用户输入，绝不用标准答案覆盖', { timeout: 20000 }, async () => {
    startFlow(container);
    await wait(50);

    pressDigits('4'); pressConfirm();   // 商 4（对）
    await wait(800);
    pressDigits('35'); pressConfirm();  // 乘积应 28，故意答 35（错）
    await wait(800);

    // ⭐ 核心修复：格子显示用户输入 35，绝不被标准答案 28 悄悄覆盖
    expect(key(container, 'p-0-0').textContent).toBe('3');
    expect(key(container, 'p-0-1').textContent).toBe('5');
    cleanup();
  });

  it('终局回溯+级联重置：末位答错→柔声提示→点高亮格重填→记对', { timeout: 20000 }, async () => {
    // 12 + 34 = 46：十位 4 对，个位（终局）故意答 5
    const a = container.querySelector('#m9a'), b = container.querySelector('#m9b'), op = container.querySelector('#m9op');
    a.value = '12'; b.value = '34'; op.value = '+';
    a.dispatchEvent(new Event('input', { bubbles: true }));
    b.dispatchEvent(new Event('input', { bubbles: true }));
    op.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(200);
    startFlow(container);
    await wait(50);

    pressDigits('6'); pressConfirm();   // 个位（step0），对
    await wait(800);
    pressDigits('5'); pressConfirm();   // 十位（step1，终局），答错（应 4）
    await wait(1300);                   // 等 flashFilled + 700ms 推进 + 键盘滑下

    const fb = container.querySelector('#m9fb');
    expect(fb.textContent).toContain('最终的得数好像不对，我们一起回头看看？');
    expect(fb.className).not.toContain('error');              // 无红、无缩略条
    expect(keypadVisible()).toBe(false);                      // 终局谢幕，键盘滑下
    const r0 = key(container, 'r-0');                         // 十位 = result-0，错误值 5
    expect(r0.textContent).toBe('5');
    expect(ctx.data.historyAdd).not.toHaveBeenCalled();       // 不判 0
    // ⭐ 回溯期由 Thumb Bar 主导：Aji 浮条绝不出现（常规态挂起的空闲请求已收）
    expect(ajiToastVisible()).toBe(false);

    // 学生点「去修改」→ 级联重置 → 重新填十位 4 → 终局达成、记为对
    const goFix = [...ctx.showThumbBar.mock.calls].reverse().find(c => c[0].nextLabel === '去修改');
    goFix[0].onNext();
    await wait(100);
    expect(keypadVisible()).toBe(true);                       // 重新等待输入，键盘弹出
    pressDigits('4'); pressConfirm();
    await wait(1300);
    expect(container.querySelector('#m9fb').textContent).toContain('算出来啦');
    expect(ctx.data.historyAdd).toHaveBeenCalledTimes(1);
    expect(ctx.data.historyAdd.mock.calls[0][0].isCorrect).toBe(true);
    cleanup();
  });

  it('回溯静默期：去修改后无弹窗，20s 无动作 Aji 浮条才出现；点击浮条弹对话框', { timeout: 20000 }, async () => {
    const a = container.querySelector('#m9a'), b = container.querySelector('#m9b'), op = container.querySelector('#m9op');
    a.value = '12'; b.value = '34'; op.value = '+';
    a.dispatchEvent(new Event('input', { bubbles: true }));
    b.dispatchEvent(new Event('input', { bubbles: true }));
    op.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(200);
    startFlow(container);
    await wait(50);

    pressDigits('6'); pressConfirm();   // 个位，对
    await wait(800);
    pressDigits('5'); pressConfirm();   // 十位（终局）答错 → 回溯
    await wait(1300);
    expect(ajiToastVisible()).toBe(false);   // Thumb Bar 阶段：Aji 静默

    const goFix = [...ctx.showThumbBar.mock.calls].reverse().find(c => c[0].nextLabel === '去修改');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      goFix[0].onNext();                      // 去修改 → 级联重置 + 20s 静默起算
      expect(ajiToastVisible()).toBe(false); // ⭐ 立刻无任何弹窗

      vi.advanceTimersByTime(20000);          // 一直发呆 → 20s 后浮条才出现
      expect(ajiToastVisible()).toBe(true);
      const toastEl = document.querySelector('.aji-float-bubble');
      expect(toastEl.textContent).toContain('卡住了吗');

      toastEl.click();                        // 点击浮条 → 聊天舱滑出（结构化消息入流）
      expect(ajiToastVisible()).toBe(false);
      expect(getAji().isDrawerOpen).toBe(true);
      const drawer = document.querySelector('.aji-chat-hub');
      expect(drawer.style.display).toBe('flex');
      expect(drawer.textContent).toContain('竖式');
      expect(drawer.textContent).toContain('这一步怎么想？');   // ⭐ 结构化消息（title）
      expect(drawer.querySelector('.aji-msg-chip').textContent).toContain('我懂了');
    } finally {
      vi.useRealTimers();
    }
    cleanup();
  });

  it('估算下沉 Aji：直通开算无拦截；静置浮条点击 → 估算对话卡片选区间揭晓', { timeout: 20000 }, async () => {
    const a = container.querySelector('#m9a'), b = container.querySelector('#m9b'), op = container.querySelector('#m9op');
    a.value = '12'; b.value = '34'; op.value = '+';
    a.dispatchEvent(new Event('input', { bubbles: true }));
    b.dispatchEvent(new Event('input', { bubbles: true }));
    op.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(200);
    // ⭐ 估算弹窗已移除：点待填格直接进入输入态，没有任何拦截断层
    expect(container.querySelector('#m9EstimateBox')).toBeNull();
    startFlow(container);
    await wait(50);
    expect(keypadVisible()).toBe(true);

    // 静置 → Aji 浮条（估算邀请）→ 点击 → 估算对话卡片
    const aji = getAji();
    aji.hideToast();   // 清掉真实时钟上的挂起计时
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      container.querySelector('#m9reset').click();   // 重新载入 → 估算邀请落在虚拟时钟
      vi.advanceTimersByTime(35000);
      expect(ajiToastVisible()).toBe(true);
      expect(document.querySelector('.aji-float-bubble').textContent).toContain('估一估');

      document.querySelector('.aji-float-bubble').click();
      expect(getAji().isDrawerOpen).toBe(true);
      const drawer = document.querySelector('.aji-chat-hub');
      expect(drawer.style.display).toBe('flex');
      expect(drawer.textContent).toContain('先估一估');
      // 点选正确区间（12+34=46 → 0~100）→ 用户气泡入流 → 追加揭晓消息
      const right = [...drawer.querySelectorAll('.aji-msg-chip')].find(b => b.textContent === '0~100');
      expect(right).toBeTruthy();
      right.click();
      expect(drawer.textContent).toContain('精确结果是');
      expect(drawer.textContent).toContain('46');
      // ⭐ 聊天舱状态记忆：点选以用户气泡落史
      expect(drawer.querySelectorAll('.aji-msg-user').length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
    cleanup();
  });

  it('终局回溯：静置 45 秒无动作 → 微光轻照出错格（无倒计时、无红）', { timeout: 20000 }, async () => {
    const a = container.querySelector('#m9a'), b = container.querySelector('#m9b'), op = container.querySelector('#m9op');
    a.value = '12'; b.value = '34'; op.value = '+';
    a.dispatchEvent(new Event('input', { bubbles: true }));
    b.dispatchEvent(new Event('input', { bubbles: true }));
    op.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(200);
    startFlow(container);
    await wait(50);

    pressDigits('6'); pressConfirm();   // 个位（step0），对
    await wait(800);
    // ⭐ 虚拟时钟先于"终局答错"激活（守护在虚拟时钟上起算）；finally 保证还原，绝不泄漏
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      pressDigits('5'); pressConfirm();   // 十位（终局）答错
      vi.advanceTimersByTime(700);        // 推进 → 终局判定 → m9EnterRecheck → 起 45s 守护
      expect(key(container, 'r-0').classList.contains('b9-glow')).toBe(false);

      // 静置 45 秒（期间无任何动作）→ 守护给微光
      vi.advanceTimersByTime(45000);
      expect(key(container, 'r-0').classList.contains('b9-glow')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
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

    startFlow(container);
    await wait(50);

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
    startFlow(container);
    await wait(50);
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

    startFlow(container);
    await wait(50);

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
