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

/* ⭐ 单向引用：缓动/几何/时长标准值以 core/ui/golden-motion.js 为唯一事实源
   （golden 零主题值、零反向依赖）；本文件只持有业务键名别名与主题色板。 */
import { EASE as GOLDEN_EASE, DUR as GOLDEN_DUR, ARC as GOLDEN_ARC, cellStyle as goldenCellStyle } from '../../../core/ui/golden-motion.js';

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

/* GSAP 缓动（业务键名别名）——值单向引用 golden 标准，逐项 === 旧字面量（业务行为零变化） */
export const EASE = {
  entry:     GOLDEN_EASE.draw,   // 入场与位移（= power2.out）
  land:      GOLDEN_EASE.land,   // 新数字落地：重力砸下微回弹（= back.out(1.2)，真机验收值）
  emphasize: GOLDEN_EASE.pop,    // 强调最终结果（= elastic.out(1, 0.55)，真机验收值）
  exit:      'power2.in',        // 消失/缩小（业务专属档，golden 暂无对应；有第二消费者时上收）
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
  restPause:    GOLDEN_DUR.pause,   // 时间轴留白：让大脑处理信息（= golden DUR.pause = 0.25）
  overlap:      0.1,    // 组合拳重叠量（tl.to(..., "-=0.1")）
  dimOpacity:   0.4,    // 呼吸降噪：非焦点元素透明度
  stagger:      0.04,   // 同排多元素交错
  arcDip:       GOLDEN_ARC.dip,     // 圆弧漏斗的下潜深度（= golden ARC.dip = 34，真机验收值）
  strokeWidth:  1.5,    // 弧线宽（必须比数字字重小）
  tickLen:      GOLDEN_ARC.tick,    // 弧底垂直指示线长度（= golden ARC.tick = 20，真机验收值）
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

/* 全局数学排版（单一数据源）────────────────────────────────
   模块内禁止硬编码 math 字符的 font-family / font-weight / font-variant-numeric：
   - CSS 侧用 var(--math-*) 变量（本文件 ensureMathTypoStyle 注入 :root）
   - DOM 侧直接挂 .math-num / .math-op 工具类
   字号分级：sizeL = C 位大数字（m1 算式行 / m9 竖式，与 DIMENSION.font、GRID 同值）；
             sizeM = 次级结果条（calc-final 等）。模块自有语义字号（如 m9 进位 22px）
             属局部层级，继续走各自 tokens，不在此强归一。 */
export const TYPOGRAPHY = {
  family: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  weight: 800,
  fontVariantNumeric: 'tabular-nums',   // 强制数字等宽：多位数变化时零宽度抖动
  sizeL: 38,
  sizeM: 24,
};

const MATH_TYPO_STYLE_ID = 'math-typo-style';

/* 幂等注入 :root 变量 + 两个基础工具类。shell.js 启动时调用一次；
   m1/m9 mount 兜底调用（脱离 shell 独立挂载也能拿到）。Node/jsdom 外安全返回。 */
export function ensureMathTypoStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(MATH_TYPO_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = MATH_TYPO_STYLE_ID;
  el.textContent = `
:root {
  --math-font-family: ${TYPOGRAPHY.family};
  --math-font-weight: ${TYPOGRAPHY.weight};
  --math-font-variant-numeric: ${TYPOGRAPHY.fontVariantNumeric};
  --math-size-l: ${TYPOGRAPHY.sizeL}px;
  --math-size-m: ${TYPOGRAPHY.sizeM}px;
}
/* 基础工具类：数字 / 运算符。运算符 0.95em + 1px 下移做光学居中微调 */
.math-num { font-family: var(--math-font-family); font-weight: var(--math-font-weight);
  font-variant-numeric: var(--math-font-variant-numeric); line-height: 1; }
.math-op { font-family: var(--math-font-family); font-weight: var(--math-font-weight);
  font-variant-numeric: var(--math-font-variant-numeric); line-height: 1;
  font-size: 0.95em; transform: translateY(1px); }
`;
  document.head.appendChild(el);
}

/* 单元格配色（golden 标准判定 + 主题注入制）：dark 直接走 golden 默认色板；
   light 在此组装 palette 注入——light 色值只存在于本文件，golden 保持纯净。 */
export function cellStyle({ state, fromResult, theme = currentTheme() } = {}) {
  if (theme === 'dark') return goldenCellStyle({ state, fromResult });
  const lc = LIFECYCLE_THEMES.light;
  return goldenCellStyle({
    state, fromResult,
    palette: {
      focus: lc.focus.color,
      result: lc.result.color,
      history: lc.history.color,
      historyMid: lc.history.color,
      historyDeep: lc.consumed.color,
      textSoft: lc.init.color,
      glowFocus: lc.focus.glow,
      glowResult: lc.result.glow,
      opacityFocus: 1,
      opacityHistory: lc.history.opacity ?? 0.75,
      opacityHistoryMid: lc.history.opacity ?? 0.75,
      opacityHistoryDeep: lc.consumed.opacity ?? 0.4,
    },
  });
}
