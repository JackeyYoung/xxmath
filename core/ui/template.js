/* core/ui/template.js —— 模板查询的唯一入口（S3）

原本 14 个模块各自写 document.getElementById('tpl-mX')：
  · 散落 14 处全局 id 查询
  · 每次模块挂载都重新查一遍 DOM

收敛到这里，并加一层缓存（<template> 元素在整个应用生命周期里不会变）。
*/
const _cache = new Map();

/** 取 <template id="tpl-xxx">；找不到返回 null */
export function getTemplate(id) {
  if (_cache.has(id)) return _cache.get(id);
  const el = document.getElementById(id);
  if (el) _cache.set(id, el);
  return el;
}

/** 清缓存（理论上不需要；留作测试/热重载用） */
export function clearTemplateCache() { _cache.clear(); }
