/* core/wrongbook-tags.js */
import { lsGet, lsSet } from './storage.js';
import { REASON_KEY } from './keys.js';

export const REASONS = ['计算粗心', '读题不细', '方法不会', '单位漏写'];

/* ---------- 题型：互斥，按 weight 取最高 ---------- */
const PROBLEM_TYPES = [
  { id: 'optimal-buy',    name: '最优购买', weight: 100,
    re: /优惠|满\s*\d+\s*减|打折|怎么买.*(划算|便宜|省)|最省|最少花/ },
  { id: 'unit-convert',   name: '单位换算', weight: 90,
    // 要求：数字+单位 与 数字+单位 之间是 = 或 ＝，且不夹"分钟"
    re: /\d+(?:\.\d+)?\s*(?:元|角|米|分米|厘米|毫米|千米|千克|克|吨)\s*[=＝]\s*\d+(?:\.\d+)?\s*(?:元|角|米|分米|厘米|毫米|千米|千克|克|吨)/ },
  { id: 'area-perimeter', name: '面积周长', weight: 80,
    re: /面积|周长|边长|地砖|围栏|铺.*(?:地|砖)/ },
  { id: 'time-calc',      name: '时间推算', weight: 80,
    re: /经过.*(?:小时|分钟)|几点.*(?:到|出发|开始)|用时|一共.*(?:小时|分钟)/ },
  { id: 'multi-step',     name: '多步应用题', weight: 30,
    re: /还剩|剩下|找回|找零|平均|一共/ },
];

/* ---------- 知识点：可多个，注意负向排除 ---------- */
const KNOWLEDGE_POINTS = [
  { id: 'multiplication', name: '乘除运算', re: /[×÷]|乘|除以/ },
  { id: 'fraction',       name: '分数',     re: /分数|几分之几|\d+\s*\/\s*\d+/ },
  { id: 'multiple',       name: '倍数关系', re: /倍|增加到|增加了/ },
  // 货币：排除"分钟/分米/分数/分别/十分/分享/分析"
  { id: 'money',          name: '货币',     re: /[元角](?!旦)|分(?!钟|米|数|别|享|析)/ },
  // 长度：米要排除"厘米/毫米/千米/平方米"已含在字面里；这里直接按包含匹配即可
  { id: 'length',         name: '长度',     re: /厘米|毫米|分米|千米|米(?!制)/ },
  { id: 'mass',           name: '质量',     re: /千克|克|吨/ },
];

function collect(hits) {
  const set = new Set();
  hits.forEach(h => { if (h.re.test(text)) set.add(h.name); });
  return set;
}

/**
 * 返回结构化分类结果
 * @returns {{ type: string|null, typeId: string|null, knowledge: string[], tags: string[] }}
 */
export function classify(text) {
  const t = String(text || '');
  // 题型：权重从高到低，命中第一个即止
  let type = null;
  for (const r of [...PROBLEM_TYPES].sort((a, b) => b.weight - a.weight)) {
    if (r.re.test(t)) { type = r; break; }
  }
  // 知识点：全量收集
  const knowledge = [];
  KNOWLEDGE_POINTS.forEach(k => { if (k.re.test(t)) knowledge.push(k.name); });

  // 组装 tags：题型 + 知识点（去重）
  const tags = [];
  if (type) tags.push(type.name);
  knowledge.forEach(k => { if (!tags.includes(k)) tags.push(k); });

  return {
    type: type ? type.name : null,
    typeId: type ? type.id : null,
    knowledge,
    tags,
  };
}

/**
 * 兼容旧调用方：只返回标签数组
 */
export function autoTagsFor(text) {
  return classify(text).tags;
}

/* ---------- 以下保持原样，不动存储逻辑 ---------- */
export function loadReasons() {
  try { return JSON.parse(lsGet(REASON_KEY) || '{}'); } catch (e) { return {}; }
}
export function saveReasons(map) {
  try { lsSet(REASON_KEY, JSON.stringify(map)); } catch (e) {}
}
export function getReasons(text) {
  const m = loadReasons();
  return m[text] || [];
}
export function toggleReason(text, reason) {
  const m = loadReasons();
  const cur = new Set(m[text] || []);
  if (cur.has(reason)) cur.delete(reason);
  else cur.add(reason);
  m[text] = [...cur];
  saveReasons(m);
}