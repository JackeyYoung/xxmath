/* core/ui/dialog.js —— WebView 友好的对话框（M12）

   为什么不用 alert / confirm / prompt：
   1. WKWebView（Capacitor 打包后就是它）里原生弹窗会**阻塞 JS 线程**，动画卡住；
   2. `prompt` 在 iOS 上会被软键盘遮挡，而且拿不到「取消」与「输入空串」的区别；
   3. 原生弹窗样式不可控，深色模式下是刺眼的白框。

   这里全换成 Promise 版本，走主题变量，深色模式自动跟随。
   用法：
     await showAlert('保存失败')
     if (!(await showConfirm('确定删除？'))) return
     const text = await showPrompt('回一句…', '默认值')
*/
function el(tag, cls, css) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (css) n.style.cssText = css;
  return n;
}

function open({ title, message, input, defaultValue = '', okText = '确定', cancelText = '取消', danger = false }) {
  return new Promise((resolve) => {
    const mask = el('div', 'dialog-mask', [
      'position:fixed', 'inset:0', 'z-index:10030',
      'background:rgba(15,23,42,.55)', 'backdrop-filter:blur(2px)',
      'display:flex', 'align-items:center', 'justify-content:center', 'padding:20px',
    ].join(';'));

    const card = el('div', 'dialog-card', [
      'background:var(--card)', 'color:var(--text)',
      'border-radius:20px', 'padding:22px 20px 18px',
      'width:100%', 'max-width:360px',
      'box-shadow:0 20px 60px rgba(15,23,42,.3)',
      'animation:dialogPop .2s cubic-bezier(.34,1.3,.64,1)',
    ].join(';'));

    if (title) {
      const h = el('div', 'dialog-title', 'font-size:16px;font-weight:800;margin-bottom:8px;');
      h.textContent = title;
      card.appendChild(h);
    }

    const body = el('div', 'dialog-body', 'font-size:14px;line-height:1.7;color:var(--text-soft);white-space:pre-wrap;');
    body.textContent = message || '';
    card.appendChild(body);

    let inputEl = null;
    if (input) {
      inputEl = el('textarea', 'dialog-input', [
        'width:100%', 'min-height:70px', 'margin-top:12px', 'padding:10px 12px',
        'border:2px solid var(--border)', 'border-radius:10px',
        'background:var(--input-bg)', 'color:var(--text-soft)',
        'font-size:14px', 'font-family:inherit', 'outline:none', 'resize:vertical', 'box-sizing:border-box',
      ].join(';'));
      inputEl.value = defaultValue;
      card.appendChild(inputEl);
    }

    const row = el('div', 'dialog-actions', 'display:flex;gap:10px;margin-top:18px;');

    const cancel = el('button', 'dialog-cancel', [
      'flex:1', 'padding:12px', 'border:none', 'border-radius:12px',
      'background:var(--border-soft)', 'color:var(--text-soft)',
      'font-size:14px', 'font-weight:700', 'font-family:inherit', 'cursor:pointer',
    ].join(';'));
    cancel.textContent = cancelText;

    const ok = el('button', 'dialog-ok', [
      'flex:1', 'padding:12px', 'border:none', 'border-radius:12px',
      'background:' + (danger ? '#dc2626' : '#2563eb'), 'color:#fff',
      'font-size:14px', 'font-weight:700', 'font-family:inherit', 'cursor:pointer',
      'box-shadow:0 3px 0 ' + (danger ? '#b91c1c' : '#1d4ed8'),
    ].join(';'));
    ok.textContent = okText;

    row.appendChild(cancel);
    if (input || cancelText) row.appendChild(ok);
    card.appendChild(row);
    mask.appendChild(card);
    document.body.appendChild(mask);

    // 有输入框时：显示键盘后底部按钮可能被顶住，滚动到可视区
    if (inputEl) {
      setTimeout(() => {
        try { inputEl.focus({ preventScroll: true }); inputEl.scrollIntoView({ block: 'center' }); }
        catch (e) { inputEl.focus(); }
      }, 120);
    } else {
      setTimeout(() => { try { ok.focus(); } catch (e) {} }, 60);
    }

    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      mask.remove();
      resolve(val);
    };

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); finish(input ? null : false); }
      else if (e.key === 'Enter' && (input ? (e.metaKey || e.ctrlKey) : true)) {
        e.preventDefault();
        finish(input ? inputEl.value : true);
      }
    }
    document.addEventListener('keydown', onKey, true);

    cancel.onclick = () => finish(input ? null : false);
    ok.onclick = () => finish(input ? inputEl.value : true);
    mask.addEventListener('click', (e) => { if (e.target === mask) finish(input ? null : false); });
  });
}

/** 只有一个「确定」按钮 */
export function showAlert(message, opts = {}) {
  return open({ ...opts, message, cancelText: '', okText: opts.okText || '知道了' });
}

/** 返回 true/false */
export function showConfirm(message, opts = {}) {
  return open({ ...opts, message, okText: opts.okText || '确定', cancelText: opts.cancelText || '取消' });
}

/** 返回字符串；点取消返回 null */
export function showPrompt(message, defaultValue = '', opts = {}) {
  return open({ ...opts, message, input: true, defaultValue, okText: opts.okText || '保存', cancelText: opts.cancelText || '取消' });
}
