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
export function mergeCloudIntoLocal(cloudMap, getLocal, setLocal, toPush) {
  let pulledCount = 0;
  let pushedCount = 0;

  cloudMap.forEach((cloudItem, key) => {
    const local = getLocal(key);
    const cloudTime = new Date(cloudItem.updated_at).getTime();
    const localTime = local?.localUpdatedAt || 0;

    if (!local) {
      // 本地没有 → 用云端的
      setLocal(key, cloudItem.value);
      pulledCount++;
    } else if (localTime < cloudTime) {
      // 云端更新 → 用云端的
      setLocal(key, cloudItem.value);
      pulledCount++;
    } else if (localTime > cloudTime) {
      // 本地更新 → 推送本地
      toPush(key, local.value);
      pushedCount++;
    }
    // localTime === cloudTime → 一样，跳过
  });

  return { pulledCount, pushedCount };
}