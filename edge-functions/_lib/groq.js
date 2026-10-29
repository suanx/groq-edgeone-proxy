// Groq 反向代理共享库 (EdgeOne Pages Edge Functions)
// 放在 edge-functions/_lib/ 下，不会被当作路由函数暴露

export const GROQ_BASE = 'https://api.groq.com/openai/v1';

// 通用 CORS 头
export function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, User-Agent',
    'Access-Control-Max-Age': '86400',
    ...extra
  };
}

// 统一 JSON 错误响应
export function jsonError(message, status = 500, code = 'error') {
  return new Response(
    JSON.stringify({ error: { message, type: code, code } }),
    { status, headers: corsHeaders({ 'Content-Type': 'application/json; charset=utf-8' }) }
  );
}

// 网关访问鉴权：配了 ACCESS_KEY 才校验
export function checkAccess(request, env) {
  if (!env || !env.ACCESS_KEY) return true;
  const auth = request.headers.get('Authorization') || '';
  return auth === `Bearer ${env.ACCESS_KEY}`;
}

// 决定发往 Groq 的 Authorization
// 配了 GROQ_API_KEY 就固定用它（真实 key 不暴露给客户端）
// 没配则透传客户端自己的 key
function resolveUpstreamAuth(request, env) {
  if (env && env.GROQ_API_KEY) return `Bearer ${env.GROQ_API_KEY}`;
  return request.headers.get('Authorization') || '';
}

// 核心转发：把请求原样打给 Groq，响应（含 SSE 流）原样回传
export async function proxy(request, env, upstreamPath) {
  const url = GROQ_BASE + upstreamPath;

  const headers = new Headers();
  for (const k of ['content-type', 'accept', 'accept-encoding', 'accept-language']) {
    const v = request.headers.get(k);
    if (v) headers.set(k, v);
  }
  const upAuth = resolveUpstreamAuth(request, env);
  if (upAuth) headers.set('Authorization', upAuth);
  headers.set('User-Agent', 'EdgeOne-Groq-Proxy/1.0');

  const init = { method: request.method, headers };
  // GET / HEAD 不能带 body
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    return jsonError(
      `无法连接 Groq：${e && e.message ? e.message : e}。若返回 403 说明当前节点所在地区被 Groq 封锁，请改用海外节点或其他平台。`,
      502,
      'upstream_unreachable'
    );
  }

  const outHeaders = new Headers();
  res.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    // 去掉会被边缘节点二次处理的头，保证流式不被缓冲
    if (['content-encoding', 'content-length', 'transfer-encoding', 'connection',
         'access-control-allow-origin', 'access-control-allow-headers'].includes(lk)) return;
    outHeaders.set(k, v);
  });
  const cors = corsHeaders({ 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  Object.entries(cors).forEach(([k, v]) => outHeaders.set(k, v));

  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: outHeaders });
}
