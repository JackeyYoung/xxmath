import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  extractJson,
  normalizeAiFeedback,
  callLLM,
  callLLMWithRetry,
  LLM_CONFIG,
} from '../llm.js';

/* ============================================================
   1. extractJson —— 纯函数，最容易测
   ============================================================ */
describe('llm · extractJson', () => {
  it('直接 JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('markdown 代码块包裹', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('前后有废话', () => {
    expect(extractJson('好的，结果：{"a":1}，请查收')).toEqual({ a: 1 });
  });

  it('嵌套 JSON', () => {
    const j = extractJson('{"a":{"b":{"c":1}}}');
    expect(j.a.b.c).toBe(1);
  });

  it('非 JSON → null', () => {
    expect(extractJson('not json')).toBeNull();
  });

  it('null / undefined / 数字 → null', () => {
    expect(extractJson(null)).toBeNull();
    expect(extractJson(undefined)).toBeNull();
    expect(extractJson(42)).toBeNull();
  });

  it('空字符串 → null', () => {
    expect(extractJson('')).toBeNull();
  });
});

/* ============================================================
   2. normalizeAiFeedback —— 纯函数
   ============================================================ */
describe('llm · normalizeAiFeedback', () => {
  it('null → 全默认值', () => {
    const r = normalizeAiFeedback(null, '10 元');
    expect(r.answer.full).toBe('10 元');
    expect(r.judgement.answer_correct).toBe(false);
    expect(r.strengths.length).toBeGreaterThan(0);
    expect(r.gaps.length).toBeGreaterThan(0);
  });

  it('标准结构 → 原样保留', () => {
    const raw = {
      problem_understanding: '求剩余',
      required_steps: 2,
      answer: { value: 10, unit: '元', full: '10 元' },
      steps: [{ step: 1, relation: 'x', substitution: 'y', result: 'z' }],
      judgement: {
        answer_correct: true,
        student_answer_issue: '无',
        step_issues: [],
        step_count_comment: '步骤合理',
      },
      strengths: ['第一步正确'],
      gaps: [],
      reasoning_walkthrough: '分析过程',
      hint: '注意单位',
    };
    const r = normalizeAiFeedback(raw);
    expect(r.answer.value).toBe(10);
    expect(r.judgement.answer_correct).toBe(true);
    expect(r.strengths).toEqual(['第一步正确']);
  });

  it('缺字段时填默认值', () => {
    const r = normalizeAiFeedback({ answer: { full: '5 元' } });
    expect(r.answer.full).toBe('5 元');
    expect(r.answer.value).toBeNull();
    expect(r.steps).toEqual([]);
    expect(r.judgement.answer_correct).toBe(false);
  });

  it('answer_correct=true 时 gaps 默认空数组', () => {
    const r = normalizeAiFeedback({
      judgement: { answer_correct: true },
      answer: { full: 'x' },
    });
    expect(r.gaps).toEqual([]);
  });

  it('fallbackFull 参数生效', () => {
    const r = normalizeAiFeedback({}, '兜底答案');
    expect(r.answer.full).toBe('兜底答案');
  });
});

/* ============================================================
   3. callLLM —— 需要 mock fetch
   ============================================================ */
describe('llm · callLLM 网络层', () => {
  let origFetch;

  beforeEach(() => {
    origFetch = globalThis.fetch;
    LLM_CONFIG.enabled = true;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('fetch 抛网络错误 → 抛"网络请求失败"', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(
      callLLM({ problem: 'x', studentAnswer: 'y', steps: [] })
    ).rejects.toThrow(/网络请求失败/);
  });

  it('fetch 超时（AbortError）→ 抛"请求超时"', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      return Promise.reject(e);
    });
    await expect(
      callLLM({ problem: 'x', studentAnswer: 'y', steps: [] })
    ).rejects.toThrow(/请求超时/);
  });

  it('HTTP 500 → 抛"API 500"', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'server error',
    });
    await expect(
      callLLM({ problem: 'x', studentAnswer: 'y', steps: [] })
    ).rejects.toThrow(/API 500/);
  });

  it('响应不是 JSON → 抛"不是合法 JSON"', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error('not json'); },
    });
    await expect(
      callLLM({ problem: 'x', studentAnswer: 'y', steps: [] })
    ).rejects.toThrow(/不是合法 JSON/);
  });

  it('choices 为空 → 抛"未返回有效内容"', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [] }),
    });
    await expect(
      callLLM({ problem: 'x', studentAnswer: 'y', steps: [] })
    ).rejects.toThrow(/未返回有效内容/);
  });

  it('正常响应 → 返回解析后的 JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: { content: '{"answer":{"value":10}}' },
          finish_reason: 'stop',
        }],
      }),
    });
    const r = await callLLM({ problem: 'x', studentAnswer: 'y', steps: [] });
    expect(r.answer.value).toBe(10);
  });

  it('模型返回 markdown 包裹 → 仍能解析', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: { content: '```json\n{"answer":{"value":10}}\n```' },
          finish_reason: 'stop',
        }],
      }),
    });
    const r = await callLLM({ problem: 'x', studentAnswer: 'y', steps: [] });
    expect(r.answer.value).toBe(10);
  });

  it('finish_reason=length → 抛"截断"错误', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: { content: '' },
          finish_reason: 'length',
        }],
        usage: { completion_tokens_details: { reasoning_tokens: 5000 } },
      }),
    });
    await expect(
      callLLM({ problem: 'x', studentAnswer: 'y', steps: [] })
    ).rejects.toThrow(/思考过长被截断|截断/);
  });
});

/* ============================================================
   4. callLLMWithRetry
   ============================================================ */
describe('llm · callLLMWithRetry', () => {
  let origFetch;

  beforeEach(() => {
    origFetch = globalThis.fetch;
    LLM_CONFIG.enabled = true;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('第一次成功 → 不重试', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      calls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
        }),
      };
    });
    const r = await callLLMWithRetry({ problem: 'x', studentAnswer: 'y', steps: [] });
    expect(calls).toBe(1);
    expect(r.ok).toBe(true);
  });

  it('5xx 会重试（最多 2 次）', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      calls++;
      return {
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'busy',
      };
    });
    await expect(
      callLLMWithRetry({ problem: 'x', studentAnswer: 'y', steps: [] }, 1)
    ).rejects.toThrow();
    expect(calls).toBeGreaterThan(1);
  });
});