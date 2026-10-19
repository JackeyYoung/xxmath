import { describe, it, expect, beforeEach, vi } from 'vitest';

// ⭐ 用一个内存 Map 模拟 localforage
const mockStore = new Map();
globalThis.localforage = {
  createInstance: () => ({
    keys: async () => [...mockStore.keys()],
    getItem: async (k) => mockStore.get(k) ?? null,
    setItem: async (k, v) => { mockStore.set(k, v); },
    removeItem: async (k) => { mockStore.delete(k); },
  }),
};

vi.mock('../keys.js', async () => {
  const actual = await vi.importActual('../keys.js');
  return {
    ...actual,
    isPersistKey: (k) => typeof k === 'string' && /^grade\d+_/.test(k),
    MIGRATED_FLAG: '__migrated_v1',
  };
});

const {
  lsGet, initStorage, migrateFromLocalStorage,
} = await import('../storage.js');

describe('storage · migrateFromLocalStorage', () => {
  beforeEach(() => {
    mockStore.clear();
    localStorage.clear();
  });

  it('把 localStorage 里的 grade 数据迁移到 localforage', async () => {
    localStorage.setItem('grade3_mig1', 'v1');
    localStorage.setItem('grade3_mig2', 'v2');
    localStorage.setItem('other_key', 'skip');

    await migrateFromLocalStorage();

    expect(mockStore.get('grade3_mig1')).toBe('v1');
    expect(mockStore.get('grade3_mig2')).toBe('v2');
    expect(mockStore.has('other_key')).toBe(false);
  });

  it('迁移后写入 MIGRATED_FLAG，第二次调用直接返回', async () => {
    localStorage.setItem('grade3_mig3', 'v3');
    await migrateFromLocalStorage();

    expect(mockStore.get('__migrated_v1')).toBe('1');

    // 清 localStorage，再调一次
    localStorage.clear();
    localStorage.setItem('grade3_mig4', 'v4');
    await migrateFromLocalStorage();

    // 因为已有标记，不应该迁移 mig4
    expect(mockStore.has('grade3_mig4')).toBe(false);
  });

  it('迁移后的数据能被 initStorage 读回', async () => {
    localStorage.setItem('grade3_mig5', 'v5');
    await migrateFromLocalStorage();
    // 清内存缓存（通过一个新的 init）
    await initStorage();
    expect(lsGet('grade3_mig5')).toBe('v5');
  });

  it('migrate 抛错时不会中断', async () => {
    // 让 setItem 抛错
    const origSet = mockStore.set.bind(mockStore);
    mockStore.set = () => { throw new Error('db fail'); };

    localStorage.setItem('grade3_fail', 'v');
    await expect(migrateFromLocalStorage()).resolves.not.toThrow();

    mockStore.set = origSet;
  });
});