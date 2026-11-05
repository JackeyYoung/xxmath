/* app/grade-config.js —— 年级配置（原来在 shell.js 的 1. 年级配置） */

/* ============================================================
   1. 年级配置（为多年级扩展做准备）
   ============================================================ */
export const GRADE_CONFIG = {
  '3': {
    id: '3',
    name: '三年级',
    allowNegative: false,   // 三年级尚未学习负数：出题/作答都禁止出现负的中间结果
    islands: [
      { id: 'm1',  icon: '🎯', name: '混合运算', color: 'blue',   desc: '先算乘除，后算加减' },
      { id: 'm2',  icon: '🧱', name: '铺地砖',   color: 'green',  desc: '一块一块铺满' },
      { id: 'm3',  icon: '🍕', name: '分数',     color: 'amber',  desc: '分一分，取几份' },
      { id: 'm4',  icon: '📏', name: '长度',     color: 'cyan',   desc: '毫米到千米' },
      { id: 'm5',  icon: '📐', name: '面积',     color: 'violet', desc: '长 × 宽 是多少格' },
      { id: 'm6',  icon: '💰', name: '小数',     color: 'pink',   desc: '元角分' },
      { id: 'm7',  icon: '🕐', name: '时间',     color: 'orange', desc: '时分秒' },
      { id: 'm8',  icon: '🍎', name: '倍数',     color: 'lime',   desc: '几倍是多少' },
      { id: 'm9',  icon: '🔢', name: '竖式',     color: 'sky',    desc: '一步步算' },
      { id: 'm10', icon: '📅', name: '日期',     color: 'red',    desc: '年月日' },
      { id: 'm11', icon: '📍', name: '方向',     color: 'teal',   desc: '第几列第几行' },
      { id: 'm12', icon: '⚖️', name: '质量',     color: 'purple', desc: '吨千克克' },
      { id: 'm13', icon: '💡', name: '思维',     color: 'indigo', desc: '四步法解题' },
    ],
  },
};

export function getGradeConfig() {
  const g = (typeof globalThis.__memCachePeek === 'function'
    ? globalThis.__memCachePeek('grade3_current_grade')
    : localStorage.getItem('grade3_current_grade')) || '3';
  return GRADE_CONFIG[g] || GRADE_CONFIG['3'];
}
