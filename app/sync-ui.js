/* app/sync-ui.js
   同步状态指示器 + 配置入口
*/

import {
  onSyncStateChange, getSyncState, forceSync, SyncState,
} from '../core/sync/sync-manager.js';
import { isCloudBaseConfigured } from '../core/sync/cloudbase-client.js';
import { getCurrentUser } from '../core/sync/auth.js';
import { openSyncSetupModal } from './sync-setup-ui.js';

export function initSyncUI() {
  console.log('[SyncUI] initSyncUI 被调用');

  const configured = isCloudBaseConfigured();
  console.log('[SyncUI] configured =', configured);

  if (!configured) {
    _renderSetupButton();
    return;
  }

  const btn = document.createElement('button');
  btn.id = 'syncBtn';
  btn.title = '同步状态';
  btn.style.cssText = `
    position: fixed; top: 12px; right: 12px;
    width: 36px; height: 36px; border-radius: 50%;
    border: none; background: #10b981; color: #fff;
    font-size: 18px; cursor: pointer; z-index: 99999;
    box-shadow: 0 3px 10px rgba(0,0,0,.15);
    display: flex; align-items: center; justify-content: center;
    transition: background .2s;
  `;
  btn.textContent = '☁️';
  document.body.appendChild(btn);
  console.log('[SyncUI] ☁️ 按钮已添加到 DOM');

  function updateUI(state) {
    const colors = {
      [SyncState.DISABLED]: '#94a3b8',
      [SyncState.IDLE]: '#10b981',
      [SyncState.SYNCING]: '#3b82f6',
      [SyncState.OFFLINE]: '#f59e0b',
      [SyncState.ERROR]: '#ef4444',
    };
    const icons = {
      [SyncState.DISABLED]: '☁️',
      [SyncState.IDLE]: '☁️',
      [SyncState.SYNCING]: '🔄',
      [SyncState.OFFLINE]: '📴',
      [SyncState.ERROR]: '⚠️',
    };
    btn.style.background = colors[state] || '#94a3b8';
    btn.textContent = icons[state] || '☁️';
    btn.title = `同步状态：${state}`;
  }

  onSyncStateChange(({ state }) => updateUI(state));
  updateUI(getSyncState());

  btn.addEventListener('click', openSyncSetupModal);
}

function _renderSetupButton() {
  const btn = document.createElement('button');
  btn.id = 'syncSetupBtn';
  btn.textContent = '☁️';
  btn.title = '点击配置云端同步';
  btn.style.cssText = `
    position: fixed; top: 12px; right: 12px;
    width: 36px; height: 36px; border-radius: 50%;
    border: none; background: #94a3b8; color: #fff;
    font-size: 18px; cursor: pointer; z-index: 99999;
    box-shadow: 0 3px 10px rgba(0,0,0,.15);
    display: flex; align-items: center; justify-content: center;
  `;
  btn.addEventListener('click', openSyncSetupModal);
  document.body.appendChild(btn);
  console.log('[SyncUI] 灰色 ☁️ 配置按钮已添加');
}