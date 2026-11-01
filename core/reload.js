/* core/reload.js —— 软重载（M12）

   直接 location.reload() 有一个真实的数据风险：
   storage.js 的 lsSet 是「内存立即 + 磁盘排队」，
   reload 时队列里的写入可能还没落到 localForage/localStorage，
   表现为「刚改的设置，重载后又变回去了」。

   所以统一走 reloadApp()：先 await flushStorage()，再重载。
*/
import { flushStorage } from './storage.js';

export async function reloadApp(reason = '') {
  try {
    await flushStorage();
  } catch (e) {
    console.warn('[reload] 重载前 flush 存储失败（继续重载）', reason, e);
  }
  location.reload();
}
