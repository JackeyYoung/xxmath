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
  mask.style.cssText = `
    position: fixed; inset: 0; z-index: 10010;
    background: rgba(15, 23, 42, .5);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  `;
  mask.innerHTML = `<div id="syncSetupModal" style="
    background: #fff; border-radius: 16px; padding: 24px 26px;
    box-shadow: 0 20px 60px rgba(15,23,42,.3);
    width: 400px; max-width: 92vw; max-height: 90vh; overflow-y: auto;
    font-family: inherit;
  "></div>`;

  document.body.appendChild(mask);
  mask.addEventListener('click', e => {
    if (e.target === mask) mask.remove();
  });

  // 每次打开重置状态
  loginStep = 'input-email';
  _renderContent();
}

function _renderContent() {
  const modal = document.getElementById('syncSetupModal');
  if (!modal) return;

  const configured = isCloudBaseConfigured();
  const logged = isLoggedIn();
  const user = getCurrentUser();

  // ⭐ 核心逻辑调整：如果是明确在“输验证码”流程，强行渲染验证码界面
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
    <h3 style="font-size:17px;font-weight:800;margin-bottom:8px;">☁️ 配置云端同步</h3>
    <p style="font-size:13px;color:#64748b;line-height:1.6;margin-bottom:16px;">
      填入腾讯云 CloudBase 环境 ID（在 <b>云开发控制台 → 环境</b> 可以看到）。
    </p>
    <label style="display:block;font-size:13px;font-weight:700;color:#475569;margin-bottom:6px;">
      环境 ID
    </label>
    <input id="tcbEnvId" type="text" placeholder="math-classroom-1a2b3c"
      style="width:100%;padding:10px 12px;border:2px solid #e2e8f0;border-radius:10px;
             font-size:14px;margin-bottom:16px;outline:none;font-family:inherit;">
    <div id="sbErr" style="color:#ef4444;font-size:13px;min-height:18px;margin-bottom:8px;"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button id="sbCancel" style="padding:9px 18px;border-radius:10px;border:none;
              background:#f1f5f9;color:#64748b;font-size:14px;font-weight:700;
              cursor:pointer;font-family:inherit;">取消</button>
      <button id="sbSave" style="padding:9px 18px;border-radius:10px;border:none;
              background:#3b82f6;color:#fff;font-size:14px;font-weight:700;
              cursor:pointer;font-family:inherit;box-shadow:0 3px 0 #2563eb;">
        保存并重载
      </button>
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
    <h3 style="font-size:17px;font-weight:800;margin-bottom:8px;">👤 登录 / 注册</h3>
    <p style="font-size:13px;color:#64748b;line-height:1.6;margin-bottom:16px;">
      输入邮箱，我们会发送 6 位验证码。<br>
      <b>首次使用</b>会自动注册，无需额外步骤。
    </p>

    <label style="display:block;font-size:13px;font-weight:700;color:#475569;margin-bottom:6px;">
      邮箱
    </label>
    <input id="loginEmail" type="email" placeholder="you@example.com"
      style="width:100%;padding:10px 12px;border:2px solid #e2e8f0;border-radius:10px;
             font-size:14px;margin-bottom:16px;outline:none;font-family:inherit;">

    <div id="loginErr" style="color:#ef4444;font-size:13px;min-height:18px;margin-bottom:8px;"></div>

    <button id="loginSendCode" style="width:100%;padding:11px;border-radius:10px;border:none;
            background:#3b82f6;color:#fff;font-size:15px;font-weight:700;cursor:pointer;
            font-family:inherit;box-shadow:0 3px 0 #2563eb;">
      发送验证码
    </button>
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
      
      // ⭐ 确保跳转前数据已保存
      loginEmail = email;
      verificationId = result.verification_id;
      isUser = result.is_user;
      
      // ⭐ 切换状态并重绘
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
    <h3 style="font-size:17px;font-weight:800;margin-bottom:8px;">📧 输入验证码</h3>
    <p style="font-size:13px;color:#64748b;line-height:1.6;margin-bottom:16px;">
      验证码已发送到 <b>${email}</b>，10 分钟内有效。
    </p>

    <label style="display:block;font-size:13px;font-weight:700;color:#475569;margin-bottom:6px;">
      6 位验证码
    </label>
    <input id="loginCode" type="text" inputmode="numeric" maxlength="6"
      placeholder="000000"
      style="width:100%;padding:12px;border:2px solid #e2e8f0;border-radius:10px;
             font-size:22px;font-weight:800;text-align:center;letter-spacing:6px;
             font-family:ui-monospace,monospace;margin-bottom:16px;outline:none;">

    <div id="loginErr" style="color:#ef4444;font-size:13px;min-height:18px;margin-bottom:8px;"></div>

    <button id="loginVerify" style="width:100%;padding:11px;border-radius:10px;border:none;
            background:#3b82f6;color:#fff;font-size:15px;font-weight:700;cursor:pointer;
            font-family:inherit;box-shadow:0 3px 0 #2563eb;margin-bottom:10px;">
      确认登录
    </button>

    <button id="loginBack" style="width:100%;padding:11px;border-radius:10px;
            border:2px solid #e2e8f0;background:#fff;color:#64748b;font-size:14px;
            font-weight:700;cursor:pointer;font-family:inherit;">
      ← 返回修改邮箱
    </button>
  `;
}

function _bindCodeStep(email) {
  // 自动聚焦验证码输入框
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
      
      // 同步成功后，清理弹窗并刷新
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
    <h3 style="font-size:17px;font-weight:800;margin-bottom:16px;">☁️ 账号</h3>

    <div style="background:#f8fafc;border-radius:12px;padding:14px 16px;margin-bottom:14px;">
      <div style="font-size:12px;color:#94a3b8;font-weight:700;margin-bottom:4px;">当前账号</div>
      <div style="font-size:15px;font-weight:800;color:#334155;word-break:break-all;margin-bottom:8px;">
        ${email}
      </div>
      <div style="font-size:11px;color:#94a3b8;font-family:ui-monospace,monospace;word-break:break-all;">
        UID: ${uid}
      </div>
    </div>

    ${isAnonymous ? `
      <div style="background:#fffbeb;border:2px dashed #fcd34d;border-radius:12px;
                  padding:12px 14px;margin-bottom:14px;font-size:13px;color:#92400e;
                  line-height:1.7;">
        ⚠️ <b>匿名账号跨设备不共享</b>。<br>
        如果要手机和 iPad 看同样的记录，请使用邮箱登录。
      </div>
      <button id="accToLogin" style="width:100%;padding:11px;border-radius:10px;border:none;
              background:#f59e0b;color:#fff;font-size:14px;font-weight:700;cursor:pointer;
              font-family:inherit;box-shadow:0 3px 0 #b45309;margin-bottom:10px;">
        使用邮箱登录 / 注册
      </button>
    ` : ''}

    <button id="accSync" style="width:100%;padding:11px;border-radius:10px;border:none;
            background:#3b82f6;color:#fff;font-size:14px;font-weight:700;cursor:pointer;
            font-family:inherit;box-shadow:0 3px 0 #2563eb;margin-bottom:10px;">
      立即同步
    </button>

    <button id="accLogout" style="width:100%;padding:11px;border-radius:10px;
            border:2px solid #e2e8f0;background:#fff;color:#ef4444;font-size:14px;
            font-weight:700;cursor:pointer;font-family:inherit;">
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