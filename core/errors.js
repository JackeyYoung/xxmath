/* core/errors.js
   错误收集 + 全局捕获
*/

const ERROR_LOG = [];
const ERROR_LOG_MAX = 50;

export function logError(scope, err, extra) {
  const item = {
    scope,
    message: err && err.message ? err.message : String(err),
    stack: err && err.stack ? err.stack : '',
    extra: extra || null,
    at: Date.now(),
  };
  ERROR_LOG.push(item);
  if (ERROR_LOG.length > ERROR_LOG_MAX) ERROR_LOG.shift();
  console.error(`[${scope}]`, err, extra || '');
  return item;
}

export function getErrorLog() {
  return ERROR_LOG.slice();
}

export function installGlobalErrorHandlers() {
  window.addEventListener('error', e => {
      const err = e.error || new Error(e.message || 'Unknown error');
      logError('window.error', err, {
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
      });
    });
  window.addEventListener('unhandledrejection', e => {
    logError('unhandledrejection', e.reason);
  });
}