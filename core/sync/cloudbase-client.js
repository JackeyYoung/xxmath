/* core/sync/cloudbase-client.js
   CloudBase 客户端封装
   - 环境 ID 存 localStorage，首次通过 UI 配置
   - 全局单例
   - ⭐ S11：948 KB 的 SDK 不再写在 <head> 里（parser-blocking），改为首次需要时按需加载
   - S8：本地配置统一走 storage 层（lsSet），不再直接写 localStorage
*/
import { lsSet } from '../storage.js';

let _app = null;
let _sdkLoading = null;

/**
 * ⭐ S11：按需加载 CloudBase 全量 SDK。
 * 只有「配了环境 ID」且真正要同步时才会调用，未配置环境的用户完全不下载这 948 KB。
 * 并发调用共享同一个 Promise，不会重复插入 <script>。
 */
export function ensureCloudbaseSDK() {
  if (typeof cloudbase !== 'undefined') return Promise.resolve(true);
  if (_sdkLoading) return _sdkLoading;

  _sdkLoading = new Promise(resolve => {
    const s = document.createElement('script');
    s.src = './js/cloudbase.full.js';
    s.async = true;
    s.onload = () => resolve(typeof cloudbase !== 'undefined');
    s.onerror = () => { console.warn('[CloudBase] SDK 加载失败，本次运行不启用云同步'); resolve(false); };
    document.head.appendChild(s);
  });
  return _sdkLoading;
}

export function getCloudBaseApp() {
  if (_app) return _app;

  const envId = localStorage.getItem('grade3_tcb_env_id');
  if (!envId) {
    console.warn('[CloudBase] 未配置环境 ID，云端同步禁用');
    return null;
  }

  if (typeof cloudbase === 'undefined') {
    console.warn('[CloudBase] SDK 尚未加载，请先 await ensureCloudbaseSDK()');
    return null;
  }

  _app = cloudbase.init({
    env: envId,
    region: 'ap-shanghai',       // 国内上海节点，延迟 30-50ms
  });

  return _app;
}

export function isCloudBaseConfigured() {
  return !!localStorage.getItem('grade3_tcb_env_id');
}

export function setCloudBaseConfig(envId) {
lsSet('grade3_tcb_env_id', envId.trim());   // S8：走存储层
  _app = null;   // 重置，下次重新创建
}

export function clearCloudBaseConfig() {
  localStorage.removeItem('grade3_tcb_env_id');
  _app = null;
}