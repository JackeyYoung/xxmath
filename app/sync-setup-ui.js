/* app/sync-setup-ui.js
   CloudBase 配置 + 邮箱验证码登录 UI
*/

import {
  isCloudBaseConfigured,
  setCloudBaseConfig,
} from '../core/sync/cloudbase-client.js';
import {
  getCurrentUser,
  ensureAnonymousLogin,
  signOut,
  isLoggedIn,
  sendEmailCode,
  verifyAndSignIn,
} from '../core/sync/auth.js';

let loginStep = 'input-email';   // 'input-email' | 'input-code'
let verificationId = null;
let loginEmail = '';
let isUser = false;

export function openSyncSetupModal() {
  if (document.querySelector('#syncSetupMask')) return;

  const mask = document.createElement('div');
  mask.id = 'syncSetupMask';
  mask.className = 'sync-modal-mask';
  
  mask.innerHTML = `<div id="syncSetupModal" class="sync-modal"></div>`;
  document.body.appendChild(mask);
  
  mask.addEventListener('click', e => {
    if (e.target === mask) mask.remove();
  });

  loginStep = 'input-email';
  _renderContent();
}

function _renderContent() {
  const modal = document.getElementById('syncSetupModal');
  if (!modal) return;

  const configured = isCloudBaseConfigured();
  const logged = isLoggedIn();
  const user = getCurrentUser();

  if (configured && loginStep === 'input-code') {
    modal.innerHTML = _htmlCodeStep(loginEmail);
    _bindCodeStep(loginEmail);
    return;
  }

  if (!configured) {
    modal.innerHTML = _htmlSetupForm();
    _bindSetupForm();
  } else if (!logged) {
    modal.innerHTML = _htmlEmailStep();
    _bindEmailStep();
  } else {
    modal.innerHTML = _htmlAccountPanel(user);
    _bindAccountPanel();
  }
}

/* ============ 视图 1：环境 ID 配置 ============ */
function _htmlSetupForm() {
  return `
    <h3>☁️ 配置云端同步</h3>
    <p>填入腾讯云 CloudBase 环境 ID（在 <b>云开发控制台 → 环境</b> 可以看到）。</p>
    
    <label>环境 ID</label>
    <input id="tcbEnvId" type="text" placeholder="math-classroom-1a2b3c" />
    
    <div id="sbErr" class="sb-err"></div>
    
    <div class="sync-btn-row">
      <button id="sbCancel" class="sync-btn sync-btn-secondary" style="flex:1; margin-bottom:0;">取消</button>
      <button id="sbSave" class="sync-btn sync-btn-primary" style="flex:2; margin-bottom:0;">保存并重载</button>
    </div>
  `;
}

function _bindSetupForm() {
  document.getElementById('sbCancel').onclick = () => {
    document.getElementById('syncSetupMask')?.remove();
  };

  document.getElementById('sbSave').onclick = () => {
    const envId = document.getElementById('tcbEnvId').value.trim();
    const err = document.getElementById('sbErr');

    if (!envId || envId.length < 10) {
      err.textContent = '环境 ID 看起来不对（应该 > 10 位）';
      return;
    }

    setCloudBaseConfig(envId);
    location.reload();
  };
}

/* ============ 视图 2：输入邮箱 ============ */
function _htmlEmailStep() {
  return `
    <h3>👤 登录 / 注册</h3>
    <p>输入邮箱，我们会发送 6 位验证码。<br><b>首次使用</b>会自动注册，无需额外步骤。</p>
    
    <label>邮箱</label>
    <input id="loginEmail" type="email" placeholder="you@example.com" />
    
    <div id="loginErr" class="sb-err"></div>
    
    <button id="loginSendCode" class="sync-btn sync-btn-primary">发送验证码</button>
  `;
}

function _bindEmailStep() {
  document.getElementById('loginSendCode').onclick = async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const err = document.getElementById('loginErr');

    if (!email || !email.includes('@')) {
      err.textContent = '请输入有效邮箱';
      return;
    }

    const btn = document.getElementById('loginSendCode');
    btn.disabled = true;
    btn.textContent = '发送中…';
    err.textContent = '';

    try {
      const result = await sendEmailCode(email);
      loginEmail = email;
      verificationId = result.verification_id;
      isUser = result.is_user;
      loginStep = 'input-code';
      _renderContent();
    } catch (e) {
      console.error('[发送验证码失败]', e);
      err.textContent = '发送失败：' + (e.message || '请重试');
      btn.disabled = false;
      btn.textContent = '发送验证码';
    }
  };
}

