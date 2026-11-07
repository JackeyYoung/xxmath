// core/__tests__/aji-routing.test.js
// Aji 本地路由单测：标准答案比对 / 换题载入 / 清空进度 / Prompt 注入 / [system,user] 两轮
// ─────────────────────────────────────────────────────────────
// ⚠️ 为什么这些必须进 CI：它们全部是"零 LLM 成本、毫秒级"的本地分支，
//    真机驱动跑不进 CI，而它们恰恰是 §二/§三 的验收主体；
//    更要紧的是「清空进度」是**不可逆**动作，谎报成功比不做更坏 —— 只能靠单测锁死。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/* GSAP 只用到 set/to/fromTo/killTweensOf —— 与 aji-stream.test.js 同款最小桩 */
vi.mock('../../js/vendor/gsap/index.js', () => ({
  gsap: { set: vi.fn(), to: vi.fn(), fromTo: vi.fn(), killTweensOf: vi.fn() },
}));

/* 存储层：用一张共享内存表替掉真存储。
   history / wrongbook / takeaway / learner 全都经 storage 落盘，
   只 mock 这一处就能让"写入 → 清空 → 回读核验"闭环成立。 */
const mem = new Map();
/* 模拟"写入静默失败"——这正是真机上的现实故障模式：
   storage 层的 setItem/removeItem 失败走 onStorageError 旁路，**不抛异常**，
   于是 clear() 看起来成功了，数据其实还在。回读核验就是为了逮住它。
   ⚠️ 挂 lsSet 而不是 lsRemove：题干里的 clear 全是"写回空表"（historyClear→lsSet('[]')），
      只有少数走 lsRemove —— 挂钩挂错地方，测试会假绿。 */
let failWriteMatch = null;
const blocked = (k) => !!failWriteMatch && String(k).includes(failWriteMatch);
vi.mock('../storage.js', () => ({
  lsGet: (k) => (mem.has(k) ? mem.get(k) : null),
  lsSet: (k, v) => { if (blocked(k)) return; mem.set(k, v); },       // 静默失败：不写、不抛
  lsRemove: (k) => { if (blocked(k)) return; mem.delete(k); },
  lsKeysByPrefix: (p) => [...mem.keys()].filter(k => k.startsWith(p)),
}));

// keys.js 的 getGradeKey 依赖 globalThis.__memCachePeek，桩掉存储层后这个全局不存在 →
// 会自动回落到 localStorage.getItem（jsdom 下为 null）→ 稳定得到 grade3_ 前缀。
const { getAji } = await import('../ui/aji.js');
const { registerActiveModule } = await import('../../app/active-modules.js');
const { historyAdd, historyLoad } = await import('../history.js');
const { wbAdd, wbLoad } = await import('../wrongbook.js');
const { takeawaySave, takeawayListAll } = await import('../takeaway.js');
const { recordEvent, eventsLoad, memoryLoad } = await import('../learner.js');

/* ---------- 壳层替身：模块对外接口（Aji 本地路由的唯一抓手） ---------- */
function makeApiStub() {
  const calls = { nextProblem: 0, loadExpression: [] };
  registerActiveModule('m1', {
    nextProblem: () => { calls.nextProblem++; return true; },
    /* 桩：只认整数算式 —— 模拟"模块拒绝载入"这一分支
       （真实模块各自有更严的文法，如 m9 只认 a op b；这里只需能拒得掉） */
    loadExpression: (text) => {
      const t = String(text || '').trim();
      if (!/^\d+([+\-×÷]\d+)+$/.test(t)) return false;
      calls.loadExpression.push(t);
      return true;
    },
    exampleHint: '12 × 3 + 15',   // 与真实 m1 一致：示例就是本模块接受的形态
  });
  return { calls };
}

/* ---------- 作答态上下文：m9 第二步，学生填 6、标准答案 8 ---------- */
function makeStepCtx(studentInput = '6') {
  return () => ({
    currentStep: '第 2 步（商，位置 q 1）',
    studentInput,
    standardAnswer: '8',
  });
}

