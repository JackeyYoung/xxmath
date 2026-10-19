import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockMem = new Map();
vi.mock('../storage.js', () => ({
  lsGet: (k) => mockMem.get(k) ?? null,
  lsSet: (k, v) => { mockMem.set(k, v); },
  lsRemove: (k) => { mockMem.delete(k); },
  lsKeysByPrefix: (p) => [...mockMem.keys()].filter(k => k.startsWith(p)),
}));

vi.mock('../keys.js', () => ({
  TAKEAWAY_KEY_PREFIX: 'grade3_takeaway_',
}));

vi.mock('../events.js', () => ({
  emit: vi.fn(),
  EVT: { DATA_CHANGED: 'data:changed' },
}));

const {
  takeawayKey, takeawaySave, takeawayLoad, takeawayListAll,
} = await import('../takeaway.js');

describe('takeaway', () => {
  beforeEach(() => {
    mockMem.clear();
  });

  it('takeawayKey：相同文本 → 相同 key', () => {
    expect(takeawayKey('hello')).toBe(takeawayKey('hello'));
  });

  it('takeawayKey：不同文本 → 不同 key（大多数情况）', () => {
    expect(takeawayKey('a')).not.toBe(takeawayKey('b'));
  });

  it('takeawayKey：空文本 → null', () => {
    expect(takeawayKey('')).toBeNull();
    expect(takeawayKey(null)).toBeNull();
    expect(takeawayKey('   ')).toBeNull();
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