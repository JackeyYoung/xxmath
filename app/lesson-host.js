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
import { swapModule } from './lifecycle.js';
import { navigate } from './router.js';


/* ⭐ 搬进 stage 后，重新跑一次模块自己的渲染入口 */
function retriggerModuleRender(lessonId) {
  try {
    switch (lessonId) {
      case 'm1':
        // M1 的 m1Render 是闭包，优先用挂到 window 的引用
        if (typeof window.__m1Rerender === 'function') {
          window.__m1Rerender();
        } else {
          // 兜底：点一下"重来一次"按钮，触发 m1LoadExpression
          _lessonQ('m1reset')?.click();
        }
        break;
      case 'm2':
        if (typeof window.m2Draw === 'function') { window.m2Draw(); window.m2Calc(); }
        break;
      case 'm3':
        if (typeof window.m3Reset === 'function') window.m3Reset();
        break;
      case 'm5':
        if (typeof window.m5Render === 'function') window.m5Render();
        break;
      case 'm6':
        if (typeof window.m6Update === 'function') window.m6Update();
        break;
      case 'm7':
        if (typeof window.m7Draw === 'function') { window.m7Draw(); window.m7UpdateDigital(); }
        break;
      case 'm9':
        if (typeof window.m9Render === 'function') window.m9Render();
        break;
      case 'm10':
        if (typeof window.m10Render === 'function') window.m10Render();
        break;
      case 'm11':
        if (typeof window.m11Render === 'function') window.m11Render();
        break;
      case 'm12':
        if (typeof window.m12Update === 'function') window.m12Update();
        break;
      case 'm13':
        if (typeof window.m13RenderSteps === 'function') window.m13RenderSteps();
        break;
      // m4/m8/m14 不需要额外渲染
    }
  } catch (e) {
    console.warn('[shell] 重新渲染模块失败:', lessonId, e);
  }
}

// ⭐ 显示重做横幅
function showRedoBanner() {
  _lessonQ('redoBanner')?.remove();
  const banner = document.createElement('div');
  banner.id = 'redoBanner';
  // 使用 amber 变量，自适应深浅色
  banner.style.cssText = `position:fixed;top:0;left:0;right:0;background:var(--amber-text);color:#fff;padding:10px 20px;font-size:14px;font-weight:700;text-align:center;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.1);`;
  // M3：DOM 构建（顺带去掉内联 onclick，改为事件监听）
  banner.textContent = '🔁 正在重做错题，做对将累计掌握进度 ';
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'margin-left:10px;background:transparent;border:none;color:#fff;cursor:pointer;';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => banner.remove());
  banner.appendChild(closeBtn);
  document.body.appendChild(banner);
}

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

  const loader = {
    m1: () => import('../grades/grade3/modules/m1.js'),
    m2: () => import('../grades/grade3/modules/m2.js'),
    m3: () => import('../grades/grade3/modules/m3.js'),
    m4: () => import('../grades/grade3/modules/m4.js'),
    m5: () => import('../grades/grade3/modules/m5.js'),
    m6: () => import('../grades/grade3/modules/m6.js'),
    m7: () => import('../grades/grade3/modules/m7.js'),
    m8: () => import('../grades/grade3/modules/m8.js'),
    m9: () => import('../grades/grade3/modules/m9.js'),
    m10: () => import('../grades/grade3/modules/m10.js'),
    m11: () => import('../grades/grade3/modules/m11.js'),
    m12: () => import('../grades/grade3/modules/m12.js'),
    m13: () => import('../grades/grade3/modules/m13.js')
  }[lessonId];

  if (!loader) {
// M3/L6：同上，模块 id 不进 HTML 字符串
    stage.innerHTML = '';
    {
      const box = document.createElement('div');
      box.style.cssText = 'padding:40px;text-align:center;color:var(--muted);';
      box.textContent = '模块 ' + lessonId + ' 尚未拆分';
      stage.appendChild(box);
    }
    return;
  }

  // ⭐ 必须在这里包裹 Promise，否则拿不到 mod 和 mount
  swapModule(stage, async () => {
    let mod;
    try {
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

    // 构造注入模块的上下文（S5：契约收敛到 core/lesson/ctx.js，字段名保持不变）
    const ctx = createLessonContext({
      lessonId,
      storage: { get: lsGet, set: lsSet },
      ui: {
        toast: showToast,
        focusWhenReady: focusInputWhenReady,
        showMasteryCard,
        buildAiInsightHtml,
        showThumbBar: (opts) => {
          if (window.__shell && window.__shell.showThumbBar) window.__shell.showThumbBar(opts);
        },
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

export function showThumbBar({ text, ok, onNext }) {
  const bar = _lessonQ('thumbBar');
  if (!bar) return;
  bar.classList.add('show', ok ? 'ok' : 'err');
  _lessonQ('thumbBarBody').innerHTML = text;
  const retry = _lessonQ('thumbRetry');
  const next = _lessonQ('thumbNext');
  retry.hidden = ok;
  next.hidden = false;
  next.textContent = ok ? '继续' : '看看为什么';
  next.onclick = () => { hideThumbBar(); onNext?.(); };
}

export function hideThumbBar() {
  _lessonQ('thumbBar')?.classList.remove('show', 'ok', 'err');
}