async function freshAji(stepCtx) {
  if (globalThis.__ajiInst) { try { globalThis.__ajiInst.destroy(); } catch (e) {} }
  const inst = getAji();
  globalThis.__ajiInst = inst;
  inst.registerModuleContext({
    moduleId: 'm1',
    topic: '除法竖式',
    problemText: () => '338 ÷ 7',
    progress: () => '做到第 2 步',
    isStarted: () => true,
    ...(stepCtx ? { stepCtx } : {}),
  });
  return inst;
}

let origFetch;
beforeEach(() => {
  mem.clear();
  failWriteMatch = null;
  origFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('本地路由不该发起网络请求')));
});
afterEach(() => {
  globalThis.fetch = origFetch;
  if (globalThis.__ajiInst) { try { globalThis.__ajiInst.destroy(); } catch (e) {} globalThis.__ajiInst = null; }
});

/* ============================================================
   §二 标准答案比对：问哪答哪，零 LLM
   ============================================================ */
describe('Aji 本地路由 · 「这一步对吗」比对标准答案', () => {
  it('填错 → 明确指出学生输入与标准答案的差异（这是验收标准 2 的单测形态）', async () => {
    const inst = await freshAji(makeStepCtx('6'));   // 标准 8，填 6
    const msg = inst._memoryLocal('我这一步错哪了');
    expect(msg).toBeTruthy();
    expect(msg.title).toContain('不一样');
    expect(msg.content).toContain('6');
    expect(msg.content).toContain('8');
    expect(msg.content).toContain('第 2 步');
    // ⭐ 绝不越界给"为什么错"——那要讲算理，必须留给大模型
    expect(msg.content).not.toMatch(/因为|所以应该|进位/);
  });

  it('填对 → 如实说对，不硬找错', async () => {
    const inst = await freshAji(makeStepCtx('8'));
    const msg = inst._memoryLocal('这一步对吗');
    expect(msg.title).toContain('对的');
  });

  it('归一确实生效：007 与 7 判定相同', async () => {
    const inst = await freshAji(makeStepCtx('007'));
    expect(inst._normNum('007')).toBe(inst._normNum('7'));
    expect(inst._normNum('８')).toBe('8');
    expect(inst._normNum(' 1 2 ')).toBe('12');
    expect(inst._normNum('5.')).toBe('5');
  });

  it('还没输入 → 提示先填，不假装判定', async () => {
    const inst = await freshAji(makeStepCtx(''));
    const msg = inst._memoryLocal('这一步对吗');
    expect(msg.title).toContain('还没填');
  });

  it('未进入作答态（模块未提供 stepCtx）→ 不瞎编判定', async () => {
    const inst = await freshAji(null);
    const msg = inst._memoryLocal('这一步对吗');
    expect(msg.title).toContain('还没有可判定的步骤');
  });

  it('⭐ 全程零网络：本地比对绝不触发 fetch', async () => {
    const inst = await freshAji(makeStepCtx('6'));
    inst._memoryLocal('这一步对吗');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(inst._aiBusy).toBeFalsy();
  });

  it('模块 stepCtx 抛错 → 当作没有，绝不把脏数据塞进判定', async () => {
    const inst = await freshAji(() => { throw new Error('模块炸了'); });
    const msg = inst._memoryLocal('这一步对吗');
    expect(msg.title).toContain('还没有可判定的步骤');
  });

  it('stepCtx 返回畸形值 → 当作没有', async () => {
    const inst = await freshAji(() => 'not-an-object');
    expect(inst._memoryLocal('这一步对吗').title).toContain('还没有可判定的步骤');
  });
});

/* ============================================================
   §三 换题 / 载入算式：原右上角 ⚙ 抽屉的职责下沉进对话
   ============================================================ */
