/* cloudbase-cleanup/index.js —— 9.2 云同步脏数据清洗（CloudBase 云函数）

背景（体检报告 9.2）：
  云同步写入结构不一致，历史数据里会出现
    · 同一 (key, _openid) 的多条重复文档（后写不覆盖，变成多份）
    · 缺少 _openid 的孤儿文档（可能是别的设备/别人写进来的）
    · updated_at 为非法值（字符串/空），导致 merge 时无法判新旧（9.8 已修，但旧数据还在）
  结果是：重复文档 + 已删除的记录「复活」。

代码侧已保证不再产生新脏数据（9.1 已加 _openid 过滤、9.8 已修时间戳判定）。
这个函数只做一次历史数据治理。

用法：
  1) 在云开发控制台 → 云函数 → 新建函数（Node.js 18），把本文件作为 index.js 贴进去
  2) 依赖：@cloudbase/node-sdk（控制台里加）
  3) 环境变量：SYNC_COLLECTION（默认 sync_data）、DRY_RUN（默认 '1'）
  4) 先 DRY_RUN=1 跑一次看报告；确认无误后改成 DRY_RUN=0 再跑一次

安全：
  · DRY_RUN 默认开启（只报告不删）
  · 只处理「重复文档」与「缺 _openid 的孤儿文档」，不碰正常文档
  · 每组保留 updated_at 最新的一条；updated_at 相同时保留 _id 字典序最大的（幂等、可重复跑）
*/
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
const db = app.database();

const COLLECTION = process.env.SYNC_COLLECTION || 'sync_data';
const DRY_RUN = (process.env.DRY_RUN || '1') !== '0';

const toNum = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  if (v instanceof Date) return v.getTime();
  return -1;                     // 非法/缺失 → 视为最旧
};

async function pageAll(collection, batch = 100) {
  const out = [];
  for (let skip = 0; ; skip += batch) {
    const res = await db.collection(collection).skip(skip).limit(batch).get();
    const list = res.data || [];
    out.push(...list);
    if (list.length < batch) break;
    if (out.length > 50000) break;     // 兜底，避免失控
  }
  return out;
}

exports.main = async () => {
  const all = await pageAll(COLLECTION);

  const report = {
    collection: COLLECTION,
    dryRun: DRY_RUN,
    total: all.length,
    orphanNoOpenid: 0,
    badUpdatedAt: 0,
    duplicateGroups: 0,
    redundantDocs: 0,
    deleteIds: [],
  };

  // 1) 缺 _openid 的孤儿文档
  const orphans = all.filter((d) => !d._openid);
  report.orphanNoOpenid = orphans.length;

  // 2) 非法 updated_at
  report.badUpdatedAt = all.filter((d) => toNum(d.updated_at) < 0).length;

  // 3) 按 (key, _openid) 分组去重
  const groups = new Map();
  for (const d of all) {
    if (!d._openid) continue;                 // 孤儿单独处理
    const gk = String(d.key) + '\u0000' + String(d._openid);
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push(d);
  }

  for (const [, list] of groups) {
    if (list.length < 2) continue;
    report.duplicateGroups++;
    // 新者优先；完全相同时间时用 _id 兜底，保证结果稳定
    list.sort((a, b) => {
      const dt = toNum(b.updated_at) - toNum(a.updated_at);
      if (dt !== 0) return dt;
      return String(b._id) > String(a._id) ? 1 : -1;
    });
    for (const d of list.slice(1)) {
      report.deleteIds.push(d._id);
      report.redundantDocs++;
    }
  }

  // 孤儿文档也清掉（没有 _openid 就无法按用户隔离，留着会被别的账号拉到）
  for (const d of orphans) report.deleteIds.push(d._id);

  if (DRY_RUN) {
    console.log('[dry-run] 只会报告，不会删除。报告如下：');
    console.log(JSON.stringify({ ...report, deleteIds: report.deleteIds.slice(0, 20) }, null, 2));
    return { ok: true, ...report, note: 'DRY_RUN=1，未做任何修改' };
  }

  // 分批删除（每批 20 条）
  let deleted = 0;
  for (let i = 0; i < report.deleteIds.length; i += 20) {
    const batch = report.deleteIds.slice(i, i + 20);
    if (!batch.length) continue;
    await db.collection(COLLECTION).where({ _id: db.command.in(batch) }).remove();
    deleted += batch.length;
  }

  console.log('[cleanup] 已删除', deleted, '条');
  return { ok: true, ...report, deleted };
};
