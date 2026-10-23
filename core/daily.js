/* core/daily.js */
import { lsGet, lsSet } from './storage.js';
import { DAILY_CHEER_KEY } from './keys.js';
import { historyLoad } from './history.js';
import { on, EVT } from './events.js';
import { autoTagsFor } from './wrongbook-tags.js';

const MODULE_MAP = {
  '两步应用题': 'm13', '面积周长': 'm5', '倍数关系': 'm8',
  '时间推算': 'm7', '单位换算': 'm4', '乘除运算': 'm1',
  '质量单位': 'm12', '分数': 'm3',
};

function patchDailyCheer() {
  const today = new Date().toISOString().slice(0, 10);
  try { if (lsGet(DAILY_CHEER_KEY) === today) return; } catch (e) {}

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayList = historyLoad().filter(r => r.timestamp >= todayStart.getTime());
  if (todayList.length < 5) return;

  try { lsSet(DAILY_CHEER_KEY, today); } catch (e) {}

  const cheer = document.createElement('div');
  cheer.className = 'daily-cheer';
  cheer.innerHTML = `
    <span>🎉 今天已经完成 <b>${todayList.length}</b> 道题，很棒！</span>
    <div class="daily-cheer-actions">
      <button class="daily-cheer-btn daily-cheer-rest">休息一下</button>
      <button class="daily-cheer-btn daily-cheer-go">继续加油</button>
    </div>
  `;
  document.body.appendChild(cheer);
  cheer.querySelector('.daily-cheer-rest').addEventListener('click', () => cheer.remove());
  cheer.querySelector('.daily-cheer-go').addEventListener('click', () => {
    cheer.remove();
    document.querySelector('.tab[data-target="m13"]')?.click();
  });
  setTimeout(() => { if (cheer.parentElement) cheer.remove(); }, 15000);
}

function patchDailySuggest() {
  if (sessionStorage.getItem('grade3_daily_suggest_shown') === '1') return;

  const history = historyLoad();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  if (history.some(r => r.timestamp >= todayStart.getTime())) return;

  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const recent = history.filter(r => r.timestamp >= sevenDaysAgo && !r.isCorrect);
  const tagCount = {};
  recent.forEach(r => autoTagsFor(r.problemText).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
  const topTag = Object.entries(tagCount).sort((a, b) => b[1] - a[1])[0];
  if (!topTag) return;
  const targetModule = MODULE_MAP[topTag[0]];
  if (!targetModule) return;

  const card = document.createElement('div');
  card.className = 'daily-suggest';
  card.innerHTML = `
    <button class="daily-suggest-close" id="dailySuggestClose">×</button>
    <div class="daily-suggest-hd">📅 每日一练推荐</div>
    <div class="daily-suggest-body">
      最近你「<b>${topTag[0]}</b>」错了 <b>${topTag[1]}</b> 次。<br>要不要先练 3 道，把它攻克？💪
    </div>
    <div class="daily-suggest-actions">
      <button class="daily-suggest-later">稍后</button>
      <button class="daily-suggest-go">开始练习</button>
    </div>
  `;
  document.body.appendChild(card);
  const close = () => { sessionStorage.setItem('grade3_daily_suggest_shown', '1'); card.remove(); };
  document.getElementById('dailySuggestClose').addEventListener('click', close);
  card.querySelector('.daily-suggest-later').addEventListener('click', close);
  card.querySelector('.daily-suggest-go').addEventListener('click', () => {
    close();
    document.querySelector(`.tab[data-target="${targetModule}"]`)?.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function showDailyComplete({ total, correct, rate }) {
  if (document.querySelector('.daily-complete-mask')) return;
  const mask = document.createElement('div');
  mask.className = 'daily-complete-mask';
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:10010;padding:20px;';
  mask.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:32px 28px 24px;width:380px;max-width:92vw;text-align:center;box-shadow:0 20px 60px rgba(15,23,42,.3);">
      <div style="font-size:56px;margin-bottom:8px;">🎉</div>
      <div style="font-size:20px;font-weight:800;color:#15803d;margin-bottom:8px;">今日目标完成！</div>
      <div style="font-size:14px;color:#64748b;line-height:1.8;margin-bottom:20px;">
        今天做了 <b style="color:#2563eb;">${total}</b> 道题，<br>
        正确 <b style="color:#15803d;">${correct}</b> 道，正确率 <b style="color:#2563eb;">${rate}%</b>
      </div>
      <div style="display:flex;gap:10px;">
        <button id="dailyCompleteRest" style="flex:1;padding:12px;border-radius:12px;font-weight:700;background:#f1f5f9;color:#475569;border:none;cursor:pointer;font-family:inherit;">休息一下</button>
        <button id="dailyCompleteMore" style="flex:1;padding:12px;border-radius:12px;font-weight:700;background:#2563eb;color:#fff;border:none;cursor:pointer;box-shadow:0 3px 0 #1d4ed8;font-family:inherit;">再来几题</button>
      </div>
    </div>
  `;
  document.body.appendChild(mask);
  document.getElementById('dailyCompleteRest').addEventListener('click', () => {
    mask.remove();
    import('../../app/shell.js').then(({ navigate }) => navigate('home'));
  });
  document.getElementById('dailyCompleteMore').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
}

function hookDailyComplete() {
  let shown = false;
  on(EVT.DATA_CHANGED, (payload) => {
    if (payload.source !== 'history' || shown) return;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayRecords = historyLoad().filter(r => r.timestamp >= todayStart.getTime());
    if (todayRecords.length < 5) return;
    if (sessionStorage.getItem('grade3_daily_complete_shown') === '1') return;
    sessionStorage.setItem('grade3_daily_complete_shown', '1');
    shown = true;
    const correct = todayRecords.filter(r => r.isCorrect).length;
    showDailyComplete({ total: todayRecords.length, correct, rate: Math.round(correct / todayRecords.length * 100) });
  });
}

export function installDaily() {
  patchDailyCheer();
  patchDailySuggest();
  hookDailyComplete();
}