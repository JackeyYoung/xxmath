/* core/feedback-resolver.js
   统一的反馈查询引擎：题库 -> 历史缓存 -> 错题本缓存
*/
import { historyLoad } from './history.js';
import { wbLoad } from './wrongbook.js';
import { normalizeAiFeedback } from './llm.js';

// 接受题目文本和可选的题库（M13题库）
export function findCachedFeedback(problemText, bank = []) {
  if (!problemText) return null;
  const key = String(problemText).trim();

  // ① 查历史记录（最近的优先）
  try {
    const history = historyLoad();
    const hit = history.find(r => (r.problemText || '').trim() === key && r.aiFeedback && r.aiFeedback.answer);
    if (hit) return { aiFeedback: hit.aiFeedback, source: 'history' };
  } catch (e) {}

  // ② 查错题本缓存
  try {
    const wb = wbLoad();
    const hit = wb.find(r => (r.text || '').trim() === key && r.aiFeedback && r.aiFeedback.answer);
    if (hit) return { aiFeedback: hit.aiFeedback, source: 'wrongbook' };
  } catch (e) {}

  // ③ 查题库（带 steps 的题）
  try {
    if (Array.isArray(bank)) {
      const hit = bank.find(p => (p.text || '').trim() === key && p.steps && p.steps.length);
      if (hit) {
        const fb = normalizeAiFeedback({
          answer: { full: hit.answer?.full || (typeof hit.answer === 'string' ? hit.answer : ''), value: hit.answer?.value },
          steps: hit.steps,
          judgement: { answer_correct: true },
          _source: 'bank',
        }, hit.answer?.full);
        return { aiFeedback: fb, source: 'bank' };
      }
    }
  } catch (e) {}

  return null;
}