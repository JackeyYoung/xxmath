// core/__tests__/learner.test.js
// Aji 记忆引擎单测：只存错 / 聚合 mastered 与 persistent_weakness / 兴趣捕获 /
// 无感出题干预 / 趣味融合 / RAG 精简格式
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../js/vendor/gsap/index.js', () => ({
  gsap: { set: vi.fn(), to: vi.fn(), fromTo: vi.fn(), killTweensOf: vi.fn() },
}));

import {
  settle, eventsLoad, eventsClear, memoryLoad, memoryClear,
  aggregate, captureInterests, extractInterests, topInterest,
  learnerTagSummary, interestSummary, wrongDigest, topWrongTags,
  guidanceFor, pickProblem, flavorScenario, learnerSnapshot,
  tagsForArithmetic, tagsForVertical, normalizeTags,
} from '../learner.js';

/* localStorage 在 jsdom 里可用；storage.js 会优先走内存缓存 + localStorage 兜底 */
beforeEach(() => {
  try { localStorage.clear(); } catch (e) {}
  eventsClear();
  memoryClear();
});

describe('① 高价值存储：做对的题不进 Event Store，只喂聚合器', () => {
  it('连续做对 5 道 → LearnerEvents 不增长，对应 Tag 的 streak 递增到 mastered', () => {
    for (let i = 0; i < 5; i++) {
      settle({
        moduleId: 'm1', topic: '混合运算', problemText: `${i + 2} × 3 + 1`,
        tags: ['乘法', '混合运算'], isCorrect: true, hasErrors: false,
      });
    }
    expect(eventsLoad()).toHaveLength(0);                 // ⭐ 一条都不许存
    const agg = aggregate();
    expect(agg.mastered).toContain('乘法');
    expect(agg.mastered).toContain('混合运算');
    expect(agg.tagStats['乘法'].streak).toBe(5);
    expect(agg.tagStats['乘法'].correct).toBe(5);
  });

  it('阈值边界：连续 2 次正确不算掌握，第 3 次才升级', () => {
    const t = { moduleId: 'm1', problemText: '2 × 3', tags: ['乘法'], isCorrect: true };
    settle(t); settle(t);
    expect(aggregate().mastered).not.toContain('乘法');
    expect(aggregate().tagStats['乘法'].streak).toBe(2);
    settle(t);
    expect(aggregate().mastered).toContain('乘法');
  });

  it('过程有错但结果蒙对（hasErrors:true）→ 仍算错，必须入 Event Store', () => {
    const r = settle({
      moduleId: 'm1', topic: '混合运算', problemText: '12 × 3 + 15',
      tags: ['乘法', '加法', '进位'],
      isCorrect: true, hasErrors: true,        // 终局对，但过程填错过
      correctAnswer: '51', studentAnswer: '51',
      errorStep: '12 × 3 算成了 35', usedHint: true,
    });
    expect(r.recorded).not.toBeNull();
    const list = eventsLoad();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      moduleId: 'm1', problemText: '12 × 3 + 15', correctAnswer: '51',
      studentAnswer: '51', errorStep: '12 × 3 算成了 35', usedHint: true,
    });
    expect(list[0].id).toMatch(/^evt_/);
    expect(list[0].timestamp).toBeTruthy();
    expect(list[0].tags).toEqual(['乘法', '加法', '进位']);
    // 有错 → streak 归零，不会因为"终局对"而记成掌握
    expect(aggregate().tagStats['乘法'].streak).toBe(0);
    expect(aggregate().mastered).not.toContain('乘法');
  });
});

