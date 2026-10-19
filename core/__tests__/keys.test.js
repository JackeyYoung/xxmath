import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getGradeKey, getWrongBookKey, getHistoryKey, isPersistKey,
  TAKEAWAY_KEY_PREFIX,
} from '../keys.js';

describe('keys', () => {
  let originalPeek;

  beforeEach(() => {
    originalPeek = globalThis.__memCachePeek;
  });

  afterEach(() => {
    globalThis.__memCachePeek = originalPeek;
  });

  it('默认年级是 3', () => {
    globalThis.__memCachePeek = () => null;
    expect(getGradeKey('test')).toBe('grade3_test');
  });

  it('年级切换后动态变化', () => {
    globalThis.__memCachePeek = (k) =>
      k === 'grade3_current_grade' ? '1' : null;
    expect(getGradeKey('test')).toBe('grade1_test');
    expect(getWrongBookKey()).toBe('grade1_wrong_book_v1');
    expect(getHistoryKey()).toBe('grade1_practice_history_v1');
  });

  it('isPersistKey：grade 开头 + 数字', () => {
    expect(isPersistKey('grade3_history')).toBe(true);
    expect(isPersistKey('grade1_x')).toBe(true);
    expect(isPersistKey('gradeX_x')).toBe(false);
    expect(isPersistKey('other_key')).toBe(false);
    expect(isPersistKey(null)).toBe(false);
    expect(isPersistKey(123)).toBe(false);
  });

  it('TAKEAWAY_KEY_PREFIX 正确', () => {
    expect(TAKEAWAY_KEY_PREFIX).toBe('grade3_takeaway_');
  });

  it('__memCachePeek 未定义时读 localStorage', () => {
    const origPeek = globalThis.__memCachePeek;
    delete globalThis.__memCachePeek;

    localStorage.setItem('grade3_current_grade', '5');
    expect(getGradeKey('x')).toBe('grade5_x');

    localStorage.removeItem('grade3_current_grade');
    globalThis.__memCachePeek = origPeek;
  });

  it('__memCachePeek 抛错时兜底为 3', () => {
    const origPeek = globalThis.__memCachePeek;
    globalThis.__memCachePeek = () => { throw new Error('boom'); };

    expect(getGradeKey('x')).toBe('grade3_x');

    globalThis.__memCachePeek = origPeek;
  });
});