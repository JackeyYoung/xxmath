// grades/grade3/__tests__/index.test.js
// ⭐ arch 版 index.js = 默认导出的年级描述符：modules 是 loader 注册表（id → 动态 import），
//    测试对真实形状断言（不复活 fork 时代的 GRADE3_META 数组导出）。
// ⭐ 合并并集：feat 的 m14 哨兵 + main 的 islands 一一对应 / defaultHero 断言，双方高价值断言全保留。
import { describe, it, expect } from 'vitest';
import GRADE3 from '../index.js';

describe('grade3 index', () => {
  it('有 id 和 name', () => {
    expect(GRADE3.id).toBe('3');
    expect(GRADE3.name).toBe('三年级');
  });

  it('modules 是 loader 注册表：13 个（m1~m13），m14 刻意不进注册表', () => {
    const ids = Object.keys(GRADE3.modules);
    expect(ids.length).toBe(13);
    expect(ids).toContain('m1');
    expect(ids).toContain('m13');
    // ⭐ m14（我的成长）由成长页 views/growth.js 直挂，刻意不进 loader 注册表——锁定该设计
    expect('m14' in GRADE3.modules).toBe(false);
    // 每个 loader 都是可调用的动态 import 函数
    for (const id of ids) {
      expect(typeof GRADE3.modules[id]).toBe('function');
    }
  });

  it('islands 知识岛与 modules 一一对应', () => {
    const islandIds = GRADE3.islands.map(i => i.id);
    expect(islandIds).toEqual(Object.keys(GRADE3.modules));
    // 每个岛都有展示用的字段
    for (const island of GRADE3.islands) {
      expect(typeof island.icon).toBe('string');
      expect(typeof island.name).toBe('string');
    }
  });

  it('home.defaultHero 指向 m1', () => {
    expect(GRADE3.home.defaultHero.lesson).toBe('m1');
  });
});
