/* app/sync-setup-ui.js
   CloudBase 配置 + 登录 UI
*/

import {
  isCloudBaseConfigured,
  setCloudBaseConfig,
} from '../core/sync/cloudbase-client.js';
import {
  getCurrentUser,
  ensureAnonymousLogin,
  signInWithEmail,
  signUpWithEmail,
  signOut,
  isLoggedIn,
} from '../core/sync/auth.js';

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

  _renderContent();
}

function _renderContent() {
  const modal = document.getElementById('syncSetupModal');
  if (!modal) return;

  const configured = isCloudBaseConfigured();
  const logged = isLoggedIn();
  const user = getCurrentUser();

  if (!configured) {
    modal.innerHTML = _htmlSetupForm();
    _bindSetupForm();
  } else if (!logged) {
    modal.innerHTML = _htmlLoginForm();
    _bindLoginForm();
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

/* ============ 视图 2：登录 ============ */
function _htmlLoginForm() {
  return `
    <h3 style="font-size:17px;font-weight:800;margin-bottom:8px;">👤 登录账号</h3>
    <p style="font-size:13px;color:#64748b;line-height:1.6;margin-bottom:16px;">
      登录后可在多台设备看到同样的做题记录。<br>
      <b>首次使用？</b>直接点"匿名登录"，无需注册。
    </p>

    <div id="loginTabs" style="display:flex;gap:6px;margin-bottom:16px;">
      <button data-tab="email" style="flex:1;padding:8px;border-radius:8px;border:2px solid #3b82f6;
              background:#3b82f6;color:#fff;font-size:13px;font-weight:700;cursor:pointer;
              font-family:inherit;">邮箱</button>
      <button data-tab="signup" style="flex:1;padding:8px;border-radius:8px;border:2px solid #e2e8f0;
              background:#fff;color:#64748b;font-size:13px;font-weight:700;cursor:pointer;
              font-family:inherit;">注册</button>
    </div>

    <div id="emailFields">
      <input id="loginEmail" type="email" placeholder="邮箱"
        style="width:100%;padding:10px 12px;border:2px solid #e2e8f0;border-radius:10px;
               font-size:14px;margin-bottom:10px;outline:none;font-family:inherit;">
      <input id="loginPassword" type="password" placeholder="密码（至少 6 位）"
        style="width:100%;padding:10px 12px;border:2px solid #e2e8f0;border-radius:10px;
               font-size:14px;margin-bottom:16px;outline:none;font-family:inherit;">
    </div>

    <div id="loginErr" style="color:#ef4444;font-size:13px;min-height:18px;margin-bottom:8px;"></div>

    <button id="loginSubmit" style="width:100%;padding:11px;border-radius:10px;border:none;
            background:#3b82f6;color:#fff;font-size:15px;font-weight:700;cursor:pointer;
            font-family:inherit;box-shadow:0 3px 0 #2563eb;margin-bottom:10px;">
      登录
    </button>

    <button id="loginAnon" style="width:100%;padding:11px;border-radius:10px;
            border:2px solid #e2e8f0;background:#fff;color:#475569;font-size:14px;
            font-weight:700;cursor:pointer;font-family:inherit;">
      匿名登录（不需要账号）
    </button>
  `;
}

function _bindLoginForm() {
  let mode = 'email';
  const mask = document.getElementById('syncSetupMask');

  document.querySelectorAll('#loginTabs button').forEach(btn => {
    btn.onclick = () => {
      mode = btn.dataset.tab;
      document.querySelectorAll('#loginTabs button').forEach(b => {
        const active = b.dataset.tab === mode;
        b.style.background = active ? '#3b82f6' : '#fff';
        b.style.color = active ? '#fff' : '#64748b';
        b.style.borderColor = active ? '#3b82f6' : '#e2e8f0';
      });
      document.getElementById('loginSubmit').textContent =
        mode === 'email' ? '登录' : '注册';
    };
  });

  document.getElementById('loginAnon').onclick = async () => {
    const err = document.getElementById('loginErr');
    err.textContent = '';
    try {
      await ensureAnonymousLogin();
      const { resumeSync } = await import('../core/sync/sync-manager.js');
      resumeSync();
      mask.remove();
      location.reload();
    } catch (e) {
      err.textContent = '匿名登录失败：' + e.message;
    }
  };

  document.getElementById('loginSubmit').onclick = async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const err = document.getElementById('loginErr');

    if (!email || !email.includes('@')) {
      err.textContent = '请输入有效邮箱';
      return;
    }
    if (!password || password.length < 6) {
      err.textContent = '密码至少 6 位';
      return;
    }

    err.textContent = '';
    const btn = document.getElementById('loginSubmit');
    btn.disabled = true;
    btn.textContent = mode === 'email' ? '登录中…' : '注册中…';

    try {
      if (mode === 'email') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
      const { resumeSync } = await import('../core/sync/sync-manager.js');
      resumeSync();
      mask.remove();
      location.reload();
    } catch (e) {
      err.textContent = e.message || '操作失败';
      btn.disabled = false;
      btn.textContent = mode === 'email' ? '登录' : '注册';
    }
  };
}

/* ============ 视图 3：账号面板 ============ */
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
        如果要手机和 iPad 看同样的记录，请绑定邮箱。
      </div>
      <button id="accBind" style="width:100%;padding:11px;border-radius:10px;border:none;
              background:#f59e0b;color:#fff;font-size:14px;font-weight:700;cursor:pointer;
              font-family:inherit;box-shadow:0 3px 0 #b45309;margin-bottom:10px;">
        绑定邮箱（升级为正式账号）
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
      退出登录
    </button>
  `;
}

function _bindAccountPanel() {
  const accBind = document.getElementById('accBind');
  if (accBind) {
    accBind.onclick = async () => {
      const email = prompt('输入邮箱（用于跨设备登录）：');
      if (!email) return;
      const password = prompt('设置密码（至少 6 位）：');
      if (!password || password.length < 6) {
        alert('密码至少 6 位');
        return;
      }
      try {
        const { linkEmailToAnonymous } = await import('../core/sync/auth.js');
        await linkEmailToAnonymous(email, password);
        alert('绑定成功！现在可以在其他设备用此邮箱登录了。');
        document.getElementById('syncSetupMask')?.remove();
        location.reload();
      } catch (e) {
        alert('绑定失败：' + e.message);
      }
    };
  }

  document.getElementById('accSync').onclick = async () => {
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

  document.getElementById('accLogout').onclick = async () => {
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