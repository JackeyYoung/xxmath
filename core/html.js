/* core/html.js
   统一转义 + html`` 模板
*/

const ESCAPE_MAP = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;',
  '"': '&quot;', "'": '&#39;',
};

export function escapeHtmlStrict(v) {
  if (v == null) return '';
  return String(v).replace(/[&<>"']/g, ch => ESCAPE_MAP[ch]);
}

/* 兼容旧名 */
export const escapeHtml = escapeHtmlStrict;

export function raw(s) {
  return { __htmlRaw: true, value: String(s ?? '') };
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v && typeof v === 'object' && v.__htmlRaw) {
      out += v.value;
    } else if (Array.isArray(v)) {
      out += v.map(x => (x && x.__htmlRaw) ? x.value : escapeHtmlStrict(x)).join('');
    } else {
      out += escapeHtmlStrict(v);
    }
    out += strings[i + 1];
  }
  return out;
}

/* 属性转义（给 value="" 用） */
export function escapeAttr(v) {
  return escapeHtmlStrict(v);
}