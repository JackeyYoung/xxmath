/* app/main.js —— 纯净版，只负责启动和全局绑定 */

// ========== 1. 基础依赖 ==========
import { injectTemplates } from './templates.js';
import {
  lsGet, lsSet, lsRemove, lsKeysByPrefix,
  initStorage, migrateFromLocalStorage,
  flushStorage, getStorageHealth, getLocalUpdatedAt, applyCloudValue
} from '../core/storage.js';

import { 
  getStudentName, installStudentInit, renderStudentCard, showStudentModal 
} from '../core/student.js';

import {
  escapeHtmlStrict
} from '../core/html.js';

import {
  installGlobalErrorHandlers, getErrorLog
} from '../core/errors.js';

import { on, emit, EVT } from '../core/events.js';

import {
  historyLoad, historyAdd, historySave, historyRemove, historyClear, historyUpdate 
} from '../core/history.js';

import {
  wbLoad, wbSave, wbAdd, wbRemove, wbClear, markRedoSuccess
} from '../core/wrongbook.js';

import {
  takeawayLoad, takeawaySave
} from '../core/takeaway.js';

import {
  LLM_CONFIG, extractJson, normalizeAiFeedback, callLLM
} from '../core/llm.js';

import {
  targetLoad, targetSave, targetReset
} from '../core/target.js';

import {
  msgUnread, msgReply, msgMarkAllRead, msgAdd
} from '../core/parent-message.js';

import {
  showToast
} from '../core/toast.js';

import {
  initSync, pullFromCloud, getSyncState
} from '../core/sync/sync-manager.js';
import { mergeCloudIntoLocal } from '../core/sync/merge.js';

import { initSyncUI } from './sync-ui.js';
import { initShell, navigate, showThumbBar, hideThumbBar } from './shell.js';

import { initWrongBookUI, showExplainModal } from '../core/ui/wrongbook-ui.js';
import { wbRender } from '../core/wrongbook-render.js';
import { historyRender, initHistoryDelegation } from '../core/history-render.js';
import { renderDashboard, getStudyStreak, bindRangeTabs } from '../core/dashboard-render.js';
import { renderErrorProfile } from '../core/wrongbook-profile.js';
import { installGlobalUI, lockBodyScroll } from '../core/ui/global.js';
import { installUIListeners } from '../core/ui/global-observer.js';
import { installSessionBackup } from '../core/session-backup.js';
import { installDaily } from '../core/daily.js';
import { installTimerChallenge } from '../core/timer-challenge.js';
import { showMasteryCard } from '../core/ui/mastery-card.js';
import { showShareCard } from '../core/share-card.js';
import { buildWeeklyReport, buildWeeklyReportHtml } from '../core/weekly-report.js';
import { downloadBlob } from '../core/download.js';

import { initGradeSelector, updateTitle } from '../js/grade.js';
initGradeSelector();
updateTitle();

// 初始化全局错误捕获
installGlobalErrorHandlers();

// ========== 2. 全局逻辑（如活动记录、错题重做） ==========
window.__flushActivity = function () {};

// ⭐ 错题本重做成功逻辑（全局单例）
function handleRedoSuccess(problemText) {
  const result = markRedoSuccess(problemText);
  if (result.removed) {
    showToast('🎉 太棒了！这道题隔天再做对，已从错题本移除！', 'success');
    document.getElementById('redoBanner')?.remove();
    const history = historyLoad();
    const rec = history.find(r => r.problemText === problemText && r.isCorrect);
    if (rec) {
      setTimeout(() => {
        showMasteryCard({
          problemText,
          correctAnswer: rec.correctAnswer || rec.studentAnswer || '—',
          takeaway: takeawayLoad(problemText),
        });
      }, 800);
    }
  } else if (result.tooSoon) {
    const nextDate = new Date(result.nextReviewAt).toLocaleDateString('zh-CN');
    showToast(`✅ 做对了！明天（${nextDate}）再来做对一次，就能从错题本移除`, 'info');
  } else {
    showToast(`✅ 做对了！明天再来做对一次，就能从错题本移除`, 'info');
  }

  const history = historyLoad();
  const latest = history.find(r => r.problemText === problemText && r.isCorrect);
  if (latest) setTimeout(() => showShareCard(latest), 500);
}
// 将重做函数挂到全局以供模块使用
window.__handleRedoSuccess = handleRedoSuccess;

