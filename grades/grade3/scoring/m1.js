/* grades/grade3/scoring/m1.js
   混合运算：解析 + 优先级 + 括号清理（纯函数，无 DOM）
*/

/* 解析算式字符串 → token 数组 */
export function parseExpression(str) {
  const s = String(str).replace(/\s+/g, '')
    .replace(/[×xX*]/g, '×')
    .replace(/[÷/]/g, '÷')
    .replace(/[−–—]/g, '-')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')');
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(s[i + 1]))) {
      let num = '';
      while (i < s.length && /[\d.]/.test(s[i])) { num += s[i]; i++; }
      const v = parseFloat(num);
      if (!isNaN(v)) tokens.push({ type: 'num', val: v });
    } else if ('+-×÷'.includes(ch)) {
      tokens.push({ type: 'op', val: ch });
      i++;
    } else if (ch === '(' || ch === ')') {
      tokens.push({ type: ch === '(' ? 'lparen' : 'rparen', val: ch });
      i++;
    } else {
      i++;
    }
  }
  return tokens;
}

export function fmtNum(n) {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

export function tokensToString(tokens) {
  return tokens.map(t => t.type === 'num' ? fmtNum(t.val) : t.val).join(' ');
}

/* 找出"应该先算"的运算符下标（有乘除取乘除，否则取加减） */
export function computePriorityOps(tokens) {
  const mulDiv = [], addSub = [];
  tokens.forEach((t, i) => {
    if (t.type === 'op') {
      if (t.val === '×' || t.val === '÷') mulDiv.push(i);
      else addSub.push(i);
    }
  });
  return mulDiv.length > 0 ? mulDiv : addSub;
}

/* 括号层级：返回每个 token 所在的深度 */
export function computeDepths(tokens) {
  const depths = [];
  let cur = 0;
  let max = 0;
  for (const t of tokens) {
    if (t.type === 'lparen') { cur++; if (cur > max) max = cur; }
    depths.push(cur);
    if (t.type === 'rparen') cur--;
  }
  return { depths, maxDepth: max };
}

/* 判断某个运算符能否被点击（
   规则：必须处于最深层；同层有乘除时 +- 不能点；左右必须是数字 */
export function canClickOp(tokens, i) {
  const t = tokens[i];
  if (!t || t.type !== 'op') return { ok: false, reason: 'not-op' };

  const { depths, maxDepth } = computeDepths(tokens);
  const depth = depths[i];
  if (depth < maxDepth) return { ok: false, reason: 'inner-paren' };

  const op = t.val;
  if (op === '+' || op === '-') {
    const hasMulDivAtSameDepth = tokens.some((tt, j) => {
      if (tt.type !== 'op') return false;
      if (tt.val !== '×' && tt.val !== '÷') return false;
      return depths[j] === depth;
    });
    if (hasMulDivAtSameDepth) return { ok: false, reason: 'muldiv-first' };
  }

  const left = tokens[i - 1], right = tokens[i + 1];
  if (!left || !right || left.type !== 'num' || right.type !== 'num') {
    return { ok: false, reason: 'not-ready' };
  }
  return { ok: true, depth };
}

/* 计算一步的结果 */
export function computeStep(left, right, op) {
  if (op === '×') return left * right;
  if (op === '÷') {
    if (right === 0) throw new Error('不能除以 0');
    return left / right;
  }
  if (op === '+') return left + right;
  if (op === '-') return left - right;
  throw new Error('未知运算符 ' + op);
}

/* 执行一步：返回新 token 数组 */
export function applyStep(tokens, i, resultVal) {
  return [
    ...tokens.slice(0, i - 1),
    { type: 'num', val: resultVal },
    ...tokens.slice(i + 2),
  ];
}

/* 清理孤立的括号（括号内只剩一个 num 时删掉） */
export function cleanParens(tokens) {
  let changed = true;
  let result = tokens.slice();
  while (changed) {
    changed = false;
    for (let i = 0; i < result.length; i++) {
      if (result[i].type !== 'lparen') continue;
      let depth = 1, j = i + 1;
      for (; j < result.length; j++) {
        if (result[j].type === 'lparen') depth++;
        if (result[j].type === 'rparen') { depth--; if (depth === 0) break; }
      }
      if (j >= result.length) continue;
      const inner = result.slice(i + 1, j);
      const hasOp = inner.some(t => t.type === 'op');
      if (!hasOp) {
        result = [...result.slice(0, i), ...inner, ...result.slice(j + 1)];
        changed = true;
        break;
      }
    }
  }
  return result;
}

/* 生成"把某段用括号 + 高亮包起来"的 HTML（不转义，交给调用方） */
export function tokensToMarkedHtml(tokens, markL, markR) {
  return tokens.map((t, idx) => {
    let str = t.type === 'num' ? fmtNum(t.val) : t.val;
    if (idx >= markL && idx <= markR) {
      const isParen = (t.type === 'lparen' || t.type === 'rparen');
      if (idx === markL && !isParen) str = '( ' + str;
      if (idx === markR && !isParen) str = str + ' )';
      return `<span class="step-part">${str}</span>`;
    }
    return str;
  }).join(' ');
}