/* core/lesson/ctx.js —— 注入给模块的上下文契约（S5）

问题（体检报告 S5）：13 个模块的 ctx 是 lesson-host 里**手拼出来的一个对象**，
模块各自假设「我要的字段一定在」——
少一个 `ctx.data.wbAdd` 就是运行时 `is not a function`，而且没有类型/版本/默认值，
新加一个模块只能靠抄前一个模块的代码。

这里把契约收敛成一处：
  · 统一形状（namespace 固定：data / ui / storage）
  · 可选字段给**安全的默认实现**（不崩，只是不生效）
  · 必填字段缺失时**打一次警告并指出是哪个模块**，而不是运行时炸

注意：不改变任何字段名，13 个模块**无需改动**（这是 S5 能低风险落地的前提）。
*/

export const CTX_VERSION = 1;

/** 必填：缺了就是 bug，记录并告警（仍然给一个空实现，免得整个模块挂掉） */
const REQUIRED = ['data.historyAdd', 'data.masteryRecord', 'ui.toast'];

function noop() {}

function pick(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function warnMissing(lessonId, missing) {
  if (!missing.length) return;
  console.warn(
    `[ctx] 模块 ${lessonId} 的上下文缺少必填项：${missing.join(', ')}` +
    `（已用空实现兜底，该模块相关功能不会生效）`,
  );
}

/**
 * @param {{
 *   lessonId: string,
 *   data?: object,   // historyAdd/historyLoad/historySave/masteryRecord/takeawayLoad/activityAdd/recordActivity/wbAdd/wbLoad/wbSave
 *   ui?: object,     // toast/focusWhenReady/showMasteryCard/buildAiInsightHtml/showThumbBar/registerLevelHandler
 *   storage?: object // { get, set }
 * }} parts
 */
export function createLessonContext({ lessonId = 'unknown', data = {}, ui = {}, storage = {} } = {}) {
  const ctx = {
    version: CTX_VERSION,

    storage: {
      get: storage.get || (() => null),
      set: storage.set || noop,
    },

    ui: {
      toast: ui.toast || noop,
      focusWhenReady: ui.focusWhenReady || (() => {}),
      showMasteryCard: ui.showMasteryCard || noop,
      buildAiInsightHtml: ui.buildAiInsightHtml || (() => ''),
      showThumbBar: ui.showThumbBar || noop,
      registerLevelHandler: ui.registerLevelHandler || noop,
    },

    data: {
      historyAdd: data.historyAdd || (() => null),
      historyLoad: data.historyLoad || (() => []),
      historySave: data.historySave || noop,
      masteryRecord: data.masteryRecord || (() => null),
      takeawayLoad: data.takeawayLoad || (() => ''),
      activityAdd: data.activityAdd || noop,
      recordActivity: data.recordActivity || noop,
      wbAdd: data.wbAdd || noop,
      wbLoad: data.wbLoad || (() => []),
      wbSave: data.wbSave || noop,
    },
  };

  // —— 向后兼容（S5 的关键约束）——
  // 老模块写的是 ctx.toast / ctx.showMasteryCard / ctx.showThumbBar / ctx.focusWhenReady，
  // 这里用取值器把它们映射到新命名空间，模块代码一行都不用改。
  Object.defineProperties(ctx, {
    toast: { get: () => ctx.ui.toast, enumerable: true },
    focusWhenReady: { get: () => ctx.ui.focusWhenReady, enumerable: true },
    showMasteryCard: { get: () => ctx.ui.showMasteryCard, enumerable: true },
    buildAiInsightHtml: { get: () => ctx.ui.buildAiInsightHtml, enumerable: true },
    showThumbBar: { get: () => ctx.ui.showThumbBar, enumerable: true },
    registerLevelHandler: { get: () => ctx.ui.registerLevelHandler, enumerable: true },
  });

  const missing = REQUIRED.filter((p) => {
    const v = pick({ data: data, ui: ui }, p);
    return typeof v !== 'function';
  });
  warnMissing(lessonId, missing);

  return ctx;
}

/** 调试用：列出 ctx 的契约（哪些字段是函数、哪些是数据） */
export function describeContext(ctx) {
  const out = { version: ctx.version, functions: [], values: [] };
  for (const [ns, group] of Object.entries(ctx)) {
    if (ns === 'version') continue;
    if (group && typeof group === 'object') {
      for (const [k, v] of Object.entries(group)) {
        (typeof v === 'function' ? out.functions : out.values).push(`${ns}.${k}`);
      }
    }
  }
  return out;
}
