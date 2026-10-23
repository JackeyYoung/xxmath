/* grades/grade3/index.js
   三年级配置：主题、知识岛、模块懒加载器
   —— 新增年级只需复制这个文件
*/

export default {
  id: '3',
  name: '三年级',
  theme: {
    primary: '#3b82f6',
    primaryDark: '#2563eb',
    accent: '#29cc57',
    bg: '#eef3f9',
  },

  // 首页知识岛（顺序即显示顺序）
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

  // ⭐ 关键：懒加载器。进入模块前这段代码不会下载
  modules: {
    m1:  () => import('./modules/m1.js'),
    m2:  () => import('./modules/m2.js'),
    m3:  () => import('./modules/m3.js'),
    m4:  () => import('./modules/m4.js'),
    m5:  () => import('./modules/m5.js'),
    m6:  () => import('./modules/m6.js'),
    m7:  () => import('./modules/m7.js'),
    m8:  () => import('./modules/m8.js'),
    m9:  () => import('./modules/m9.js'),
    m10: () => import('./modules/m10.js'),
    m11: () => import('./modules/m11.js'),
    m12: () => import('./modules/m12.js'),
    m13: () => import('./modules/m13.js'),
  },

  // 首页文案可定制（4 年级起可不同）
  home: {
    defaultHero: { kicker: '开始今天的第一题', title: '🎯 混合运算', meta: '先算乘除，后算加减', lesson: 'm1' },
  },
};