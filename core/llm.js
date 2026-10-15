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
2. 禁止任何解释文字、禁止 markdown 代码块、禁止使用 // 或 /* */ 注释
3. 所有文字字段用中文填写；数字字段只写数字，不带单位
4. 严格按【字段清单】里的字段名和层级输出，不要增删字段、不要改名
5. 输出必须是合法 JSON，能被 JSON.parse 直接解析

【字段清单】（按此结构输出，用当前题目真实内容替换占位值）
{
  "problem_understanding": "用 1 句话理解当前题意",
  "required_steps": 0,
  "answer": {
    "value": 0,
    "unit": "单位文字，如 元 / 个 / 米",
    "full": "带单位的完整答案，一句话"
  },
  "steps": [
    {
      "step": 1,
      "relation": "本步用到的关系式，用中文描述",
      "substitution": "把题目数字代入关系式的式子",
      "result": "代入后的得数（含单位）"
    }
  ],
  "judgement": {
    "answer_correct": false,
    "student_answer_issue": "学生最终答案的问题；正确就写 无",
    "step_issues": [
      { "step": 1, "field": "relation", "issue": "这一步的具体问题，一句话" }
    ],
    "step_count_comment": "对学生步数多少的评价"
  },
  "strengths": ["逐条列出学生做对的地方，具体到哪一步、哪个式子"],
  "gaps": ["逐条指出学生漏掉的思考环节，用启发语气，不要直接给答案"],
  "reasoning_walkthrough": "用 3~5 句话复盘：怎么读题、怎么决定分几步、每步在算什么，像老师带学生走一遍思路",
  "hint": "只给'下一步该想什么'，不要给最终数字"
}

【字段取值规则】
- required_steps：本题最少必要步数，1~5 的整数，由题目本身决定，不要硬凑
- answer.value：只写数字；answer.unit：单位文字
- steps：本题的"标准解法最少步骤"，不是学生写的步骤；每步含 relation / substitution / result
- judgement.answer_correct：true 或 false
- judgement.step_issues：出问题的步骤列表，无问题给 []
  · field 只能取 relation / substitution / result 三者之一
  · 只能记录 steps 数组里真实存在的 step 编号
- judgement.step_count_comment：
  · 步数合适 → 写"步数合适"
  · 多写 → 指出"多写了哪一步"
  · 缺少 → 指出"缺少哪一步"

【启发学生的写作要求】
1. strengths：至少 1 条，要具体到"第几步、哪个式子做对了"，不要空泛表扬
2. gaps：用启发语气，例如"想一想：要求总数，是不是还缺一步加法？"，不要直接写出答案或算式
3. reasoning_walkthrough：必须给，3~5 句话，像老师带学生重走一遍思路
4. hint：只提示"下一步该想什么"，绝对不要出现最终数字

【边界情况】
1. 学生完全没写步骤时：
   · strengths 给 ["暂时没有可肯定的步骤，先写出第一步"]
   · gaps 正常指出缺少的环节
   · hint 给"先想清楚题目问的是什么，再决定第一步算什么"
2. 学生答案正确时：gaps 给 []，strengths 至少 1 条
3. 三年级学生用加减乘除解决实际问题，不使用方程
4. judgement 四个子字段必须全部输出，step_issues 无问题给 []`;

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