// grades/grade3/modules/__tests__/m1.smoke.test.js
// m1 模块冒烟测试：挂载 → 点运算符 → 虚拟键盘输入 → 判卷 → 合并动画 → 键盘持久性 → 清理
import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ⭐ 抽屉移除后，载入题目的真实通道是模块对外接口（activeModules）。
   m1.js 是从 app/shell.js 取 registerActiveModule 的，所以壳层桩要把它
   转接到一张真表上 —— 测试才能像 Aji 那样调 loadExpression / nextProblem。
   ⚠️ 路径是 4 层：__tests__ → modules → grade3 → grades → 仓库根（app/ 在根下）。
      原来写的 3 层指向 grades/app/shell.js（不存在），这个桩其实一直没生效。 */
const activeModules = {};
vi.mock('../../../../app/shell.js', () => ({
  registerActiveModule: (id, api) => { activeModules[id] = api; },
  unregisterActiveModule: (id) => { delete activeModules[id]; },
}));

// jsdom 不实现 SVG 路径长度 API 与 scrollIntoView，桩掉
if (typeof window !== 'undefined' && window.SVGElement) {
  window.SVGElement.prototype.getTotalLength = function () { return 100; };
  window.SVGElement.prototype.getPointAtLength = function (l) { return { x: l, y: 50 }; };
}
if (typeof window !== 'undefined' && window.Element && !window.Element.prototype.scrollIntoView) {
  window.Element.prototype.scrollIntoView = function () {};
}

/* ⭐ 与 app/templates.js 的 tpl-m1 保持一致：
   右上角 ↻/⚙ 与换题抽屉已作为「视觉重心归零」的一部分整体移除。
   载入题目改由模块对外接口 activeModules.m1.loadExpression() 承担。 */
