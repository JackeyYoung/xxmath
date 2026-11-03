/* app/views/settings.js —— 设置页（Vue 组件）

   S3/M3：原来是「拼 innerHTML 再用 getElementById 回来绑事件」，12 个全局 id。
   现在改成 store + 模板，只剩两个挂载点（settingsHeader / settingsStage）。
*/
import { createApp, defineComponent, shallowReactive } from '../../js/vendor/vue.esm-browser.prod.js';
import { getErrorLog } from '../../core/errors.js';
import { showAlert, showPrompt } from '../../core/ui/dialog.js';
import { clearParentPin, hasParentPin, setParentPin, isValidPin } from '../../core/parent-pin.js';
import { lsGet, lsSet, getStorageHealth } from '../../core/storage.js';
import { getCurrentUser } from '../../core/sync/auth.js';
import { getSyncState } from '../../core/sync/sync-manager.js';
import { targetLoad, targetReset, targetSave } from '../../core/target.js';
import { showToast } from '../../core/toast.js';
import { navigate } from '../router.js';
import { openSyncSetupModal } from '../sync-setup-ui.js';
import { refreshHomeTasks } from '../views/home.js';

const TARGET_ROWS = [
  { key: 'dailyQuestions', label: '每天做题', min: 1, max: 20, unit: '道' },
  { key: 'dailyStreak', label: '每天连对', min: 1, max: 10, unit: '题' },
  { key: 'dailyMastered', label: '每天掌握', min: 1, max: 5, unit: '题' },
  { key: 'weeklyQuestions', label: '每周做题', min: 5, max: 100, unit: '道' },
  { key: 'wrongReview', label: '每天复习错题', min: 0, max: 10, unit: '道' },
];

const store = shallowReactive({
  rows: TARGET_ROWS,
  targets: {},
  loggedIn: false,
  accountName: '',
  syncState: 'idle',
  storageOk: true,
  storageFailCount: 0,
  recentErrors: 0,
  soundOn: false,
  isDark: false,
  pinSet: false,
});

function readTheme() {
  try {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  } catch (e) { return false; }
}

function refreshStore() {
  const targets = targetLoad();
  store.targets = { ...targets };
  const health = getStorageHealth();
  store.storageOk = !!health.ok;
  store.storageFailCount = health.failCount || 0;
  store.syncState = getSyncState();

  let user = null;
  try {
    user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  } catch (e) { user = null; }
  store.loggedIn = !!user;
  store.accountName = (user && (user.nickName || user.uid || user.customUserId)) || '';

  store.recentErrors = getErrorLog().filter((e) => Date.now() - e.at < 7 * 86400000).length;
  store.soundOn = lsGet('grade3_sound_on') === '1';
  store.isDark = readTheme();
  store.pinSet = hasParentPin();
}

/* ---------------- 交互 ---------------- */

function goHome() { navigate('home'); }

function onTargetInput(key, ev) {
  const v = parseInt(ev && ev.target ? ev.target.value : '', 10);
  store.targets[key] = Number.isFinite(v) ? v : store.targets[key];
}

function saveTargets() {
  const next = { ...targetLoad() };
  for (const row of TARGET_ROWS) {
    const v = parseInt(store.targets[row.key], 10);
    next[row.key] = Number.isFinite(v) ? Math.min(row.max, Math.max(row.min, v)) : next[row.key];
  }
  targetSave(next);
  try { refreshHomeTasks(); } catch (e) {}
  showToast('✅ 目标已保存', 'success');
}

function resetTargets() {
  targetReset();
  refreshStore();
  try { refreshHomeTasks(); } catch (e) {}
  showToast('✅ 已恢复默认', 'success');
}

function openAccount() { openSyncSetupModal(); }

function toggleSound() {
  const next = !store.soundOn;
  lsSet('grade3_sound_on', next ? '1' : '0');
  store.soundOn = next;
  showToast(next ? '🔊 音效已开启' : '🔇 音效已关闭', 'success');
}

function toggleTheme() {
  const next = store.isDark ? 'light' : 'dark';
  try { document.documentElement.setAttribute('data-theme', next); } catch (e) {}
  lsSet('grade3_theme', next);   // S8：走存储层（记录 updatedAt，云端合并才能判新旧）
  store.isDark = next === 'dark';
  showToast(next === 'dark' ? '🌙 已切换为深色模式' : '☀️ 已切换为浅色模式', 'success');
}

function showErrors() {
  const log = getErrorLog().slice(-10);
  showAlert(log.map((e) => `[${new Date(e.at).toLocaleTimeString('zh-CN')}] ${e.scope}: ${e.message}`).join('\n'));
}

/* 9.7：家长密码（4 位 PIN） */
async function changePin() {
  const tip = store.pinSet
    ? '输入新的 4 位数字 PIN（用于进入家长区）'
    : '设置一个 4 位数字 PIN（用于进入家长区）';
  const v = await showPrompt(tip, '');
  if (v === null) return;
  const pin = String(v).trim();
  if (!isValidPin(pin)) {
    showAlert('PIN 必须是 4 位数字，例如 1234');
    return;
  }
  setParentPin(pin);
  store.pinSet = true;
  showToast('✅ 家长密码已设置', 'success');
}

async function removePin() {
  const ok = await showPrompt('输入当前 PIN 以确认移除', '');
  if (ok === null) return;
  const { verifyParentSecret } = await import('../../core/parent-pin.js');
  if (!verifyParentSecret(ok)) {
    showAlert('PIN 不对，未做修改');
    return;
  }
  clearParentPin();
  store.pinSet = false;
  showToast('✅ 已移除家长密码（进入家长区将退回旧规则）', 'success');
}

