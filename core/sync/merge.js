/* core/sync/merge.js
   冲突合并策略：last-write-wins
   但带本地优先：本地时间 >= 云端时间 → 保留本地
*/

/**
 * 合并云端和本地数据
 * @param {Map} cloudMap - Map<key, { value, updated_at }>
 * @param {Function} getLocal - (key) => { value, localUpdatedAt } 或 undefined
 * @param {Function} setLocal - (key, value) => void
 * @param {Function} toPush - (key, value) => void  收集需要回推的 key
 */
/* core/sync/merge.js */

export function mergeCloudIntoLocal(cloudMap, getLocal, setLocal, toPush) {
  let pulledCount = 0;
  let pushedCount = 0;

  cloudMap.forEach((cloudItem, key) => {
    const local = getLocal(key);
    const localTime = local?.localUpdatedAt || 0;
    // ⭐ 修复：updated_at 缺失/非法时 cloudTime 是 NaN，原来两个分支都不命中
    //    → 该 key 既不拉取也不回推，被静默跳过。这里归一成 0（视为「云端无时间」，按最旧处理）。
    //    同时删掉逐 key 打印学生数据与时间戳的调试日志。
    const parsed = new Date(cloudItem?.updated_at ?? 0).getTime();
    const cloudTime = Number.isFinite(parsed) ? parsed : 0;

    if (!local) {
      setLocal(key, cloudItem.value);
      pulledCount++;
    } else if (localTime <= cloudTime) {
      // ⭐ 改为 <=，如果时间一样也拉取云端的
      setLocal(key, cloudItem.value);
      pulledCount++;
    } else if (localTime > cloudTime) {
      toPush(key, local.value);
      pushedCount++;
    }
  });

  console.log(`[Merge] 完成：拉取 ${pulledCount} 项，推送 ${pushedCount} 项`);
  return { pulledCount, pushedCount };
}