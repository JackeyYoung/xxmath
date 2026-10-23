/* grades/registry.js
   年级注册表：只存 loader 函数，不存具体内容
   —— 这是"多年级"和"懒加载"的唯一入口
*/

const _loaders = new Map();
const _cache = new Map();

export function registerGrade(id, loader) {
  _loaders.set(String(id), loader);
}

export async function loadGrade(id) {
  const gid = String(id);
  if (_cache.has(gid)) return _cache.get(gid);
  const loader = _loaders.get(gid) || _loaders.get('3');
  if (!loader) throw new Error(`未注册年级: ${gid}`);
  const mod = await loader();
  const grade = mod.default || mod;
  _cache.set(gid, grade);
  return grade;
}

export function listRegistered() {
  return [..._loaders.keys()];
}

export function getCurrentGradeId() {
  try {
    if (typeof globalThis.__memCachePeek === 'function') {
      return globalThis.__memCachePeek('grade3_current_grade') || '3';
    }
    return localStorage.getItem('grade3_current_grade') || '3';
  } catch {
    return '3';
  }
}