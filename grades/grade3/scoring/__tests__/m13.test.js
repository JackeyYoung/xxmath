import { describe, it, expect } from 'vitest';
import {
  extractNums, problemNumbers,
  isValidSubstitution, checkPassword,
} from '../m13.js';

describe('m13 · extractNums', () => {
  it('提取整数', () => {
    expect(extractNums('有 15 元和 8 元')).toEqual([15, 8]);
  });
  it('提取小数', () => {
    expect(extractNums('1.5 米 2.3 米')).toEqual([1.5, 2.3]);
  });
  it('无数字 → []', () => {
    expect(extractNums('abc')).toEqual([]);
  });
});

describe('m13 · problemNumbers', () => {
  it('去重', () => {
    expect(problemNumbers('15 元，15 元')).toEqual([15]);
  });
  it('混合整数和小数', () => {
    const nums = problemNumbers('买 3 本，每本 12.5 元');
    expect(nums).toContain(3);
    expect(nums).toContain(12.5);
  });
});

describe('m13 · isValidSubstitution', () => {
  const problemNums = [15, 8, 3];

  it('算式含题目数字 → true', () => {
    expect(isValidSubstitution('15 - 8 - 3', problemNums)).toBe(true);
  });

  it('只有一个题目数字 → false（需要至少 2 个）', () => {
    expect(isValidSubstitution('15 - 100', problemNums)).toBe(false);
  });

  it('不含运算符 → false', () => {
    expect(isValidSubstitution('15 8 3', problemNums)).toBe(false);
  });

  it('空字符串 → false', () => {
    expect(isValidSubstitution('', problemNums)).toBe(false);
  });

  it('x 作为乘号', () => {
    expect(isValidSubstitution('3 x 8', problemNums)).toBe(true);
  });

  it('数字少 → false', () => {
    expect(isValidSubstitution('15 +', problemNums)).toBe(false);
  });
});

describe('m13 · checkPassword', () => {
  it('当天密码格式 MM DD pcw', () => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    expect(checkPassword(mm + dd + 'pcw')).toBe(true);
  });

  it('错误密码 → false', () => {
    expect(checkPassword('0000pcw')).toBe(false);
  });
});