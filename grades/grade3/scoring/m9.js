/* grades/grade3/scoring/m9.js
   竖式运算：答案映射（纯函数，无 DOM）
*/

export function getAddSubMaxLen(a, b, op) {
  const aStr = String(a), bStr = String(b);
  let maxLen = Math.max(aStr.length, bStr.length, 1);
  const sum = op === '+' ? (a + b) : (a - b);
  if (String(sum).length > maxLen) maxLen = String(sum).length;
  return maxLen;
}

export function computeAnswerMap({ a, b, op }) {
  const map = {};

  if (op === '+' || op === '−') {
    const maxLen = getAddSubMaxLen(a, b, op);
    const aD = String(a).padStart(maxLen, '0').split('').map(Number);
    const bD = String(b).padStart(maxLen, '0').split('').map(Number);
    let carry = 0;
    for (let i = maxLen - 1; i >= 0; i--) {
      let val;
      if (op === '+') {
        val = aD[i] + bD[i] + carry;
        if (val >= 10) { map[`carry-${i}`] = '1'; val -= 10; carry = 1; }
        else carry = 0;
      } else {
        val = aD[i] - bD[i] - carry;
        if (val < 0) { map[`carry-${i}`] = '1'; val += 10; carry = 1; }
        else carry = 0;
      }
      map[`result-${i}`] = String(val);
    }
  }

  if (op === '×') {
    const aStr = String(a);
    const aLen = aStr.length;
    const aRev = aStr.split('').reverse().map(Number);
    let carry = 0;
    for (let i = 0; i < aLen; i++) {
      const prod = aRev[i] * b + carry;
      const digit = prod % 10;
      const newCarry = Math.floor(prod / 10);
      map[`result-${i}`] = String(digit);
      if (newCarry > 0) map[`carry-${i + 1}`] = String(newCarry);
      carry = newCarry;
    }
    if (carry > 0) map[`result-${aLen}`] = String(carry);
  }

  if (op === '÷') {
    const aStr = String(a);
    const n = aStr.length;
    const aD = aStr.split('').map(Number);
    let rem = 0, stepIdx = 0, startPos = 0, started = false;
    for (let i = 0; i < n; i++) {
      const curVal = rem * 10 + aD[i];
      const q = Math.floor(curVal / b);
      const prod = q * b;
      const newRem = curVal - prod;
      if (i === 0 && q === 0 && !started) { rem = curVal; continue; }
      if (!started) { startPos = i; started = true; }
      map[`quotient-${stepIdx}`] = String(q);
      map[`product-${stepIdx}`] = String(prod);
      map[`remainder-${stepIdx}`] = String(newRem);
      map[`range-${stepIdx}`] = { start: startPos, end: i };
      rem = newRem;
      stepIdx++;
    }
  }

  return map;
}

export function getMaxSteps({ a, b, op }) {
  if (op === '÷') {
    if (a < b) return 0;
    const aStr = String(a);
    const n = aStr.length;
    if (b === 0) return 0;
    let rem = 0, total = 0;
    for (let i = 0; i < n; i++) {
      const curVal = rem * 10 + (+aStr[i]);
      const q = Math.floor(curVal / b);
      if (i === 0 && q === 0) { rem = curVal; continue; }
      total++;
      rem = curVal - q * b;
    }
    return Math.max(0, total - 1);
  }
  if (op === '+' || op === '−') return getAddSubMaxLen(a, b, op) - 1;
  if (op === '×') {
    const aStr = String(a);
    const aLen = aStr.length;
    const aRev = aStr.split('').reverse().map(Number);
    let carry = 0;
    for (let i = 0; i < aLen; i++) {
      carry = Math.floor((aRev[i] * b + carry) / 10);
    }
    return carry > 0 ? aLen : aLen - 1;
  }
  return 2;
}

export function calcFinalResult({ a, b, op }) {
  if (op === '+') return a + b;
  if (op === '−') return a - b;
  if (op === '×') return a * b;
  if (op === '÷') {
    const q = Math.floor(a / b);
    const r = a % b;
    return r === 0 ? q : `${q} 余 ${r}`;
  }
  return '?';
}