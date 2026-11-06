/* S3：优先在 #page-lesson 内查找，找不到退回全局（最坏情况等价于改动前）。
   好处：显式 const 不会提升到模块级，所以用 IIFE 包一层避免与文件内同名变量冲突。 */
const _lessonQ = (id) => {
  const root = document.getElementById('page-lesson');
  const el = root && typeof root.querySelector === 'function' ? root.querySelector('#' + id) : null;
  return el || document.getElementById(id);
};

/* app/lesson-host.js —— 课页宿主：模块挂载/卸载、层级切换、拇指条（原来在 shell.js 的 4/5 节） */
import { activityAdd } from '../core/activity.js';
import { historyAdd, historyLoad, historySave } from '../core/history.js';
import { focusInputWhenReady } from '../core/input-focus.js';
import { masteryRecord } from '../core/mastery.js';
import { lsGet, lsSet } from '../core/storage.js';
import { takeawayLoad } from '../core/takeaway.js';
import { showToast } from '../core/toast.js';
import { emitCorrect } from '../core/ui/bus-ui.js';
import { createLessonContext } from '../core/lesson/ctx.js';
import { buildAiInsightHtml } from '../core/ui/ai-insight.js';
import { showMasteryCard } from '../core/ui/mastery-card.js';
import { wbAdd, wbLoad, wbSave } from '../core/wrongbook.js';
import { LESSON_META } from './lesson-meta.js';
import { swapModule, registerActivityFlush } from './lifecycle.js';
import { navigate } from './router.js';
import { getGradeConfig } from './grade-config.js';
import { loadGrade } from '../grades/registry.js';


const _levelHandlers = new Map(); // ⭐ 保存各模块的层级切换函数

/**
 * 归一化模块 id。
 * 为什么需要：路由把 hash 里的 `#lesson/m1?m1i` 原样传进来时，lessonId 会带上 `?m1i`，
 * 模块表里查不到 → 显示「模块 m1?m1i 尚未拆分」。
 * 顺带也挡掉 `#`/`&` 之类的残留，保证 id 只能是一个纯标识符。
 */
