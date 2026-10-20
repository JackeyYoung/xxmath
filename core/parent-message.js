/* core/parent-message.js
   留言板：家长和孩子互相留言，可选关联题目
*/
import { lsGet, lsSet } from './storage.js';
import { getGradeKey } from './keys.js';
import { emit, EVT } from './events.js';

function getMsgKey() {
  return getGradeKey('parent_messages_v1');
}

export function msgLoad() {
  try {
    const raw = lsGet(getMsgKey());
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function msgSave(list) {
  try {
    lsSet(getMsgKey(), JSON.stringify(list));
  } catch (e) {}
  emit(EVT.DATA_CHANGED, { source: 'parent-message' });
}

/** 留一条留言 */
export function msgAdd({ text, from = '家长', emoji = '❤️', linkedProblem = null }) {
  if (!text || !text.trim()) return null;
  const list = msgLoad();
  const msg = {
    id: 'pm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    text: text.trim(),
    from,
    emoji,
    at: Date.now(),
    read: false,
    reply: null,
    repliedAt: null,
    // ⭐ 新增：关联题目（可选）
    linkedProblem: linkedProblem ? {
      text: linkedProblem.text || '',
      answer: linkedProblem.answer || '',
      moduleId: linkedProblem.moduleId || '',
    } : null,
  };
  list.unshift(msg);
  if (list.length > 100) list.length = 100;
  msgSave(list);
  return msg;
}

/** 回一句（家长或孩子都可以回） */
export function msgReply(id, replyText) {
  if (!replyText || !replyText.trim()) return;
  const list = msgLoad();
  const idx = list.findIndex(m => m.id === id);
  if (idx < 0) return;
  list[idx].reply = replyText.trim();
  list[idx].repliedAt = Date.now();
  msgSave(list);
}

export function msgUnread() {
  return msgLoad().filter(m => !m.read);
}

export function msgMarkRead(id) {
  const list = msgLoad();
  const idx = list.findIndex(m => m.id === id);
  if (idx < 0) return;
  list[idx].read = true;
  msgSave(list);
}

export function msgMarkAllRead() {
  const list = msgLoad().map(m => ({ ...m, read: true }));
  msgSave(list);
}

/** ⭐ 按时间分组：今天 / 本周 / 本月 / 更早 */
export function msgGroupByTime() {
  const list = msgLoad();
  const now = new Date();

  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const dayOfWeek = todayStart.getDay() || 7;
  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - dayOfWeek + 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const groups = { today: [], week: [], month: [], earlier: [] };
  list.forEach(m => {
    if (m.at >= todayStart.getTime()) groups.today.push(m);
    else if (m.at >= weekStart.getTime()) groups.week.push(m);
    else if (m.at >= monthStart.getTime()) groups.month.push(m);
    else groups.earlier.push(m);
  });
  return groups;
}