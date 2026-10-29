// Groq 反向代理 —— Cloudflare Workers 单文件版
// 海外节点，访问 Groq 无地区封锁问题。若 EdgeOne 被拦，用这个。

const GROQ_BASE = 'https://api.groq.com/openai/v1';

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, User-Agent',
    'Access-Control-Max-Age': '86400',
    ...extra
  };
}

function jsonError(message, status = 500, code = 'error') {
  return new Response(
    JSON.stringify({ error: { message, type: code, code } }),
    { status, headers: corsHeaders({ 'Content-Type': 'application/json; charset=utf-8' }) }
  );
}

// 配了 ACCESS_KEY 才校验客户端
function checkAccess(request, env) {
  if (!env || !env.ACCESS_KEY) return true;
  const auth = request.headers.get('Authorization') || '';
  return auth === `Bearer ${env.ACCESS_KEY}`;
}

// 配了 GROQ_API_KEY 就固定用它，真实 key 不暴露
function resolveUpstreamAuth(request, env) {
  if (env && env.GROQ_API_KEY) return `Bearer ${env.GROQ_API_KEY}`;
  return request.headers.get('Authorization') || '';
}

async function proxy(request, env, upstreamPath) {
  const headers = new Headers();
  for (const k of ['content-type', 'accept', 'accept-encoding', 'accept-language']) {
    const v = request.headers.get(k);
    if (v) headers.set(k, v);
  }
  const upAuth = resolveUpstreamAuth(request, env);
  if (upAuth) headers.set('Authorization', upAuth);
  headers.set('User-Agent', 'CF-Groq-Proxy/1.0');

  const init = { method: request.method, headers };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  let res;
  try {
    res = await fetch(GROQ_BASE + upstreamPath, init);
  } catch (e) {
    return jsonError(`无法连接 Groq：${e && e.message ? e.message : e}`, 502, 'upstream_unreachable');
  }

  const outHeaders = new Headers();
  res.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (['content-encoding', 'content-length', 'transfer-encoding', 'connection',
         'access-control-allow-origin', 'access-control-allow-headers'].includes(lk)) return;
    outHeaders.set(k, v);
  });
  const cors = corsHeaders({ 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  Object.entries(cors).forEach(([k, v]) => outHeaders.set(k, v));

  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: outHeaders });
}

// 连通性自检
async function handleHealthz(env) {
  const t0 = Date.now();
  let info;
  try {
    const headers = {};
    if (env && env.GROQ_API_KEY) headers['Authorization'] = `Bearer ${env.GROQ_API_KEY}`;
    const res = await fetch(GROQ_BASE + '/models', { headers });
    const text = await res.text();
    info = {
      groq_reachable: res.ok,
      http_status: res.status,
      elapsed_ms: Date.now() - t0,
      note: res.ok ? '✅ 可正常访问 Groq，反代可用' : '❌ 无法访问 Groq',
      body_preview: text.slice(0, 300)
    };
  } catch (e) {
    info = { groq_reachable: false, error: String(e && e.message ? e.message : e), note: '❌ 连接异常' };
  }
  return new Response(JSON.stringify(info, null, 2), {
    headers: corsHeaders({ 'Content-Type': 'application/json; charset=utf-8' })
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (url.pathname === '/healthz' || url.pathname === '/') {
      return handleHealthz(env);
    }
    if (!url.pathname.startsWith('/v1/')) {
      return jsonError('仅代理 /v1/*。可用：GET /healthz、GET /v1/models、POST /v1/chat/completions', 404, 'not_found');
    }
    if (!checkAccess(request, env)) {
      return jsonError('Unauthorized：ACCESS_KEY 不正确', 401, 'auth_error');
    }
    return proxy(request, env, url.pathname.slice('/v1'.length));
  }
};
