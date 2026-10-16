/* core/sync/sync-manager.js
   同步管理器（CloudBase 版，带错误分类 + 指数退避）
*/

import {
  isCloudBaseConfigured,
} from './cloudbase-client.js';
import {
  ensureAnonymousLogin,
  getCurrentUser,
} from './auth.js';
import {
  pullAll, pushOne, deleteOne, pushBatch,
} from './cloudbase-adapter.js';

export const SyncState = {
  DISABLED: 'disabled',
  IDLE: 'idle',
  SYNCING: 'syncing',
  OFFLINE: 'offline',
  ERROR: 'error',
};

let _state = SyncState.DISABLED;
let _listeners = new Set();
let _pushQueue = [];
let _pushTimer = null;
let _lastSyncAt = 0;
let _lastErrorKind = null;
let _pushRetryCount = 0;

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 2000;

export function onSyncStateChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function _setState(newState, payload) {
  _state = newState;
  _listeners.forEach(fn => {
    try { fn({ state: _state, ...payload }); } catch (e) {}
  });
}

export function getSyncState() { return _state; }
export function getLastSyncAt() { return _lastSyncAt; }

/* ============ 启动 ============ */
export async function initSync() {
  if (!isCloudBaseConfigured()) {
    console.log('[Sync] 未配置 CloudBase，本地模式');
    _setState(SyncState.DISABLED);
    return false;
  }

  if (!navigator.onLine) {
    _setState(SyncState.OFFLINE);
    return false;
  }

  try {
    _setState(SyncState.SYNCING);
    const user = await ensureAnonymousLogin();
    if (!user) {
      _setState(SyncState.ERROR, { error: new Error('登录失败'), kind: 'auth' });
      _lastErrorKind = 'auth';
      return false;
    }
    _setState(SyncState.IDLE, { userId: user.uid });
    console.log('[Sync] 已登录，userId =', user.uid);
    resumeSync();
    return true;
  } catch (e) {
    console.error('[Sync] 初始化失败', e);
    _setState(SyncState.ERROR, { error: e, kind: 'auth' });
    _lastErrorKind = 'auth';
    return false;
  }
}

/* ============ 拉取云端 ============ */
export async function pullFromCloud() {
  if (_state === SyncState.DISABLED) return null;

  try {
    _setState(SyncState.SYNCING);
    const map = await pullAll();
    _lastSyncAt = Date.now();
    _setState(SyncState.IDLE);
    return map;
  } catch (e) {
    console.error('[Sync] 拉取失败', e);
    if (!navigator.onLine) _setState(SyncState.OFFLINE);
    else _setState(SyncState.ERROR, { error: e });
    return null;
  }
}

/* ============ 推送（防抖 500ms） ============ */
export function schedulePush(key, value) {
  if (_state === SyncState.DISABLED) return;
  if (!getCurrentUser()) return;   // ⭐ 未登录不排队，避免堆积

  const existing = _pushQueue.findIndex(([k]) => k === key);
  if (existing >= 0) _pushQueue[existing] = [key, value];
  else _pushQueue.push([key, value]);

  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(_flushPush, 500);
}

async function _flushPush() {
  if (!_pushQueue.length) return;

  if (!navigator.onLine) {
    _setState(SyncState.OFFLINE);
    return;
  }

  // ⭐ 认证失败或已暂停 → 不重试
  if (_lastErrorKind === 'auth' || _lastErrorKind === 'exhausted') {
    return;
  }

  const batch = _pushQueue.slice();
  _pushQueue = [];

  try {
    _setState(SyncState.SYNCING);
    await pushBatch(batch);
    _lastSyncAt = Date.now();
    _pushRetryCount = 0;
    _lastErrorKind = null;
    _setState(SyncState.IDLE);
  } catch (e) {
    _pushQueue.unshift(...batch);
    const kind = _classifyError(e);

    if (kind === 'auth') {
      _lastErrorKind = 'auth';
      _setState(SyncState.ERROR, { error: e, kind });
      console.warn('[Sync] 认证失败，暂停推送');
      return;
    }

    if (kind === 'fatal') {
      _pushQueue = _pushQueue.slice(batch.length);   // 丢弃这批
      _lastErrorKind = 'fatal';
      _setState(SyncState.ERROR, { error: e, kind });
      console.error('[Sync] 致命错误，丢弃这批改动', e);
      return;
    }

    if (_pushRetryCount >= MAX_RETRIES) {
      _lastErrorKind = 'exhausted';
      _setState(SyncState.ERROR, { error: e, kind: 'exhausted' });
      console.error('[Sync] 重试耗尽，暂停推送');
      return;
    }

    _pushRetryCount++;
    const delay = BASE_RETRY_DELAY * Math.pow(2, _pushRetryCount - 1);
    console.log(`[Sync] ${kind} 错误，${delay}ms 后重试（${_pushRetryCount}/${MAX_RETRIES}）`);
    _setState(SyncState.ERROR, { error: e, kind, retryIn: delay });

    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(_flushPush, delay);
  }
}

function _classifyError(e) {
  const msg = (e && e.message || '').toLowerCase();
  const code = e && (e.code || e.status);

  if (msg.includes('未登录') || code === 401 || code === 403 ||
      msg.includes('auth')) {
    return 'auth';
  }
  if (code === 400 || code === 422) return 'fatal';
  if (code === 429) return 'ratelimit';
  if (code >= 500 || msg.includes('fetch') || msg.includes('network') ||
      msg.includes('timeout') || msg.includes('network error')) {
    return 'network';
  }
  return 'fatal';
}

/* ⭐ 登录成功后调用：清积压 + 全量重推 */
export async function resumeSync() {
  _lastErrorKind = null;
  _pushRetryCount = 0;
  clearTimeout(_pushTimer);

  // 把内存所有数据重推（首次登录后全量同步）
  const { lsKeysByPrefix, lsGet } = await import('../storage.js');
  const { LOCAL_ONLY_KEYS } = await import('../keys.js');

  const keys = lsKeysByPrefix('grade3_');
  for (const k of keys) {
    if (LOCAL_ONLY_KEYS.has(k)) continue;   // 本地专用 key 不同步
    const v = lsGet(k);
    if (v != null) schedulePush(k, v);
  }

  _pushTimer = setTimeout(_flushPush, 300);
}

/* 删除同步 */
export async function scheduleDelete(key) {
  if (_state === SyncState.DISABLED) return;
  if (!getCurrentUser()) return;
  try {
    await deleteOne(key);
  } catch (e) {
    console.error('[Sync] 删除失败', e);
  }
}

/* 手动全量同步 */
export async function forceSync() {
  if (_state === SyncState.DISABLED) return false;
  try {
    _setState(SyncState.SYNCING);
    _lastErrorKind = null;
    _pushRetryCount = 0;
    await _flushPush();
    const map = await pullAll();
    _lastSyncAt = Date.now();
    _setState(SyncState.IDLE);
    return map;
  } catch (e) {
    _setState(SyncState.ERROR, { error: e });
    return false;
  }
}

/* 网络变化 */
window.addEventListener('online', () => {
  if (_state === SyncState.OFFLINE) {
    console.log('[Sync] 网络恢复，开始同步');
    _lastErrorKind = null;
    _pushRetryCount = 0;
    _flushPush();
  }
});

window.addEventListener('offline', () => {
  _setState(SyncState.OFFLINE);
});