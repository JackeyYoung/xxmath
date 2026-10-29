/* core/ui/wrongbook-ui.js */
import { wbLoad, wbRemove, wbClear, wbSave, wbAdd  } from '../wrongbook.js';
import { findCachedFeedback } from '../feedback-resolver.js';
import { activeModules } from '../../app/shell.js';
import { showToast } from './toast.js';
import { buildAiInsightHtml } from './ai-insight.js';
import { callLLM, normalizeAiFeedback } from '../llm.js';
import { escapeHtmlStrict } from '../html.js';
import { takeawayLoad } from '../takeaway.js';
import { emit, EVT } from '../events.js';

let _ctx = {};

export function initWrongBookUI(ctx) {
  _ctx = ctx;
  const btn    = document.getElementById('wrongBookBtn');
  const drawer = document.getElementById('wrongBookDrawer');
  const mask   = document.getElementById('wrongBookMask');
  const close  = document.getElementById('wrongBookClose');
  if (!btn || !drawer) return;

  btn.addEventListener('click', () => {
    const willOpen = !drawer.classList.contains('open');
    drawer.classList.toggle('open');
    mask.classList.toggle('open');
    if (typeof ctx.lockBodyScroll === 'function') ctx.lockBodyScroll(willOpen);
  });
  
  close.addEventListener('click', () => closeDrawer());
  mask.addEventListener('click', () => closeDrawer());

  // ⭐ 核心：事件委托统一处理
  const listEl = document.getElementById('wrongBookList');
  if (listEl) {
    listEl.addEventListener('click', async e => {
      // 1. 删除
      const removeBtn = e.target.closest('.wrong-item-remove');
      if (removeBtn) {
        const text = decodeURIComponent(removeBtn.dataset.text);
        wbRemove(text);
        return;
      }

      // 2. 讲解（核心修复点）
      const explainBtn = e.target.closest('.wrong-item-explain');
      if (explainBtn) {
        const text = decodeURIComponent(explainBtn.dataset.text);
        // ⭐ 核心修复：从错题本数据里捞出当时的学生作答
        const wbList = wbLoad();
        const record = wbList.find(r => r.text === text);
        
        await showExplainModal(text, {
          studentAnswer: record?.studentAnswer || '',
          studentSteps: record?.studentSteps || []
        });
        return;
      }

      // 3. 重做
      const redoBtn = e.target.closest('.wrong-item-redo');
      if (redoBtn) {
        const text = decodeURIComponent(redoBtn.dataset.text);
        handleRedo(text);
        return;
      }
    });
  }
}

function closeDrawer() {
  document.getElementById('wrongBookDrawer').classList.remove('open');
  document.getElementById('wrongBookMask').classList.remove('open');
  if (typeof _ctx.lockBodyScroll === 'function') _ctx.lockBodyScroll(false);
}

