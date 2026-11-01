/* core/ui/id-guard.js —— 重复 id 检测（S3 的运行期护栏）

S3 的病因是「全局 DOM id 契约」：184 处 document.getElementById 依赖 id 全局唯一。
id 一旦撞车（复制模板、两个模块都用 m5Challenge 之类），取到的会是**别人的节点**，
而且**静默**——不报错，只是行为诡异。

彻底修法是逐个 Vue 化（进行中）。在那之前，这个护栏能把「静默取错节点」
变成「控制台明确告警」，把最难查的一类 bug 提前暴露。

用法（只在调试时开，生产不跑）：
  import { startIdGuard } from './ui/id-guard.js';
  startIdGuard();                       // 或 startIdGuard({ intervalMs: 3000 })
  // 也可在控制台手动：window.__idGuard.report()
*/
const DEFAULT_OPTS = { intervalMs: 0, warnOnStart: true };

let _started = false;
let _timer = null;
let _lastSig = '';
const _seen = new Map();   // id → 首次发现时间

/** 扫描一次，返回 { duplicates: [{ id, count, selector }], total } */
export function scanDuplicateIds() {
  const map = new Map();
  let total = 0;
  const all = document.querySelectorAll('[id]');
  for (const el of all) {
    const id = el.id;
    if (!id) continue;
    total++;
    if (!map.has(id)) map.set(id, 0);
    map.set(id, map.get(id) + 1);
  }
  const duplicates = [];
  for (const [id, count] of map) {
    if (count > 1) {
      duplicates.push({ id, count, selector: '#' + id });
      if (!_seen.has(id)) _seen.set(id, Date.now());
    }
  }
  return { duplicates, total, unique: map.size };
}

/** 统计并打印（返回结果，便于测试） */
export function report() {
  const r = scanDuplicateIds();
  if (r.duplicates.length === 0) {
    console.log(`[id-guard] ✅ ${r.total} 个 id 全部唯一`);
    return r;
  }
  console.warn(`[id-guard] ⚠️ 发现 ${r.duplicates.length} 个重复 id（共 ${r.total} 个 id）`);
  for (const d of r.duplicates.slice(0, 20)) {
    console.warn(`  ${d.selector} 出现 ${d.count} 次 —— getElementById 只会拿到第一个，取错节点不会报错`);
  }
  if (r.duplicates.length > 20) console.warn(`  …还有 ${r.duplicates.length - 20} 个`);
  return r;
}

/**
 * 开始周期检测。
 * intervalMs = 0 表示只在启动时扫一次（默认，几乎零开销）。
 */
export function startIdGuard(opts = {}) {
  const o = { ...DEFAULT_OPTS, ...opts };
  if (_started) return;
  _started = true;

  if (o.warnOnStart) {
    // 等首屏 DOM 稳定后再扫
    setTimeout(() => { try { report(); } catch (e) {} }, 1500);
  }

  if (o.intervalMs > 0) {
    _timer = setInterval(() => {
      try {
        const r = scanDuplicateIds();
        const sig = r.duplicates.map((d) => d.id).sort().join(',');
        if (sig && sig !== _lastSig) {      // 只在「重复集合变化」时告警，避免刷屏
          _lastSig = sig;
          report();
        }
      } catch (e) { /* 护栏自身不能影响业务 */ }
    }, o.intervalMs);
  }
}

export function stopIdGuard() {
  if (_timer) clearInterval(_timer);
  _timer = null;
  _started = false;
}

// 方便在控制台手动触发：window.__idGuard.report()
if (typeof window !== 'undefined') {
  window.__idGuard = { report, scanDuplicateIds, start: startIdGuard, stop: stopIdGuard };
}
