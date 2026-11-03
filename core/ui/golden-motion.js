/* core/ui/golden-motion.js —— m1 验收通过的「黄金视觉标准」，抽成共享规范

   为什么要有这一层：
   m1-interactive 里的配色、缓动、画线几何如果直接复制到 m9，两处会各自漂移
   （改一次主色要改两个文件，且容易忘记同步）。这里把它们收敛成唯一来源。

   三重约定（任何新模块改造都照这个来）：
     GOLDEN  颜色哲学：灰历史 / 白结果 / 黄焦点
     EASE    物理缓动：全部非匀速（禁止 linear / none）
     DUR     时间轴节奏：画线 0.4 → 吸收 0.34 → 强制留白 0.25 → 落地回弹

   m1-interactive.js 目前仍用自己的常量（已验证稳定，暂不重构）；
   新改造的模块（m9 竖式、后续 m5/m7）从这里取，保证"一套标准"。
*/

export const GOLDEN = Object.freeze({
  /* 颜色哲学：三档强对比 */
  focus: '#F5C542',          // 焦点（当前该操作）：亮黄
  result: '#FFFFFF',         // 新诞生结果：纯白
  history: '#64748b',        // 已算过：中灰（与历史连线同色）
  /** m9 除法格子密集：三档灰阶 */
  historyDeep: '#475569',    // 已完成的步骤（死亡褪色）
  historyMid: '#94A3B8',     // 已填的商（最终结果的一部分，不该太暗）
  /** 未计算数字：柔和的浅灰白（纯白在暗底上太刺眼） */
  textSoft: '#cbd5e1',
  lineFocus: '#F5C542',
  lineHistory: '#64748b',

  /* 微弱发光：焦点黄光 / 结果绿光 */
  glowFocus: '0 0 12px rgba(245, 197, 66, 0.45)',
  glowResult: '0 0 10px rgba(41, 204, 87, 0.30)',

  /* 状态不透明度：历史不低于 0.5（否则看不清），降噪固定 0.4 */
  opacityHistory: 0.8,
  /** m9「死亡褪色」：这一步做完了，彻底退到背景 */
  opacityHistoryDeep: 0.4,
  /** m9 已填的商：还属于最终结果，保持可读 */
  opacityHistoryMid: 0.8,
  /** m1 用：同排其他操作数（一排之内对比足够，0.4 就够） */
  opacityDim: 0.4,
  /** m9 用：整列「尚未轮到」——0.4 在暗底上几乎消失，抬到 0.6 */
  opacityDimFar: 0.6,
  opacityFocus: 1,
});

export const EASE = Object.freeze({
  draw: 'power2.out',       // 画线：起笔快、收尾稳
  absorb: 'power3.in',      // 重力吸收：越靠近越快
  land: 'back.out(1.2)',    // 落地回弹（m1/m9 真机验收值）
  breathe: 'power1.inOut',  // 降噪/恢复：不对抗视线
  fade: 'power2.inOut',     // 颜色过渡
  pop: 'elastic.out(1, 0.55)', // 终极谢幕（真机验收值）
});

export const DUR = Object.freeze({
  draw: 0.40,
  absorb: 0.34,
  pause: 0.25,     // 强制留白：吸收完全结束后才允许下一层出现
  land: 0.36,
  breathe: 0.30,
  link: 0.26,
  fade: 0.34,
});

/** 圆弧下潜深度与下垂短线长度（m1 真机验收几何：dip 34 / tickLen 20） */
export const ARC = Object.freeze({ dip: 34, tick: 20, offset: 10, arrow: 4.5 });

/**
 * 圆弧 + 最低点下垂短线。
 * 对称控制点 → 最低点解析解 yLow = yTop + 0.75 * dip（不是估值）。
 * @returns {{ d: string, yLow: number, midX: number }}
 */
export function arcWithTick({ lx, rx, yTop, dip = ARC.dip, tick = ARC.tick }) {
  const midX = (lx + rx) / 2;
  const yLow = yTop + 0.75 * dip;
  return {
    d: `M ${lx} ${yTop} C ${lx} ${yTop + dip}, ${rx} ${yTop + dip}, ${rx} ${yTop}`
     + ` M ${midX} ${yLow} L ${midX} ${yLow + tick}`,
    yLow,
    midX,
  };
}

/**
 * 从圆弧最低点落到目标中心的漏斗（S 形曲线 + 末端箭头）。
 * @returns {string} path d（2 段子路径）
 */
