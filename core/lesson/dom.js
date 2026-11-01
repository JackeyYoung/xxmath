/* core/lesson/dom.js
   底座 ④：<FormulaSteps> 这类列表渲染的最小等价物。

   解决的问题（报告 M3）：模块靠 innerHTML 拼 HTML 字符串。
   el() 用 textContent 装文本，天然免疫注入；replaceChildren() 只换目标节点，
   不再整块重建整棵树，将来接 Vue 的 v-for 时结构一一对应。
*/

/**
 * el('div', { class: 'x', text: 'hi', onClick: fn }, child1, child2)
 * 约定：text 走 textContent（安全）；需要富文本时显式用 html（危险，慎用）
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);

  Object.keys(attrs || {}).forEach((k) => {
    const v = attrs[k];
    if (v == null || v === false) return;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.length > 2 && k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else node.setAttribute(k, v);
  });

  children.flat(Infinity).forEach((c) => {
    if (c == null || c === false || c === '') return;
    node.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  });

  return node;
}

/** 清空一个节点（等价于 innerHTML = ''，但不解析 HTML） */
export function clear(node) {
  if (node) node.replaceChildren();
}

/** 用新节点整体替换某个子树的子节点 */
export function replace(node, ...children) {
  if (!node) return;
  node.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));
}