const TPL = `
<template id="tpl-m1">
  <div class="card b1-card">
    <div class="b1-board" id="m1board">
      <svg class="b1-arcs" id="m1arcs"></svg>
      <div class="b1-rows" id="m1rows"></div>
      <div class="b1-inputrow" id="m1inputrow" style="display:none;">
        <span class="b1-pending" id="m1pending"></span>
        <span class="b1-answer" id="m1answer" data-empty="1"></span>
      </div>
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
const { getAji } = await import('../../../../core/ui/aji.js');

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const keypadEl = () => document.querySelector('.vkp');
const keypadVisible = () => !!keypadEl() && keypadEl().style.visibility === 'visible';
// 键盘监听 pointerdown（真实设备响应更快），jsdom 里手动派发
const pressKeyEl = (el) => el.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
const pressDigit = (d) => pressKeyEl(keypadEl().querySelector(`.vkp-key[data-digit="${d}"]`));
const pressConfirm = () => pressKeyEl(keypadEl().querySelector('.vkp-key[data-confirm]'));
// ⭐ Aji 浮条（唯一求助入口）：右下角气泡
const ajiToastVisible = () => getAji().isToastVisible;
/* ⭐ 载入题目：原 #m1Custom + #m1UseCustom 两步，现在是模块对外接口一步 */
const loadExpr = (text) => activeModules.m1.loadExpression(text);

describe('m1 · Brilliant 重构冒烟', () => {
  let container, ctx;

  beforeEach(() => {
    document.body.innerHTML = TPL;
    container = document.createElement('div');
    document.body.appendChild(container);
    ctx = makeCtx();
    getAji().hideToast();   // ⭐ 清掉上一个用例遗留的 Aji 空闲计时/浮条
  });

  it('挂载后：首行算式渲染，格子数正确，可点运算符只有括号内的；原生 input 已移除', async () => {
    const cleanup = await mount(container, ctx);
    const rows = container.querySelectorAll('.b1-row');
    expect(rows.length).toBe(1);
    // ( 3 + 6 ) ÷ ( 4 - 1 ) = 11 个 token
    expect(rows[0].querySelectorAll('.b1-cell').length).toBe(11);
    // ⭐ 所有运算符都可点（点错给提示，不再静默锁定为"点了没反应"）
    expect(rows[0].querySelectorAll('.b1-op.b1-clickable').length).toBe(3);
    expect(rows[0].querySelectorAll('.b1-op.b1-locked').length).toBe(0);
    // ⭐ 场景化：无原生输入框；优先级测验强制弹窗已下线（算理在 Aji 对话框里）
    expect(container.querySelector('input.b1-input')).toBeNull();
    expect(container.querySelector('#m1answer')).toBeTruthy();
    expect(container.querySelector('#m1PriorityBox')).toBeNull();
    expect(container.querySelector('details.lesson-hint')).toBeNull();   // 无显性提示入口
    cleanup();
  });

  it('点击运算符：键盘弹出、聚光灯开启、答案槽就位', async () => {
    const cleanup = await mount(container, ctx);
    const row = container.querySelector('.b1-row');
    row.querySelectorAll('.b1-op.b1-clickable')[0].click();

    // ⭐ 防跳动：输入行常驻占位（display 恒为 flex），激活态只切 .b1-active（opacity）
    expect(inputRow_state(container)).toBe('flex');
    expect(container.querySelector('#m1inputrow').style.display).toBe('');
    // ⭐ 告别复写算式：pending 恒为空，输入区无等号/括号/箭头/问号
    expect(container.querySelector('#m1pending').textContent).toBe('');
    expect(container.querySelector('.b1-arrow')).toBeNull();
    expect(container.querySelector('.b1-eq')).toBeNull();
    expect(container.querySelector('#m1fb').textContent).toContain('得数');
    // ⭐ 虚拟键盘弹出 + 聚光灯
    expect(keypadVisible()).toBe(true);
    expect(container.querySelector('.b1-card').classList.contains('b1-awaiting')).toBe(true);
    // ⭐ 答案槽直落结果位：与提交同一几何链预演，left 已被钉位（弧底正下方）
    const ans = container.querySelector('#m1answer');
    expect(document.getElementById('b1-style').textContent).toContain('.b1-answer { position: absolute;');
    expect(ans.style.left).not.toBe('');
    // 键盘按键：点 9 → 答案槽显示 9
    pressDigit('9');
    expect(container.querySelector('#m1answer').textContent).toBe('9');
    cleanup();
  });

  it('点错运算符：提示区给出原因，而不是静默无反应', async () => {
    const cleanup = await mount(container, ctx);
    const row = container.querySelector('.b1-row');
    // (3+6)÷(4-1)：外层 ÷ 不能先算（括号内优先）——点它应给提示而非"没反应"
    const outerDiv = [...row.querySelectorAll('.b1-op')].find(op => op.textContent === '÷');
    outerDiv.click();
    expect(container.querySelector('#m1fb').textContent).toContain('先算括号里的');
    expect(inputRow_state(container)).toBe('none');
    cleanup();
  });

  it('判卷：答错放行——砸落动画照常播放，无红无抖无提示，键盘保持', { timeout: 20000 }, async () => {
    const cleanup = await mount(container, ctx);
    const row = container.querySelector('.b1-row');
    row.querySelectorAll('.b1-op.b1-clickable')[0].click();

    pressDigit('8');   // (3+6)=9，故意答 8
    pressConfirm();
    // ⭐ 探究式放行：错误也提交，界面绝不明示
    const fb = container.querySelector('#m1fb');
    expect(fb.className).not.toContain('error');               // 无红档
    expect(container.querySelector('.b1-answer.b1-wrong')).toBeNull();   // 无红框无抖
    expect(keypadVisible()).toBe(true);                        // 键盘保持（持久）
    await wait(2300);   // 等合并动画完成
    const rows = container.querySelectorAll('.b1-row');
    expect(rows.length).toBe(2);                               // ⭐ 带着错误值 8 生成了新行
    expect(rows[1].textContent).toContain('8');
    cleanup();
  });

  it('点键盘以外区域 = 自动确认（保留原失焦提交习惯）', async () => {
    const cleanup = await mount(container, ctx);
    const row = container.querySelector('.b1-row');
    row.querySelectorAll('.b1-op.b1-clickable')[0].click();

    // 空缓冲点外部 → 不提交
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
    expect(container.querySelector('#m1fb').textContent).toContain('得数');

    // 有缓冲点外部 → 自动提交（8 是错答案 → 放行，照常砸落）
    pressDigit('8');
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
    expect(container.querySelector('#m1fb').textContent).not.toContain('再想想');
    expect(keypadVisible()).toBe(true);

    // 键盘内部按下 → 不触发外部确认（等合并走完再清理）
    await wait(2300);
    const rows = container.querySelectorAll('.b1-row');
    expect(rows.length).toBe(2);   // 提交成功，合并开始
    await wait(300);               // 等提交定时器走完再清理，避免迟到回调
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
    // ⭐ 所有运算符都可点，但要找"当前可算"的那个（title 区分）；点错的会给提示、不推进
    const canOp = () => [...container.querySelectorAll('.b1-op.b1-clickable')].find(op => op.title === '点我先算这一步');
    const firstOp = canOp();
    expect(firstOp).toBeTruthy();
    firstOp.click();
    pressDigit('3');
    pressConfirm();
    await wait(2300);
    // 还剩 ÷ → 行内只剩 数字 运算符 数字：⭐ 直通输入，无需再点运算符
    expect(keypadVisible()).toBe(true);
    pressDigit('3');
    pressConfirm();
    await wait(2300);
    // ⭐ 终局：算完 → 键盘平滑滑下
    await wait(400);
    expect(container.querySelector('#m1fb').textContent).toContain('全部算完');
    expect(keypadVisible()).toBe(false);
    expect(container.querySelector('.b1-card').classList.contains('b1-awaiting')).toBe(false);
    cleanup();
  });

  it('视觉重心归零：右上角无任何常驻按钮，换题抽屉整体移除', async () => {
    const cleanup = await mount(container, ctx);
    // ⭐ 页面上除算式本体外，不得有任何常驻操作按钮（Aji 气泡由 aji.js 独立挂载）
    expect(container.querySelector('#m1reset')).toBeNull();
    expect(container.querySelector('#m1gear')).toBeNull();
    expect(container.querySelector('#m1sheet')).toBeNull();
    expect(container.querySelector('#m1Random')).toBeNull();
    expect(container.querySelectorAll('button').length).toBe(0);
    cleanup();
  });

  it('换题接口：Aji 走 loadExpression 载入指定算式；非法文本被拒且不动当前题', async () => {
    const cleanup = await mount(container, ctx);
    const before = container.querySelector('.b1-rows').textContent;

    expect(loadExpr('5 + 3')).toBe(true);
    await wait(50);
    expect(container.querySelector('.b1-rows').textContent).toContain('5');
    expect(container.querySelector('.b1-rows').textContent).toContain('3');
    const afterLoad = container.querySelector('.b1-rows').textContent;
    expect(afterLoad).not.toBe(before);

    // ⭐ 夹带文字的问句不能被当成算式（parseExpression 很宽容，必须自己把关）
    expect(loadExpr('我们算 3+4 好吗')).toBe(false);
    expect(loadExpr('帮我讲讲这道题')).toBe(false);
    expect(loadExpr('')).toBe(false);
    // 被拒 → 当前题一字未动
    expect(container.querySelector('.b1-rows').textContent).toBe(afterLoad);
    cleanup();
  });

  it('换题接口：nextProblem 换一道新题', async () => {
    const cleanup = await mount(container, ctx);
    expect(typeof activeModules.m1.nextProblem).toBe('function');
    const before = container.querySelector('.b1-rows').textContent;
    activeModules.m1.nextProblem();
    await wait(50);
    // 换题后仍是一道可算的题（可能随机到同题，故只断言结构仍在、没崩）
    expect(container.querySelectorAll('.b1-row').length).toBeGreaterThan(0);
    expect(container.querySelector('#m1fb')).toBeTruthy();
    void before;
    cleanup();
  });

  it('终局回溯：柔声提示 + Thumb Bar 主导（Aji 静默）；去修改回滚改正记对', { timeout: 20000 }, async () => {
    const cleanup = await mount(container, ctx);
    loadExpr('5 - 3');                                        // 单步题：唯一一步即终局
    // ⭐ 直通输入：载入即自动弹出输入框（无需点运算符）
    pressDigit('9');
    pressConfirm();                                           // 终局答错
    await wait(2300);                                         // 等合并动画 + 终局判定

    const fb = container.querySelector('#m1fb');
    expect(fb.textContent).toContain('好像哪里出了一点小偏差，我们回头检查一下？');
    expect(fb.className).not.toContain('error');               // 无红、无缩略条
    expect(keypadVisible()).toBe(false);                       // 终局谢幕，键盘滑下
    expect(ctx.data.historyAdd).not.toHaveBeenCalled();        // 不判 0、不记错
    // ⭐ 回溯期由 Thumb Bar 主导：Aji 浮条绝不出现（常规态挂起的空闲请求已收）
    expect(ajiToastVisible()).toBe(false);

    // 学生点「去修改」→ 级联重置：行清空、重开该步输入
    const goFix = [...ctx.showThumbBar.mock.calls].reverse().find(c => c[0].nextLabel === '去修改');
    goFix[0].onNext();
    await wait(100);
    expect(container.querySelectorAll('.b1-row').length).toBe(1);   // 后续行清空
    expect(keypadVisible()).toBe(true);                        // 重新输入，键盘弹出
    pressDigit('2');
    pressConfirm();
    await wait(2300);
    expect(fb.textContent).toContain('全部算完');
    expect(ctx.data.historyAdd).toHaveBeenCalledTimes(1);
    expect(ctx.data.historyAdd.mock.calls[0][0].isCorrect).toBe(true);
    cleanup();
  });

  it('终局答错后一直不改：不催不判；主动换题此刻才结算为错', { timeout: 20000 }, async () => {
    const cleanup = await mount(container, ctx);
    loadExpr('5 - 3');
    // ⭐ 直通输入：载入即自动弹出输入框
    pressDigit('9');
    pressConfirm();
    await wait(2300);
    expect(ctx.data.historyAdd).not.toHaveBeenCalled();   // 静默等待，绝不判 0

    // ⭐ 右上角 ↻ 已移除：放弃的出口是「换一题」（Aji 对话 / 终局缩略条），
    //    两条路都汇到 nextProblem → m1LoadExpression → m1SettleAbandoned
    activeModules.m1.nextProblem();
    expect(ctx.data.historyAdd).toHaveBeenCalledTimes(1);
    const rec = ctx.data.historyAdd.mock.calls[0][0];
    expect(rec.isCorrect).toBe(false);
    expect(rec.studentAnswer).toBe('9');
    expect(rec.correctAnswer).toBe('2');
    // 换题后微光/守护无痕退场
    expect(container.querySelector('.b1-glow')).toBeNull();
    cleanup();
  });

  it('级联重置：早期答错→带错继续→终局回溯→点首个错步回滚→清后续重推→对', { timeout: 30000 }, async () => {
    const cleanup = await mount(container, ctx);
    loadExpr('3 + 4 + 5');                                   // 3+4=7，7+5=12
    // 第 0 步：3+4，故意答 8（错）——多步题首步仍需点运算符
    container.querySelector('.b1-row .b1-op.b1-clickable').click();
    pressDigit('8'); pressConfirm();
    await wait(2300);
    expect(container.querySelectorAll('.b1-row').length).toBe(2);
    // 第 1 步：8+5=13 —— 行内只剩 num op num → ⭐ 直通输入，无需点运算符
    expect(keypadVisible()).toBe(true);
    pressDigit('1'); pressDigit('3'); pressConfirm();
    await wait(2300);
    // 终局：13 ≠ 标准 12 → 回溯
    expect(container.querySelector('#m1fb').textContent).toContain('回头检查');
    expect(ctx.data.historyAdd).not.toHaveBeenCalled();
    expect(ajiToastVisible()).toBe(false);   // ⭐ 回溯期由 Thumb Bar 主导，Aji 静默

    // 点「去修改」→ 后续行被清空，只剩原始行；重输 7
    const goFix = [...ctx.showThumbBar.mock.calls].reverse().find(c => c[0].nextLabel === '去修改');
    goFix[0].onNext();
    await wait(100);
    expect(container.querySelectorAll('.b1-row').length).toBe(1);   // ⭐ 后续行清空
    pressDigit('7'); pressConfirm();
    await wait(2300);
    expect(container.querySelectorAll('.b1-row').length).toBe(2);
    // 第 1 步：7+5=12 → ⭐ 直通输入（自动弹出），答 12 → 终局对
    pressDigit('1'); pressDigit('2'); pressConfirm();
    await wait(2300);
    expect(container.querySelector('#m1fb').textContent).toContain('全部算完');
    expect(ctx.data.historyAdd).toHaveBeenCalledTimes(1);
    expect(ctx.data.historyAdd.mock.calls[0][0].isCorrect).toBe(true);
    cleanup();
  });

  it('最后一步直通输入：载入即 num op num（5 − 3）→ 自动弹输入框，无需点运算符', async () => {
    const cleanup = await mount(container, ctx);
    loadExpr('5 - 3');
    await wait(50);
    // ⭐ 消灭冗余点击：没有点任何运算符，输入框已就位、键盘已弹起
    expect(inputRow_state(container)).toBe('flex');
    expect(keypadVisible()).toBe(true);
    expect(container.querySelector('#m1fb').textContent).toContain('请算出这一步的得数');
    pressDigit('2'); pressConfirm();
    await wait(2300);
    expect(container.querySelector('#m1fb').textContent).toContain('全部算完');
    cleanup();
  });

  it('过程零判定：算对中间步骤不弹任何"正确"暗示（无鼓励语/无绿框/无缩略条）', { timeout: 20000 }, async () => {
    const cleanup = await mount(container, ctx);
    const row = container.querySelector('.b1-row');
    row.querySelectorAll('.b1-op.b1-clickable')[0].click();
    pressDigit('9'); pressConfirm();   // (3+6)=9，答对
    // ⭐ 过程全放行：不弹鼓励语、不切 ok 档、不召唤缩略条——对错只在内部登记
    const fb = container.querySelector('#m1fb');
    expect(fb.className).not.toContain('ok');
    expect(fb.textContent).toContain('请算出这一步的得数');   // 提示语原样，未被正确暗示覆盖
    expect(ctx.showThumbBar).not.toHaveBeenCalled();
    await wait(2300);
    // 提交后继续推导的中性引导，也不含"正确"字样
    expect(container.querySelector('#m1fb').textContent).not.toContain('正确');
    cleanup();
  });

  it('Aji 智能延迟：常规态空闲 35s 浮条浮现；任何有效操作立刻淡出且计时重置', async () => {
    const cleanup = await mount(container, ctx);
    const aji = getAji();
    aji.hideToast();   // 清掉 mount 时挂在真实时钟上的空闲计时（防泄漏）
    const toast = () => document.querySelector('.aji-float-bubble');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      aji.requestIdleToast(35000, '有点卡壳？点击看看我怎么想。', null);
      vi.advanceTimersByTime(34000);
      expect(ajiToastVisible()).toBe(false);   // 差 1 秒不浮现

      // 任何有效操作 → 计时重新起算
      document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
      vi.advanceTimersByTime(34000);
      expect(ajiToastVisible()).toBe(false);   // 距操作仅 34s，仍静默
      vi.advanceTimersByTime(1000);             // 静置满 35s
      expect(ajiToastVisible()).toBe(true);
      expect(toast().textContent).toContain('有点卡壳');

      // 浮条出现后再有操作 → 立刻淡出（绝不打扰）
      document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
      expect(ajiToastVisible()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
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
  // ⭐ 防跳动契约：占位恒在（display 恒为 flex），激活态由 .b1-active（opacity）表达
  return container.querySelector('#m1inputrow').classList.contains('b1-active') ? 'flex' : 'none';
}