describe('② 精准回溯：连续错 2 道同 Tag → persistent_weakness', () => {
  const wrong = (i) => settle({
    moduleId: 'm9', topic: '竖式除法', problemText: `${300 + i} ÷ 7`,
    tags: ['除法', '竖式', '除法试商'],
    isCorrect: false, hasErrors: true,
    correctAnswer: '42', studentAnswer: '41', errorStep: '试商偏小',
  });

  it('错 1 道不触发；错第 2 道触发 persistent_weakness', () => {
    wrong(0);
    expect(aggregate().persistentWeakness).not.toContain('除法试商');
    wrong(1);
    expect(aggregate().persistentWeakness).toContain('除法试商');
    expect(aggregate().persistentWeakness).toContain('除法');
  });

  it('窗口只看最近 5 条：老错题滚出窗口后不再计入', () => {
    wrong(0); wrong(1);
    expect(aggregate().persistentWeakness).toContain('除法');
    // 再错 5 条"别的" Tag 的题，把前两条推出窗口
    for (let i = 0; i < 5; i++) {
      settle({
        moduleId: 'm3', problemText: `分数 ${i}`, tags: ['分数'],
        isCorrect: false, correctAnswer: '1', studentAnswer: '0',
      });
    }
    expect(aggregate().persistentWeakness).not.toContain('除法');
    expect(aggregate().persistentWeakness).toContain('分数');
  });

  it('错一次后又连续做对 3 次 → streak 回正，重新成为 mastered', () => {
    settle({ moduleId: 'm1', problemText: '8 × 5', tags: ['乘法'], isCorrect: false, correctAnswer: '40', studentAnswer: '35' });
    expect(aggregate().tagStats['乘法'].streak).toBe(0);
    for (let i = 0; i < 3; i++) settle({ moduleId: 'm1', problemText: `8 × ${i + 2}`, tags: ['乘法'], isCorrect: true });
    expect(aggregate().mastered).toContain('乘法');
  });
});

describe('③ 无感出题：guidanceFor 干预策略', () => {
  it('命中 persistent_weakness → consolidate；generator 反复调用直到抽中含该 Tag 的题', () => {
    // 先制造"除法试商"顽固短板
    for (let i = 0; i < 2; i++) {
      settle({
        moduleId: 'm9', topic: '竖式除法', problemText: `${300 + i} ÷ 7`,
        tags: ['除法试商'], isCorrect: false, correctAnswer: '42', studentAnswer: '41',
      });
    }
    const g = guidanceFor(['除法试商', '加法'], 'm9');
    expect(g.mode).toBe('consolidate');
    expect(g.focusTags).toContain('除法试商');

    // 生成器只在第 4 次才吐出带该 Tag 的题 → pickProblem 必须能找到它
    let n = 0;
    const picked = pickProblem(() => {
      n++;
      return n < 4
        ? { problemText: `1 + ${n}`, tags: ['加法'], answer: n + 1 }
        : { problemText: '338 ÷ 7', tags: ['除法试商'], answer: 48 };
    }, { candidateTags: ['除法试商', '加法'], moduleId: 'm9' });
    expect(picked.problemText).toBe('338 ÷ 7');
    expect(picked.tags).toContain('除法试商');
    expect(n).toBe(4);
  });

  it('全部 Tag 已 mastered → advance（升维）', () => {
    for (let i = 0; i < 3; i++) settle({ moduleId: 'm1', problemText: `2 × ${i + 3}`, tags: ['乘法'], isCorrect: true });
    const g = guidanceFor(['乘法'], 'm1');
    expect(g.mode).toBe('advance');
    expect(g.focusTags).toContain('乘法');
  });

  it('无学情 → normal', () => {
    expect(guidanceFor(['乘法'], 'm1').mode).toBe('normal');
  });

  it('兜底：generator 永远抽不出目标 Tag 时，绝不返回 null（宁可给普通题）', () => {
    for (let i = 0; i < 2; i++) {
      settle({ moduleId: 'm9', problemText: `9${i} ÷ 7`, tags: ['除法试商'], isCorrect: false, correctAnswer: '1', studentAnswer: '2' });
    }
    const picked = pickProblem(() => ({ problemText: '1 + 1', tags: ['加法'], answer: 2 }), { candidateTags: ['除法试商'] });
    expect(picked).not.toBeNull();
    expect(picked.problemText).toBe('1 + 1');
  });
});

