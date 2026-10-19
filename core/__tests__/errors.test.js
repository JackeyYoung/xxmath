import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logError, getErrorLog, installGlobalErrorHandlers } from '../errors.js';

describe('errors', () => {
  beforeEach(() => {
    // 清空 log（因为 ERROR_LOG 是模块内的，不能直接清，只能记录当前长度）
  });

  it('logError 返回记录项', () => {
    const item = logError('test', new Error('boom'));
    expect(item.scope).toBe('test');
    expect(item.message).toBe('boom');
    expect(item.stack).toContain('boom');
  });

  it('logError 支持字符串错误', () => {
    const item = logError('test', 'something bad');
    expect(item.message).toBe('something bad');
  });

  it('getErrorLog 返回数组', () => {
    logError('a', new Error('1'));
    logError('b', new Error('2'));
    const log = getErrorLog();
    expect(Array.isArray(log)).toBe(true);
    expect(log.length).toBeGreaterThanOrEqual(2);
  });

  it('getErrorLog 返回副本，修改不影响内部', () => {
    logError('x', new Error('y'));
    const log1 = getErrorLog();
    log1.push({ fake: true });
    const log2 = getErrorLog();
    expect(log2.find(x => x.fake)).toBeUndefined();
  });

  it('logError 会打印到 console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('test', new Error('x'));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

import { describe, it, expect, vi } from 'vitest';
import {
  installGlobalErrorHandlers, getErrorLog, logError,
} from '../errors.js';

describe('errors · installGlobalErrorHandlers', () => {
  it('window error 事件被记录', () => {
    installGlobalErrorHandlers();
    const before = getErrorLog().length;

    // ⭐ jsdom 里构造 ErrorEvent
    const event = new ErrorEvent('error', {
      error: new Error('test-window-error'),
      message: 'test-window-error',
      filename: 'test.js',
      lineno: 1,
      colno: 1,
    });
    window.dispatchEvent(event);

    const log = getErrorLog();
    expect(log.length).toBeGreaterThan(before);
    expect(log[log.length - 1].scope).toBe('window.error');
  });

  it('unhandledrejection 被记录', () => {
    installGlobalErrorHandlers();
    const before = getErrorLog().length;

    // ⭐ 用普通 Event + 手动挂属性，避免 PromiseRejectionEvent 兼容问题
    const event = new Event('unhandledrejection');
    event.reason = new Error('test-rejection');
    window.dispatchEvent(event);

    const log = getErrorLog();
    expect(log.length).toBeGreaterThan(before);
    expect(log[log.length - 1].scope).toBe('unhandledrejection');
  });

  it('error 事件 e.error 为 null 时仍能记录', () => {
    installGlobalErrorHandlers();
    const before = getErrorLog().length;

    const event = new ErrorEvent('error', {
      error: null,
      message: 'unknown error',
    });
    window.dispatchEvent(event);

    expect(getErrorLog().length).toBeGreaterThan(before);
  });
});