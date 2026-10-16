import { describe, it, expect } from 'vitest';
import {
  getAddSubMaxLen, computeAnswerMap, getMaxSteps, calcFinalResult,
} from '../m9.js';

// ============================================================
// ⚠️ 重要：computeAnswerMap 的 key 索引方向
//
// 加减法：result-0 = 最高位，result-2 = 个位（倒序遍历）
// 乘法：  result-0 = 个位，result-2 = 百位（反转数组正序遍历）
// 除法：  quotient-0 = 最高位商（stepIdx 从左往右）
//
// 这是 m9.js 的现状，测试按实际行为写。
// 如果未来要统一 key 方向，需要同时改 m9.js 和 main.js 的渲染逻辑。
// ============================================================

describe('m9 · getAddSubMaxLen', () => {
  it('348 + 176 → 3 位', () => {
    expect(getAddSubMaxLen(348, 176, '+')).toBe(3);
  });
  it('99 + 1 → 3 位（进位补位）', () => {
    expect(getAddSubMaxLen(99, 1, '+')).toBe(3);
  });
  it('100 - 99 → 3 位', () => {
    expect(getAddSubMaxLen(100, 99, '−')).toBe(3);
  });
  it('较短数字也要 padStart', () => {
    expect(getAddSubMaxLen(5, 1234, '+')).toBe(4);
  });
});

describe('m9 · computeAnswerMap 加法', () => {
  it('348 + 176 = 524', () => {
    const map = computeAnswerMap({ a: 348, b: 176, op: '+' });
    // ⭐ key 方向：result-2=个位, result-1=十位, result-0=百位
    expect(map['result-2']).toBe('4');   // 个位 8+6=14 写 4
    expect(map['carry-2']).toBe('1');    // 进 1
    expect(map['result-1']).toBe('2');   // 十位 4+7+1=12 写 2
    expect(map['carry-1']).toBe('1');
    expect(map['result-0']).toBe('5');   // 百位 3+1+1=5
  });

  it('不进位：12 + 34 = 46', () => {
    const map = computeAnswerMap({ a: 12, b: 34, op: '+' });
    // maxLen = 2，result-1=个位, result-0=十位
    expect(map['result-1']).toBe('6');   // 个位 2+4=6
    expect(map['result-0']).toBe('4');   // 十位 1+3=4
    expect(map['carry-1']).toBeUndefined();
    expect(map['carry-0']).toBeUndefined();
  });
});

describe('m9 · computeAnswerMap 减法', () => {
  it('500 - 123 = 377', () => {
    const map = computeAnswerMap({ a: 500, b: 123, op: '−' });
    expect(map['result-2']).toBe('7');   // 个位 0-3 → 借位 → 10-3=7
    expect(map['carry-2']).toBe('1');
    expect(map['result-1']).toBe('7');   // 十位 0-2-1 → 借位 → 10-3=7
    expect(map['carry-1']).toBe('1');
    expect(map['result-0']).toBe('3');   // 百位 5-1-1=3
  });

  it('不退位：85 - 32 = 53', () => {
    const map = computeAnswerMap({ a: 85, b: 32, op: '−' });
    expect(map['result-1']).toBe('3');   // 个位 5-2=3
    expect(map['result-0']).toBe('5');   // 十位 8-3=5
    expect(map['carry-1']).toBeUndefined();
    expect(map['carry-0']).toBeUndefined();
  });
});

describe('m9 · computeAnswerMap 乘法', () => {
  it('348 × 4 = 1392', () => {
    const map = computeAnswerMap({ a: 348, b: 4, op: '×' });
    // ⭐ 乘法 key 方向：result-0=个位, result-3=千位
    expect(map['result-0']).toBe('2');   // 个位 8×4=32 写 2
    expect(map['carry-1']).toBe('3');    // 进 3
    expect(map['result-1']).toBe('9');   // 十位 4×4+3=19 写 9
    expect(map['carry-2']).toBe('1');    // 进 1
    expect(map['result-2']).toBe('3');   // 百位 3×4+1=13 写 3
    expect(map['carry-3']).toBe('1');
    expect(map['result-3']).toBe('1');   // 千位进 1
  });

  it('无进位：12 × 3 = 36', () => {
    const map = computeAnswerMap({ a: 12, b: 3, op: '×' });
    expect(map['result-0']).toBe('6');   // 个位 2×3=6
    expect(map['result-1']).toBe('3');   // 十位 1×3=3
  });
});

describe('m9 · computeAnswerMap 除法', () => {
  it('936 ÷ 4 = 234', () => {
    const map = computeAnswerMap({ a: 936, b: 4, op: '÷' });
    // ⭐ 除法 key：quotient-0=最高位商
    expect(map['quotient-0']).toBe('2');
    expect(map['quotient-1']).toBe('3');
    expect(map['quotient-2']).toBe('4');
    expect(map['remainder-2']).toBe('0');
  });

  it('有余数：47 ÷ 5 = 9 余 2', () => {
    const map = computeAnswerMap({ a: 47, b: 5, op: '÷' });
    expect(map['quotient-0']).toBe('9');
    expect(map['remainder-0']).toBe('2');
  });

  it('前导 0 跳过：102 ÷ 3 = 34', () => {
    const map = computeAnswerMap({ a: 102, b: 3, op: '÷' });
    expect(map['quotient-0']).toBe('3');
    expect(map['quotient-1']).toBe('4');
  });
});

describe('m9 · getMaxSteps', () => {
  it('加法 348+176 → 2', () => {
    expect(getMaxSteps({ a: 348, b: 176, op: '+' })).toBe(2);
  });
  it('乘法 12×3 → 1', () => {
    expect(getMaxSteps({ a: 12, b: 3, op: '×' })).toBe(1);
  });
  it('乘法 348×4 → 3', () => {
    expect(getMaxSteps({ a: 348, b: 4, op: '×' })).toBe(3);
  });
  it('除法 936÷4 → 2', () => {
    expect(getMaxSteps({ a: 936, b: 4, op: '÷' })).toBe(2);
  });
  it('被除数 < 除数 → 0 步', () => {
    expect(getMaxSteps({ a: 3, b: 10, op: '÷' })).toBe(0);
  });
});

describe('m9 · calcFinalResult', () => {
  it('加法', () => expect(calcFinalResult({ a: 348, b: 176, op: '+' })).toBe(524));
  it('减法', () => expect(calcFinalResult({ a: 500, b: 123, op: '−' })).toBe(377));
  it('乘法', () => expect(calcFinalResult({ a: 12, b: 3, op: '×' })).toBe(36));
  it('整除', () => expect(calcFinalResult({ a: 936, b: 4, op: '÷' })).toBe(234));
  it('有余数', () => expect(calcFinalResult({ a: 47, b: 5, op: '÷' })).toBe('9 余 2'));
});