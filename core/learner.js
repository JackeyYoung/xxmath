/* core/learner.js
   Aji 记忆引擎 —— 隐式收集、无感回馈（Brilliant & Restrained）
   ──────────────────────────────────────────────────────────────
   设计哲学：
   · 学情是"资产"不是"报表"——只进后台出题策略与 Aji 的聊天语境，
     界面上永远看不到正确率、兴趣标签、薄弱项面板。
   · 课程数据最小必要：只存"错"，做对的题一条都不入 Event Store。

   三条铁律（任务书第五章「存档策略」）：
   ① 只存"错"：只有 isCorrect===false 或 hasErrors===true（过程填错、结果蒙对）
      才推入 LearnerEvents，且必须带 problemText/correctAnswer/studentAnswer/errorStep/usedHint。
   ② 做对的题只喂聚合器：对应 Tag 的连续正确计数 +1，达到阈值标 mastered；
      绝不写进 LearnerEvents。
   ③ 本模块零 UI：不画任何 DOM。学情只以两种形态流出——
      learnerDigest()（给 System Prompt）与 guidanceFor()（给出题器）。

   数据结构：
     LearnerEvents: [{ id, timestamp, moduleId, topic, problemText, correctAnswer,
                       studentAnswer, errorStep, usedHint, tags[] }]
     LearnerMemory: { interests: [{ topic, count, lastMentioned }],
                      tags:      { [tag]: { streak, lastAt, correct, wrong } } }
*/
import { lsGet, lsSet, lsRemove } from './storage.js';
import { getGradeKey } from './keys.js';

/* ---------- 存储键（走年级前缀，随年级切换隔离） ---------- */
const EVENTS_KEY = () => getGradeKey('learner_events_v1');
const MEMORY_KEY = () => getGradeKey('learner_memory_v1');

/* ---------- 阈值常量（任务书第三节） ---------- */
export const MASTER_STREAK = 3;      // 连续 3 次不出现在错题里 → mastered
export const WEAK_WINDOW = 5;        // 只看最近 5 条错题记录
export const WEAK_HITS = 2;          // 最近 5 条内出现 ≥2 次 → persistent_weakness
const EVENTS_MAX = 120;              // 错题资产上限（防移动端存储膨胀）
const INTERESTS_MAX = 12;

/* ============================================================
   一、兴趣词库（本地正则，零 LLM 成本）
   —— 每个实体独立成 topic（"黑洞"就是"黑洞"，不归并成"宇宙"），
      这样趣味融合时能直接把题干换成学生真正好奇的那个东西。
   ============================================================ */
