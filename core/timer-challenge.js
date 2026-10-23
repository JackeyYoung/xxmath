/* core/timer-challenge.js */
import { lsGet, lsSet } from './storage.js';
import { TIMER_CHALLENGE_KEY } from './keys.js';
import { SFX } from './sfx.js';

export const TIMER_CHALLENGE = {
  enabled: false,
  records: {},
  _timer: null,
  _startAt: 0,
  _curModule: null,
  _onFinish: null,
};

try {
  const saved = lsGet(TIMER_CHALLENGE_KEY);
  if (saved) TIMER_CHALLENGE.records = JSON.parse(saved);
} catch (e) {}

function toggle(enabled) {
  TIMER_CHALLENGE.enabled = !!enabled;
  try { lsSet(TIMER_CHALLENGE_KEY, JSON.stringify(TIMER_CHALLENGE.records)); } catch (e) {}
  document.querySelectorAll('.timer-challenge-display').forEach(el => {
    el.style.display = enabled ? '' : 'none';
  });
}

export function timerChallengeStart(moduleId, onFinish) {
  if (!TIMER_CHALLENGE.enabled) return;
  if (TIMER_CHALLENGE._timer) clearInterval(TIMER_CHALLENGE._timer);
  TIMER_CHALLENGE._curModule = moduleId;
  TIMER_CHALLENGE._startAt = Date.now();
  TIMER_CHALLENGE._onFinish = onFinish;
  const el = document.querySelector(`#${moduleId} .timer-challenge-display`);
  if (!el) return;
  el.classList.remove('warn', 'danger');
  TIMER_CHALLENGE._timer = setInterval(() => {
    const seconds = Math.floor((Date.now() - TIMER_CHALLENGE._startAt) / 1000);
    el.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (seconds >= 60) el.classList.add('danger');
    else if (seconds >= 30) el.classList.add('warn');
  }, 200);
}

export function timerChallengeFinish(moduleId) {
  if (!TIMER_CHALLENGE.enabled) return;
  if (TIMER_CHALLENGE._timer) clearInterval(TIMER_CHALLENGE._timer);
  const seconds = Math.floor((Date.now() - TIMER_CHALLENGE._startAt) / 1000);
  if (!TIMER_CHALLENGE.records[moduleId]) TIMER_CHALLENGE.records[moduleId] = [];
  TIMER_CHALLENGE.records[moduleId].push(seconds);
  if (TIMER_CHALLENGE.records[moduleId].length > 20) TIMER_CHALLENGE.records[moduleId].shift();
  try { lsSet(TIMER_CHALLENGE_KEY, JSON.stringify(TIMER_CHALLENGE.records)); } catch (e) {}
  if (TIMER_CHALLENGE._onFinish) TIMER_CHALLENGE._onFinish(seconds);
  updateStat(moduleId);
}

function updateStat(moduleId) {
  const el = document.querySelector(`#${moduleId} .timer-challenge-stat`);
  if (!el) return;
  const arr = TIMER_CHALLENGE.records[moduleId] || [];
  if (!arr.length) { el.textContent = '暂无记录'; return; }
  const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  const best = Math.min(...arr);
  el.innerHTML = `最佳 <b>${best}s</b> · 平均 <b>${avg}s</b> · ${arr.length} 次`;
}

function patchTimerChallenge() {
  ['m1', 'm9'].forEach(id => {
    const card = document.querySelector(`#${id} .card`);
    if (!card || card.querySelector('.timer-challenge-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'timer-challenge-bar';
    bar.innerHTML = `
      <label class="timer-challenge-toggle">
        <input type="checkbox" data-timer-toggle="${id}"> ⚡ 计时挑战
      </label>
      <div class="timer-challenge-display" data-timer-display="${id}" style="display:none;">00:00</div>
      <div class="timer-challenge-stat" data-timer-stat="${id}">暂无记录</div>
    `;
    const h2 = card.querySelector('h2');
    if (h2) h2.after(bar); else card.insertBefore(bar, card.firstChild);
    bar.querySelector(`input[data-timer-toggle="${id}"]`).addEventListener('change', e => {
      if (e.target.checked) {
        toggle(true);
        bar.querySelectorAll('input[data-timer-toggle]').forEach(x => { if (x !== e.target) x.checked = true; });
      } else {
        const anyOn = [...document.querySelectorAll('input[data-timer-toggle]')].some(x => x.checked);
        if (!anyOn) toggle(false);
      }
      document.querySelectorAll('.timer-challenge-display').forEach(el => {
        el.style.display = TIMER_CHALLENGE.enabled ? '' : 'none';
      });
    });
    updateStat(id);
  });

  if (TIMER_CHALLENGE.enabled) {
    document.querySelectorAll('input[data-timer-toggle]').forEach(x => x.checked = true);
    document.querySelectorAll('.timer-challenge-display').forEach(el => el.style.display = '');
  }
}

export function installTimerChallenge() {
  patchTimerChallenge();
}