describe('Aji 本地路由 · 换题与载入算式（零 LLM）', () => {
  it('「换一题」→ 调模块 nextProblem', async () => {
    const api = makeApiStub();
    const inst = await freshAji(makeStepCtx());
    const msg = inst._memoryLocal('换一题');
    expect(api.calls.nextProblem).toBe(1);
    expect(msg.title).toContain('换了一道新题');
  });

  it('「12 × 3 + 15」→ 直接载入这个算式', async () => {
    const api = makeApiStub();
    const inst = await freshAji(makeStepCtx());
    const msg = inst._memoryLocal('12 × 3 + 15');
    expect(api.calls.loadExpression).toEqual(['12×3+15']);
    expect(msg.title).toContain('换好了');
  });

  it('夹带汉字的问句绝不当作载入指令（防把"3+4怎么算"当换题）', async () => {
    const api = makeApiStub();
    const inst = await freshAji(makeStepCtx());
    expect(inst._memoryLocal('我们算 3+4 好吗')).toBeNull();
    expect(inst._memoryLocal('帮我讲讲 3+4 这道题')).toBeNull();
    expect(api.calls.loadExpression).toEqual([]);
    expect(api.calls.nextProblem).toBe(0);
  });

  it('模块拒绝载入（算式形式对但模块不认）→ 如实说认不了，不谎报成功', async () => {
    makeApiStub();
    const inst = await freshAji(makeStepCtx());
    // ⚠️ 必须挑一个"抽得出算式、但模块会拒"的输入。
    //    像 `9((` 这种抽不出算式的，走的是 null → 交给大模型的分支，测不到这条路径。
    const msg = inst._memoryLocal('7 + 0.5');   // 桩只认整数算式 → 拒
    expect(msg).toBeTruthy();
    expect(msg.title).toContain('算不了');
  });

  it('⭐ 拒答示例必须来自模块本身（用 m1 的形态教 m9 只会更绕）', async () => {
    makeApiStub();
    const inst = await freshAji(makeStepCtx());
    const withHint = inst._memoryLocal('7 + 0.5');
    expect(withHint.content).toContain('12 × 3 + 15');   // 桩声明了自己的示例

    /* 模块不声明 exampleHint → 退化成不给具体算式的泛化提示，
       绝不硬塞一个"某模块的形态"当通用示例。 */
    registerActiveModule('m1', { loadExpression: () => false });
    const noHint = inst._memoryLocal('7 + 0.5');
    expect(noHint.content).not.toContain('12 × 3 + 15');
    expect(noHint.content).toContain('两个数和一个运算符');
  });

  it('完全抽不出算式 → 返回 null（交给后续规则 / 大模型），绝不误判成换题', async () => {
    const api = makeApiStub();
    const inst = await freshAji(makeStepCtx());
    expect(inst._memoryLocal('9((')).toBeNull();
    expect(inst._memoryLocal('今天天气不错')).toBeNull();
    expect(api.calls.loadExpression).toEqual([]);
    expect(api.calls.nextProblem).toBe(0);
  });

  it('当前模块没注册对外接口 → 返回 null，交给后续规则/大模型', async () => {
    const inst = await freshAji(makeStepCtx());
    inst.registerModuleContext({ moduleId: 'm99', problemText: () => '1 + 1' });
    expect(inst._memoryLocal('换一题')).toBeNull();
  });
});

/* ============================================================
   §三 设置下沉：清空进度（不可逆，绝不谎报）
   ============================================================ */
