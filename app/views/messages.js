/* app/views/messages.js —— 留言板（Vue 组件）

   S3/M3：原来是「拼 innerHTML → 再用 document.getElementById 回来找元素」，
   现在改成 shallowReactive store + 模板，挂载一次，之后靠 store 驱动重渲染。
   关联题目弹窗仍是命令式 DOM（模态，独立于本页生命周期），但查询改成 mask 内作用域查找。
*/
import { createApp, defineComponent, shallowReactive } from '../../js/vendor/vue.esm-browser.prod.js';
import { escapeHtmlStrict } from '../../core/html.js';
import { showPrompt } from '../../core/ui/dialog.js';
import { masteryLoad } from '../../core/mastery.js';
import { msgAdd, msgGroupByTime, msgMarkAllRead, msgReply } from '../../core/parent-message.js';
import { showToast } from '../../core/toast.js';
import { wbLoad } from '../../core/wrongbook.js';
import { navigate } from '../router.js';

const pad2 = (n) => String(n).padStart(2, '0');

const store = shallowReactive({
  identity: '家长',
  input: '',
  attach: null,          // { text, answer, moduleId }
  groups: [],            // [{ title, items: [...] }]
  empty: true,
});

/* ---------------- 数据 → 视图模型 ---------------- */

function decorate(m) {
  const d = new Date(m.at);
  const isParent = m.from === '家长';
  return {
    id: m.id,
    from: m.from,
    isParent,
    text: m.text,
    timeStr: `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
    linked: m.linkedProblem
      ? { text: m.linkedProblem.text || '', answer: m.linkedProblem.answer || '' }
      : null,
    reply: m.reply
      ? {
          text: m.reply,
          atStr: new Date(m.repliedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        }
      : null,
  };
}

function refreshStore() {
  const g = msgGroupByTime();
  const mk = (title, list) => (list && list.length ? { title, items: list.map(decorate) } : null);
  const groups = [mk('今天', g.today), mk('本周', g.week), mk('本月', g.month), mk('更早', g.earlier)].filter(Boolean);
  store.groups = groups;
  store.empty = groups.length === 0;
}

/* ---------------- 交互 ---------------- */

function setIdentity(id) {
  store.identity = id;
}

function send() {
  const text = String(store.input || '').trim();
  if (!text) { showToast('写一句再发吧', 'info'); return; }
  msgAdd({ text, from: store.identity, linkedProblem: store.attach });
  store.input = '';
  store.attach = null;
  refreshStore();
  showToast('✅ 已留言', 'success');
}

async function reply(m) {
  const text = await showPrompt('回一句…');
  if (text && text.trim()) {
    msgReply(m.id, text);
    refreshStore();
    showToast('✅ 已回复', 'success');
  }
}

function openAttach() {
  showAttachProblemModal((problem) => {
    store.attach = problem;
  });
}

function removeAttach() {
  store.attach = null;
}

function goHome() {
  navigate('home');
}

/* ---------------- 组件 ---------------- */

const HeaderView = defineComponent({
  name: 'MessagesHeader',
  setup() { return { goHome }; },
  template: `
<button class="lesson-back" @click="goHome">←</button>
<div class="lesson-title">💬 留言板</div>
<div style="width:36px"></div>
  `,
});

const MessagesView = defineComponent({
  name: 'MessagesView',
  setup() {
    return { s: store, setIdentity, send, reply, openAttach, removeAttach };
  },
  template: `
<div class="messages-wrap">
  <div class="msg-compose">
    <div class="msg-identity">
      <span class="msg-identity-label">我是：</span>
      <button class="msg-identity-btn" :class="{ active: s.identity === '家长' }" @click="setIdentity('家长')">👨‍👩‍👦 家长</button>
      <button class="msg-identity-btn" :class="{ active: s.identity === '孩子' }" @click="setIdentity('孩子')">👦 孩子</button>
    </div>

    <textarea v-model="s.input" placeholder="写一句…" maxlength="120"></textarea>

    <div class="msg-compose-actions">
      <button class="msg-attach-btn" @click="openAttach">📎 关联题目</button>
      <button class="msg-send-btn" @click="send">发送</button>
    </div>

    <div v-if="s.attach" class="msg-attach-preview" style="display:block;">
      <span>📎 关联：{{ s.attach.text }}</span>
      <button @click="removeAttach" style="margin-left:8px;border:none;background:transparent;color:#ef4444;cursor:pointer;font-weight:700;">✕</button>
    </div>
  </div>

  <div v-if="s.empty" class="msg-empty">还没有留言，写第一句吧 💬</div>

  <div v-for="g in s.groups" :key="g.title" class="msg-group">
    <div class="msg-group-hd">{{ g.title }}</div>
    <div v-for="m in g.items" :key="m.id" class="msg-item" :class="m.isParent ? 'from-parent' : 'from-child'">
      <div class="msg-hd">
        <span class="msg-avatar">{{ m.isParent ? '👨‍👩‍👦' : '👦' }}</span>
        <span class="msg-from">{{ m.from }}</span>
        <span class="msg-time">{{ m.timeStr }}</span>
      </div>
      <div class="msg-text">{{ m.text }}</div>

      <div v-if="m.linked" class="msg-linked">
        <span>📎</span>
        <span>{{ m.linked.text }}</span>
        <span v-if="m.linked.answer" class="msg-linked-answer">答案 {{ m.linked.answer }}</span>
      </div>

      <div v-if="m.reply" class="msg-reply">
        <div class="msg-reply-hd">{{ m.isParent ? '👦 孩子回复' : '👨‍👩‍👦 家长回复' }} · {{ m.reply.atStr }}</div>
        <div class="msg-reply-text">{{ m.reply.text }}</div>
      </div>
      <button v-else class="msg-reply-btn" @click="reply(m)">💬 回一句</button>
    </div>
  </div>
</div>
  `,
});

/* ---------------- 挂载 ---------------- */

let _headerApp = null;
let _bodyApp = null;

export function renderMessages() {
  const hd = document.getElementById('messagesHeader');
  const stage = document.getElementById('messagesStage');

  refreshStore();
  msgMarkAllRead();

  if (hd && !_headerApp) {
    _headerApp = createApp(HeaderView);
    _headerApp.mount(hd);
  }
  if (stage && !_bodyApp) {
    _bodyApp = createApp(MessagesView);
    _bodyApp.mount(stage);
  }
}

/* ⭐ 关联题目选择弹窗（模态：独立的 DOM 生命周期，不进页面 store） */
function showAttachProblemModal(onSelect) {
  if (document.querySelector('.msg-attach-mask')) return;

  const masteryMap = masteryLoad();
  const mastered = Object.values(masteryMap)
    .filter((r) => r.state === 'mastered')
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, 5);
  const wrong = wbLoad().slice(0, 5);

  const mask = document.createElement('div');
  mask.className = 'msg-attach-mask';
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:10020;padding:20px;';
  mask.innerHTML = `
    <div style="background:var(--card);border-radius:20px;padding:20px;width:400px;max-width:92vw;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(15,23,42,.3);">
      <div style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:14px;">📎 关联一道题</div>

      ${mastered.length ? `
        <div style="font-size:12.5px;font-weight:800;color:#15803d;margin-bottom:8px;">🏆 最近掌握的</div>
        ${mastered.map((r) => `
          <button class="msg-attach-item" data-text="${escapeHtmlStrict(r.text || '')}" data-answer="" data-module=""
                  style="width:100%;text-align:left;padding:10px 12px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;margin-bottom:6px;font-size:13px;color:#15803d;cursor:pointer;font-family:inherit;">
            ${escapeHtmlStrict((r.text || '').slice(0, 40))}${(r.text || '').length > 40 ? '…' : ''}
          </button>
        `).join('')}
      ` : ''}

      ${wrong.length ? `
        <div style="font-size:12.5px;font-weight:800;color:#b45309;margin-top:14px;margin-bottom:8px;">❌ 最近做错的</div>
        ${wrong.map((r) => `
          <button class="msg-attach-item" data-text="${escapeHtmlStrict(r.text || '')}" data-module="${escapeHtmlStrict(r.moduleId || '')}" data-answer="${escapeHtmlStrict(r.correctAnswer || '')}"
                  style="width:100%;text-align:left;padding:10px 12px;background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px;margin-bottom:6px;font-size:13px;color:#b45309;cursor:pointer;font-family:inherit;">
            ${escapeHtmlStrict((r.text || '').slice(0, 40))}${(r.text || '').length > 40 ? '…' : ''}
          </button>
        `).join('')}
      ` : ''}

      ${!mastered.length && !wrong.length ? `
        <div style="text-align:center;padding:30px 20px;color:#94a3b8;font-size:13px;">还没有题，做几道再来关联吧</div>
      ` : ''}

      <button id="msgAttachCancel" style="width:100%;margin-top:12px;padding:10px;border-radius:10px;background:var(--border-soft);color:var(--text-soft);border:none;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;">取消</button>
    </div>
  `;
  document.body.appendChild(mask);

  mask.querySelectorAll('.msg-attach-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      onSelect({
        text: btn.dataset.text,
        answer: btn.dataset.answer || '',
        moduleId: btn.dataset.module || '',
      });
      mask.remove();
    });
  });

  mask.querySelector('#msgAttachCancel')?.addEventListener('click', () => mask.remove());
  mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
}
