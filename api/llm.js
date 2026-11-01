// api/llm.js — Vercel Serverless Function
export default async function handler(req, res) {
  // 1. CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 2. 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 3. 只接受 POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // 4. 获取 API Key
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    res.status(401).json({ error: 'API key is not configured' });
    return;
  }

  // ⭐ 安全修复：原来把 req.body 原样转发 —— 客户端可以自带 model 字段调用任意（含最贵的）模型，
  //    等于把服务端 key 变成了开放代理，配额可被刷爆。这里做模型白名单 + 体积上限 + 字段裁剪。
  const ALLOWED_MODELS = String(process.env.LLM_ALLOWED_MODELS || 'glm-4-flash')
    .split(',').map(s => s.trim()).filter(Boolean);
  const MAX_BODY_BYTES = Number(process.env.LLM_MAX_BODY_BYTES || 20000);

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  if (!rawBody || rawBody.length > MAX_BODY_BYTES) {
    res.status(413).json({ error: 'Payload too large or empty' });
    return;
  }

  let payload;
  try { payload = typeof req.body === 'string' ? JSON.parse(req.body) : { ...(req.body || {}) }; }
  catch { res.status(400).json({ error: 'Invalid JSON body' }); return; }

  if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
    res.status(400).json({ error: 'messages is required' });
    return;
  }

  // 只转发白名单字段，避免客户端塞入 tools / functions 等
  const safe = {
    model: ALLOWED_MODELS.includes(payload.model) ? payload.model : ALLOWED_MODELS[0],
    messages: payload.messages,
    temperature: payload.temperature,
    max_tokens: payload.max_tokens,
    response_format: payload.response_format,
    stream: false,
  };

  // 5. 转发到智谱
  try {
    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(safe)
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(502).json({ error: 'Upstream request failed', detail: error.message });
  }
}