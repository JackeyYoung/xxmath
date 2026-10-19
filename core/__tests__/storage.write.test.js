import { describe, it, expect, beforeEach, vi } from 'vitest';

// ⭐ mock 一个"写会失败"的 store
const mockStore = new Map();
let shouldFailSet = false;
let shouldFailRemove = false;

globalThis.localforage = {
  createInstance: () => ({
    keys: async () => [...mockStore.keys()],
    getItem: async (k) => mockStore.get(k) ?? null,
    setItem: async (k, v) => {
      if (shouldFailSet) throw new Error('write failed');
      mockStore.set(k, v);
    },
    removeItem: async (k) => {
      if (shouldFailRemove) throw new Error('remove failed');
      mockStore.delete(k);
    },
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
  lsSet, lsRemove, flushStorage, onStorageError,
} = await import('../storage.js');

describe('storage · 写队列失败路径', () => {
  beforeEach(() => {
    mockStore.clear();
    shouldFailSet = false;
    shouldFailRemove = false;
  });

  it('setItem 失败 → 触发 onStorageError', async () => {
    const errors = [];
    const off = onStorageError(e => errors.push(e));

    shouldFailSet = true;
    lsSet('grade3_fail_set', 'v');
    await flushStorage();

    off();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.key === 'grade3_fail_set')).toBe(true);
  });

  it('removeItem 失败 → 触发 onStorageError', async () => {
    const errors = [];
    const off = onStorageError(e => errors.push(e));

    mockStore.set('grade3_fail_rm', 'v');
    shouldFailRemove = true;
    lsRemove('grade3_fail_rm');
    await flushStorage();

    off();
    expect(errors.length).toBeGreaterThan(0);
  });

  it('写队列串行化：连续写同 key 不丢', async () => {
    lsSet('grade3_serial', 'v1');
    lsSet('grade3_serial', 'v2');
    lsSet('grade3_serial', 'v3');
    await flushStorage();
    expect(mockStore.get('grade3_serial')).toBe('v3');
  });
});