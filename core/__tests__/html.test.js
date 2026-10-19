import { describe, it, expect } from 'vitest';
import { escapeHtmlStrict, escapeHtml, raw, html } from '../html.js';

describe('escapeHtmlStrict', () => {
  it('转义 & < > " \'', () => {
    expect(escapeHtmlStrict('<script>alert("x")</script>'))
      .toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('转义单引号', () => {
    expect(escapeHtmlStrict("it's")).toBe('it&#39;s');
  });

  it('null / undefined → 空字符串', () => {
    expect(escapeHtmlStrict(null)).toBe('');
    expect(escapeHtmlStrict(undefined)).toBe('');
  });

  it('数字 → 字符串', () => {
    expect(escapeHtmlStrict(42)).toBe('42');
  });

  it('escapeHtml 是 escapeHtmlStrict 的别名', () => {
    expect(escapeHtml).toBe(escapeHtmlStrict);
  });
});

describe('raw', () => {
  it('包装对象标记 __htmlRaw', () => {
    const r = raw('<b>hi</b>');
    expect(r.__htmlRaw).toBe(true);
    expect(r.value).toBe('<b>hi</b>');
  });
});

describe('html 模板函数', () => {
  it('默认转义插值', () => {
    const user = '<img src=x onerror=alert(1)>';
    const result = html`<div>${user}</div>`;
    expect(result).toBe('<div>&lt;img src=x onerror=alert(1)&gt;</div>');
  });

  it('raw() 跳过转义', () => {
    const user = '<b>safe</b>';
    const result = html`<div>${raw(user)}</div>`;
    expect(result).toBe('<div><b>safe</b></div>');
  });

  it('数组自动转义', () => {
    const arr = ['<a>', '<b>'];
    expect(html`${arr}`).toBe('&lt;a&gt;&lt;b&gt;');
  });

  it('数组中的 raw 保留', () => {
    const arr = [raw('<b>'), '<i>'];
    expect(html`${arr}`).toBe('<b>&lt;i&gt;');
  });

  it('数字安全', () => {
    expect(html`count=${42}`).toBe('count=42');
  });
});

import { escapeAttr } from '../html.js';

describe('html · escapeAttr', () => {
  it('转义双引号', () => {
    expect(escapeAttr('a"b')).toBe('a&quot;b');
  });
  it('转义单引号', () => {
    expect(escapeAttr("a'b")).toBe('a&#39;b');
  });
  it('null → 空字符串', () => {
    expect(escapeAttr(null)).toBe('');
  });
});