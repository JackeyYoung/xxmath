/* core/sync/cloudbase-adapter.js
   CloudBase 文档型数据库适配器
   集合：user_kv
   文档结构：{ _id, _openid, key, value, updated_at }
   _openid 由 CloudBase 自动维护
*/

import { getCloudBaseApp } from './cloudbase-client.js';
import { ensureAnonymousLogin, getCurrentUser } from './auth.js';

const COLLECTION = 'user_kv';

async function getDb() {
  const app = getCloudBaseApp();
  if (!app) throw new Error('CloudBase 未配置');

  await ensureAnonymousLogin();
  return app.database();
}

/* ============ 拉取当前用户所有 KV ============ */
export async function pullAll() {
  const db = await getDb();
  const user = getCurrentUser();
  if (!user) throw new Error('未登录');

  const res = await db.collection(COLLECTION)
    .where({ _openid: user.uid })
    .limit(1000)             // CloudBase 单次最多 1000 条
    .get();

  const map = new Map();
  (res.data || []).forEach(doc => {
    map.set(doc.key, {
      value: doc.value,
      updated_at: doc.updated_at,
    });
  });
  return map;
}

/* ============ 写一个 key ============ */
export async function pushOne(key, value) {
  const db = await getDb();
  const user = getCurrentUser();
  if (!user) throw new Error('未登录');

  const now = new Date().toISOString();

  const exist = await db.collection(COLLECTION)
    .where({ _openid: user.uid, key })
    .limit(1)
    .get();

  if (exist.data && exist.data.length > 0) {
    await db.collection(COLLECTION)
      .doc(exist.data[0]._id)
      .update({
        data: { value, updated_at: now },
      });
  } else {
    await db.collection(COLLECTION).add({
      data: { key, value, updated_at: now },
    });
  }
}

/* ============ 删一个 key ============ */
export async function deleteOne(key) {
  const db = await getDb();
  const user = getCurrentUser();
  if (!user) throw new Error('未登录');

  const exist = await db.collection(COLLECTION)
    .where({ _openid: user.uid, key })
    .get();

  for (const doc of exist.data || []) {
    await db.collection(COLLECTION).doc(doc._id).remove();
  }
}

/* ============ 批量推送 ============
   CloudBase 无原生 upsert，逐个操作
   但先批量查存在性，减少往返
*/
export async function pushBatch(entries) {
  const db = await getDb();
  const user = getCurrentUser();
  if (!user) throw new Error('未登录');

  const now = new Date().toISOString();
  const keys = entries.map(([k]) => k);

  // ① 一次性查出所有已存在的 key
  const existing = await db.collection(COLLECTION)
    .where({
      _openid: user.uid,
      key: db.command.in(keys),
    })
    .limit(keys.length)
    .get();

  const existMap = new Map();
  (existing.data || []).forEach(doc => existMap.set(doc.key, doc._id));

  // ② 逐个 upsert（并发执行）
  const tasks = entries.map(([key, value]) => {
    const _id = existMap.get(key);
    if (_id) {
      return db.collection(COLLECTION).doc(_id).update({
        data: { value, updated_at: now },
      });
    }
    return db.collection(COLLECTION).add({
      data: { key, value, updated_at: now },
    });
  });

  await Promise.all(tasks);
}