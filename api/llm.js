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

  // ⭐ 流式开关按请求分流（默认关闭，保持既有调用方的 JSON 语义不变）：
  //    - 判卷链路 callLLM 带 response_format:json_object，依赖"一次性返回完整 JSON"，
  //      若被强制改成流式会拿到分片 JSON、解析必然失败 —— 所以绝不能无条件翻转。
  //    - 只有 Aji 聊天舱显式传 stream:true 时才走 SSE 透传。
  const wantStream = payload.stream === true && !payload.response_format;

  // 只转发白名单字段，避免客户端塞入 tools / functions 等
  const safe = {
    model: ALLOWED_MODELS.includes(payload.model) ? payload.model : ALLOWED_MODELS[0],
    messages: payload.messages,
    temperature: payload.temperature,
    max_tokens: payload.max_tokens,
    response_format: payload.response_format,
    stream: wantStream,
  };

  const UPSTREAM = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

  /* ---------- 5a. 流式透传（SSE） ---------- */
  if (wantStream) {
    let upstream;
    try {
      upstream = await fetch(UPSTREAM, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(safe),
      });
    } catch (error) {
      res.status(502).json({ error: 'Upstream request failed', detail: error.message });
      return;
    }

    if (!upstream.ok || !upstream.body) {
      // 上游拒绝（鉴权/限流/参数）→ 退回 JSON 错误，前端给温柔兜底而不是空流
      if (upstream.body) { try { await upstream.body.cancel(); } catch (e) {} }
      let detail = '';
      try { detail = (await upstream.text()).slice(0, 300); } catch (e) {}
      res.status(upstream.status || 502).json({ error: 'Upstream stream failed', detail });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');   // 关掉反代缓冲，否则 chunk 会被攒成一坨
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const reader = upstream.body.getReader();
    // ⭐ 客户端断开（用户关舱 / 切模块 / 发新提问）→ 立刻取消上游，别把 token 白烧完。
    //    ⚠️ 监听 res 的 close（不是 req 的）：Node 16+ 里 req 的 'close' 在请求体读完
    //    后就会触发，用它判定断连会把正常流误判成中断、整个流式功能失效。
    //    另加 writableEnded 判定，区分"我们主动收尾"与"客户端真的跑了"。
    let aborted = false;
    const onClose = () => { if (!res.writableEnded) { aborted = true; reader.cancel().catch(() => {}); } };
    try { res.on?.('close', onClose); } catch (e) {}

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || aborted) break;
        res.write(Buffer.from(value));
        if (typeof res.flush === 'function') { try { res.flush(); } catch (e) {} }
      }
    } catch (error) {
      // 流中途断了也只能收尾（响应头已发出，无法再改状态码）
      if (!aborted) { try { res.write('data: [DONE]\n\n'); } catch (e) {} }
    } finally {
      try { res.off?.('close', onClose); } catch (e) {}
      try { res.end(); } catch (e) {}
    }
    return;
  }

  /* ---------- 5b. 非流式（判卷链路原样保留） ---------- */
  try {
    const response = await fetch(UPSTREAM, {
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