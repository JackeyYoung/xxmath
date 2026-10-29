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
    // ⭐ 使用全局 navigate 直接跳转到 lesson/m13
    if (window.__shell?.navigate) {
      window.__shell.navigate('lesson', { lessonId: 'm13' });
    }
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

  const close = () => { 
    sessionStorage.setItem('grade3_daily_suggest_shown', '1'); 
    card.remove(); 
  };
  
  document.getElementById('dailySuggestClose').addEventListener('click', close);
  card.querySelector('.daily-suggest-later').addEventListener('click', close);
  card.querySelector('.daily-suggest-go').addEventListener('click', () => {
    close();
    // ⭐ 使用全局 navigate 跳转到具体的知识岛
    if (window.__shell?.navigate) {
      window.__shell.navigate('lesson', { lessonId: targetModule });
    }
  });
}

function showDailyComplete({ total, correct, rate }) {
  if (document.querySelector('.daily-complete-mask')) return;
  
  // 使用统一的遮罩和弹窗类名，不再硬编码内联样式
  const mask = document.createElement('div');
  mask.className = 'daily-complete-mask'; 
  mask.innerHTML = `
    <div class="daily-complete-card">
      <div class="daily-complete-emoji">🎉</div>
      <div class="daily-complete-title">今日目标完成！</div>
      <div class="daily-complete-body">
        今天做了 <b>${total}</b> 道题，<br>
        正确 <b>${correct}</b> 道，正确率 <b>${rate}%</b>
      </div>
      <div class="daily-complete-actions">
        <button id="dailyCompleteRest" class="daily-complete-rest">休息一下</button>
        <button id="dailyCompleteMore" class="daily-complete-go">再来几题</button>
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