const INTEREST_LEXICON = [
  { topic: '恐龙', hero: '小恐龙', nouns: ['恐龙蛋', '恐龙贴纸', '恐龙模型'],
    re: /恐龙|霸王龙|三角龙|翼龙|剑龙|侏罗纪|白垩纪|化石|考古/ },
  { topic: '黑洞', hero: '宇航员', nouns: ['星球贴纸', '陨石', '望远镜'],
    re: /黑洞|引力|奇点|事件视界/ },
  { topic: '宇宙', hero: '宇航员', nouns: ['星球贴纸', '火箭模型', '陨石'],
    re: /宇宙|银河|星系|星球|行星|恒星|太阳系|月球|太空|火箭|卫星|外星/ },
  { topic: '海洋', hero: '小海豚', nouns: ['贝壳', '海星', '珍珠'],
    re: /海洋|海底|鲨鱼|鲸鱼|海豚|珊瑚|贝壳|深海/ },
  { topic: '动物', hero: '小熊猫', nouns: ['竹笋', '蜂蜜', '橡果'],
    re: /动物|熊猫|老虎|狮子|大象|长颈鹿|兔子|猴子|小狗|小猫|蜜蜂/ },
  { topic: '昆虫', hero: '小蚂蚁', nouns: ['树叶', '花瓣', '露珠'],
    re: /昆虫|蚂蚁|蝴蝶|蜻蜓|甲虫|萤火虫|蜘蛛/ },
  { topic: '汽车', hero: '赛车手', nouns: ['轮胎', '赛车模型', '加油站'],
    re: /汽车|赛车|跑车|卡车|轮胎|引擎|高铁|火车/ },
  { topic: '飞机', hero: '飞行员', nouns: ['模型飞机', '机票', '行李'],
    re: /飞机|客机|机场|航班|航班|飞艇|直升机/ },
  { topic: '机器人', hero: '小机器人', nouns: ['电池', '齿轮', '零件'],
    re: /机器人|人工智能|编程|芯片|机械/ },
  { topic: '游戏', hero: '小玩家', nouns: ['游戏币', '徽章', '道具'],
    re: /游戏|关卡|通关|boss|装备|积分/ },
  { topic: '足球', hero: '小前锋', nouns: ['足球', '球票', '护腿板'],
    re: /足球|篮球|排球|球赛|进球|比赛|运动员/ },
  { topic: '美食', hero: '小厨师', nouns: ['蛋糕', '冰淇淋', '果汁'],
    re: /美食|蛋糕|冰淇淋|巧克力|糖果|饺子|披萨|汉堡|奶茶|水果/ },
  { topic: '音乐', hero: '小乐手', nouns: ['琴弦', '乐谱', '口琴'],
    re: /音乐|钢琴|吉他|小提琴|唱歌|乐谱|乐队/ },
  { topic: '画画', hero: '小画家', nouns: ['水彩笔', '画纸', '颜料'],
    re: /画画|绘画|水彩|颜料|素描|画笔/ },
  { topic: '植物', hero: '小园丁', nouns: ['花种', '树苗', '肥料'],
    re: /植物|花朵|大树|小草|种子|森林|树叶/ },
];

/** 从一句话里提取兴趣实体（本地正则，毫秒级，绝不走 LLM） */
export function extractInterests(text) {
  const t = String(text || '');
  if (!t) return [];
  const hits = [];
  for (const item of INTEREST_LEXICON) {
    if (item.re.test(t)) hits.push(item.topic);
  }
  return hits;
}

/** 取最高权重的兴趣（count 优先，同分看最近提及） */
export function topInterest(memory = memoryLoad()) {
  const list = (memory && memory.interests) || [];
  if (!list.length) return null;
  const best = [...list].sort((a, b) => {
    if ((b.count || 0) !== (a.count || 0)) return (b.count || 0) - (a.count || 0);
    return (b.lastMentioned || 0) - (a.lastMentioned || 0);
  })[0];
  return best ? best.topic : null;
}

const _lexOf = (topic) => INTEREST_LEXICON.find((x) => x.topic === topic) || null;

/* ============================================================
   二、Event Store（做题记录事件库）—— 只存"错"
   ============================================================ */
