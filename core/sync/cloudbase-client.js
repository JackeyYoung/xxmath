/* core/sync/cloudbase-client.js
   CloudBase 客户端封装
   - 环境 ID 存 localStorage，首次通过 UI 配置
   - 全局单例
*/

let _app = null;

export function getCloudBaseApp() {
  if (_app) return _app;

  const envId = localStorage.getItem('grade3_tcb_env_id');
  if (!envId) {
    console.warn('[CloudBase] 未配置环境 ID，云端同步禁用');
    return null;
  }

  if (typeof cloudbase === 'undefined') {
    console.warn('[CloudBase] SDK 未加载，检查 ./js/cloudbase.full.js');
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
  localStorage.setItem('grade3_tcb_env_id', envId.trim());
  _app = null;   // 重置，下次重新创建
}

export function clearCloudBaseConfig() {
  localStorage.removeItem('grade3_tcb_env_id');
  _app = null;
}