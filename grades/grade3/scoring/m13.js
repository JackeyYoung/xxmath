/* grades/grade3/scoring/m13.js
   解题思维：数字提取 + 代入式校验（纯函数）
*/

export function extractNums(s) {
  return (String(s).match(/\d+(\.\d+)?/g) || []).map(Number);
}

export function problemNumbers(problemText) {
  const raw = String(problemText || '');
  const nums = raw.match(/\d+(?:\.\d+)?/g) || [];
  return [...new Set(nums.map(n => parseFloat(n)).filter(n => !isNaN(n)))];
}

export function isValidSubstitution(sub, problemNums) {
  if (!sub) return false;
  const s = String(sub).trim();
  if (!/[+\-×÷*/]/.test(s) && !/\d\s*[xX]\s*\d/.test(s)) return false;
  const subNums = (s.match(/\d+(?:\.\d+)?/g) || []).map(n => parseFloat(n));
  if (subNums.length < 2) return false;
  let hit = 0;
  subNums.forEach(n => {
    if (problemNums.some(p => Math.abs(p - n) < 1e-6)) hit++;
  });
  return hit >= 2;
}

export function checkPassword(input) {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return input === (mm + dd + 'pcw');
}