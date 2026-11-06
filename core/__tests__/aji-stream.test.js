// core/__tests__/aji-stream.test.js
// Aji 流式引擎单测：SSE 分片解析 / 打字机增量 / 中断 / 非流式回退 / 竞态守卫
// ⚠️ 这些行为真机驱动也覆盖（drive-aji-stream.cjs），但真机跑不进 CI，
//    而"被中断的旧流覆盖新流 controller"这类竞态恰恰是单测才锁得住的。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../js/vendor/gsap/index.js', () => ({
  gsap: { set: vi.fn(), to: vi.fn(), fromTo: vi.fn(), killTweensOf: vi.fn() },
}));

/** 手控 SSE 流：测试用 _push/_done 精确制造"流进行中"的窗口
    ⚠️ 每个响应必须配独立的流：ReadableStream 被 getReader() 后即 locked，
       两个请求共用一条流时第二次必抛错（会被误当成"AI 失败"）。 */
function makeControlledStream() {
  const enc = new TextEncoder();
  const ctl = { canceled: false };
  let inner = null;
  const stream = new ReadableStream({
    start(controller) { inner = controller; },
    cancel() { ctl.canceled = true; },
  });
  stream._push = (text) => {
    inner.enqueue(enc.encode('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n'));
  };
  stream._done = () => {
    inner.enqueue(enc.encode('data: [DONE]\n\n'));
    try { inner.close(); } catch (e) {}
  };
  return { stream, ctl };
}

/** 流工厂：fetch 每次被调用都给一条全新的流，并记录到 calls。
    ⭐ 忠实模拟浏览器语义：signal abort → 该次响应的 read() 以 AbortError 拒绝。 */
function streamFactory() {
  const calls = [];
  const fetchMock = vi.fn().mockImplementation((url, opts) => {
    const made = makeControlledStream();
    calls.push(made);
    return Promise.resolve({
      ok: true,
      headers: { get: () => 'text/event-stream' },
      body: {
        getReader() {
          const real = made.stream.getReader();
          return {
            // 转发真实读取，但与 abort 竞速——忠实还原"中止即时打断挂起的 read"
            read() {
              const abortP = new Promise((_, reject) => {
                if (opts.signal.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; return reject(e); }
                opts.signal.addEventListener('abort', () => {
                  const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
                });
              });
              return Promise.race([real.read(), abortP]);
            },
            cancel() { return real.cancel().catch(() => {}); },
          };
        },
      },
    });
  });
  return { fetchMock, calls };
}

/** 建一个全新的 Aji 单例（先销毁上一个，避免跨用例串状态） */
async function freshAji() {
  const mod = await import('../ui/aji.js');
  if (globalThis.__ajiInst) { try { globalThis.__ajiInst.destroy(); } catch (e) {} }
  const inst = mod.getAji();
  globalThis.__ajiInst = inst;
  return inst;
}

const okStreamRes = (stream) => ({
  ok: true, headers: { get: () => 'text/event-stream' }, body: stream,
});
const CTX = { moduleId: 'm1', topic: '混合运算', currentProblem: '5 - 3', studentProgress: '无', knowledgeCards: [], userQuery: 'q' };

let origFetch;
beforeEach(() => { origFetch = globalThis.fetch; });
afterEach(() => {
  globalThis.fetch = origFetch;
  if (globalThis.__ajiInst) { try { globalThis.__ajiInst.destroy(); } catch (e) {} globalThis.__ajiInst = null; }
});

