// core/__tests__/chat-keypad.test.js
// Aji 聊天键盘单测：默认文字层 / 切层 / 退格 / 发送 / 高度上报 / 绝不碰 body 布局
// ⚠️ 最要紧的两条不变量：
//    ① 与做题键盘 virtual-keypad.js 是**两个独立实例**（复用会打断 m1/m9 判卷）
//    ② 绝不写 document.body.style.paddingBottom（背后算式重排的唯一来源）
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../js/vendor/gsap/index.js', () => ({
  gsap: { set: vi.fn(), to: vi.fn(), fromTo: vi.fn(), killTweensOf: vi.fn() },
}));

import { getChatKeypad, FEATURE_HANDWRITING } from '../ui/chat-keypad.js';
import { getVirtualKeypad } from '../ui/virtual-keypad.js';

/* jsdom 没有布局引擎：rect 全是 0。给键盘和 body 一个可辨认的高度，
   让"上报高度"这条链路能真的被断言（而不是断言 0 === 0）。 */
function stubHeights(kpHeight, bodyHeight = 0) {
  const proto = window.HTMLElement.prototype;
  const orig = proto.getBoundingClientRect;
  proto.getBoundingClientRect = function () {
    let h = 0;
    if (this.classList?.contains('akp')) h = kpHeight;
    else if (this === document.body) h = bodyHeight;
    return { top: 0, left: 0, right: 300, bottom: h, width: 300, height: h, x: 0, y: 0, toJSON() {} };
  };
  return () => { proto.getBoundingClientRect = orig; };
}

let restoreRect = null;
beforeEach(() => {
  document.body.innerHTML = '';
  document.body.style.paddingBottom = '';
  // 单例：每个用例前销毁，避免跨用例串状态
  try { getChatKeypad().destroy(); } catch (e) {}
  try { getVirtualKeypad().destroy(); } catch (e) {}
});
afterEach(() => {
  if (restoreRect) { restoreRect(); restoreRect = null; }
  try { getChatKeypad().destroy(); } catch (e) {}
});

const keysOf = (kp) => [...kp.el.querySelectorAll('.akp-key')].map((k) => k.textContent);
const tap = (kp, label) => {
  const btn = [...kp.el.querySelectorAll('.akp-key')].find((k) => k.textContent === label);
  btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
};
/* ⚠️ jsdom 不做布局，getComputedStyle 不会把 repeat(8, 1fr) 展开成 8 个值
   （实测只剩 2 个分量）。所以断言"列数"要看**源码里那一行**与**每行的实际键数**，
   而不是读计算样式——后者在 jsdom 里测的是解析器的怪癖，不是我们的契约。 */
const modeCols = (kp) => {
  const m = /repeat\((\d+),\s*1fr\)/.exec(kp.gridEl.style.gridTemplateColumns || '');
  return m ? Number(m[1]) : null;
};
/* 本层全部键占的格数（span 键按 span 计），用于证明"每行正好铺满、不留空洞" */
const rowWidths = (kp) => {
  let acc = 0;
  for (const btn of kp.el.querySelectorAll('.akp-key')) {
    acc += Number((/span\s+(\d+)/.exec(btn.style.gridColumn) || [])[1] || 1);
  }
  return acc;
};

describe('聊天键盘 · 默认层与切层', () => {
  it('默认是文字层：有 a-z、中文标点、?123 切换键，且无数学运算符', () => {
    const kp = getChatKeypad();
    const keys = keysOf(kp);
    for (const c of 'abcdefghijklmnopqrstuvwxyz') expect(keys).toContain(c);
    for (const p of ['，', '。', '？', '；', '：']) expect(keys).toContain(p);
    expect(keys).toContain('?123');
    expect(keys).toContain('⌫');
    expect(keys).toContain('发送');
    // ⭐ 默认层不该出现数学键——学生对着聊天框 99% 是在说话
    expect(keys).not.toContain('+');
    expect(keys).not.toContain('=');
    expect(keys).not.toContain('1');
  });

  it('文字层是 8 列（小键宽），数学层是 4 列（大键，专注计算）', () => {
    const kp = getChatKeypad();
    expect(modeCols(kp)).toBe(8);
    // 每层总格数必须是列数的整数倍（每行正好铺满，不留空洞）
    expect(rowWidths(kp) % 8).toBe(0);
    tap(kp, '?123');
    expect(modeCols(kp)).toBe(4);
    expect(rowWidths(kp) % 4).toBe(0);
  });

  it('?123 → 数学层：0-9、+ − = . 、⌫、发送、ABC；且无字母', () => {
    const kp = getChatKeypad();
    tap(kp, '?123');
    const keys = keysOf(kp);
    for (const d of '0123456789') expect(keys).toContain(d);
    for (const s of ['+', '−', '=', '.', '⌫', '发送', 'ABC']) expect(keys).toContain(s);
    expect(keys).not.toContain('a');
    expect(keys).not.toContain('z');
  });

  it('ABC → 切回文字层（往返可逆）', () => {
    const kp = getChatKeypad();
    tap(kp, '?123');
    expect(kp.mode).toBe('symbol');
    tap(kp, 'ABC');
    expect(kp.mode).toBe('text');
    expect(keysOf(kp)).toContain('a');
  });

  it('setMode 可直接切层，非法层名被忽略', () => {
    const kp = getChatKeypad();
    kp.setMode('symbol');
    expect(kp.mode).toBe('symbol');
    kp.setMode('nope');
    expect(kp.mode).toBe('symbol');
  });
});

