/* core/storage.js
   存储适配层：
   - 内存缓存（同步可用）
   - localForage 异步落盘（带写队列防竞态）
   - 失败可见化
   - 迁移自 localStorage
*/
// core/storage.js 顶部加 import
import {
  schedulePush, scheduleDelete,
} from './sync/sync-manager.js';

import { isPersistKey, MIGRATED_FLAG, LOCAL_ONLY_KEYS } from './keys.js';

/* 记录每个 key 的本地更新时间（用于冲突合并） */
const _localUpdatedAt = new Map();

export function getLocalUpdatedAt(key) {
  return _localUpdatedAt.get(key) || 0;
}

/* ---------- 内存缓存 ---------- */
const _memCache = new Map();

/* 给 keys.js 用：不依赖 import 也能 peek */
globalThis.__memCachePeek = (k) => _memCache.has(k) ? _memCache.get(k) : null;

/* ---------- localForage 实例 ---------- */
let _store = null;
let _storeChecked = false;      // ⭐ 新增

function getStore() {
  if (_store) return _store;
  if (_storeChecked) return null;   // ⭐ 检查过了且没 store，就永远返回 null
  _storeChecked = true;

  if (typeof localforage === 'undefined') {
    console.warn('[存储] localForage 未加载，将退化为 localStorage 模式');
    return null;
  }
  _store = localforage.createInstance({
    name: 'grade3_math',
    storeName: 'kv',
  });
  return _store;
}

/* ---------- 写队列 + 健康状态 ---------- */
const _writeQueues = new Map();
const _health = {
  failCount: 0,
  lastError: null,
  lastErrorKey: null,
  lastErrorAt: 0,
  listeners: new Set(),
};

export function onStorageError(fn) {
  _health.listeners.add(fn);
  return () => _health.listeners.delete(fn);
}

function _emitStorageError(key, err) {
  _health.failCount++;
  _health.lastError = err;
  _health.lastErrorKey = key;
  _health.lastErrorAt = Date.now();
  console.warn('[存储] 写入失败', key, err);
  _health.listeners.forEach(fn => {
    try { fn({ key, err, ..._health }); } catch (e) {}
  });
}

export function getStorageHealth() {
  return {
    failCount: _health.failCount,
    lastError: _health.lastError,
    lastErrorKey: _health.lastErrorKey,
    lastErrorAt: _health.lastErrorAt,
    ok: _health.failCount === 0,
  };
}

/* ---------- 同步读 ---------- */
export function lsGet(key) {
  if (_memCache.has(key)) return _memCache.get(key);

  // S8：内存里没有时回落到 localStorage。
  // 原因：initStorage() 之前、或旧版本直接 localStorage.setItem 写的数据，内存里都没有；
  // 若不回落，`lsGet(k)` 与 `localStorage.getItem(k)` 会给出不同结果（同一份数据两条读路径）。
  // 回落后顺手放进内存，后续读取就都走缓存。
  if (isPersistKey(key)) {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) { _memCache.set(key, v); return v; }
    } catch (e) { /* 隐私模式 / 配额异常：当作没有 */ }
  }
  return null;
}

/* ---------- 云端同步判定（单一出口，便于单测） ----------
   只有「需要持久化 + 非本地专用 + 未显式跳过」的 key 才该推云端。
   旧实现把这个判断写在 if (!store) 分支 return 之后（死代码，永远不执行），
   而真正生效的两处 schedulePush 都没查 LOCAL_ONLY_KEYS
   → grade3_sound_on / grade3_current_grade 这类「只存本地」的 key 也会被推到云端。 */
export function shouldSyncKey(key, opts = {}) {
  return !opts.skipSync && !LOCAL_ONLY_KEYS.has(key);
}

/* ---------- 同步写（内存立即 + 磁盘排队） ---------- */
export function lsSet(key, value, opts = {}) {
  if (!isPersistKey(key)) return;
  _memCache.set(key, value);
  _localUpdatedAt.set(key, Date.now());

  if (shouldSyncKey(key, opts)) schedulePush(key, value);

  const store = getStore();
  if (!store) {
    // 无 localForage：降级写 localStorage（同步判定已在上面统一做过）
    try { localStorage.setItem(key, value); } catch (e) { _emitStorageError(key, e); }
    return;
  }

  const prev = _writeQueues.get(key) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => store.setItem(key, value))
    .catch(e => _emitStorageError(key, e))
    .finally(() => {
      if (_writeQueues.get(key) === next) _writeQueues.delete(key);
    });
  _writeQueues.set(key, next);
}

