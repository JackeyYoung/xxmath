/* core/llm.js
   大模型调用 + JSON 兜底解析 + 统一反馈结构
   ⚠️ 注意：LLM_CONFIG 里的 apiUrl 保持你现在的 'api/llm'
*/

export const LLM_CONFIG = {
  enabled: true,
  apiUrl: 'api/llm',
  apiKey: '',
  model: 'glm-5.3-flash',
};

export const LLM_SYSTEM_PROMPT = `你是一位三年级数学老师，负责评判学生的解题过程。

【输出铁律】
1. 你的回复必须是且只能是一个 JSON 对象，第一个字符是 {，最后一个字符是 }
2. 禁止任何解释、禁止 markdown 代码块、禁止"好的/让我分析"之类的话
3. 所有字段用中文填写；数字字段只写数字，不带单位
4. 严格按下面的字段名和层级输出，不要增删字段、不要改名
5. 输出中不要出现任何注释

【输出结构】
{
  "problem_understanding": "用 1 句话理解当前题意",
  "required_steps": 0,
  "answer": { "value": 0, "unit": "单位文字", "full": "带单位的完整答案" },
  "steps": [
    { "step": 1, "relation": "关系式", "substitution": "代入", "result": "得数" }
  ],
  "judgement": {
    "answer_correct": false,
    "student_answer_issue": "问题或 无",
    "step_issues": [ { "step": 1, "field": "relation", "issue": "问题" } ],
    "step_count_comment": "步数评价"
  },
  "strengths": ["做对的地方"],
  "gaps": ["漏掉的环节"],
  "reasoning_walkthrough": "3~5 句复盘",
  "hint": "只给下一步该想什么"
}

【填写要求】
1. 三年级，不用方程
2. 步数由题目决定（1~3 步），不要硬凑
3. steps 是最少必要步骤
4. 关系式用中文
5. strengths/gaps/reasoning_walkthrough 必给
6. 若学生完全没写步骤，strengths 给 ["暂时没有可肯定的步骤，先写出第一步"]`;

/* ---------- JSON 兜底解析 ---------- */
export function extractJson(text) {
  if (typeof text !== 'string') return null;
  let s = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try { return JSON.parse(s); } catch (_) {}
  const l = s.indexOf('{');
  const r = s.lastIndexOf('}');
  if (l !== -1 && r > l) {
    try { return JSON.parse(s.slice(l, r + 1)); } catch (_) {}
  }
  return null;
}

/* ---------- 统一反馈结构 ---------- */
export function normalizeAiFeedback(raw, fallbackFull) {
  const base = raw && typeof raw === 'object' ? raw : {};
  const j = base.judgement || {};
  return {
    problem_understanding: base.problem_understanding || '',
    required_steps: base.required_steps || (Array.isArray(base.steps) ? base.steps.length : 0),
    answer: {
      value: (base.answer && base.answer.value != null) ? base.answer.value : null,
      unit:  (base.answer && base.answer.unit)  || '',
      full:  (base.answer && base.answer.full)  || fallbackFull || '—',
    },
    steps: Array.isArray(base.steps) ? base.steps : [],
    judgement: {
      answer_correct:     j.answer_correct ?? false,
      student_answer_issue: j.student_answer_issue || '无',
      step_issues: Array.isArray(j.step_issues) ? j.step_issues : [],
      step_count_comment: j.step_count_comment || '',
    },
    strengths: Array.isArray(base.strengths) ? base.strengths
              : ['（本次未返回"做对了什么"，可再点一次讲解）'],
    gaps: Array.isArray(base.gaps) ? base.gaps
         : (j.answer_correct ? [] : ['（本次未返回"漏掉什么"，可再点一次讲解）']),
    reasoning_walkthrough: base.reasoning_walkthrough || '',
    hint: base.hint || '',
    keywords: base.keywords || null,
    _source: base._source || 'unknown',
  };
}

/* ---------- 主调用 ---------- */
export async function callLLM({ problem, studentAnswer, steps, extraSystem }) {
  if (!LLM_CONFIG.enabled) throw new Error('大模型未启用');

  const stepArr = Array.isArray(steps) ? steps : [];
  const stepsText = stepArr.length
    ? stepArr.map((s, i) => {
        const rel = (s && s.rel) || '（未填）';
        const sub = (s && s.sub) || '（未填）';
        const res = (s && s.res) || '（未填）';
        return `- 第 ${i + 1} 步：关系式「${rel}」，代入「${sub}」，得数「${res}」`;
      }).join('\n')
    : '（学生未填写任何步骤）';

  const userPrompt = `
题目：${problem}

学生的作答（共 ${stepArr.length} 步）：
${stepsText}

最终答案：${studentAnswer || '（未填）'}

请严格按 JSON 格式输出评判结果。`;

  const headers = { 'Content-Type': 'application/json' };
  if (LLM_CONFIG.apiKey) headers['Authorization'] = `Bearer ${LLM_CONFIG.apiKey}`;

  const messages = [
    { role: 'system', content: LLM_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];
  if (extraSystem) messages.push({ role: 'system', content: extraSystem });

  const body = {
    model: LLM_CONFIG.model,
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 4000,
    reasoning_effort: 'low',
  };

  const TIMEOUT_MS = 300000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(LLM_CONFIG.apiUrl, {
      method: 'POST', headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`请求超时（${TIMEOUT_MS / 1000} 秒未响应），请检查网络后重试`);
    }
    throw new Error('网络请求失败：' + e.message, { cause: e });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    let errText = '';
    try { errText = await res.text(); } catch (_) {}
    const snippet = errText.slice(0, 300);
    throw new Error(`API ${res.status}（${res.statusText}）${snippet ? '：' + snippet : ''}`);
  }

  let data;
  try { data = await res.json(); } catch (e) {
    throw new Error('服务端返回的不是合法 JSON，请检查接口地址或网关配置', { cause: e });
  }

  const msg = data && data.choices && data.choices[0] && data.choices[0].message;
  let content = msg && (msg.content || msg.reasoning_content);
  const finishReason = data?.choices?.[0]?.finish_reason;
  const reasoningTokens = data?.usage?.completion_tokens_details?.reasoning_tokens || 0;

  if (typeof content !== 'string' || !content.trim()) {
    if (finishReason === 'length') {
      throw new Error(
        reasoningTokens > 0
          ? `模型思考过长被截断（用了 ${reasoningTokens} token 推理）`
          : '模型输出被长度限制截断，请调高 max_tokens'
      );
    }
    const apiErr = data && data.error && data.error.message;
    throw new Error(apiErr ? `API 业务错误：${apiErr}` : '模型未返回有效内容，请重试');
  }

  const parsed = extractJson(content);
  if (!parsed) throw new Error('模型返回格式异常，请再试一次');
  return parsed;
}

export async function callLLMWithRetry(opts, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await callLLM(opts);
    } catch (e) {
      lastErr = e;
      const msg = e.message || '';
      if (/模型返回格式异常|模型未返回有效内容/.test(msg)) {
        if (i >= retries) throw e;
        try {
          return await callLLM({
            ...opts,
            extraSystem: '上次你的输出不是合法 JSON。这次必须直接输出 JSON 对象：第一个字符是 {，最后一个字符是 }，不要任何解释、不要 markdown 代码块、不要 // 注释。',
          });
        } catch (e2) { throw e2; }
      }
      const retriable = /超时|网络请求失败|API 5\d\d|API 429/.test(msg);
      if (!retriable || i === retries) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}