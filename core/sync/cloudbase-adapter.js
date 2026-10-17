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
/* ============ 拉取当前用户所有 KV ============ */
export async function pullAll() {
  const db = await getDb();
  const user = getCurrentUser();
  if (!user) throw new Error('未登录');

  console.log(`[Adapter] 开始拉取数据，当前用户 UID: ${user.uid}`);

  try {
    // 1. 尝试不加 _openid 查询（新版网关自带权限校验）
    const res = await db.collection(COLLECTION)
      .limit(1000)
      .get();

    console.log(`[Adapter] 云端返回原始数据:`, res);

    const map = new Map();
    const list = res.data || res.result?.data || [];

    if (list.length === 0) {
      console.warn('[Adapter] 云端返回数据为空 (res.data 是空数组)');
    }

    list.forEach(doc => {
      // ⭐ 兼容处理：数据可能被包在 doc.data 里，也可能直接在 doc 上
      const actualData = doc.data || doc;

      if (actualData.key) {
        map.set(actualData.key, {
          value: actualData.value,
          updated_at: actualData.updated_at,
        });
      } else {
        console.warn('[Adapter] 发现一条缺失 key 的脏数据:', doc);
      }
    });

    console.log(`[Adapter] 成功解析出 ${map.size} 条记录，key 列表:`, Array.from(map.keys()));
    return map;

  } catch (e) {
    console.error('[Adapter] 拉取失败，尝试带 _openid 查询', e);

    // 2. 兜底：如果上面报错，尝试带 _openid 查询（老版逻辑）
    try {
      const res = await db.collection(COLLECTION)
        .where({ _openid: user.uid })
        .limit(1000)
        .get();

      console.log(`[Adapter] 兜底查询云端返回:`, res);

      const map = new Map();
      const list = res.data || res.result?.data || [];
      list.forEach(doc => {
      // ⭐ 兼容处理：数据可能被包在 doc.data 里，也可能直接在 doc 上
          const actualData = doc.data || doc;

          if (actualData.key) {
            map.set(actualData.key, {
              value: actualData.value,
              updated_at: actualData.updated_at,
            });
          } else {
            console.warn('[Adapter] 发现一条缺失 key 的脏数据:', doc);
          }
        });
      return map;
    } catch (err2) {
      console.error('[Adapter] 拉取彻底失败:', err2);
      throw err2;
    }
  }
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

  // 查已存在的
  const existing = await db.collection(COLLECTION)
    .where({
      _openid: user.uid,
      key: db.command.in(keys), // 如果旧数据在 data.key 里，这里可能查不到，但没关系，直接 add 新的
    })
    .limit(keys.length)
    .get();

  const existMap = new Map();
  (existing.data || []).forEach(doc => {
    const actualData = doc.data || doc;
    if (actualData.key) existMap.set(actualData.key, doc._id);
  });

  // 逐条写入
  const tasks = entries.map(([key, value]) => {
    const _id = existMap.get(key);

    // ⭐ 注意：新版 SDK 直接传入对象，不要套 { data: ... }
    const payload = { key, value, updated_at: now };

    if (_id) {
      return db.collection(COLLECTION).doc(_id).update(payload);
    } else {
      return db.collection(COLLECTION).add(payload); // 去掉外面的 data 包裹
    }
  });

  await Promise.all(tasks);
}