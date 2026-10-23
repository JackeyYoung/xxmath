/* core/ui/ai-insight.js */
import { escapeHtmlStrict } from '../html.js';

export function buildAiInsightHtml(r, opts = {}) {
  const esc = (s) => escapeHtmlStrict(String(s || ''));
  const openClass = opts.open ? ' open' : '';

  const strengthsHtml = (r.strengths && r.strengths.length) ? `
    <div class="std-fold${openClass}" data-insight="strengths">
      <div class="std-fold-hd"><span>👍 你做对了什么</span><span class="arrow">▶</span></div>
      <div class="std-fold-bd">
        <ul style="margin:0;padding-left:18px;">
          ${r.strengths.map(s => `<li>${esc(s)}</li>`).join('')}
        </ul>
      </div>
    </div>
  ` : '';

  const gapsHtml = (r.gaps && r.gaps.length) ? `
    <div class="std-fold${openClass}" data-insight="gaps">
      <div class="std-fold-hd"><span>🔍 哪个环节还没想到</span><span class="arrow">▶</span></div>
      <div class="std-fold-bd">
        <ul style="margin:0;padding-left:18px;">
          ${r.gaps.map(s => `<li>${esc(s)}</li>`).join('')}
        </ul>
      </div>
    </div>
  ` : '';

  const walkHtml = r.reasoning_walkthrough ? `
    <div class="std-fold${openClass}" data-insight="walk">
      <div class="std-fold-hd"><span>🧠 AI 是怎么分析这道题的</span><span class="arrow">▶</span></div>
      <div class="std-fold-bd">
        <div class="std-line">${esc(r.reasoning_walkthrough).replace(/\n/g, '<br>')}</div>
      </div>
    </div>
  ` : '';

  const j = r.judgement || {};
  const judgementHtml = `
    <div class="std-fold${openClass}" data-insight="judgement">
      <div class="std-fold-hd"><span>📊 大模型批改结果</span><span class="arrow">▶</span></div>
      <div class="std-fold-bd">
        <div class="std-line">
          <b>答案判定：</b>
          ${j.answer_correct
            ? '<span style="color:#15803d;font-weight:800;">✓ 正确</span>'
            : '<span style="color:#b91c1c;font-weight:800;">✗ 有误</span>'}
        </div>
        ${j.student_answer_issue && j.student_answer_issue !== '无'
          ? `<div class="std-line"><b>答案问题：</b>${esc(j.student_answer_issue)}</div>` : ''}
        ${j.step_count_comment
          ? `<div class="std-line"><b>步数评价：</b>${esc(j.step_count_comment)}</div>` : ''}
        ${(j.step_issues && j.step_issues.length)
          ? `<div class="std-line"><b>步骤问题：</b>
              <ul style="margin:4px 0 0 18px;">
                ${j.step_issues.map(it => `<li>第 ${it.step} 步 · ${esc(it.field)}：${esc(it.issue)}</li>`).join('')}
              </ul>
             </div>` : ''}
      </div>
    </div>
  `;

  return { strengthsHtml, gapsHtml, walkHtml, judgementHtml };
}