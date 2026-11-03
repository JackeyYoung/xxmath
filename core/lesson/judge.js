/* core/lesson/judge.js
   底座 ②：useJudge()。把「判对/判错/输入非法」这件事从 13 个模块里抽出来。

   纯逻辑，不碰 DOM —— 因此可以直接单测（M4 的判分骨架重复问题在这里收敛）。

   Vue 化后：
     const { submit, last, attempts } = useJudge({ answer: () => quiz.value.ans })
     <button @click="result = submit(input)">检查</button>
*/

/** 默认的严格解析：空串 / 半截输入（'12abc'）一律视为无效，对应报告里的 M6 */
export function defaultParse(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {{ answer: (() => number|string|null) | number | string | null,
 *           parse?: (raw: any) => number|null,
 *           tolerance?: number }} opts
 */
export function createJudge({ answer, parse = defaultParse, tolerance = 1e-9 } = {}) {
  const attemptsLog = [];

  function expectedValue() {
    return typeof answer === 'function' ? answer() : answer;
  }

  function record(r) { attemptsLog.push(r); return r; }

  /**
   * @returns {{ ok: boolean, state: 'ok'|'wrong'|'invalid', raw: any, parsed: any, expected: any }}
   */
  function submit(raw) {
    const expected = expectedValue();

    // ⭐ 期望值是字符串（如「9 余 1」）时走原文全等比较，不做数值解析 ——
    //    否则 Number('9 余 1') 是 NaN，会被误判成「输入非法」。
    if (typeof expected === 'string') {
      const s = String(raw == null ? '' : raw).trim();
      const ok = s !== '' && s === expected.trim();
      return record({ ok, state: ok ? 'ok' : 'wrong', raw, parsed: s || null, expected });
    }

    const parsed = parse(raw);
    if (parsed == null) {
      return record({ ok: false, state: 'invalid', raw, parsed: null, expected });
    }

    let ok = false;
    if (typeof expected === 'number') ok = Math.abs(parsed - expected) <= tolerance;
    else if (expected != null) ok = String(parsed) === String(expected);

    return record({ ok, state: ok ? 'ok' : 'wrong', raw, parsed, expected });
  }

  return {
    submit,
    reset() { attemptsLog.length = 0; },
    get last() { return attemptsLog[attemptsLog.length - 1] || null; },
    get attempts() { return attemptsLog.length; },
  };
}