describe('④ 好奇心捕获（兴趣记忆）', () => {
  it('分词命中：黑洞 → 只记"黑洞"，不扩散成"宇宙"', () => {
    const hits = captureInterests('黑洞是什么呀？');
    expect(hits).toEqual(['黑洞']);
    const m = memoryLoad();
    expect(m.interests).toHaveLength(1);
    expect(m.interests[0].topic).toBe('黑洞');
    expect(m.interests[0].count).toBe(1);
    expect(typeof m.interests[0].lastMentioned).toBe('number');
  });

  it('重复提及 → count 累加；topInterest 取权重最高', () => {
    captureInterests('恐龙好酷');
    captureInterests('恐龙吃什么');
    captureInterests('宇宙有多大');
    expect(memoryLoad().interests.find(x => x.topic === '恐龙').count).toBe(2);
    expect(topInterest()).toBe('恐龙');
  });

  it('无关提问不产生任何记忆（零污染）', () => {
    captureInterests('为什么这一步要进位？');
    expect(memoryLoad().interests).toHaveLength(0);
    expect(extractInterests('12 × 3 等于多少')).toEqual([]);
  });
});

describe('⑤ 趣味融合（应用题题干静默换装）', () => {
  it('主角与通用名词换成兴趣主题，数字与单位一字不动', () => {
    captureInterests('我喜欢恐龙');
    const src = '小明有 15 元，买一支钢笔用去 8 元，又买一本本子用去 3 元。小明还剩多少元？';
    const out = flavorScenario(src, '恐龙');
    expect(out).not.toContain('小明');
    expect(out).toContain('小恐龙');
    expect(out).toContain('15 元');
    expect(out).toContain('8 元');
    expect(out).toContain('3 元');
    expect(out).toMatch(/还剩多少元？$/);
  });

  it('没有兴趣记忆 → 原样返回（零副作用）', () => {
    const src = '小明有 15 元，买一支钢笔用去 8 元。';
    expect(flavorScenario(src)).toBe(src);
  });

  it('同一道题换装结果稳定（不闪烁）', () => {
    captureInterests('恐龙');
    const src = '小明买了 3 个气球。';
    expect(flavorScenario(src, '恐龙')).toBe(flavorScenario(src, '恐龙'));
  });

  it('无可换锚点的题干（纯算式）原样返回，绝不破坏数字', () => {
    captureInterests('恐龙');
    expect(flavorScenario('12 × 3 + 15', '恐龙')).toBe('12 × 3 + 15');
  });
});

describe('⑥ RAG 精简格式（错题本检索）', () => {
  it('倒序取最近 5 条，格式为「N. [m1] 题目：…，正确答案：…，学生答案：…（错因：…）」', () => {
    for (let i = 0; i < 7; i++) {
      settle({
        moduleId: 'm1', topic: '混合运算', problemText: `${i} × 3 + 15`,
        tags: ['乘法'], isCorrect: false,
        correctAnswer: '51', studentAnswer: '50', errorStep: `${i} × 3 算成了 35`,
      });
    }
    const digest = wrongDigest('混合运算', 5);
    expect(digest).toHaveLength(5);
    expect(digest[0]).toBe('1. [m1] 题目：6 × 3 + 15，正确答案：51，学生答案：50（错因：6 × 3 算成了 35）');
    // 倒序：最后写入的（6 × 3）在最前
    expect(digest[4]).toContain('题目：2 × 3 + 15');
  });

  it('topWrongTags：按 Tag 聚合错得最多的类别', () => {
    for (let i = 0; i < 3; i++) settle({ moduleId: 'm9', problemText: `1${i} ÷ 7`, tags: ['除法', '竖式', '除法试商'], isCorrect: false, correctAnswer: '1', studentAnswer: '2' });
    settle({ moduleId: 'm1', problemText: '2 × 3', tags: ['乘法'], isCorrect: false, correctAnswer: '6', studentAnswer: '5' });
    const top = topWrongTags(5);
    expect(top[0]).toEqual({ tag: '除法', count: 3 });
    expect(top.map(x => x.tag)).toContain('乘法');
    expect(top.find(x => x.tag === '乘法').count).toBe(1);
  });
});

