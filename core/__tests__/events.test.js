import { describe, it, expect, beforeEach, vi } from 'vitest';
import { on, off, emit, EVT } from '../events.js';

describe('事件总线', () => {
  it('on + emit 触发回调', () => {
    const fn = vi.fn();
    on('test', fn);
    emit('test', { a: 1 });
    expect(fn).toHaveBeenCalledWith({ a: 1 });
    off('test', fn);
  });

  it('多个监听者都收到', () => {
    const fn1 = vi.fn(), fn2 = vi.fn();
    on('multi', fn1);
    on('multi', fn2);
    emit('multi', 'x');
    expect(fn1).toHaveBeenCalledWith('x');
    expect(fn2).toHaveBeenCalledWith('x');
    off('multi', fn1);
    off('multi', fn2);
  });

  it('off 后不再收到', () => {
    const fn = vi.fn();
    on('x', fn);
    off('x', fn);
    emit('x');
    expect(fn).not.toHaveBeenCalled();
  });

  it('回调抛错不影响其他回调', () => {
    const bad = () => { throw new Error('boom'); };
    const good = vi.fn();
    on('safe', bad);
    on('safe', good);
    expect(() => emit('safe')).not.toThrow();
    expect(good).toHaveBeenCalled();
    off('safe', bad);
    off('safe', good);
  });

  it('EVT 常量存在', () => {
    expect(EVT.GRADE_CHANGED).toBe('grade:changed');
    expect(EVT.DATA_CHANGED).toBe('data:changed');
  });

  it('off 不存在的 event 不报错', () => {
    expect(() => off('never-registered', () => {})).not.toThrow();
  });

  it('off 不存在的 fn 不报错', () => {
    const fn1 = vi.fn();
    on('x', fn1);
    expect(() => off('x', () => {})).not.toThrow();   // 传一个没注册过的 fn
    off('x', fn1);
  });

  it('emit 不存在的 event 不报错', () => {
    expect(() => emit('never-emitted', {})).not.toThrow();
  });
});