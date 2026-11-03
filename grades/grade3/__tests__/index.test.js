// grades/grade3/__tests__/index.test.js
// ⭐ arch 版 index.js = 默认导出的年级描述符：modules 是 loader 注册表（id → 动态 import），
//    测试对真实形状断言（不复活 fork 时代的 GRADE3_META 数组导出）。
import { describe, it, expect } from 'vitest';
import GRADE3 from '../index.js';

describe('grade3 index', () => {
  it('有 id 和 name', () => {
    expect(GRADE3.id).toBe('3');
    expect(GRADE3.name).toBe('三年级');
  });

  it('modules 是 loader 注册表：13 个（m1~m13），m14 刻意不进注册表', () => {
    expect(Object.keys(GRADE3.modules)).toContain('m1');
    expect(Object.keys(GRADE3.modules)).toContain('m13');
    // ⭐ m14（我的成长）由成长页 views/growth.js 直挂，刻意不进 loader 注册表——锁定该设计
    expect('m14' in GRADE3.modules).toBe(false);
    // 每个 loader 都必须是可调用的动态 import 函数
    for (const loader of Object.values(GRADE3.modules)) {
      expect(typeof loader).toBe('function');
    }
  });
});