describe('⑦ 学情/兴趣摘要（喂 System Prompt）', () => {
  it('薄弱在前、已掌握在后，中文可读；无学情返回空串', () => {
    expect(learnerTagSummary()).toBe('');
    for (let i = 0; i < 3; i++) settle({ moduleId: 'm1', problemText: `2 × ${i}`, tags: ['乘法'], isCorrect: true });
    for (let i = 0; i < 2; i++) settle({ moduleId: 'm9', problemText: `${i} ÷ 7`, tags: ['除法试商'], isCorrect: false, correctAnswer: '1', studentAnswer: '2' });
    const s = learnerTagSummary();
    expect(s).toContain('除法试商薄弱');
    expect(s).toContain('乘法已掌握');
    expect(s.indexOf('除法试商薄弱')).toBeLessThan(s.indexOf('乘法已掌握'));
  });

  it('兴趣摘要取最高权重 3 个', () => {
    captureInterests('恐龙');
    captureInterests('宇宙');
    expect(interestSummary()).toBe('恐龙、宇宙');
  });
});

describe('⑧ 算术题标签器', () => {
  it('m1 混合算式：运算类型 + 运算顺序 + 括号', () => {
    expect(tagsForArithmetic('12 × 3 + 15')).toEqual(expect.arrayContaining(['混合运算', '乘法', '加法']));
    expect(tagsForArithmetic('(3 + 6) ÷ (4 - 1)')).toContain('含括号');
    expect(tagsForArithmetic('15 - 9 - 8')).toEqual(expect.arrayContaining(['减法']));
  });

  it('进位由数字本身算出，不靠猜', () => {
    expect(tagsForArithmetic('58 + 27')).toContain('进位');    // 8+7 进位
    expect(tagsForArithmetic('23 + 14')).not.toContain('进位'); // 无进位
  });

  it('m9 竖式：带"竖式"标记与算理特征', () => {
    expect(tagsForVertical({ a: 338, b: 7, op: '÷' })).toEqual(expect.arrayContaining(['竖式', '除法', '除法试商']));
    expect(tagsForVertical({ a: 58, b: 27, op: '+' })).toContain('进位');
    expect(tagsForVertical({ a: 58, b: 27, op: '−' })).toEqual(expect.arrayContaining(['竖式', '减法', '退位']));
  });

  it('normalizeTags：去重、去空、截断', () => {
    expect(normalizeTags(['乘法', '乘法', '', null, ' 加法 '])).toEqual(['乘法', '加法']);
    expect(normalizeTags('除法')).toEqual(['除法']);
    expect(normalizeTags(Array.from({ length: 20 }, (_, i) => 't' + i))).toHaveLength(8);
  });
});

describe('⑨ 存储上限与快照', () => {
  it('事件库有上限（防移动端存储膨胀），最旧的被淘汰', () => {
    for (let i = 0; i < 130; i++) {
      settle({ moduleId: 'm1', problemText: `第 ${i} 题`, tags: ['减法'], isCorrect: false, correctAnswer: '1', studentAnswer: '0' });
    }
    const list = eventsLoad();
    expect(list.length).toBe(120);
    expect(list[0].problemText).toBe('第 129 题');
    expect(list[list.length - 1].problemText).toBe('第 10 题');
  });

  it('空题面不入库（避免脏数据）', () => {
    const r = settle({ moduleId: 'm1', problemText: '', tags: ['乘法'], isCorrect: false });
    expect(r.recorded).toBeNull();
    expect(eventsLoad()).toHaveLength(0);
  });

  it('快照包含学情全貌，但只是数据（本模块不画任何 DOM）', () => {
    settle({ moduleId: 'm9', problemText: '338 ÷ 7', tags: ['除法试商'], isCorrect: false, correctAnswer: '48', studentAnswer: '41' });
    captureInterests('恐龙');
    const snap = learnerSnapshot();
    expect(snap.events).toHaveLength(1);
    expect(snap.interests[0].topic).toBe('恐龙');
    expect(snap).toHaveProperty('persistentWeakness');
    expect(snap).toHaveProperty('mastered');
    expect(snap).toHaveProperty('tagStats');
  });

  it('损坏的存储内容不炸（返回空结构）', () => {
    localStorage.setItem('grade3_learner_events_v1', '{not json');
    localStorage.setItem('grade3_learner_memory_v1', '[]');
    expect(eventsLoad()).toEqual([]);
    expect(memoryLoad()).toEqual({ interests: [], tags: {} });
  });
});