export function funnelToTarget({ midX, yLow, tx, yEnd, arrow = ARC.arrow }) {
  const k = Math.max(6, (yEnd - yLow) * 0.5);
  return `M ${midX} ${yLow} C ${midX} ${yLow + k}, ${tx} ${yEnd - k}, ${tx} ${yEnd}`
       + ` M ${tx - arrow} ${yEnd - arrow * 1.7} L ${tx} ${yEnd} L ${tx + arrow} ${yEnd - arrow * 1.7}`;
}

/**
 * 单元格配色（三档强对比）。m1 / m9 共用同一套判定。
 * ⭐ 主题注入制：palette 与 GOLDEN 同形（focus/result/history/historyDeep/historyMid/
 *    textSoft/glowFocus/glowResult/opacity*），light 档由 tokens.js 组装注入——
 *    本文件保持零主题色值、零 import 的纯净性（铁律：主题只存在于 tokens.js）。
 * @param {{ state?: 'history'|'focus'|'normal', fromResult?: boolean, palette?: object }} o
 * @returns {{ color: string, opacity: number, textShadow: string }}
 */
export function cellStyle({ state = 'normal', fromResult = false, palette = null } = {}) {
  const P = palette || GOLDEN;
  if (state === 'historyDeep') {
    return { color: P.historyDeep, opacity: P.opacityHistoryDeep, textShadow: 'none' };
  }
  if (state === 'historyMid') {
    return { color: P.historyMid, opacity: P.opacityHistoryMid, textShadow: 'none' };
  }
  if (state === 'history') {
    return { color: P.history, opacity: P.opacityHistory, textShadow: 'none' };
  }
  if (fromResult) {
    return { color: P.result, opacity: P.opacityFocus, textShadow: P.glowResult };
  }
  if (state === 'focus') {
    return { color: P.focus, opacity: P.opacityFocus, textShadow: P.glowFocus };
  }
  return { color: 'var(--text)', opacity: P.opacityFocus, textShadow: 'none' };
}

/** 缓动白名单校验（供测试与开发期自检使用） */
export function assertNoLinear() {
  const bad = Object.entries(EASE).filter(([, v]) => /^(linear|none)$/.test(v));
  if (bad.length) throw new Error(`[golden] 出现禁用缓动：${bad.map(([k]) => k).join(', ')}`);
  return true;
}

/* ============================================================
   五档颜色生命周期（m9 除法验收后的终极标准）
   ------------------------------------------------------------
   L1  result       #FFFFFF + 绿光     刚落定的最终答案 / 刚填对的格子
   L2  focus        #F5C542 + 黄光     当前正在操作的那一组
   L3  normal       #cbd5e1            还没轮到的数字（不刺眼的白）
   L4  historyMid   #94A3B8 / 0.8      已填的商：属于最终结果，保持可读
   L5  historyDeep  #475569 / 0.4      已完成的步骤：彻底退到背景
   另有 dim        #64748b / 0.6       「还没轮到」的降噪（m1 同排 / m9 未算列）

   铁律：同一时刻只能有 **一个** focus。
   做法不是"判断每个格子"，而是先算出一个**标量**再比较：
       const activeStep = (step < 0 || isFinale) ? -1 : step;
       const workRow   = activeStep - 1;      // 除法：正在算的是上一步的余数行
       ...
       st: (idx === workRow) ? 'focus' : 'historyDeep'
   只要 activeStep 是单值，"两个黄"在结构上就不可能发生。
   ============================================================ */

/** 五档状态的规范顺序（供测试与文档使用） */
export const STATE_TIERS = Object.freeze([
  'result', 'focus', 'normal', 'historyMid', 'historyDeep',
]);

/**
 * 落位弹跳（m9 除法 bringing down 的验收参数）。
 * 从上方原位"砸"到目标位置：back.out(1.2) 落下 + 轻微 scale 回弹。
 * 调用方只需给出起止 dy，不必重复写缓动。
 *
 * @param {(target:any, vars:object) => any} animate  通常是 gsap.to / fromTo 的包装
 */
export function bringDownVars(dy, onDone) {
  return {
    y: 0,
    duration: 0.42,
    ease: EASE.land,   // 落位回弹（对齐 EASE.land，消除硬编码双源）
    from: { y: dy, opacity: 0.85 },
    onComplete: onDone,
  };
}

/** 落地后的强调回弹（0 → 1.12 → 1） */
export function landPopVars() {
  return [
    { scale: 1.12, duration: 0.12, ease: EASE.draw },
    { scale: 1, duration: 0.18, ease: EASE.land },
  ];
}

