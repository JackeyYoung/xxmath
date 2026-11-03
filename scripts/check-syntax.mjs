/* scripts/check-syntax.mjs —— 全项目语法自检（L3）
 *
 * 为什么要它：这个项目是原生 ESM、没有打包器，
 * 一个手滑的括号错误只有在浏览器里打开那个模块时才会暴露。
 * 这条命令把所有 .js 过一遍 `node --check`，几秒钟跑完。
 *
 * 用法：node scripts/check-syntax.mjs    （或 pnpm run check）
 */
import { readdirSync, statSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = resolve(import.meta.dirname, '..')
const SKIP_DIR = new Set(['node_modules', '.git', '备份1028', '占位备份', 'vendor', 'cloudbase'])

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (SKIP_DIR.has(n)) continue
    const full = join(dir, n)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (n.endsWith('.js') || n.endsWith('.mjs')) out.push(full)
  }
  return out
}

const files = walk(ROOT)
let bad = 0
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' })
  } catch (e) {
    bad++
    console.error(`  ✗ ${relative(ROOT, f)}`)
    const msg = String(e.stderr || '').split('\n').slice(0, 4).join('\n')
    if (msg) console.error(msg.replace(/^/gm, '    '))
  }
}

console.log(`\n语法检查：${files.length} 个文件，${bad} 个失败`)
process.exit(bad ? 1 : 0)