// ==========================================
// 核心：讲解弹窗逻辑（题库 -> 缓存 -> AI）
// ==========================================
export async function showExplainModal(text, userContext = null) {
  const modalMask = document.getElementById('explainModalMask');
  const modalBody = document.getElementById('explainModalBody');
  if (!modalMask || !modalBody) return;
  
  // 复原右上角的关闭按钮绑定（防止被解绑）
  document.getElementById('explainModalClose').onclick = () => {
    modalMask.style.display = 'none';
    document.body.classList.remove('modal-open'); // ⭐ 解除滚动锁定
  };

  modalMask.style.display = 'flex';
  document.body.classList.add('modal-open');       // ⭐ 锁定主页面滚动
  
  const bank = window.M13_PROBLEMS_BANK || [];
  const cached = findCachedFeedback(text, bank);

  // ⭐ 核心修复：检查用户是否传了新的作答进来
  const hasNewContext = userContext && (
    (userContext.studentAnswer && userContext.studentAnswer.trim() !== '') || 
    (userContext.studentSteps && userContext.studentSteps.length > 0)
  );

  // 只有当“没有新作答”（比如从错题本点看解析），且“有缓存”时，才直接展示缓存
  if (cached && !hasNewContext) {
    const fb = JSON.parse(JSON.stringify(cached.aiFeedback));
    fb._problemText = text;
    fb._userContext = null; 
    renderExplainContent(fb);
    return;
  }

  // 无缓存：AI 现算
  modalBody.innerHTML = `<div class="ai-thinking"><span class="dots"><span></span><span></span><span></span></span><div><div class="think-text">🤖 AI 正在思考…</div></div></div>`;
  
  try {
    // ⭐ 如果用户有作答，就带上；如果没有，传空
    const raw = await callLLM({ 
      problem: text, 
      studentAnswer: userContext?.studentAnswer || '', 
      steps: userContext?.studentSteps || [] 
    });
    const result = normalizeAiFeedback(raw, null);
    result._problemText = text;
    result._userContext = userContext; // ⭐ 存到 result 里，供弹窗内部使用
    renderExplainContent(result);

    // 回写缓存
    try {
      const list = wbLoad();
      const idx = list.findIndex(r => r.text === text);
      if (idx >= 0) { list[idx].aiFeedback = result; wbSave(list); }
    } catch(e) {}
    
  } catch (e) {
    // 使用语义化错误变量
    modalBody.innerHTML = `<div style="color:var(--red-text);text-align:center;padding:20px;font-weight:700;">AI 讲解获取失败：${e.message}</div>`;
  }
}

function renderExplainContent(result) {
  const modalBody = document.getElementById('explainModalBody');
  const insight = buildAiInsightHtml(result, { open: true });
  
  const stepsHtml = (result.steps || []).map(s => `
    <div class="std-fold">
      <div class="std-fold-hd"><span>第 ${s.step} 步</span><span class="arrow">▶</span></div>
      <div class="std-fold-bd">
        <div class="std-line"><b>关系式：</b>${escapeHtmlStrict(s.relation)}</div>
        <div class="std-line"><b>代入：</b>${escapeHtmlStrict(s.substitution)}</div>
        <div class="std-line"><b>得数：</b>${escapeHtmlStrict(s.result)}</div>
      </div>
    </div>
  `).join('');

  // 还原原版：展示“一题一得”
  const takeaway = takeawayLoad(result._problemText);
  const takeawayHtml = takeaway ? `
    <div style="margin-top:12px;padding:12px 16px;background:var(--primary-soft);border-left:4px solid var(--primary);border-radius:8px;font-size:13px;line-height:1.7;color:var(--text-soft);">
      <b style="color:var(--primary-d);">💡 一题一得：</b>${escapeHtmlStrict(takeaway)}
    </div>
  ` : '';

  modalBody.innerHTML = `
    <div class="koji-intro">
      <span class="koji-intro-emoji">🤖</span>
      <span>💡 Koji 想跟你说：${result.problem_understanding ? '先想想——' + escapeHtmlStrict(result.problem_understanding) : '我们一步一步来看看这道题。'}</span>
    </div>
    
    <div style="margin-bottom:16px;">
      <div style="font-size:13px;color:var(--muted);margin-bottom:8px;">题目：</div>
      <div style="font-size:15px;line-height:1.7;color:var(--text-soft);background:var(--bg);padding:12px 16px;border-radius:10px;">${escapeHtmlStrict(result._problemText)}</div>
    </div>
    
    ${insight.strengthsHtml}
    ${insight.gapsHtml}
    ${insight.judgementHtml}
    ${insight.walkHtml}
    ${stepsHtml}
    
    <div class="std-fold">
      <div class="std-fold-hd"><span>✅ 最终答案</span><span class="arrow">▶</span></div>
      <div class="std-fold-bd"><div class="std-answer">${escapeHtmlStrict(result.answer?.full || '—')}</div></div>
    </div>
    ${takeawayHtml}
    
    <div class="koji-more-wrap">
      <div class="koji-more-title">💡 这是之前保存的讲解。还想让 AI 换个角度再讲一遍吗？</div>
      <div class="koji-more-actions">
        <button class="btn-secondary" id="kojiMoreBtn">🤖 让 AI 再讲一遍</button>
        <button class="btn-secondary" id="kojiCloseBtn">够了，谢谢</button>
      </div>
    </div>
  `;

  modalBody.querySelectorAll('.std-fold-hd').forEach(hd => {
    hd.addEventListener('click', () => hd.parentElement.classList.toggle('open'));
  });

  // 重新绑定弹窗底部按钮
  document.getElementById('kojiCloseBtn')?.addEventListener('click', () => {
    document.getElementById('explainModalMask').style.display = 'none';
  });
  
  document.getElementById('kojiMoreBtn')?.addEventListener('click', () => {
    document.querySelector('.koji-more-wrap')?.remove();
    modalBody.innerHTML = `<div class="ai-thinking"><span class="dots"><span></span><span></span><span></span></span><div><div class="think-text">🤖 AI 正在重新思考…</div></div></div>`;
    
    // ⭐ 核心修复：把用户的作答（如果有）一并传递给 AI
    callLLM({ 
      problem: result._problemText, 
      studentAnswer: result._userContext?.studentAnswer || '', 
      steps: result._userContext?.studentSteps || [] 
    }).then(raw => {
      const newResult = normalizeAiFeedback(raw, null);
      newResult._problemText = result._problemText;
      newResult._userContext = result._userContext; // 保持上下文不丢
      
      // ⭐ 核心修复：更新错题本并确保触发全局刷新
      try {
        const wbList = wbLoad();
        const existing = wbList.find(w => w.text === result._problemText);
        if (existing) {
          wbAdd({
            ...existing,
            aiFeedback: newResult,
            timestamp: Date.now()
          });
          // ⭐ 关键：手动触发数据变更事件，让错题本列表重新渲染
          emit(EVT.DATA_CHANGED, { source: 'wrongbook' });
          showToast('✅ 已更新新的 AI 讲解', 'success');
        }
      } catch (e) {
        console.warn('更新 AI 重新讲解缓存失败', e);
      }

      renderExplainContent(newResult);
    }).catch(e => {
      modalBody.innerHTML = `<div style="color:var(--red-text);text-align:center;padding:20px;">AI 讲解获取失败：${e.message}</div>`;
    });
  });
}

