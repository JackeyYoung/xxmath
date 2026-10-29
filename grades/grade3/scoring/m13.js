/* grades/grade3/scoring/m13.js
   解题思维：数字提取 + 代入式校验（纯函数）
*/
/**
 * 将中文数字字符串转换为阿拉伯数字
 * 支持：一、十、百、千、万，支持“两”，支持“零”
 * 例如："一百四十" -> 140, "两千零五" -> 2005, "一百" -> 100
 */
function parseChineseNumber(cnStr) {
  const cnNums = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  const cnUnits = { '十': 10, '百': 100, '千': 1000, '万': 10000 };
  
  let result = 0;
  let section = 0; // 当前万级以下的计算
  let number = 0;  // 当前正在处理的数字
  
  for (let i = 0; i < cnStr.length; i++) {
    const char = cnStr[i];
    if (cnNums[char] !== undefined) {
      number = cnNums[char];
      // 处理“十五”这种十开头的特殊情况
      if (char === '十' && i === 0) number = 10;
    } else if (cnUnits[char] !== undefined) {
      const unit = cnUnits[char];
      if (unit === 10000) {
        section = (section + (number || 1)) * unit;
        result += section;
        section = 0;
      } else {
        if (number === 0) number = 1; // 处理“百”前面没有数字的情况，如“百”
        section += number * unit;
      }
      number = 0;
    }
  }
  return result + section + number;
}

/**
 * 预处理字符串：将中文复合数字替换为阿拉伯数字
 */
function replaceChineseNumbers(text) {
  if (!text) return '';
  // 匹配连续的中文数字（包含十百千万两零）
  return text.replace(/[零一二两三四五六七八九十百千万]+/g, (match) => {
    const parsed = parseChineseNumber(match);
    // 如果解析出来大于 0，就替换；解析失败则原样返回
    return parsed > 0 ? parsed.toString() : match;
  });
}

export function extractNums(text) {
  if (!text) return [];
  // ⭐ 先把所有的汉字数字短语转成阿拉伯数字（如把“一百四”转成“140”）
  const converted = replaceChineseNumbers(text);
  
  // 匹配所有的数字（包括小数）
  const matches = converted.match(/\d+(\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

/*
export function isValidSubstitution(sub, problemNums) {
  if (!sub) return false;
  
  // 用户写的代入式，也要先做同样的处理（比如用户写了“8 × 一百四十”）
  const convertedSub = replaceChineseNumbers(sub);
  
  const userNums = extractNums(convertedSub);
  return userNums.some(num => problemNums.includes(num));
}
*/

export function problemNumbers(problemText) {
  const raw = String(problemText || '');
  const nums = raw.match(/\d+(?:\.\d+)?/g) || [];
  return [...new Set(nums.map(n => parseFloat(n)).filter(n => !isNaN(n)))];
}

export function isValidSubstitution(sub, problemNums) {
  if (!sub || !Array.isArray(problemNums)) return false; // ⭐ 增加对 problemNums 的校验
  
  // ⭐ 1. 先把用户写的汉字数字转换成阿拉伯数字
  const convertedSub = replaceChineseNumbers(String(sub).trim());
  
  // ⭐ 2. 检查是否包含运算符号（兼容乘号的各种写法）
  if (!/[+\-×÷*/xX]/.test(convertedSub)) return false;
  
  // ⭐ 3. 提取转换后的所有数字
  const subNums = (convertedSub.match(/\d+(?:\.\d+)?/g) || []).map(n => parseFloat(n));
  
  // ⭐ 4. 核心放宽：只要代入式里有数字，且至少有 1 个数字在题目里出现过，就算有效
  // （去掉了原先强制的 length < 2 限制，也把 hit >= 2 改为了 hit >= 1）
  if (subNums.length === 0) return false;
  
  const hit = subNums.filter(n => 
    problemNums.some(p => Math.abs(p - n) < 1e-6)
  ).length;

  return hit >= 1; 
}

export function checkPassword(input) {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return input === (mm + dd + 'pcw');
}