export function eventsLoad() {
  try {
    const raw = lsGet(EVENTS_KEY());
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function eventsSave(list) {
  try { lsSet(EVENTS_KEY(), JSON.stringify(list)); } catch (e) {}
}

export function eventsClear() {
  try { lsRemove(EVENTS_KEY()); } catch (e) {}
}

/**
 * ⭐ 唯一的错题入库口。调用方必须先自行判定"这题算错"（终局错 或 过程有错），
 *    本函数不做二次判断——判定逻辑留在模块里（它才知道什么是"过程有错"）。
 * @returns {object|null} 落库的事件对象；未入库返回 null
 */
export function recordEvent({
  moduleId = '', topic = '', problemText = '', tags = [],
  correctAnswer = '', studentAnswer = '', errorStep = '', usedHint = false,
} = {}) {
  if (!problemText) return null;
  const evt = {
    id: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    timestamp: new Date().toISOString(),
    moduleId: String(moduleId || ''),
    topic: String(topic || ''),
    problemText: String(problemText).trim(),
    correctAnswer: String(correctAnswer ?? ''),
    studentAnswer: String(studentAnswer ?? ''),
    errorStep: String(errorStep || ''),
    usedHint: !!usedHint,
    tags: normalizeTags(tags),
  };
  const list = eventsLoad();
  list.unshift(evt);
  if (list.length > EVENTS_MAX) list.length = EVENTS_MAX;
  eventsSave(list);
  return evt;
}

/* ============================================================
   三、LearnerMemory（学情聚合 + 兴趣记忆）
   ============================================================ */
export function memoryLoad() {
  try {
    const raw = lsGet(MEMORY_KEY());
    const m = raw ? JSON.parse(raw) : null;
    if (!m || typeof m !== 'object') return { interests: [], tags: {} };
    return {
      interests: Array.isArray(m.interests) ? m.interests : [],
      tags: (m.tags && typeof m.tags === 'object') ? m.tags : {},
    };
  } catch (e) {
    return { interests: [], tags: {} };
  }
}

function memorySave(m) {
  try { lsSet(MEMORY_KEY(), JSON.stringify(m)); } catch (e) {}
}

export function memoryClear() {
  try { lsRemove(MEMORY_KEY()); } catch (e) {}
}

export const normalizeTags = (tags) => {
  const out = [];
  (Array.isArray(tags) ? tags : [tags]).forEach((t) => {
    const s = String(t || '').trim();
    if (s && !out.includes(s)) out.push(s);
  });
  return out.slice(0, 8);
};

/** ⭐ 好奇心捕获：把一句话里命中的兴趣实体静默写进 LearnerMemory.interests */
export function captureInterests(text, now = Date.now()) {
  const topics = extractInterests(text);
  if (!topics.length) return [];
  const m = memoryLoad();
  const list = m.interests;
  for (const topic of topics) {
    const found = list.find((x) => x.topic === topic);
    if (found) {
      found.count = (found.count || 0) + 1;
      found.lastMentioned = now;
    } else {
      list.push({ topic, count: 1, lastMentioned: now });
    }
  }
  // 只留最高权重的若干条，防无限膨胀
  list.sort((a, b) => (b.count || 0) - (a.count || 0) || (b.lastMentioned || 0) - (a.lastMentioned || 0));
  m.interests = list.slice(0, INTERESTS_MAX);
  memorySave(m);
  return topics;
}

/**
 * ⭐ 学情聚合器：扫描 LearnerEvents 计算
 *    · persistentWeakness  最近 WEAK_WINDOW 条错题里出现 ≥WEAK_HITS 次的 Tag
 *    · mastered            连续 MASTER_STREAK 次未出现在错题里的 Tag
 *    ⚠️ 与 recordEvent 的分工：聚合器**只读**事件库，不写；
 *       连续正确计数在 settle() 里即时维护（做对的题不入事件库，事后无法回算）。
 */
export function aggregate(events = eventsLoad(), memory = memoryLoad()) {
  const recent = events.slice(0, WEAK_WINDOW);
  const weaknessHits = {};
  recent.forEach((e) => {
    normalizeTags(e && e.tags).forEach((t) => { weaknessHits[t] = (weaknessHits[t] || 0) + 1; });
  });
  const persistentWeakness = Object.keys(weaknessHits)
    .filter((t) => weaknessHits[t] >= WEAK_HITS)
    .sort((a, b) => weaknessHits[b] - weaknessHits[a]);

  const tagStats = memory.tags || {};
  const mastered = Object.keys(tagStats)
    .filter((t) => (tagStats[t] && tagStats[t].streak || 0) >= MASTER_STREAK)
    .sort((a, b) => (tagStats[b].streak || 0) - (tagStats[a].streak || 0));

  return { persistentWeakness, mastered, weaknessHits, tagStats, recentEvents: recent };
}

/* ============================================================
   四、结算入口（模块的唯一调用点）
   ============================================================ */
/**
 * ⭐ 一次答题结算。模块把"这题算不算错""过程有没有错"如实报上来，
 *    引擎负责分流：错 → 入 Event Store；对 → 只喂聚合器。
 * @param {object} o
 * @param {boolean} o.isCorrect  终局判定是否正确
 * @param {boolean} o.hasErrors  过程是否有填错（结果蒙对也算错）
 * @returns {{ recorded: object|null, tags: string[], digest: object }}
 */
export function settle({
  moduleId = '', topic = '', problemText = '', tags = [],
  isCorrect = true, hasErrors = false,
  correctAnswer = '', studentAnswer = '', errorStep = '', usedHint = false,
} = {}) {
  const tagList = normalizeTags(tags);
  const isWrong = !isCorrect || hasErrors;

  let recorded = null;
  if (isWrong) {
    recorded = recordEvent({
      moduleId, topic, problemText, tags: tagList,
      correctAnswer, studentAnswer, errorStep, usedHint,
    });
  }

  // 聚合计数：做对（且过程无错）→ 连续正确 +1；做错 → 归零
  const m = memoryLoad();
  for (const t of tagList) {
    const rec = m.tags[t] || { streak: 0, correct: 0, wrong: 0, lastAt: 0 };
    if (isWrong) {
      rec.streak = 0;
      rec.wrong = (rec.wrong || 0) + 1;
    } else {
      rec.streak = (rec.streak || 0) + 1;
      rec.correct = (rec.correct || 0) + 1;
    }
    rec.lastAt = Date.now();
    m.tags[t] = rec;
  }
  memorySave(m);

  return { recorded, tags: tagList, digest: aggregate() };
}

/* ============================================================
   五、出题干预（无感定制生成器）
   ============================================================ */

/** 该 Tag 是否属于"顽固短板" */
export function isWeak(tag) {
  return aggregate().persistentWeakness.includes(tag);
}

/** 该 Tag 是否已掌握 */
export function isMastered(tag) {
  return aggregate().mastered.includes(tag);
}

/**
 * ⭐ 出题策略：模块把候选 Tag 报上来，引擎给出干预指令。
 *    · 命中 persistent_weakness → mode:'consolidate'（降维巩固：参数范围收窄）
 *    · 全部命中 mastered        → mode:'advance'    （升维挑战：参数范围放宽）
 *    · 否则                     → mode:'normal'
 * @param {string[]} candidateTags 本次出题可能覆盖的 Tag
 * @param {string} moduleId
 */
export function guidanceFor(candidateTags = [], moduleId = '') {
  const tags = normalizeTags(candidateTags);
  const { persistentWeakness, mastered } = aggregate();
  const weakHit = tags.filter((t) => persistentWeakness.includes(t));
  const masterHit = tags.filter((t) => mastered.includes(t));
  let mode = 'normal';
  if (weakHit.length) mode = 'consolidate';
  else if (tags.length && masterHit.length === tags.length) mode = 'advance';
  return {
    moduleId,
    mode,
    focusTags: mode === 'consolidate' ? weakHit : (mode === 'advance' ? masterHit : []),
    weakTags: persistentWeakness,
    masteredTags: mastered,
  };
}

/**
 * ⭐ 定向出题：反复调用 generator(guidance) 直到题目命中 focusTags。
 *    generator 必须返回 { problemText, tags, ... }（题目标签强制返回结构）。
 *    ⚠️ 有次数上限并有兜底：宁可给普通题，也绝不"换题换不出来"。
 */
export function pickProblem(generator, { candidateTags = [], moduleId = '', tries = 24 } = {}) {
  const g = guidanceFor(candidateTags, moduleId);
  const wantTags = g.focusTags;
  let fallback = null;
  for (let i = 0; i < tries; i++) {
    let p;
    try { p = generator(g); } catch (e) { p = null; }
    if (!p || !p.problemText) continue;
    const out = { ...p, tags: normalizeTags(p.tags), guidance: g };
    if (!fallback) fallback = out;
    if (!wantTags.length) return out;
    if (wantTags.some((t) => out.tags.includes(t))) return out;
  }
  return fallback;
}

/* ============================================================
   六、趣味融合（应用题题干静默换装）
   ============================================================ */
/** 稳定哈希：同一道题永远换装成同一种口味（不闪烁） */
function _hash(str) {
  let h = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const PROTAGONISTS = /小明|小红|小刚|小华|小丽|小强|小美|小王|小张|小李|冬冬|阳阳|芳芳/g;
/* 通用名词 → 主题名词的落点（只换"物件"，绝不碰数字与单位） */
const GENERIC_NOUNS = ['钢笔', '铅笔', '本子', '橡皮', '苹果', '糖果', '气球', '贴纸', '书'];

/**
 * ⭐ 静默换装：把应用题里的主角与一件通用物品换成学生的兴趣主题。
 *    · 没有兴趣记忆 → 原样返回（零副作用）
 *    · 文本里没有可换的锚点 → 原样返回（绝不动数字/单位/问句）
 * @param {string} text 原始题干
 * @param {string} [topic] 指定兴趣；不传则用最高权重兴趣
 */
export function flavorScenario(text, topic) {
  const src = String(text || '');
  if (!src) return src;
  const t = topic || topInterest();
  if (!t) return src;
  const lex = _lexOf(t);
  if (!lex) return src;

  let out = src;
  let touched = false;

  if (PROTAGONISTS.test(out)) {
    PROTAGONISTS.lastIndex = 0;
    out = out.replace(PROTAGONISTS, lex.hero);
    touched = true;
  }

  const nth = _hash(src) % lex.nouns.length;
  const pickNoun = lex.nouns[nth];
  for (const noun of GENERIC_NOUNS) {
    if (out.includes(noun)) {
      out = out.replace(noun, pickNoun);
      touched = true;
      break;
    }
  }

  return touched ? out : src;
}

/* ============================================================
   七、给 LLM 的学情摘要（System Prompt 注入）
   ============================================================ */

/** 「除法进位薄弱、乘法已掌握」这样的中文摘要；无学情返回空串 */
export function learnerTagSummary(agg = aggregate()) {
  const parts = [];
  if (agg.persistentWeakness.length) parts.push(agg.persistentWeakness.slice(0, 3).map((t) => `${t}薄弱`).join('、'));
  if (agg.mastered.length) parts.push(agg.mastered.slice(0, 3).map((t) => `${t}已掌握`).join('、'));
  return parts.join('、');
}

/** 「恐龙、宇宙」这样的兴趣摘要；无则空串 */
export function interestSummary(memory = memoryLoad()) {
  return ((memory && memory.interests) || []).slice(0, 3).map((x) => x.topic).join('、');
}

/**
 * ⭐ RAG 历史错题：倒序取最近 limit 条（可选按 topic 过滤）的真实错题记录。
 *    精简格式（任务书 §五.4）：
 *      1. [m1] 题目：12 × 3 + 15，正确答案：51，学生答案：50（错因：12 × 3 算成了 35）
 */
export function wrongDigest(topic = '', limit = 5) {
  let list = eventsLoad();
  if (topic) {
    const hit = list.filter((e) => e.topic && e.topic.includes(topic));
    if (hit.length) list = hit;   // 有同主题错题就优先取它们，避免 RAG 跑偏
  }
  return list.slice(0, limit).map((e, i) => {
    const parts = [`${i + 1}. [${e.moduleId || '?'}] 题目：${e.problemText}`];
    if (e.correctAnswer) parts.push(`正确答案：${e.correctAnswer}`);
    if (e.studentAnswer) parts.push(`学生答案：${e.studentAnswer}`);
    let line = parts.join('，');
    if (e.errorStep) line += `（错因：${e.errorStep}）`;
    return line;
  });
}

/**
 * ⭐ 错题本入口：按 Tag 聚合出"错得最多"的前 N 类，供 Aji 对话回答。
 *    刻意不返回题目明细（那是错题本的职责）；界面只给一个跳转按钮。
 */
export function topWrongTags(limit = 5) {
  const counts = {};
  eventsLoad().forEach((e) => {
    normalizeTags(e && e.tags).forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

/** 完整学情快照（调试/测试用；界面绝不展示） */
export function learnerSnapshot() {
  const agg = aggregate();
  const memory = memoryLoad();
  return {
    events: eventsLoad(),
    interests: memory.interests,
    mastered: agg.mastered,
    persistentWeakness: agg.persistentWeakness,
    tagStats: agg.tagStats,
  };
}

/* ============================================================
   八、算术题标签器（给 m1/m9 这类纯算式模块用）
   ============================================================ */

/**
 * ⭐ 纯算式的结构化标签：运算类型 + 算理特征。
 *    任务书要求 tags 至少含「运算类型 / 算理特征」两类。
 * @param {string} expr    '12 × 3 + 15' / '338 ÷ 7'
 * @param {object} [opt]   { vertical:true } 竖式（m9）会补「竖式」标记
 */
export function tagsForArithmetic(expr, opt = {}) {
  const s = String(expr || '');
  const tags = [];
  const has = (re) => re.test(s);
  const hasMul = has(/[×*]/), hasDiv = has(/[÷/]/), hasAdd = has(/\+/), hasSub = has(/[-−]/);

  // 运算类型
  const ops = [hasMul && '乘法', hasDiv && '除法', hasAdd && '加法', hasSub && '减法'].filter(Boolean);
  if (ops.length > 1) tags.push('混合运算');
  ops.forEach((o) => tags.push(o));

  // 算理特征
  if (opt.vertical) tags.push('竖式');
  if (has(/[()（）]/)) tags.push('含括号');
  if (ops.length > 1 && !has(/[()（）]/)) tags.push('运算顺序');

  // ⭐ 进位 / 借位：由数字本身算出来，不靠猜
  const nums = (s.match(/\d+/g) || []).map(Number).filter((n) => Number.isFinite(n));
  if (hasAdd && nums.some((n) => String(n).length >= 2) && hasCarryIn(s)) tags.push('进位');
  if (hasSub && !hasAdd) tags.push('退位');
  if (hasDiv && nums.length >= 2) tags.push('除法试商');
  if (hasMul && nums.some((n) => n >= 10)) tags.push('乘法进位');

  return normalizeTags(tags);
}

/** 逐位相加是否有进位（只看加号两侧的相邻数） */
function hasCarryIn(s) {
  const m = s.match(/(\d+)\s*\+\s*(\d+)/g);
  if (!m) return false;
  return m.some((seg) => {
    const [, a, b] = seg.match(/(\d+)\s*\+\s*(\d+)/) || [];
    if (!a || !b) return false;
    const A = String(a).split('').reverse();
    const B = String(b).split('').reverse();
    let carry = 0;
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      const sum = (+A[i] || 0) + (+B[i] || 0) + carry;
      if (sum >= 10) return true;
      carry = 0;
    }
    return false;
  });
}

/** 竖式题（m9）的标签：按运算符给"算理特征"，如 338 ÷ 7 → ['除法','竖式','除法试商'] */
export function tagsForVertical({ a, b, op }) {
  const tags = ['竖式'];
  const map = { '+': '加法', '−': '减法', '-': '减法', '×': '乘法', '*': '乘法', '÷': '除法', '/': '除法' };
  const name = map[op] || '';
  if (name) tags.push(name);
  if (op === '÷' || op === '/') tags.push('除法试商');
  if (op === '×' || op === '*') tags.push('乘法进位');
  if (op === '+' && sumHasCarry(a, b)) tags.push('进位');
  if (op === '−' || op === '-') tags.push('退位');
  return normalizeTags(tags);
}

function sumHasCarry(a, b) {
  const A = String(Math.abs(a)).split('').reverse();
  const B = String(Math.abs(b)).split('').reverse();
  let carry = 0;
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if ((+A[i] || 0) + (+B[i] || 0) + carry >= 10) return true;
    carry = 0;
  }
  return false;
}
