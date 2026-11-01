/* core/student.js */
import { lsGet, lsSet, lsRemove } from './storage.js';
import { showAlert } from './ui/dialog.js';
import { STUDENT_KEY } from './keys.js';
import { showToast } from './ui/toast.js';

export function getStudentName() {
  try { return lsGet(STUDENT_KEY) || ''; } catch (e) { return ''; }
}

export function setStudentName(name) {
  try {
    if (name && name.trim()) lsSet(STUDENT_KEY, name.trim());
    else lsRemove(STUDENT_KEY);
  } catch (e) { console.warn('[学生姓名] 保存失败', e); }
  renderStudentCard();
}

export function renderStudentCard() {
  const el = document.getElementById('dashStudentName');
  if (!el) return;
  const name = getStudentName();
  el.textContent = name || '点此设置';
}

export function showStudentModal() {
  if (document.querySelector('.student-modal-mask')) return;

  const mask = document.createElement('div');
  mask.className = 'student-modal-mask';
  // M3/L6：DOM 构建替代模板字符串。原来的 value="${getStudentName()}" 会把名字
  // 未经转义直接拼进 HTML 属性（名字里带引号即可注入），这里改为直接赋值。
  const card = document.createElement('div');
  card.className = 'student-modal';
  const h3 = document.createElement('h3');
  h3.textContent = '👦 请告诉我你的名字';
  const p = document.createElement('p');
  p.textContent = '做过的题会保存到你的名下（可选）';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'studentNameInput';
  nameInput.maxLength = 12;
  nameInput.placeholder = '例：小明';
  nameInput.autocomplete = 'off';
  nameInput.value = getStudentName();        // ← 安全：不进 HTML 解析器
  const btns = document.createElement('div');
  btns.className = 'student-btns';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'student-cancel';
  cancelBtn.id = 'studentCancel';
  cancelBtn.textContent = '取消';
  const okBtn = document.createElement('button');
  okBtn.className = 'student-ok';
  okBtn.id = 'studentOk';
  okBtn.textContent = '确定';
  btns.append(cancelBtn, okBtn);
  card.append(h3, p, nameInput, btns);
  mask.append(card);
  document.body.appendChild(mask);
  document.body.classList.add('modal-open');

  const input = document.getElementById('studentNameInput');
  setTimeout(() => { input.focus(); input.select(); }, 60);

  function doOk() {
    const name = input.value.trim();
if (!name) { showAlert('请输入名字'); return; }
    setStudentName(name);
    document.body.classList.remove('modal-open');
    mask.remove();
    showToast(`👋 你好，${name}！`, 'success');
  }

  document.getElementById('studentOk').addEventListener('click', doOk);
  document.getElementById('studentCancel').addEventListener('click', () => {
    document.body.classList.remove('modal-open');
    mask.remove();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') doOk();
    if (e.key === 'Escape') { document.body.classList.remove('modal-open'); mask.remove(); }
  });
  mask.addEventListener('click', e => { if (e.target === mask) { document.body.classList.remove('modal-open'); mask.remove(); } });
}

export function installStudentInit() {
  document.getElementById('dashStudent')?.addEventListener('click', showStudentModal);
  setTimeout(() => {
    if (getStudentName()) return;
    if (sessionStorage.getItem('grade3_student_asked') === '1') return;
    sessionStorage.setItem('grade3_student_asked', '1');
    showStudentModal();
  }, 1000);
}