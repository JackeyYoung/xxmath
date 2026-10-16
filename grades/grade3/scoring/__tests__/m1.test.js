import { describe, it, expect } from 'vitest';
import {
  parseExpression, fmtNum, tokensToString,
  computePriorityOps, computeDepths, canClickOp,
  computeStep, applyStep, cleanParens, tokensToMarkedHtml,
} from '../m1.js';

describe('m1 · parseExpression', () => {
  it('基本解析', () => {
    const t = parseExpression('12 × 3 + 15');
    expect(t).toEqual([
      { type: 'num', val: 12 },
      { type: 'op', val: '×' },
      { type: 'num', val: 3 },
      { type: 'op', val: '+' },
      { type: 'num', val: 15 },
    ]);
  });

  // 找到 "识别括号" 这个 it，改成：
  it('识别括号', () => {
    const t = parseExpression('(3 + 6) ÷ (4 - 1)');
    expect(t[0].type).toBe('lparen');
    expect(t[4].type).toBe('rparen');    // ← 从 2 改成 4
  });

  it('* / x X 都算乘除', () => {
    expect(parseExpression('2*3')[1].val).toBe('×');
    expect(parseExpression('2/3')[1].val).toBe('÷');
    expect(parseExpression('2x3')[1].val).toBe('×');
    expect(parseExpression('2X3')[1].val).toBe('×');
  });

  it('全角括号', () => {
    const t = parseExpression('（3 + 6）÷ 3');
    expect(t[0].type).toBe('lparen');
  });

  it('忽略空白', () => {
    const t = parseExpression('  12   ×   3  ');
    expect(t.length).toBe(3);
  });

  it('小数', () => {
    const t = parseExpression('1.5 + 2.5');
    expect(t[0].val).toBe(1.5);
    expect(t[2].val).toBe(2.5);
  });

  it('非法字符被忽略', () => {
    const t = parseExpression('12 & 3');
    expect(t.length).toBe(2);
  });
});

describe('m1 · fmtNum', () => {
  it('整数直接字符串', () => {
    expect(fmtNum(42)).toBe('42');
  });
  it('小数四舍五入到 2 位', () => {
    expect(fmtNum(3.14159)).toBe('3.14');
  });
  it('结果带小数点时保留', () => {
    expect(fmtNum(1.5)).toBe('1.5');
  });
});

describe('m1 · tokensToString', () => {
  it('数字和运算符用空格连接', () => {
    const t = parseExpression('12 × 3 + 15');
    expect(tokensToString(t)).toBe('12 × 3 + 15');
  });
});

describe('m1 · computePriorityOps', () => {
  it('有乘除 → 返回乘除下标', () => {
    const t = parseExpression('12 × 3 + 15');
    expect(computePriorityOps(t)).toEqual([1]);
  });

  it('只有加减 → 返回所有运算符', () => {
    const t = parseExpression('12 + 3 + 15');
    const ops = computePriorityOps(t);
    expect(ops.length).toBe(2);
  });

  it('多个乘除都返回', () => {
    const t = parseExpression('2 × 3 + 4 × 5');
    expect(computePriorityOps(t).length).toBe(2);
  });
});

describe('m1 · computeDepths', () => {
  it('无括号 → 全部深度 0', () => {
    const t = parseExpression('1 + 2');
    const { depths, maxDepth } = computeDepths(t);
    expect(depths).toEqual([0, 0, 0]);
    expect(maxDepth).toBe(0);
  });

  it('一层括号', () => {
    const t = parseExpression('(1 + 2) × 3');
    const { maxDepth } = computeDepths(t);
    expect(maxDepth).toBe(1);
  });

  it('嵌套括号', () => {
    const t = parseExpression('((1 + 2)) × 3');
    const { maxDepth } = computeDepths(t);
    expect(maxDepth).toBe(2);
  });
});

describe('m1 · canClickOp', () => {
  it('纯加减：任意运算符都可点', () => {
    const t = parseExpression('1 + 2 + 3');
    expect(canClickOp(t, 1).ok).toBe(true);
    expect(canClickOp(t, 3).ok).toBe(true);
  });

  it('混合：加减不可点，乘除可点', () => {
    const t = parseExpression('1 + 2 × 3');
    expect(canClickOp(t, 1).ok).toBe(false);   // +
    expect(canClickOp(t, 3).ok).toBe(true);    // ×
  });

  it('括号内运算符优先', () => {
    const t = parseExpression('(1 + 2) × 3');
    // + 在括号里（深度 1），× 在外（深度 0）
    expect(canClickOp(t, 2).ok).toBe(true);    // + 在括号内
    expect(canClickOp(t, 4).ok).toBe(false);   // × 在括号外，不能先算
  });

  it('非运算符 → not-op', () => {
    const t = parseExpression('1 + 2');
    expect(canClickOp(t, 0).ok).toBe(false);
    expect(canClickOp(t, 0).reason).toBe('not-op');
  });
});

describe('m1 · computeStep', () => {
  it('加法', () => expect(computeStep(3, 4, '+')).toBe(7));
  it('减法', () => expect(computeStep(10, 3, '-')).toBe(7));
  it('乘法', () => expect(computeStep(6, 7, '×')).toBe(42));
  it('除法', () => expect(computeStep(20, 4, '÷')).toBe(5));
  it('除以 0 抛错', () => {
    expect(() => computeStep(1, 0, '÷')).toThrow('不能除以 0');
  });
});

describe('m1 · applyStep', () => {
  it('替换 3 个 token 为 1 个数字', () => {
    const t = parseExpression('12 × 3 + 15');
    // 算 12 × 3 → 36
    const result = applyStep(t, 1, 36);
    expect(result).toEqual([
      { type: 'num', val: 36 },
      { type: 'op', val: '+' },
      { type: 'num', val: 15 },
    ]);
  });
});

describe('m1 · cleanParens', () => {
  it('括号内只剩一个数字 → 删括号', () => {
    const t = [
      { type: 'lparen', val: '(' },
      { type: 'num', val: 5 },
      { type: 'rparen', val: ')' },
    ];
    const cleaned = cleanParens(t);
    expect(cleaned).toEqual([{ type: 'num', val: 5 }]);
  });

  it('括号内有运算符 → 保留', () => {
    const t = parseExpression('(1 + 2)');
    const cleaned = cleanParens(t);
    expect(cleaned.length).toBe(5);
  });

  it('括号 (5) 后跟着运算符，删括号', () => {
    const t = [
      { type: 'lparen', val: '(' },
      { type: 'num', val: 5 },
      { type: 'rparen', val: ')' },
      { type: 'op', val: '+' },
      { type: 'num', val: 3 },
    ];
    const cleaned = cleanParens(t);
    expect(cleaned[0]).toEqual({ type: 'num', val: 5 });
    expect(cleaned[1]).toEqual({ type: 'op', val: '+' });
  });
});

describe('m1 · tokensToMarkedHtml', () => {
  it('标记范围用 span 包裹', () => {
    const t = parseExpression('12 × 3');
    const html = tokensToMarkedHtml(t, 0, 2);
    expect(html).toContain('<span class="step-part">');
    expect(html).toContain('12');
    expect(html).toContain('3');
  });
});