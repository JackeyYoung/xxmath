/* ============ 年级管理 ============ */
const GRADE_KEY = 'grade3_current_grade';
const SUPPORTED_GRADES = ['3'];   // ⭐ 已实现的年级，四年级五年级后续追加

export function getCurrentGrade() {
  try {
    const g = localStorage.getItem(GRADE_KEY);
    if (g && SUPPORTED_GRADES.includes(g)) return g;
    return '3';
  } catch (e) {
    return '3';
  }
}

export function setCurrentGrade(g) {
  try {
    if (SUPPORTED_GRADES.includes(String(g))) {
      localStorage.setItem(GRADE_KEY, String(g));
    }
  } catch (e) {}
}

/* 年级中文名 */
export function getGradeName(g) {
  const names = { '1': '一年级', '2': '二年级', '3': '三年级', '4': '四年级', '5': '五年级',  '6': '六年级', '7': '初一年级', '8': '初二年级', '9': '初三年级', '10': '高一年级', '11': '高二年级', '12': '高三年级'};
  return names[String(g)] || '三年级';
}

/* 初始化年级选择器（使用事件委托，支持动态 DOM） */
export function initGradeSelector() {
  // 把监听绑在 document 上，这样不管 #dashGrade 什么时候渲染出来都能点
  document.body.addEventListener('click', (e) => {
    const chip = e.target.closest('#dashGrade');
    if (chip) {
      showGradeModal();
    }
  });

  // 初始化文字（如果有的话）
  updateGradeChipText();
}

/* 暴露一个更新 UI 文字的全局方法，方便 M14 渲染完后调用 */
export function updateGradeChipText() {
  const nameEl = document.getElementById('dashGradeName');
  if (nameEl) {
    nameEl.textContent = getGradeName(getCurrentGrade());
  }
}

/* 弹出年级选择窗口 */
function showGradeModal() {
  if (document.querySelector('.grade-modal-mask')) return;

  const cur = getCurrentGrade();
  const grades = [
    { g: '1', name: '一年级' },
    { g: '2', name: '二年级' },
    { g: '3', name: '三年级' },
    { g: '4', name: '四年级' },
    { g: '5', name: '五年级' },
    { g: '6', name: '六年级' },
    { g: '7', name: '初一年级' },
    { g: '8', name: '初二年级' },
    { g: '9', name: '初三年级' },
    { g: '10', name: '高一年级' },
    { g: '11', name: '高二年级' },
    { g: '12', name: '高三年级' }
  ];
  // 已实现的年级才可点
  const enabled = SUPPORTED_GRADES;

  const mask = document.createElement('div');
  mask.className = 'grade-modal-mask';
  mask.innerHTML = `
    <div class="grade-modal">
      <h3>📚 选择年级</h3>
      <p>切换后学习记录会按年级分开保存</p>
      <div class="grade-modal-list">
        ${grades.map(({ g, name }) => `
          <button class="grade-opt ${g === cur ? 'active' : ''} ${!enabled.includes(g) ? 'disabled' : ''}"
                  data-grade="${g}"
                  ${!enabled.includes(g) ? 'disabled' : ''}>
            ${name}
            ${!enabled.includes(g) ? '<small>（即将上线）</small>' : ''}
          </button>
        `).join('')}
      </div>
      <div class="grade-modal-btns">
        <button class="grade-cancel" id="gradeCancel">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(mask);
  document.body.classList.add('modal-open');

  // 绑定
  mask.querySelectorAll('.grade-opt:not(.disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      const g = btn.dataset.grade;
      if (g === cur) {
        mask.remove();
        document.body.classList.remove('modal-open');
        return;
      }
      if (!confirm(`确定切换到${getGradeName(g)}吗？\n\n切换后学习记录会按年级分开保存。`)) return;
      setCurrentGrade(g);
      // 切年级后：重新从存储加载 + 重渲染
      try { if (typeof wbRender === 'function') wbRender(); } catch (e) {}
      try { if (typeof historyRender === 'function') historyRender(); } catch (e) {}
      try { if (typeof renderDashboard === 'function') renderDashboard(); } catch (e) {}
      try { if (typeof renderStudentCard === 'function') renderStudentCard(); } catch (e) {}
      try { if (typeof window._refreshGrowthCards === 'function') window._refreshGrowthCards(); } catch (e) {}
      location.reload();
    });
  });

  document.getElementById('gradeCancel').addEventListener('click', () => {
    mask.remove();
    document.body.classList.remove('modal-open');
  });
  mask.addEventListener('click', e => {
    if (e.target === mask) {
      mask.remove();
      document.body.classList.remove('modal-open');
    }
  });
}

/* 更新页面标题 */
export function updateTitle() {
  const el = document.getElementById('appTitle');
  if (!el) return;
  const g = getCurrentGrade();
  el.textContent = `🎓 ${getGradeName(g)}数学互动课堂`;
}