/* ---------------- 组件 ---------------- */

const HeaderView = defineComponent({
  name: 'SettingsHeader',
  setup() { return { goHome }; },
  template: `
<button class="lesson-back" @click="goHome">←</button>
<div class="lesson-title">⚙️ 设置</div>
<div style="width:36px"></div>
  `,
});

const SettingsView = defineComponent({
  name: 'SettingsView',
  setup() {
    return { s: store, onTargetInput, saveTargets, resetTargets, openAccount, toggleSound, toggleTheme, showErrors, changePin, removePin };
  },
  template: `
<div class="settings-wrap">

  <div class="settings-section">
    <div class="settings-section-hd">
      <span class="settings-section-icon">🎯</span>
      <span class="settings-section-title">学习目标</span>
      <span class="settings-section-desc">家长可以调整</span>
    </div>
    <div class="settings-section-body">
      <div v-for="t in s.rows" :key="t.key" class="settings-row">
        <span class="settings-label">{{ t.label }}</span>
        <input type="number" class="settings-input"
               :value="s.targets[t.key]" :min="t.min" :max="t.max"
               @input="onTargetInput(t.key, $event)">
        <span class="settings-unit">{{ t.unit }}</span>
      </div>
      <div class="settings-row-actions">
        <button class="settings-btn-secondary" @click="resetTargets">恢复默认</button>
        <button class="settings-btn-primary" @click="saveTargets">保存</button>
      </div>
    </div>
  </div>

  <div class="settings-section">
    <div class="settings-section-hd">
      <span class="settings-section-icon">☁️</span>
      <span class="settings-section-title">数据与同步</span>
    </div>
    <div class="settings-section-body">
      <div class="settings-row">
        <span class="settings-label">账号</span>
        <span class="settings-status" :class="s.loggedIn ? 'ok' : 'err'">
          {{ s.loggedIn ? ('✅ 已登录' + (s.accountName ? '：' + s.accountName.slice(0, 12) : '')) : '⚠️ 未登录' }}
        </span>
        <button class="settings-btn-secondary" @click="openAccount">管理账号</button>
      </div>
      <div class="settings-row">
        <span class="settings-label">云同步状态</span>
        <span class="settings-status" :class="{ ok: s.syncState === 'idle' }">
          {{ s.syncState === 'idle' ? '✅ 已同步' : (s.syncState === 'syncing' ? '⏳ 同步中' : '⚠️ 未同步') }}
        </span>
      </div>
      <div class="settings-row">
        <span class="settings-label">本地存储状态</span>
        <span class="settings-status" :class="s.storageOk ? 'ok' : 'err'">
          {{ s.storageOk ? '✅ 正常' : ('⚠️ 失败 ' + s.storageFailCount + ' 次') }}
        </span>
      </div>
      <div v-if="s.recentErrors" class="settings-row">
        <span class="settings-label">最近错误</span>
        <span class="settings-status err">{{ s.recentErrors }} 个</span>
        <button class="settings-btn-secondary" @click="showErrors">查看</button>
      </div>
    </div>
  </div>

  <div class="settings-section">
    <div class="settings-section-hd">
      <span class="settings-section-icon">🔊</span>
      <span class="settings-section-title">体验</span>
    </div>
    <div class="settings-section-body">
      <div class="settings-row">
        <span class="settings-label">音效</span>
        <button class="settings-toggle" :class="{ on: s.soundOn }" @click="toggleSound">
          {{ s.soundOn ? '🔊 已开启' : '🔇 已关闭' }}
        </button>
      </div>
      <div class="settings-row" style="margin-top:12px;">
        <span class="settings-label">深色模式</span>
        <button class="settings-toggle" :class="{ on: s.isDark }" @click="toggleTheme">
          {{ s.isDark ? '🌙 深色' : '☀️ 浅色' }}
        </button>
      </div>
    </div>
  </div>

  <div class="settings-section">
    <div class="settings-section-hd">
      <span class="settings-section-icon">🔒</span>
      <span class="settings-section-title">家长密码</span>
      <span class="settings-section-desc">4 位数字，挡住孩子误入</span>
    </div>
    <div class="settings-section-body">
      <div class="settings-row">
        <span class="settings-label">当前状态</span>
        <span class="settings-status" :class="s.pinSet ? 'ok' : ''">
          {{ s.pinSet ? '✅ 已设置' : '未设置（沿用旧规则）' }}
        </span>
      </div>
      <div class="settings-row-actions">
        <button v-if="s.pinSet" class="settings-btn-secondary" @click="removePin">移除密码</button>
        <button class="settings-btn-primary" @click="changePin">{{ s.pinSet ? '修改 PIN' : '设置 PIN' }}</button>
      </div>
    </div>
  </div>

  <div class="settings-section">
    <div class="settings-section-hd">
      <span class="settings-section-icon">ℹ️</span>
      <span class="settings-section-title">关于</span>
    </div>
    <div class="settings-section-body">
      <div class="settings-row">
        <span class="settings-label">版本</span>
        <span class="settings-value">v1.0.0</span>
      </div>
    </div>
  </div>

</div>
  `,
});

/* ---------------- 挂载 ---------------- */

let _headerApp = null;
let _bodyApp = null;

export function renderSettings() {
  const hd = document.getElementById('settingsHeader');
  const stage = document.getElementById('settingsStage');
  if (!stage && !hd) return;

  refreshStore();

  if (hd && !_headerApp) {
    _headerApp = createApp(HeaderView);
    _headerApp.mount(hd);
  }
  if (stage && !_bodyApp) {
    _bodyApp = createApp(SettingsView);
    _bodyApp.mount(stage);
  }
}
