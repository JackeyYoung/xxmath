/* grades/_helpers.js
   给模块提供的通用工具：
   - 模板克隆
   - 让模块拿到 ctx（依赖注入，彻底告别 window.__xxx）
*/

import { lsGet, lsSet, lsRemove, lsKeysByPrefix, flushStorage, getLocalUpdatedAt, applyCloudValue } from '../core/storage.js';
import { on, off, emit, EVT } from '../core/events.js';
import { showToast } from '../core/toast.js';
import { focusInput, focusInputWhenReady } from '../core/input-focus.js';
import { historyLoad, historyAdd, historySave } from '../core/history.js';
import { wbLoad, wbAdd } from '../core/wrongbook.js';
import { masteryRecord } from '../core/mastery.js';
import { takeawayLoad } from '../core/takeaway.js';
import { showMasteryCard } from '../core/ui/mastery-card.js';

/**
 * 把 <template id="tpl-m1"> 的内容克隆到容器里
 * 找不到模板时抛错，方便定位
 */
export function cloneTemplate(tplId, container) {
  const tpl = document.getElementById(tplId);
  if (!tpl) {
    console.error(`[helpers] 找不到模板 #${tplId}`);
    return;
  }
  container.appendChild(tpl.content.cloneNode(true));
}

/**
 * 创建模块上下文，注入所有依赖
 * 这样模块代码不需要 import core/，也不需要 window.xxx
 */
export function createModuleContext({ gradeId, lessonId, shell, levelHandlers }) {
  return {
    gradeId,
    lessonId,

    // 存储
    storage: {
      get: lsGet,
      set: lsSet,
      remove: lsRemove,
      keysByPrefix: lsKeysByPrefix,
      flush: flushStorage,
      getLocalUpdatedAt,
      applyCloudValue,
    },

    // 事件
    events: { on, off, emit, EVT },

    // UI
    toast: showToast,
    focus: focusInput,
    focusWhenReady: focusInputWhenReady,
    showMasteryCard,

    // 业务数据（只读为主）
    data: { historyLoad, historyAdd, historySave, wbLoad, wbAdd, masteryRecord, takeawayLoad },

    // 壳层
    shell,

    // ⭐ 层级注册：模块调用 ctx.registerLevelHandler(id, fn)，壳层切换层级时回调
    registerLevelHandler: (id, fn) => {
      levelHandlers.set(id, fn);
    },
  };
}