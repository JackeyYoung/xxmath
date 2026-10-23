/* core/student.js */
import { lsGet, lsSet, lsRemove } from './storage.js';
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
  mask.innerHTML = `
    <div class="student-modal">
      <h3>👦 请告诉我你的名字</h3>
      <p>做过的题会保存到你的名下（可选）</p>
      <input type="text" id="studentNameInput" maxlength="12" placeholder="例：小明" autocomplete="off" value="${getStudentName()}">
      <div class="student-btns">
        <button class="student-cancel" id="studentCancel">取消</button>
        <button class="student-ok" id="studentOk">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(mask);
  document.body.classList.add('modal-open');

  const input = document.getElementById('studentNameInput');
  setTimeout(() => { input.focus(); input.select(); }, 60);

  function doOk() {
    const name = input.value.trim();
    if (!name) { alert('请输入名字'); return; }
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