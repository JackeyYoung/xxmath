import { describe, it, expect, beforeEach, vi } from 'vitest';

// ⭐⭐⭐ 关键：在 import storage.js 之前，删掉 localforage
delete globalThis.localforage;

// ⭐ 让 isPersistKey / MIGRATED_FLAG 保持真实
vi.mock('../keys.js', async () => {
  const actual = await vi.importActual('../keys.js');
  return {
    ...actual,
    isPersistKey: (k) => typeof k === 'string' && /^grade\d+_/.test(k),
    MIGRATED_FLAG: '__migrated_v1',
  };
});

const {
  lsGet, lsSet, lsRemove, lsKeysByPrefix,
  initStorage, getStorageHealth, onStorageError,
} = await import('../storage.js');

describe('storage · 无 localforage 降级到 localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getStore 返回 null 时不崩', () => {
    // 触发任何 lsSet 就会走 getStore()
    expect(() => lsSet('grade3_a', 'v')).not.toThrow();
  });

  it('lsSet 写入 localStorage', () => {
    lsSet('grade3_fb1', 'hello');
    expect(localStorage.getItem('grade3_fb1')).toBe('hello');
    expect(lsGet('grade3_fb1')).toBe('hello');
  });

  it('lsRemove 从 localStorage 删除', () => {
    localStorage.setItem('grade3_fb2', 'x');
    lsRemove('grade3_fb2');
    expect(localStorage.getItem('grade3_fb2')).toBeNull();
  });

  it('lsSet 抛 QuotaExceeded 时触发 storage error', () => {
    const errors = [];
    const off = onStorageError(e => errors.push(e));

    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    lsSet('grade3_quota', 'big');

    spy.mockRestore();
    off();

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].key).toBe('grade3_quota');
  });

  it('lsRemove 抛错时也触发 storage error', () => {
    const errors = [];
    const off = onStorageError(e => errors.push(e));

    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('remove failed');
    });

    lsRemove('grade3_x');

    spy.mockRestore();
    off();

    expect(errors.length).toBeGreaterThan(0);
  });

  it('getStorageHealth 在失败后 failCount > 0', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('x');
    });
    lsSet('grade3_health', 'v');
    spy.mockRestore();

    const h = getStorageHealth();
    expect(h.failCount).toBeGreaterThan(0);
    expect(h.ok).toBe(false);
  });
});

describe('storage · initStorage 无 store 回退', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initStorage 从 localStorage 回填内存', async () => {
    localStorage.setItem('grade3_init_a', 'from-ls-1');
    localStorage.setItem('grade3_init_b', 'from-ls-2');
    await initStorage();
    expect(lsGet('grade3_init_a')).toBe('from-ls-1');
    expect(lsGet('grade3_init_b')).toBe('from-ls-2');
  });

  it('initStorage 跳过非 persist key', async () => {
    localStorage.setItem('other_key', 'x');
    await initStorage();
    expect(lsGet('other_key')).toBeNull();
  });
});

describe('storage · lsKeysByPrefix', () => {
  it('只返回匹配前缀的 key', () => {
    lsSet('grade3_a', '1');
    lsSet('grade3_b', '2');
    lsSet('other_x', '3');
    const keys = lsKeysByPrefix('grade3_');
    expect(keys).toContain('grade3_a');
    expect(keys).toContain('grade3_b');
    expect(keys).not.toContain('other_x');
  });
});