// ========== 3. Koji 点击逻辑 ==========
(function hookKoji() {
  const btn = document.getElementById('kojiBtn');
  if (!btn || btn.dataset._hooked) return;
  btn.dataset._hooked = '1';

  btn.addEventListener('click', () => {
    const hash = location.hash; 
    let id = null;
    if (hash.startsWith('#lesson/')) {
      id = hash.split('/')[1];
    }

    if (!id) { 
      showToast('先进一个知识岛，再来找 Koji 💡', 'info'); 
      return; 
    }

    let problemText = '';
    if (id === 'm1') {
      problemText = document.getElementById('m1expr')?.textContent?.trim() || '';
    } else if (id === 'm9') {
      const a = document.getElementById('m9a')?.value || '';
      const op = document.getElementById('m9op')?.value || '';
      const b = document.getElementById('m9b')?.value || '';
      problemText = `${a} ${op} ${b}`;
    } else  if (id === 'm13') {
      problemText = document.getElementById('problem-text')?.innerText?.trim() || '';
      // ⭐ 核心修复：把用户填写的答案和步骤收集起来
      const currentAnswer = document.getElementById('pAnswer')?.value.trim() || '';
      const currentSteps = [];
      document.querySelectorAll('#formulaSteps .formula-step').forEach(step => {
        const rel = step.querySelector('input[data-field="rel"]')?.value || '';
        const sub = step.querySelector('input[data-field="sub"]')?.value || '';
        const res = step.querySelector('input[data-field="res"]')?.value || '';
        if (rel || sub || res) currentSteps.push({ rel, sub, res });
        if (problemText){
          showExplainModal(problemText, {
            studentAnswer: currentAnswer,
            studentSteps: currentSteps
          });
        }
      });
    } else {
      problemText = document.querySelector('#lesson-stage-main .card h2')?.textContent || '';
    }

    if (!problemText) {
      showToast('这一题还没开始，先做一步再问 Koji 吧', 'info');
      return;
    }

    if (id === 'm1' || id === 'm9') {
      showExplainModal(problemText);
    }
  });
})();