// ==========================================
// 重做逻辑
// ==========================================
function handleRedo(text) {
  const mid = (wbLoad().find(r => r.text === text)?.moduleId) || 'm13';
  closeDrawer();

  if (_ctx.navigate) _ctx.navigate('lesson', { lessonId: mid });

  setTimeout(() => {
    if (mid === 'm1') {
      const custom = document.getElementById('m1Custom');
      if (custom) { custom.value = text; document.getElementById('m1UseCustom')?.click(); }
    } else if (mid === 'm9') {
      const m = text.match(/^(\d+)\s*([+\-−×÷])\s*(\d+)$/);
      if (m) {
        document.getElementById('m9a').value = m[1];
        document.getElementById('m9op').value = m[2];
        document.getElementById('m9b').value = m[3];
        document.getElementById('m9reset')?.click();
      }
    } else {
      if (activeModules[mid] && activeModules[mid].redo) activeModules[mid].redo(text);
    }
    // 重做横幅
    document.getElementById('redoBanner')?.remove();
    const banner = document.createElement('div');
    banner.id = 'redoBanner';
    // 使用 amber 变量，自适应深浅色
    banner.style.cssText = `position:fixed;top:0;left:0;right:0;background:var(--amber-text);color:#fff;padding:10px 20px;font-size:14px;font-weight:700;text-align:center;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.1);`;
    banner.innerHTML = `🔁 正在重做错题，做对将累计掌握进度 <button onclick="this.parentElement.remove()" style="margin-left:10px;background:transparent;border:none;color:#fff;cursor:pointer;">×</button>`;
    document.body.appendChild(banner);
  }, 300);
}
