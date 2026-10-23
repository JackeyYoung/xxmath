/* core/wrongbook-tags.js */
import { lsGet, lsSet } from './storage.js';
import { REASON_KEY } from './keys.js';

export const REASONS = ['计算粗心', '读题不细', '方法不会', '单位漏写'];

export function autoTagsFor(text) {
  const rules = [
    { re: /还剩|剩下|一共|平均|找回|找零|共计/, tag: '两步应用题' },
    { re: /面积|周长|边长|长.*宽|围栏|地砖/,        tag: '面积周长' },
    { re: /倍|是.*的.*倍|增加到/,                    tag: '倍数关系' },
    { re: /时|分|秒|经过|几点|分钟/,                 tag: '时间推算' },
    { re: /元|角|分|吨|千克|克|米|分米|厘米|毫米/,   tag: '单位换算' },
    { re: /[×÷]/,                                    tag: '乘除运算' },
    { re: /千克|克|吨/,                              tag: '质量单位' },
    { re: /分数|几分之几/,                           tag: '分数' },
  ];
  const tags = new Set();
  rules.forEach(r => { if (r.re.test(text)) tags.add(r.tag); });
  return [...tags];
}

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