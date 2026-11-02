// grades/grade3/__tests__/index.test.js
import { describe, it, expect } from 'vitest';
import GRADE3 from '../index.js';

describe('grade3 index', () => {
  it('有 id 和 name', () => {
    expect(GRADE3.id).toBe('3');
    expect(GRADE3.name).toBe('三年级');
  });

  it('modules 懒加载器包含 m1~m13', () => {
    const ids = Object.keys(GRADE3.modules);
    expect(ids.length).toBe(13);
    expect(ids).toContain('m1');
    expect(ids).toContain('m13');
    // 每个 loader 都是返回 Promise 的函数
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
