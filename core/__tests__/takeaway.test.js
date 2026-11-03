import { describe, it, expect, beforeEach, vi } from 'vitest';
import { problemId } from '../problem-id.js';   // ⭐ arch 拆出的文本级 key 纯函数（零依赖，无需 mock）

const mockMem = new Map();
vi.mock('../storage.js', () => ({
  lsGet: (k) => mockMem.get(k) ?? null,
  lsSet: (k, v) => { mockMem.set(k, v); },
  lsRemove: (k) => { mockMem.delete(k); },
  lsKeysByPrefix: (p) => [...mockMem.keys()].filter(k => k.startsWith(p)),
}));

vi.mock('../keys.js', () => ({
  // ⭐ arch 版 takeaway.js 走年级隔离键：mock 必须补 getGradeKey（否则 getTakeawayMapKey 内直接炸）
  getGradeKey: (k) => `grade3_${k}`,
}));

vi.mock('../events.js', () => ({
  emit: vi.fn(),
  EVT: { DATA_CHANGED: 'data:changed' },
}));

const {
  takeawaySave, takeawayLoad, takeawayListAll,
} = await import('../takeaway.js');

describe('takeaway', () => {
  beforeEach(() => {
    mockMem.clear();
  });

  it('problemId：相同文本 → 相同 key', () => {
    expect(problemId('hello')).toBe(problemId('hello'));
  });

  it('problemId：不同文本 → 不同 key（大多数情况）', () => {
    expect(problemId('a')).not.toBe(problemId('b'));
  });

  it('problemId：空文本 → 空串（falsy 即视为无 key）', () => {
    expect(problemId('')).toBe('');
    expect(problemId(null)).toBe('');
    expect(problemId('   ')).toBe('');
  });

  it('save + load 往返', () => {
    takeawaySave('problem A', '要用减法');
    expect(takeawayLoad('problem A')).toBe('要用减法');
  });

  it('save 空内容 → 删除', () => {
    takeawaySave('problem A', 'x');
    takeawaySave('problem A', '');
    expect(takeawayLoad('problem A')).toBe('');
  });

  it('takeawayListAll 返回所有非空心得', () => {
    takeawaySave('p1', 'n1');
    takeawaySave('p2', 'n2');
    takeawaySave('p3', '');   // 空的
    const list = takeawayListAll();
    expect(list.length).toBe(2);
  });
});