describe('聊天键盘 · 回调上抛（组件内零业务语义）', () => {
  it('点字母/标点 → onKey 收到那个字符', () => {
    const kp = getChatKeypad();
    const seen = [];
    kp.show({ onKey: (c) => seen.push(c) });
    tap(kp, 'k');
    tap(kp, '，');
    tap(kp, '空格');
    expect(seen).toEqual(['k', '，', ' ']);
  });

  it('⌫ → onBackspace；发送 → onSubmit', () => {
    const kp = getChatKeypad();
    const calls = [];
    kp.show({ onBackspace: () => calls.push('bs'), onSubmit: () => calls.push('go') });
    tap(kp, '⌫');
    tap(kp, '发送');
    expect(calls).toEqual(['bs', 'go']);
  });

  it('切层会通知 onModeChange（宿主据此做别的联动）', () => {
    const kp = getChatKeypad();
    const modes = [];
    kp.show({ onModeChange: (m) => modes.push(m) });
    tap(kp, '?123');
    tap(kp, 'ABC');
    expect(modes).toEqual(['symbol', 'text']);
  });
});

describe('聊天键盘 · 高度上报（宿主的托举依据）', () => {
  it('show() 会上报当前高度；hide() 立刻上报 0（不等动画结束）', () => {
    restoreRect = stubHeights(280);
    const kp = getChatKeypad();
    const heights = [];
    kp.show({ onResize: (h) => heights.push(h) });
    expect(heights[heights.length - 1]).toBe(280);
    kp.hide();
    expect(heights[heights.length - 1]).toBe(0);
  });

  it('切层后重新上报（两层行数不同 → 高度会变）', () => {
    restoreRect = stubHeights(280);
    const kp = getChatKeypad();
    const heights = [];
    kp.show({ onResize: (h) => heights.push(h) });
    const n = heights.length;
    // 文字层 5 行 vs 数学层 5 行 → 高度可能相同，但**必须重新上报一次**
    tap(kp, '?123');
    expect(heights.length).toBeGreaterThan(n);
  });

  it('重新 show() 时若已可见：不重播动画、仍重绑回调', () => {
    const kp = getChatKeypad();
    const a = [];
    kp.show({ onKey: (c) => a.push('A' + c) });
    const b = [];
    kp.show({ onKey: (c) => b.push('B' + c) });
    tap(kp, 'k');
    expect(a).toEqual([]);        // 旧回调已被替换
    expect(b).toEqual(['Bk']);
  });
});

describe('聊天键盘 · 两条硬不变量', () => {
  it('绝不写 document.body.style.paddingBottom（背后重排的唯一来源）', () => {
    const kp = getChatKeypad();
    kp.show({});
    expect(document.body.style.paddingBottom).toBe('');
    tap(kp, 'k');
    kp.hide();
    expect(document.body.style.paddingBottom).toBe('');
  });

  it('与做题键盘是两个独立实例、两套 DOM 节点（复用会打断 m1/m9 判卷）', () => {
    const chat = getChatKeypad();
    const calc = getVirtualKeypad();
    expect(chat).not.toBe(calc);
    expect(chat.el).not.toBe(calc.el);
    expect(chat.el.className).toContain('akp');
    expect(calc.el.className).toContain('vkp');
    // 做题键盘的按键是 data-digit/confirm；聊天键盘用 data-act —— 键集完全不重叠
    expect(chat.el.querySelectorAll('[data-digit]').length).toBe(0);
    expect(calc.el.querySelectorAll('[data-act]').length).toBe(0);
  });

  it('聊天键盘 show/hide 不影响做题键盘的可见性', () => {
    const chat = getChatKeypad();
    const calc = getVirtualKeypad();
    calc.show({});
    const before = calc.visible;
    chat.show({});
    chat.hide();
    expect(calc.visible).toBe(before);
  });
});

describe('聊天键盘 · 手写预留', () => {
  it('FEATURE_HANDWRITING 关闭，且界面不留手写按钮/画板（可见即可用是硬线）', () => {
    expect(FEATURE_HANDWRITING).toBe(false);
    const kp = getChatKeypad();
    kp.show({});
    const labels = keysOf(kp).join('');
    expect(labels).not.toMatch(/手写|画板|笔/);
    expect(kp.el.querySelectorAll('canvas').length).toBe(0);
    expect(document.querySelectorAll('canvas').length).toBe(0);
  });
});