/* ---------- 同步删 ---------- */
export function lsRemove(key, opts = {}) {
  if (!isPersistKey(key)) return;
  _memCache.delete(key);
  _localUpdatedAt.delete(key);

  const store = getStore();
  if (!store) {
    try { localStorage.removeItem(key); } catch (e) { _emitStorageError(key, e); }
    if (shouldSyncKey(key, opts)) scheduleDelete(key);
    return;
  }

  const prev = _writeQueues.get(key) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => store.removeItem(key))
    .catch(e => _emitStorageError(key, e))
    .finally(() => {
      if (_writeQueues.get(key) === next) _writeQueues.delete(key);
    });
  _writeQueues.set(key, next);

  if (shouldSyncKey(key, opts)) scheduleDelete(key);

  // 删除只需同步「删除」事件，不要再 push 值。
  // 旧实现在这里写成 schedulePush(key, value)，而 lsRemove 的形参里没有 value
  // → 严格模式下必抛 ReferenceError，导致调用方后续逻辑（如 renderStudentCard）不执行。
}

/* 新增：应用云端数据到本地（跳过同步回推） */
export function applyCloudValue(key, value, cloudUpdatedAt) {
  // ⭐ S8：顺序必须反过来 —— lsSet 内部会把 _localUpdatedAt 置成 Date.now()，
  //    若先写云端时间戳再调 lsSet，它立刻被覆盖 → merge 永远认为「本地更新」，
  //    表现为每次同步都把自己的值重新推上去、云端的新值永远拉不下来。
  lsSet(key, value, { skipSync: true });
  if (cloudUpdatedAt) {
    const t = new Date(cloudUpdatedAt).getTime();
    if (Number.isFinite(t)) _localUpdatedAt.set(key, t);
  }
}

/* ---------- 前缀遍历 ---------- */
export function lsKeysByPrefix(prefix) {
  const out = [];
  _memCache.forEach((_, k) => {
    if (k.startsWith(prefix)) out.push(k);
  });
  return out;
}

/* ---------- 等待挂起写入落盘 ---------- */
export async function flushStorage() {
  // ⭐ 修复：原来只 await 一次快照，await 期间新入队的写入不会被等待（切后台可能丢数据）。
  //    改成循环到队列清空（最多 10 轮，防止写入风暴时死循环）。
  for (let i = 0; i < 10; i++) {
    const pending = [..._writeQueues.values()];
    if (!pending.length) return;
    await Promise.allSettled(pending);
    if (_writeQueues.size === 0) return;
  }
}

/* ---------- 初始化：从 localForage 拉到内存 ---------- */
export async function initStorage() {
  const store = getStore();
  if (!store) {
    _fallbackFromLocalStorage();
    return;
  }
  try {
    const keys = await store.keys();
    await Promise.all(keys.map(async k => {
      if (!isPersistKey(k)) return;
      const v = await store.getItem(k);
      if (typeof v === 'string') _memCache.set(k, v);
    }));
    console.log(`[存储] localForage 已加载 ${_memCache.size} 项`);
  } catch (e) {
    console.warn('[存储] localForage 加载失败，回退 localStorage', e);
    _fallbackFromLocalStorage();
  }
}

/* ---------- 一次性迁移 ---------- */
function _fallbackFromLocalStorage() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (isPersistKey(k)) _memCache.set(k, localStorage.getItem(k));
    }
  } catch (e) {}
  // ⭐ 加这行：标记"不再需要迁移"，防止以后 localforage 恢复后数据被覆盖
  try { _memCache.set(MIGRATED_FLAG, '1'); } catch (e) {}
}

/* ---------- 一次性迁移 ---------- */
export async function migrateFromLocalStorage() {
  const store = getStore();
  if (!store) return;
  try {
    if (await store.getItem(MIGRATED_FLAG)) return;
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!isPersistKey(k)) continue;
      const v = localStorage.getItem(k);
      if (v != null) {
        _memCache.set(k, v);
        await store.setItem(k, v);
        count++;
      }
    }
    await store.setItem(MIGRATED_FLAG, '1');
    if (count > 0) console.log(`[存储] 已从 localStorage 迁移 ${count} 项`);
  } catch (e) {
    console.warn('[存储] 迁移失败', e);
  }
}