// ========== 4. 家长设置与留言弹窗 ==========
function showParentSettingsModal() {
  if (document.querySelector('.parent-settings-mask')) return;
  const targets = targetLoad();

  const mask = document.createElement('div');
  mask.className = 'parent-settings-mask';
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:10015;padding:20px;';
  mask.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:24px 22px 20px;width:380px;max-width:92vw;box-shadow:0 20px 60px rgba(15,23,42,.3);">
      <div style="font-size:17px;font-weight:800;color:#1e293b;margin-bottom:6px;">⚙️ 家长设置</div>
      <div style="font-size:12.5px;color:#64748b;margin-bottom:16px;">设置每天/每周的学习目标</div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;">
        ${[
          { key: 'dailyQuestions', label: '每天做题', min: 1, max: 20, unit: '道' },
          { key: 'dailyStreak', label: '每天连对', min: 1, max: 10, unit: '题' },
          { key: 'dailyMastered', label: '每天掌握', min: 1, max: 5, unit: '题' },
          { key: 'weeklyQuestions', label: '每周做题', min: 5, max: 100, unit: '道' },
          { key: 'wrongReview', label: '每天复习错题', min: 0, max: 10, unit: '道' },
        ].map(t => `
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="flex:1;font-size:13px;font-weight:700;color:#475569;">${t.label}</span>
            <input type="number" data-target-key="${t.key}" value="${targets[t.key]}" min="${t.min}" max="${t.max}" style="width:70px;padding:8px 10px;border:2px solid #e5e7eb;border-radius:8px;font-size:14px;font-weight:700;text-align:center;font-family:inherit;outline:none;">
            <span style="font-size:12px;color:#64748b;font-weight:600;">${t.unit}</span>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:10px;">
        <button id="parentSetReset" style="flex:1;padding:12px;border-radius:12px;background:#f1f5f9;color:#475569;border:none;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;">恢复默认</button>
        <button id="parentSetSave" style="flex:1;padding:12px;border-radius:12px;background:#2563eb;color:#fff;border:none;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;box-shadow:0 3px 0 #1d4ed8;">保存</button>
      </div>
  `;

  document.body.appendChild(mask);

  document.getElementById('parentSetReset').addEventListener('click', () => {
    targetReset(); mask.remove(); showToast('✅ 已恢复默认目标', 'success');
  });

  document.getElementById('parentSetSave').addEventListener('click', () => {
    const newTargets = { ...targets };
    mask.querySelectorAll('[data-target-key]').forEach(inp => {
      newTargets[inp.dataset.targetKey] = parseInt(inp.value, 10) || 1;
    });
    targetSave(newTargets); mask.remove(); showToast('✅ 目标已保存', 'success');
    if (window.__shell?.renderHome) window.__shell.renderHome();
  });
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
}
window.__showParentSettingsModal = showParentSettingsModal;

function showUnreadParentMsg() {
  const unread = msgUnread();
  if (!unread.length) return;
  if (sessionStorage.getItem('grade3_parent_msg_shown') === '1') return;
  sessionStorage.setItem('grade3_parent_msg_shown', '1');

  const msg = unread[0];
  const mask = document.createElement('div');
  mask.className = 'parent-msg-read-mask';
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;z-index:10018;padding:20px;';
  mask.innerHTML = `
    <div style="background:linear-gradient(135deg,#fff,#fdf2f8);border-radius:24px;padding:28px 24px 20px;width:340px;max-width:92vw;text-align:center;box-shadow:0 24px 80px rgba(236,72,153,.3);">
      <div style="font-size:56px;margin-bottom:8px;">💌</div>
      <div style="font-size:13px;color:#ec4899;font-weight:800;letter-spacing:1px;margin-bottom:10px;">${msg.from} 给你留了一句话</div>
      <div style="font-size:17px;font-weight:800;color:#1e293b;line-height:1.7;padding:16px;background:#fff;border-radius:14px;margin-bottom:16px;">
        ${escapeHtmlStrict(msg.text)}
      </div>
      <div id="parentMsgReplyBox" style="display:none;margin-bottom:12px;">
        <textarea id="parentMsgReplyInput" placeholder="回一句…" style="width:100%;padding:10px 12px;border:2px solid #fbcfe8;border-radius:10px;font-size:14px;font-family:inherit;outline:none;resize:none;height:60px;"></textarea>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="parentMsgReplyToggle" style="flex:1;padding:12px;border-radius:12px;background:#fdf2f8;color:#be185d;border:2px solid #fbcfe8;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;">💬 回一句</button>
        <button id="parentMsgReadClose" style="flex:1;padding:12px;border-radius:12px;background:#ec4899;color:#fff;border:none;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;box-shadow:0 3px 0 #be185d;">我看到了 ❤️</button>
      </div>
    </div>
  `;
  document.body.appendChild(mask);

  const replyBox = document.getElementById('parentMsgReplyBox');
  const replyInput = document.getElementById('parentMsgReplyInput');

  document.getElementById('parentMsgReplyToggle').addEventListener('click', () => {
    const willShow = replyBox.style.display === 'none';
    replyBox.style.display = willShow ? 'block' : 'none';
    if (willShow) replyInput.focus();
  });

  document.getElementById('parentMsgReadClose').addEventListener('click', () => {
    const reply = replyInput.value.trim();
    if (reply) msgReply(msg.id, reply);
    msgMarkAllRead();
    mask.remove();
    if (reply) showToast('💬 已回复，家长下次打开会看到', 'success');
  });
}

// ========== 5. 启动流程 ==========
(async function bootstrap() {
  // ⭐ 核心：先注入 HTML 模板，确保后续模块挂载时能拿到 DOM
  injectTemplates();
  // ⭐ 初始化主题
  const savedTheme = localStorage.getItem('grade3_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  // 修改 PWA 状态栏颜色
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', savedTheme === 'dark' ? '#0f172a' : '#3b82f6');
  }

  await initStorage();
  await migrateFromLocalStorage();

  const syncOK = await initSync();
  if (syncOK) {
    const cloudMap = await pullFromCloud();
    if (cloudMap) {
      const toPush = [];
      mergeCloudIntoLocal(cloudMap, 
        (key) => { const value = lsGet(key); return value == null ? undefined : { value, localUpdatedAt: getLocalUpdatedAt(key) }; },
        (key, value) => { const cloudItem = cloudMap.get(key); applyCloudValue(key, value, cloudItem?.updated_at); },
        (key, value) => toPush.push([key, value])
      );
      if (toPush.length) {
        const { pushBatch } = await import('../core/sync/cloudbase-adapter.js');
        pushBatch(toPush).catch(e => console.warn('[Sync] 回推失败', e));
      }
      // ⭐ 删掉 historyRender，保留其他的
      try { wbRender(); renderDashboard(); } catch (e) {}
    }
  }

  // 年级切换与数据变化监听
  on(EVT.GRADE_CHANGED, () => {
    // ⭐ 删掉 historyRender
    try { wbRender(); renderDashboard(); renderStudentCard(); window._refreshGrowthCards?.(); } catch (e) {}
  });
  
  on(EVT.DATA_CHANGED, (payload) => {
    // ⭐ 彻底删掉这里触发 historyRender 的逻辑，因为它已经由 m14 内部处理
    if (payload.source === 'wrongbook') try { wbRender(); } catch (e) {}
    if (payload.source === 'takeaway') try { window._refreshGrowthCards?.(); } catch (e) {}
    try { renderDashboard(); } catch (e) {}
    try { window._refreshGrowthCards?.(); } catch (e) {} 
  });

  // 初始渲染
  wbRender();
  renderDashboard();
  renderErrorProfile();

  // 初始化核心 UI 和全局补丁
  installGlobalUI();
  installUIListeners();
  installSessionBackup();
  installDaily();
  installTimerChallenge();
  installStudentInit();
  renderStudentCard();

  initSyncUI();
  initShell();
  initHistoryDelegation();
  bindRangeTabs();

  initWrongBookUI({
    lockBodyScroll,
    navigate,
    getStudentName,
    handleRedoSuccess: window.__handleRedoSuccess,
    explainBusy: false,
    onExplainWrongItem: async (text) => {
      showExplainModal(text);
    }
  });

  // 拇指区浮球联动
  (function hookThumbBarToFloats() {
    const shell = window.__shell;
    if (!shell) return;
    const origShow = shell.showThumbBar;
    const origHide = shell.hideThumbBar;

    shell.showThumbBar = function (opts) {
      document.body.classList.add('thumb-bar-open');
      return origShow.call(this, opts);
    };
    shell.hideThumbBar = function () {
      document.body.classList.remove('thumb-bar-open');
      return origHide.call(this);
    };

    const bar = document.getElementById('thumbBar');
    if (bar) {
      new MutationObserver(() => {
        document.body.classList.toggle('thumb-bar-open', bar.classList.contains('show'));
      }).observe(bar, { attributes: true, attributeFilter: ['class'] });
    }
  })();

  showUnreadParentMsg();

  console.log('[启动] ✅ core/ 已就绪, sync =', getSyncState());
})();

// ========== 6. 页面卸载清理 ==========
document.addEventListener('visibilitychange', () => { if (document.hidden) flushStorage().catch(() => {}); });
window.addEventListener('pagehide', () => { flushStorage().catch(() => {}); });
window.addEventListener('beforeunload', () => { flushStorage().catch(() => {}); });

window.__debug = { getStorageHealth, getErrorLog, flushStorage };