export function normalizeLessonId(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(/^[#/\s]+/, '');
  // 只取开头连续的「标识符字符」：m1?m1i → m1；m1/../../x → m1；#m1 → m1
  const m = s.match(/^[A-Za-z0-9_-]+/);
  return m ? m[0] : '';
}

export function mountLesson(lessonId) {
  // ⭐ 加载新模块时，清空残留反馈
  const bar = _lessonQ('thumbBar');
  if (bar) bar.classList.remove('show', 'ok', 'err');

  lessonId = normalizeLessonId(lessonId);
  if (!lessonId) lessonId = 'm1';
  const stage = _lessonQ('lesson-stage-main') || _lessonQ('modulePool');
  if (!stage) return;

  // ⭐ S2：旧模块卸载与容器清空统一交给 swapModule（先 cleanup、后清 DOM）
  _levelHandlers.clear(); // 必须在 mount 之前清，否则会连带清掉新模块注册的 handler

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-lesson')?.classList.add('active');
  _lessonQ('globalHeader').style.display = 'none';

  const meta = LESSON_META[lessonId] || LESSON_META.m1;
  _lessonQ('lessonHeader').innerHTML = `
    <button class="lesson-back" id="lessonBack">←</button>
    <div class="lesson-title">${meta.icon} ${meta.title}</div>
    <button class="lesson-more" id="lessonMore">⋯</button>
  `;
  _lessonQ('lessonBack')?.addEventListener('click', () => navigate('home'));

  // ⭐ 单一事实源：loader 取自年级注册表（grades/grade3/index.js），不再在此重复登记
  swapModule(stage, async () => {
    let mod;
    try {
      const cfg = await loadGrade(getGradeConfig().id || '3');
      const loader = cfg && cfg.modules && cfg.modules[lessonId];
      if (!loader) {
        // M3/L6：模块 id 不进 HTML 字符串
        stage.innerHTML = '';
        {
          const box = document.createElement('div');
          box.style.cssText = 'padding:40px;text-align:center;color:var(--muted);';
          box.textContent = '模块 ' + lessonId + ' 尚未拆分';
          stage.appendChild(box);
        }
        return null;
      }
      mod = await loader();
    } catch (err) {
      console.error('模块加载失败', lessonId, err);
// M3/L6：错误信息用 textContent 写入，不再拼 innerHTML（err.message 来自第三方，不该当 HTML）
      stage.innerHTML = '';
      {
        const box = document.createElement('div');
        box.style.cssText = 'padding:40px;text-align:center;color:#ef4444;';
        box.textContent = '模块加载失败：' + (err && err.message ? err.message : '未知错误');
        stage.appendChild(box);
      }
      return null;
    }

    const mount = mod.default;
    if (typeof mount !== 'function') {
      console.error(`模块 ${lessonId} 没有 default 导出`);
      return null;
    }

    // 在 mountLesson 函数的内部，定义一个防抖器
    const _actTimers = {};
    const _actPending = {};
    function recordActivity(moduleId, label, detail, delay = 2000) {
      clearTimeout(_actTimers[moduleId]);
      _actPending[moduleId] = { label, detail };
      _actTimers[moduleId] = setTimeout(() => {
        activityAdd(moduleId, _actPending[moduleId]);
        delete _actPending[moduleId];
      }, delay);
    }

    // ⭐ 立即落盘未满 delay 的 activity（切页/卸载前由 lifecycle 统一冲刷）
    function flushActivity() {
      Object.keys(_actTimers).forEach(id => { clearTimeout(_actTimers[id]); delete _actTimers[id]; });
      Object.keys(_actPending).forEach(id => {
        activityAdd(id, _actPending[id]);
        delete _actPending[id];
      });
    }
    registerActivityFlush(flushActivity);

    // 构造注入模块的上下文（S5：契约收敛到 core/lesson/ctx.js，字段名保持不变）
    const ctx = createLessonContext({
      lessonId,
      storage: { get: lsGet, set: lsSet },
      ui: {
        toast: showToast,
        focusWhenReady: focusInputWhenReady,
        showMasteryCard,
        buildAiInsightHtml,
        showThumbBar,
        hideThumbBar,
        registerLevelHandler: (id, fn) => {
          _levelHandlers.set(id, fn);
        },
      },
      data: {
        // M10：13 个模块都会走 historyAdd，统一在这里发「答对了」事件（带坐标 + 去重）
        historyAdd: (rec) => {
          const out = historyAdd(rec);
          if (rec && rec.isCorrect) emitCorrect(lessonId);
          return out;
        },
        historyLoad,
        historySave,
        masteryRecord,
        takeawayLoad,
        activityAdd,
        recordActivity,
        wbAdd, wbLoad, wbSave,
      },
    });

    // 1. 只挂载一次！cleanup 交给 swapModule 统一保管
    const cleanup = mount(stage, ctx);

    // 2. 渲染层级切换按钮
    const levelWrap = _lessonQ('lessonLevels');
    //console.log('模块 meta:', mod.meta);
    
    if (mod.meta && mod.meta.levels && mod.meta.levels.length > 0) {
      if (levelWrap) {
        levelWrap.classList.remove('is-hidden');
        const currentLevelId = localStorage.getItem(`grade3_${lessonId}_level`) || mod.meta.levels[0].id;

        levelWrap.innerHTML = mod.meta.levels.map(lv => {
          const isCurrent = lv.id === currentLevelId;
          return `
            <button class="level-btn ${isCurrent ? 'current' : ''}" data-level-id="${lv.id}">
              <span class="level-btn-icon">${lv.icon || ''}</span>
              <span class="level-btn-name">${lv.name}</span>
            </button>
          `;
        }).join('');

        // 绑定点击
        levelWrap.querySelectorAll('.level-btn:not(.locked)').forEach(btn => {
          btn.addEventListener('click', () => {
            const levelId = btn.dataset.levelId;
lsSet(`grade3_${lessonId}_level`, levelId);   // S8：走存储层
            levelWrap.querySelectorAll('.level-btn').forEach(b => b.classList.remove('current'));
            btn.classList.add('current');

            if (_levelHandlers.has(lessonId)) {
              _levelHandlers.get(lessonId)(levelId);
            }
          });
        });

        // ⭐ 延时 50ms 触发一次初始层级
        setTimeout(() => {
          if (_levelHandlers.has(lessonId)) {
            _levelHandlers.get(lessonId)(currentLevelId);
          }
        }, 50);
      }
    } else {
      // 如果没有层级配置，隐藏
      if (levelWrap) {
        levelWrap.classList.add('is-hidden');
        levelWrap.innerHTML = '';
      }
    }

    return cleanup;
  });
}

/* ============================================================
   5. 拇指区反馈条（Brilliant 式底部 Banner）
   ============================================================ */
export function ensureThumbBar() {
  if (window.visualViewport) {
    const adjustThumbBar = () => {
      const bar = _lessonQ('thumbBar');
      if (!bar) return;
      const vv = window.visualViewport;
      const keyboardHeight = window.innerHeight - vv.height;
      bar.style.bottom = keyboardHeight > 0 ? `${keyboardHeight}px` : '0';
    };
    window.visualViewport.addEventListener('resize', adjustThumbBar);
    window.visualViewport.addEventListener('scroll', adjustThumbBar);
  }

  if (_lessonQ('thumbBar')) return;
  const bar = document.createElement('div');
  bar.id = 'thumbBar';
  bar.className = 'thumb-bar';
  bar.innerHTML = `
    <div class="thumb-bar-body" id="thumbBarBody"></div>
    <div class="thumb-bar-actions">
      <button class="thumb-btn secondary" id="thumbRetry" hidden>再试</button>
      <button class="thumb-btn primary" id="thumbNext" hidden>继续</button>
    </div>
  `;
  document.body.appendChild(bar);

  // ⭐ 绑一次，永远不重复
  _lessonQ('thumbRetry').addEventListener('click', () => {
    const lesson = document.querySelector('#modulePool .module.active');  // ⭐ 改这里
    if (!lesson) { hideThumbBar(); return; }
    const reset = lesson.querySelector('[id$="reset"]');
    if (reset) reset.click();
    hideThumbBar();
  });
  _lessonQ('thumbNext').addEventListener('click', () => {
    hideThumbBar();
  });
}

export function showThumbBar({ text, ok, onNext, nextLabel, retryLabel, onRetry, hideRetry } = {}) {
  const bar = _lessonQ('thumbBar');
  if (!bar) return;
  bar.classList.add('show', ok ? 'ok' : 'err');
  _lessonQ('thumbBarBody').innerHTML = text;
  const retry = _lessonQ('thumbRetry');
  const next = _lessonQ('thumbNext');
  retry.hidden = hideRetry || ok;
  if (retryLabel) retry.textContent = retryLabel;
  if (onRetry) retry.onclick = onRetry;   // ⭐ 回溯期「看答案」覆盖默认 reset
  next.hidden = false;
  next.textContent = nextLabel || (ok ? '继续' : '看看为什么');
  next.onclick = () => { hideThumbBar(); onNext?.(); };
}

export function hideThumbBar() {
  _lessonQ('thumbBar')?.classList.remove('show', 'ok', 'err');
}
