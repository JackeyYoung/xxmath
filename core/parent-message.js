/* core/parent-message.js
   家长留言：家长可以在孩子做题时留一句话，孩子下次打开时看到
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

/** 家长留一条消息 */
export function msgAdd({ text, from = '家长', emoji = '❤️' }) {
  if (!text || !text.trim()) return null;
  const list = msgLoad();
  const msg = {
    id: 'pm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    text: text.trim(),
    from,
    emoji,
    at: Date.now(),
    read: false,   // 孩子是否已读
  };
  list.unshift(msg);
  if (list.length > 20) list.length = 20;
  msgSave(list);
  return msg;
}

/** 未读消息 */
export function msgUnread() {
  return msgLoad().filter(m => !m.read);
}

/** 标记已读 */
export function msgMarkRead(id) {
  const list = msgLoad();
  const idx = list.findIndex(m => m.id === id);
  if (idx < 0) return;
  list[idx].read = true;
  msgSave(list);
}

/** 全部标记已读 */
export function msgMarkAllRead() {
  const list = msgLoad().map(m => ({ ...m, read: true }));
  msgSave(list);
}

/** 孩子回一句 */
export function msgReply(id, replyText) {
  if (!replyText || !replyText.trim()) return;
  const list = msgLoad();
  const idx = list.findIndex(m => m.id === id);
  if (idx < 0) return;
  list[idx].reply = replyText.trim();
  list[idx].repliedAt = Date.now();
  msgSave(list);
}