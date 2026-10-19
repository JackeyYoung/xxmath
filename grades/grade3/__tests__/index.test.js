// grades/grade3/__tests__/index.test.js
import { describe, it, expect } from 'vitest';
import { GRADE3_META } from '../index.js';

describe('grade3 index', () => {
  it('有 id 和 name', () => {
    expect(GRADE3_META.id).toBe('3');
    expect(GRADE3_META.name).toBe('三年级');
  });

  it('modules 包含 14 个模块', () => {
    expect(GRADE3_META.modules.length).toBe(14);
    expect(GRADE3_META.modules).toContain('m1');
    expect(GRADE3_META.modules).toContain('m14');
  });
});