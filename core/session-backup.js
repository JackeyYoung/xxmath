/* core/session-backup.js */
import { lsGet, lsSet, lsKeysByPrefix, flushStorage } from './storage.js';
import { SESSION_BACKUP_KEY } from './keys.js';

const LS_KEYS = [
  'grade3_wrong_book_v1',
  'grade3_practice_history_v1',
  'grade3_student_name',
  'grade3_wrong_reasons_v1',
  'grade3_timer_challenge',
  'grade3_sound_on',
];

let _restoringFromSession = false;

function backupToSession() {
  if (_restoringFromSession) return;
  const data = {};
  LS_KEYS.forEach(k => {
    try { const v = lsGet(k); if (v != null) data[k] = v; } catch (e) {}
  });
  lsKeysByPrefix('grade3_takeaway_').forEach(k => { data[k] = lsGet(k); });
  try { sessionStorage.setItem(SESSION_BACKUP_KEY, JSON.stringify(data)); } catch (e) {}
}

async function restoreFromSession() {
  let data;
  try { data = JSON.parse(sessionStorage.getItem(SESSION_BACKUP_KEY) || '{}'); } catch (e) { return false; }
  const keys = Object.keys(data);
  if (!keys.length) return false;
  keys.forEach(k => { try { lsSet(k, data[k]); } catch (e) {} });
  try { await flushStorage(); } catch (e) {}
  return true;
}

function checkRestore() {
  try {
    const hasAny = lsKeysByPrefix('grade3_').length > 0;
    if (hasAny) return;
    const sessionRaw = sessionStorage.getItem(SESSION_BACKUP_KEY);
    if (!sessionRaw) return;
    const data = JSON.parse(sessionRaw);
    if (!Object.keys(data).length) return;

    const bar = document.createElement('div');
    bar.className = 'backup-restore-bar';
    bar.innerHTML = `
      ⚠️ 检测到上次会话数据，是否恢复？
      <div style="display:flex;gap:8px;margin-left:auto;">
        <button class="backup-restore-no" id="backupNo">忽略</button>
        <button class="backup-restore-yes" id="backupYes">恢复</button>
      </div>
    `;
    document.body.appendChild(bar);
    document.getElementById('backupYes').addEventListener('click', async () => {
      _restoringFromSession = true;
      try { await restoreFromSession(); await flushStorage(); }
      finally { _restoringFromSession = false; }
      location.reload();
    });
    document.getElementById('backupNo').addEventListener('click', () => {
      sessionStorage.removeItem(SESSION_BACKUP_KEY);
      bar.remove();
    });
  } catch (e) {}
}

export function installSessionBackup() {
  setInterval(backupToSession, 30000);
  window.addEventListener('beforeunload', backupToSession);
  checkRestore();
}