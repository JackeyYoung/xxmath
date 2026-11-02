import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockMem = new Map();
vi.mock('../storage.js', () => ({
  lsGet: (k) => mockMem.get(k) ?? null,
  lsSet: (k, v) => { mockMem.set(k, v); },
  lsRemove: (k) => { mockMem.delete(k); },
  lsKeysByPrefix: (p) => [...mockMem.keys()].filter(k => k.startsWith(p)),
}));

vi.mock('../keys.js', () => ({
  getGradeKey: (prefix) => `grade3_${prefix}`,
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