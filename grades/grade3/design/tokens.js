/* grades/grade3/design/tokens.js
   Brilliant 级视觉设计令牌（单一事实源）
   ─────────────────────────────────────────────
   五档色彩生命周期：
     ① init     初始常量（被除数、固定数字）—— 亮白清透
     ② focus    当前活跃焦点（待填输入框、刚落位数字）—— 亮黄，全场唯一中心
     ③ result   刚刚产出的结果 —— 纯白 + 绿色微光，C 位
     ④ history  已产出的重要历史（商、最终结果）—— 中灰稳重
     ⑤ consumed 被消耗的过程数据（旧乘数/减数/余数）—— 冷暗灰残影，禁止删除线
   模块代码里禁止出现魔法颜色 / 魔法时长，一律从这里取。
*/

/* 五档色彩生命周期 —— 按主题双色板（语义不变，字色随底色自适应，保持视觉统一）
   dark：亮白数字浮在深色卡片上（原版规范值）
   light：深板岩字浮在浅色卡片上；焦点档用黄底色块保证对比 */
export const LIFECYCLE_THEMES = {
  dark: {
    init:     { color: '#F8FAFC', opacity: 1 },
    focus:    { color: '#F5C542', opacity: 1, ring: 'rgba(245,197,66,.45)', glow: '0 0 12px rgba(245,197,66,.35)' },
    result:   { color: '#FFFFFF', opacity: 1, glow: '0 0 16px rgba(41,204,87,.45)' },
    history:  { color: '#94A3B8', opacity: 0.8 },
    consumed: { color: '#475569', opacity: 0.4 },
  },
  light: {
    init:     { color: '#0F172A', opacity: 1 },
    focus:    { color: '#92400E', opacity: 1, ring: 'rgba(245,197,66,.95)', glow: '0 0 10px rgba(245,197,66,.45)', bg: 'rgba(245,197,66,.18)', bgStrong: 'rgba(245,197,66,.28)' },
    result:   { color: '#0F172A', opacity: 1, glow: '0 0 14px rgba(41,204,87,.55)' },
    history:  { color: '#64748B', opacity: 0.75 },
    consumed: { color: '#475569', opacity: 0.4 },
  },
};

/* 读取应用当前主题（main.js 在 <html data-theme="..."> 上切换） */
export function currentTheme() {
  try { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  catch (e) { return 'light'; }
}

export function getLifecycle(theme = currentTheme()) {
  return LIFECYCLE_THEMES[theme] || LIFECYCLE_THEMES.light;
}

/* GSAP 缓动函数（物理直觉） */
export const EASE = {
  entry:     'power2.out',           // 入场与位移
  land:      'back.out(1.2)',        // 新数字落地：重力砸下微回弹
  emphasize: 'elastic.out(1, 0.55)', // 强调最终结果
  exit:      'power2.in',            // 消失/缩小
};

/* 动效节奏（秒 / 像素） */
export const MOTION = {
  dropY:        -26,    // 新元素入场下坠距离
  dropYResult:  -20,    // 新行结果数字的下坠距离
  mergeDur:     0.42,   // 左右数字向中间合拢
  collideDur:   0.18,   // 碰撞缩小消失
  lineGrowDur:  0.6,    // 贝塞尔弧线生长
  lineStartMove: 0.7,   // 线画到 70% 数字才起步（不能撞得太早）
  holdGlow:     0.15,   // 连线连通后保持高亮
  restPause:    0.25,   // 时间轴留白：让大脑处理信息
  overlap:      0.1,    // 组合拳重叠量（tl.to(..., "-=0.1")）
  dimOpacity:   0.4,    // 呼吸降噪：非焦点元素透明度
  stagger:      0.04,   // 同排多元素交错
  arcDip:       34,     // 圆弧漏斗的下潜深度
  strokeWidth:  1.5,    // 弧线宽（必须比数字字重小）
  tickLen:      20,     // 弧底垂直指示线长度
  hintPulseDur: 0.18,   // 下一步运算符的提示脉动
};

/* 布局锁（防止 Layout Shift 的固定尺寸）——超大字号场景 */
export const DIMENSION = {
  rowH:   64,   // 每行固定高
  numW:   64,   // 数字格固定宽（1 位数 → 3 位数不变宽）
  opW:    44,   // 运算符格固定宽
  parenW: 26,   // 括号格固定宽
  rowGap: 8,    // 行间距
  font:   38,   // 数字字号（超大等宽，4 数字 + 3 运算符在最窄视口也不溢出）
};

/* 竖式网格（m9）——列宽/行高锁死，格子永不位移 */
export const GRID = {
  labelW: 40,   // 商行左侧标签列
  sepW:   24,   // 除号分隔列
  digitW: 48,   // 数字列宽
  rowH:   50,   // 网格行高
};

/* 判卷反馈语义色（对/错） */
export const STATUS = {
  ok:  '#29CC57',
  bad: '#EF4444',
};

/* 把主题色板挂到容器的 CSS 变量上（m1 / m9 共用，retheme 时只需重设变量） */
export function applyThemeVars(el, lc) {
  el.style.setProperty('--b1-init', lc.init.color);
  el.style.setProperty('--b1-history', lc.history.color);
  el.style.setProperty('--b1-focus', lc.focus.color);
  el.style.setProperty('--b1-focus-ring', lc.focus.ring);
  el.style.setProperty('--b1-focus-glow', lc.focus.glow);
  el.style.setProperty('--b1-focus-bg', lc.focus.bg || 'transparent');
  el.style.setProperty('--b1-focus-bg-strong', lc.focus.bgStrong || lc.focus.bg || 'transparent');
  el.style.setProperty('--b1-result-glow', lc.result.glow);
  el.style.setProperty('--b1-placeholder', SURFACE.placeholder);
}

/* 面板表面（⭐ 不绘制板底 —— 与卡片融为一体，字色由 LIFECYCLE_THEMES 自适应） */
export const SURFACE = {
  placeholder: '#94A3B8',
  hint: '#64748b',   // 弱化的次级提示文字
};

/* 判定用户系统是否要求减弱动效 */
export function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return false; }
}
