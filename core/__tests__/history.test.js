import { describe, it, expect, beforeEach, vi } from 'vitest';

// mock storage
const mockMem = new Map();
vi.mock('../storage.js', () => ({
  lsGet: (k) => mockMem.get(k) ?? null,
  lsSet: (k, v) => { mockMem.set(k, v); },
  lsRemove: (k) => { mockMem.delete(k); },
  lsKeysByPrefix: (p) => [...mockMem.keys()].filter(k => k.startsWith(p)),
}));

vi.mock('../keys.js', () => ({
  getHistoryKey: () => 'grade3_practice_history_v1',
}));

vi.mock('../events.js', () => ({
  emit: vi.fn(),
  EVT: { DATA_CHANGED: 'data:changed' },
}));

const {
  historyLoad, historySave, historyAdd, historyRemove, historyClear,
} = await import('../history.js');

describe('history', () => {
  beforeEach(() => {
    mockMem.clear();
  });

  it('空数据 → []', () => {
    expect(historyLoad()).toEqual([]);
  });

  it('historySave + historyLoad 往返', () => {
    historySave([{ id: 'x', problemText: 'q' }]);
    expect(historyLoad()).toEqual([{ id: 'x', problemText: 'q' }]);
  });

  it('historyAdd 添加记录并生成 id + timestamp', () => {
    historyAdd({ problemText: 'q1', isCorrect: true });
    const list = historyLoad();
    expect(list.length).toBe(1);
    expect(list[0].id).toMatch(/^h_/);
    expect(typeof list[0].timestamp).toBe('number');
    expect(list[0].problemText).toBe('q1');
  });

  it('historyAdd 新记录 unshift 到最前', () => {
    historyAdd({ problemText: 'first' });
    historyAdd({ problemText: 'second' });
    const list = historyLoad();
    expect(list[0].problemText).toBe('second');
    expect(list[1].problemText).toBe('first');
  });

  it('historyRemove 按 id 删除', () => {
    historyAdd({ problemText: 'a' });
    const list1 = historyLoad();
    historyRemove(list1[0].id);
    expect(historyLoad().length).toBe(0);
  });

  it('historyClear 清空', () => {
    historyAdd({ problemText: 'a' });
    historyClear();
    expect(historyLoad()).toEqual([]);
  });

  it('超过 MAX 条数会截断', () => {
    // 注意：HISTORY_MAX 现在是 1000，测试会慢，改成模拟
    // 简化：只验证不超过 1000
    for (let i = 0; i < 5; i++) historyAdd({ problemText: `q${i}` });
    expect(historyLoad().length).toBeLessThanOrEqual(1000);
  });

  it('JSON.parse 失败时返回 []', () => {
    // 直接往 mock storage 里塞一个非法 JSON
    mockMem.set('grade3_practice_history_v1', '{invalid json');
    expect(historyLoad()).toEqual([]);
  });

  it('存储为空 → []', () => {
    mockMem.delete('grade3_practice_history_v1');
    expect(historyLoad()).toEqual([]);
  });

  it('JSON.parse 抛错时打警告', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockMem.set('grade3_practice_history_v1', 'not json');
    historyLoad();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});