/* ============ 视图 3：输入验证码 ============ */
function _htmlCodeStep(email) {
  return `
    <h3>📧 输入验证码</h3>
    <p>验证码已发送到 <b>${email}</b>，10 分钟内有效。</p>
    
    <label>6 位验证码</label>
    <input id="loginCode" type="text" inputmode="numeric" maxlength="6" placeholder="000000" class="code-input" />
    
    <div id="loginErr" class="sb-err"></div>
    
    <button id="loginVerify" class="sync-btn sync-btn-primary" style="margin-bottom:10px;">确认登录</button>
    <button id="loginBack" class="sync-btn sync-btn-secondary">← 返回修改邮箱</button>
  `;
}

function _bindCodeStep(email) {
  setTimeout(() => document.getElementById('loginCode')?.focus(), 100);

  document.getElementById('loginBack').onclick = () => {
    loginStep = 'input-email';
    _renderContent();
  };

  document.getElementById('loginVerify').onclick = async () => {
    const code = document.getElementById('loginCode').value.trim();
    const err = document.getElementById('loginErr');

    if (!/^\d{6}$/.test(code)) {
      err.textContent = '请输入 6 位数字验证码';
      return;
    }

    const btn = document.getElementById('loginVerify');
    btn.disabled = true;
    btn.textContent = '验证中…';
    err.textContent = '';

    try {
      await verifyAndSignIn(email, code, verificationId, isUser);
      
      const { resumeSync } = await import('../core/sync/sync-manager.js');
      resumeSync();
      
      document.getElementById('syncSetupMask')?.remove();
      location.reload();
      
    } catch (e) {
      console.error('[验证码校验失败]', e);
      err.textContent = '验证失败：' + (e.message || '请检查验证码是否正确');
      btn.disabled = false;
      btn.textContent = '确认登录';
    }
  };
}

/* ============ 视图 4：账号面板 ============ */
function _htmlAccountPanel(user) {
  const uid = user?.uid || '—';
  const email = user?.email || '（匿名用户）';
  const isAnonymous = !user?.email;

  return `
    <h3>☁️ 账号设置</h3>

    <div class="sync-acc-card">
      <div class="label">当前账号</div>
      <div class="email">${email}</div>
      <div class="uid">UID: ${uid}</div>
    </div>

    ${isAnonymous ? `
      <div class="sync-warning">
        ⚠️ <b>匿名账号跨设备不共享</b>。<br>
        如果要手机和 iPad 看同样的记录，请使用邮箱登录。
      </div>
      <button id="accToLogin" class="sync-btn sync-btn-primary" style="background:var(--amber-text);">使用邮箱登录 / 注册</button>
    ` : ''}

    <button id="accSync" class="sync-btn sync-btn-primary">立即同步</button>
    <button id="accLogout" class="sync-btn sync-btn-danger">
      ${isAnonymous ? '清除本地登录态' : '退出登录'}
    </button>
  `;
}

function _bindAccountPanel() {
  const accToLogin = document.getElementById('accToLogin');
  if (accToLogin) {
    accToLogin.onclick = () => {
      loginStep = 'input-email';
      const modal = document.getElementById('syncSetupModal');
      if (modal) {
        modal.innerHTML = _htmlEmailStep();
        _bindEmailStep();
      }
    };
  }

  const accSync = document.getElementById('accSync');
  if (accSync) {
    accSync.onclick = async () => {
      const btn = document.getElementById('accSync');
      btn.textContent = '同步中…';
      btn.disabled = true;
      try {
        const { forceSync } = await import('../core/sync/sync-manager.js');
        await forceSync();
        btn.textContent = '✅ 已同步';
        setTimeout(() => {
          btn.textContent = '立即同步';
          btn.disabled = false;
        }, 1200);
      } catch (e) {
        btn.textContent = '同步失败';
        setTimeout(() => {
          btn.textContent = '立即同步';
          btn.disabled = false;
        }, 1500);
      }
    };
  }

  const accLogout = document.getElementById('accLogout');
  if (accLogout) {
    accLogout.onclick = async () => {
      if (!confirm('退出后本设备的云端同步会停止，本地数据保留。\n\n确定退出？')) return;
      try {
        await signOut();
        document.getElementById('syncSetupMask')?.remove();
        location.reload();
      } catch (e) {
        alert('退出失败：' + e.message);
      }
    };
  }
}