describe('Aji 本地路由 · 清空学习记录', () => {
  function seed() {
    historyAdd({ problemText: '5 + 3', problemSource: 'm1', moduleId: 'm1', studentAnswer: '9', isCorrect: false });
    wbAdd({ text: '5 + 3', correctAnswer: '8', studentAnswer: '9' });
    takeawaySave('5 + 3', '忘了进位');
    recordEvent({ moduleId: 'm1', topic: '进位加法', problemText: '5 + 3', correctAnswer: '8', studentAnswer: '9', tags: ['进位'] });
  }

  it('先二次确认，绝不一键清空', async () => {
    seed();
    const inst = await freshAji(makeStepCtx());
    const ask = inst._memoryLocal('清空我的进度');
    expect(ask.title).toContain('要清空');
    expect(ask.actions.map(a => a.text)).toEqual(['清空', '先不清']);
    expect(historyLoad().length).toBe(1);   // 还没点确认 → 数据必须还在
  });

  it('⭐ 确认后：四类数据全部真的空了（回读核验，不是"没抛错"就算成功）', async () => {
    seed();
    const inst = await freshAji(makeStepCtx());
    inst._doResetProgress();
    expect(historyLoad()).toEqual([]);
    expect(wbLoad()).toEqual([]);
    expect(eventsLoad()).toEqual([]);
    expect(Object.keys(memoryLoad().tags || {}).length).toBe(0);
    expect(takeawayListAll()).toEqual([]);
    const last = inst.history[inst.history.length - 1];
    expect(last.title).toContain('清空好了');
  });

  it('⭐ 一题一得必须经 storage 层删除（直接摸 localStorage 会"删了个空"却报成功）', async () => {
    seed();
    expect(takeawayListAll().length).toBe(1);
    const inst = await freshAji(makeStepCtx());
    inst._takeawayClearAll();
    expect(takeawayListAll()).toEqual([]);
    expect(mem.has('grade3_takeaway_map_v1')).toBe(false);
  });

  it('⭐ 清空失败必须如实点名，绝不谎报"已清空"（回读核验的意义所在）', async () => {
    seed();
    const inst = await freshAji(makeStepCtx());
    /* 让错题本的删除**静默失败**：不抛异常、也不真删。
       这正是真机上 storage 层失败的形态 —— 若无回读核验，这里会谎报"已清空"。 */
    failWriteMatch = 'wrong_book';
    inst._doResetProgress();
    const last = inst.history[inst.history.length - 1];
    expect(last.title).toContain('没清掉');
    expect(last.content).toContain('错题本');
    expect(wbLoad().length).toBe(1);          // 确实没清掉（诚实）
    // 其余项仍然清干净了（单项失败绝不阻断其余）
    expect(historyLoad()).toEqual([]);
    expect(takeawayListAll()).toEqual([]);
    expect(eventsLoad()).toEqual([]);
  });
});

/* ============================================================
   §一 流式请求体：messages 必须是 [system, user] 两轮
   ============================================================ */
describe('Aji 请求体 · 400 根因回归锁', () => {
  const CTX = {
    moduleId: 'm1', topic: '除法竖式', currentProblem: '338 ÷ 7',
    studentProgress: '做到第 2 步', isError: true, userQuery: '我这一步错哪了',
    stepCtx: { currentStep: '第 2 步（商）', studentInput: '6', standardAnswer: '8' },
  };

  /** 非流式回退路径最省事：一次 fetch 就能拿到完整 body */
  function stubJsonFetch() {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      body: new ReadableStream({ start(c) { c.close(); } }),
      text: async () => JSON.stringify({ choices: [{ message: { content: '好' } }] }),
    });
    globalThis.fetch = fetchMock;
    return fetchMock;
  }

  it('⭐ 学生提问必须进 user 轮（缺了这一轮 = 答非所问 + 网关 400 的真根因）', async () => {
    const fetchMock = stubJsonFetch();
    const inst = await freshAji(makeStepCtx());
    await inst._streamAI(CTX, () => {});
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages.map(m => m.role)).toEqual(['system', 'user']);
    expect(body.messages[1].content).toBe('我这一步错哪了');
  });

  it('⭐ 标准答案强制注入 System Prompt，并明令对比学生输入', async () => {
    const inst = await freshAji(makeStepCtx());
    const sys = inst._buildSystemPrompt(CTX);
    expect(sys).toContain('当前步骤：第 2 步（商）');
    expect(sys).toContain('学生当前输入：6');
    expect(sys).toContain('标准答案参考：8');
    expect(sys).toContain('对比');
  });

  it('未作答时整段不注入：拿上一次的残值做对比比不注入更坏', async () => {
    const inst = await freshAji(makeStepCtx());
    const sys = inst._buildSystemPrompt({ ...CTX, stepCtx: { currentStep: '', studentInput: '', standardAnswer: '' } });
    expect(sys).not.toContain('标准答案参考');
    expect(sys).toContain('当前题目：338 ÷ 7');   // 其余上下文照常
  });

  it('请求头带 Content-Type / Accept，且 body 无空值 role', async () => {
    const fetchMock = stubJsonFetch();
    const inst = await freshAji(makeStepCtx());
    await inst._streamAI(CTX, () => {});
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.headers.Accept).toBe('text/event-stream');
    const body = JSON.parse(opts.body);
    expect(body.stream).toBe(true);
    expect(body.messages.every(m => m.role && typeof m.content === 'string' && m.content.trim())).toBe(true);
  });
});
