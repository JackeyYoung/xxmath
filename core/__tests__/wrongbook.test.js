import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockMem = new Map();
vi.mock('../storage.js', () => ({
  lsGet: (k) => mockMem.get(k) ?? null,
  lsSet: (k, v) => { mockMem.set(k, v); },
}));

vi.mock('../keys.js', () => ({
  getWrongBookKey: () => 'grade3_wrong_book_v1',
}));

vi.mock('../events.js', () => ({
  emit: vi.fn(),
  EVT: { DATA_CHANGED: 'data:changed' },
}));

const {
  wbLoad, wbSave, wbAdd, wbRemove, wbClear, markRedoSuccess,
} = await import('../wrongbook.js');

describe('wrongbook', () => {
  beforeEach(() => {
    mockMem.clear();
  });

  it('空 → []', () => {
    expect(wbLoad()).toEqual([]);
  });

  it('wbAdd 添加错题', () => {
    wbAdd({ text: 'q1', studentAnswer: '3' });
    const list = wbLoad();
    expect(list.length).toBe(1);
    expect(list[0].text).toBe('q1');
    expect(typeof list[0].timestamp).toBe('number');
  });

  it('同一道题重复添加，只保留最新', () => {
    wbAdd({ text: 'same', studentAnswer: 'wrong1' });
    wbAdd({ text: 'same', studentAnswer: 'wrong2' });
    const list = wbLoad();
    expect(list.length).toBe(1);
    expect(list[0].studentAnswer).toBe('wrong2');
  });

  it('wbRemove 按 text 删除', () => {
    wbAdd({ text: 'a' });
    wbAdd({ text: 'b' });
    wbRemove('a');
    const list = wbLoad();
    expect(list.length).toBe(1);
    expect(list[0].text).toBe('b');
  });

  it('markRedoSuccess：第一次做对，masteredCount=1，不移除', () => {
    wbAdd({ text: 'x' });
    const r1 = markRedoSuccess('x');
    expect(r1.removed).toBe(false);
    expect(r1.masteredCount).toBe(1);
    expect(wbLoad().length).toBe(1);
  });

  it('markRedoSuccess：连续做对 2 次，移除', () => {
    wbAdd({ text: 'y' });
    markRedoSuccess('y');
    // ⭐ 隔日重做算法要求两次做对间隔 ≥ 20 小时，
    //    测试里把 lastCorrectAt 拨回 21 小时前来模拟"隔天"
    const rec = wbLoad().find(r => r.text === 'y');
    rec.lastCorrectAt = Date.now() - 21 * 3600000;
    wbSave(wbLoad().map(r => (r.text === 'y' ? rec : r)));
    const r2 = markRedoSuccess('y');
    expect(r2.removed).toBe(true);
    expect(r2.masteredCount).toBe(2);
    expect(wbLoad().length).toBe(0);
  });

  it('markRedoSuccess：第二次做对但未隔天 → 不移除（tooSoon）', () => {
    wbAdd({ text: 'z2' });
    markRedoSuccess('z2');
    const r = markRedoSuccess('z2');
    expect(r.removed).toBe(false);
    expect(r.tooSoon).toBe(true);
    expect(wbLoad().length).toBe(1);
  });

  it('markRedoSuccess：不在错题本里 → removed=false, count=0', () => {
    const r = markRedoSuccess('not-in-book');
    expect(r.removed).toBe(false);
    expect(r.masteredCount).toBe(0);
  });

  it('wbClear 清空', () => {
    wbAdd({ text: 'z' });
    wbClear();
    expect(wbLoad()).toEqual([]);
  });
});