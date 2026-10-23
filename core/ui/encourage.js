/* core/ui/encourage.js */
export function getEncouragement(moduleId, streak = 1) {
  const byModule = {
    m1: ['算对了！先乘除后加减，你掌握了 👏', '这一步很关键，继续！', '又对一步，思路很清晰'],
    m9: ['进位没丢，漂亮！', '这一位算得准，继续保持', '竖式就是这样一步步来的'],
    m13: ['思路对上了，真棒！', '这道题你抓住关键了', '解题四步法你用得越来越顺了'],
  };
  const generic = ['做对了！', '很好，继续！', '思路对上了', '这一步稳了'];
  const pool = byModule[moduleId] || generic;
  if (streak >= 5) return `连对 ${streak} 题，状态很好 🔥`;
  if (streak >= 3) return `连对 ${streak} 题，保持住！`;
  return pool[Math.floor(Math.random() * pool.length)];
}