describe('Aji 流式引擎', () => {
  it('SSE 分片逐块解析 → 打字机增量依次回调', async () => {
    const { stream } = makeControlledStream();
    globalThis.fetch = vi.fn().mockResolvedValue(okStreamRes(stream));
    const inst = await freshAji();
    inst.registerModuleContext({ moduleId: 'm1', topic: '混合运算', problemText: () => '5 - 3' });

    const seen = [];
    const p = inst._streamAI(CTX, (d) => seen.push(d));
    await new Promise(r => setTimeout(r, 0));
    stream._push('先看看');
    await new Promise(r => setTimeout(r, 0));
    stream._push('这一步');
    await new Promise(r => setTimeout(r, 0));
    stream._done();
    await p;
    expect(seen).toEqual(['先看看', '这一步']);
  });

  it('请求体带 stream:true 且不带 response_format（流式不能带 JSON 模式）', async () => {
    const { stream } = makeControlledStream();
    const fetchMock = vi.fn().mockResolvedValue(okStreamRes(stream));
    globalThis.fetch = fetchMock;
    const inst = await freshAji();
    inst.registerModuleContext({ moduleId: 'm1' });

    const p = inst._streamAI(CTX, () => {});
    await new Promise(r => setTimeout(r, 0));
    stream._done();
    await p;
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.stream).toBe(true);
    expect(body.response_format).toBeUndefined();
    // 系统提示词注入上下文（不泄题约束）
    expect(body.messages[0].content).toMatch(/绝对不要直接给出最终答案/);
    expect(body.messages[0].content).toMatch(/当前题目：5 - 3/);
  });

  it('非流式回退：Content-Type 是 JSON 时按一次性解析（不能误当 SSE 丢掉正文）', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      body: new ReadableStream({ start(c) { c.close(); } }),
      text: async () => JSON.stringify({ choices: [{ message: { content: '我是非流式回复' } }] }),
    });
    const inst = await freshAji();
    inst.registerModuleContext({ moduleId: 'm1' });
    const seen = [];
    await inst._streamAI(CTX, (d) => seen.push(d));
    expect(seen).toEqual(['我是非流式回复']);
  });

  it('中断：abort 后抛 AbortError 且 controller 清空', async () => {
    const inst = await freshAji();
    inst.registerModuleContext({ moduleId: 'm1' });

    // 忠实模拟浏览器：信号 abort → 读流报 AbortError（而不是让 fetch 永不 settle）
    const enc = new TextEncoder();
    let inner = null;
    const stream = new ReadableStream({ start(c) { inner = c; }, cancel() {} });
    globalThis.fetch = vi.fn().mockImplementation((url, opts) => Promise.resolve({
      ok: true,
      headers: { get: () => 'text/event-stream' },
      body: {
        getReader() {
          return {
            read() {
              return new Promise((resolve, reject) => {
                if (opts.signal.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; return reject(e); }
                opts.signal.addEventListener('abort', () => {
                  const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
                });
              });
            },
            cancel() { return Promise.resolve(); },
          };
        },
      },
    }));

    const p = inst._streamAI(CTX, () => {});
    await new Promise(r => setTimeout(r, 0));
    expect(inst._streamAbort).toBeTruthy();
    inst._abortStream();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(inst._streamAbort).toBeNull();
  });

  it('⭐ 竞态守卫：被取代的旧流不得覆盖新流的 controller', async () => {
    const { fetchMock, calls } = streamFactory();
    globalThis.fetch = fetchMock;
    const inst = await freshAji();
    inst.registerModuleContext({ moduleId: 'm1' });

    const oldP = inst._askAI('第一个问题');
    await new Promise(r => setTimeout(r, 0));
    const oldAbort = inst._streamAbort;

    const newP = inst._askAI('第二个问题');
    await new Promise(r => setTimeout(r, 0));
    const newAbort = inst._streamAbort;

    expect(newAbort).toBeTruthy();
    expect(newAbort).not.toBe(oldAbort);

    // 旧流异步收尾，绝不能把新流的 controller 清成 null
    await oldP.catch(() => {});
    expect(inst._streamAbort).toBe(newAbort);

    calls[calls.length - 1].stream._done();
    await newP.catch(() => {});
  });

  it('AbortError 不算失败：未出字时安静撤掉占位，不出「连不上」兜底', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url, opts) => new Promise((resolve, reject) => {
      const e = new Error('aborted'); e.name = 'AbortError';
      opts.signal.addEventListener('abort', () => reject(e));
    }));
    const inst = await freshAji();
    inst.registerModuleContext({ moduleId: 'm1' });

    const p = inst._askAI('问一句');
    await new Promise(r => setTimeout(r, 0));
    inst._abortStream();
    await p;
    expect(inst.hub.textContent || '').not.toMatch(/连不上/);
  });

  it('SSE 解析：忽略 event:/id:/注释行，只取 data；多行 data 按规范拼接', async () => {
    const inst = await freshAji();
    expect(inst._parseSSE('event: message\ndata: {"a":1}')).toBe('{"a":1}');
    expect(inst._parseSSE(': keep-alive comment')).toBeNull();
    expect(inst._parseSSE('data: [DONE]')).toBe('[DONE]');
    expect(inst._parseSSE('data: line1\ndata: line2')).toBe('line1\nline2');
  });

  it('让位管线：stageOwned 只在舱体展开时接管该模块', async () => {
    const inst = await freshAji();
    const el = document.createElement('div');
    document.body.appendChild(el);
    inst.registerStage({ moduleId: 'm1', el });
    expect(inst.stageOwned('m1')).toBe(false);      // 未展开 → 不接管
    expect(inst.stageOwned('m9')).toBe(false);
    expect(inst.hasStage('m1')).toBe(true);
    inst.openDrawer();
    expect(inst.stageOwned('m1')).toBe(true);       // 展开 → 接管
    inst.clearStage('m1');
    expect(inst.hasStage('m1')).toBe(false);
  });
});
