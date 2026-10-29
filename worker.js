// 多上游 AI 网关 —— Cloudflare Workers 单文件版
// 上游：Groq（需 Key）+ LLM7.io（可匿名），自动降级

const PROVIDERS = {
  groq: {
    id: 'groq',
    label: 'Groq 官方',
    base: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    anonymous: false,
    defaultModel: 'openai/gpt-oss-120b',
    models: {
      'gpt-oss-120b': 'openai/gpt-oss-120b',
      'gpt-oss-20b': 'openai/gpt-oss-20b',
      'gpt-oss': 'openai/gpt-oss-120b',
      'qwen': 'qwen/qwen3.8-27b'
    }
  },
  llm7: {
    id: 'llm7',
    label: 'LLM7.io（可匿名）',
    base: 'https://api.llm7.io/v1',
    keyEnv: 'LLM7_API_KEY',
    anonymous: true,
    placeholderKey: 'unused',
    defaultModel: 'gpt-oss',
    models: {
      'gpt-oss-120b': 'gpt-oss',
      'gpt-oss-20b': 'gpt-oss:20b',
      'gpt-oss': 'gpt-oss',
      'qwen': 'qwen3-235b'
    }
  }
};

// ---------- 工具 ----------

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, User-Agent',
    'Access-Control-Max-Age': '86400',
    ...extra
  };
}

function jsonError(message, status = 500, code = 'error', extraHeaders = {}) {
  return new Response(
    JSON.stringify({ error: { message, type: code, code } }),
    { status, headers: corsHeaders({ 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders }) }
  );
}

function checkAccess(request, env) {
  if (!env || !env.ACCESS_KEY) return true;
  const auth = request.headers.get('Authorization') || '';
  return auth === `Bearer ${env.ACCESS_KEY}`;
}

function hasGatewayKey(env) { return !!(env && env.ACCESS_KEY); }

function upstreamAuth(p, env, request) {
  if (env && env[p.keyEnv]) return `Bearer ${env[p.keyEnv]}`;
  if (p.anonymous) return `Bearer ${p.placeholderKey || 'unused'}`;
  if (!hasGatewayKey(env)) return request.headers.get('Authorization') || '';
  return '';
}

function isAvailable(p, env) {
  if (env && env[p.keyEnv]) return true;
  if (p.anonymous) return true;
  return !hasGatewayKey(env);
}

function providerOrder(env, forced) {
  if (forced && PROVIDERS[forced]) return [forced];
  const raw = env && env.PROVIDER_ORDER;
  if (raw) {
    const list = String(raw).split(',').map(s => s.trim()).filter(s => PROVIDERS[s]);
    if (list.length) return list;
  }
  return ['groq', 'llm7'];
}

function mapModel(model, p) {
  if (!model) return model;
  if (p.models && p.models[model]) return p.models[model];
  return model;
}

const HOP = ['content-encoding', 'content-length', 'transfer-encoding', 'connection',
             'access-control-allow-origin', 'access-control-allow-headers'];

// HTTP 头只能是 Latin-1，中文等字符必须先转义，否则 Headers.set 会抛错
function safeHeader(s) {
  try { return encodeURIComponent(String(s)).slice(0, 400); } catch (e) { return 'unprintable'; }
}

function buildOutHeaders(res, providerName, log) {
  const h = new Headers();
  res.headers.forEach((v, k) => { if (!HOP.includes(k.toLowerCase())) h.set(k, v); });
  const cors = corsHeaders({ 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  Object.entries(cors).forEach(([k, v]) => h.set(k, v));
  h.set('X-Upstream-Provider', providerName);
  if (log && log.length) h.set('X-Fallback-Log', safeHeader(JSON.stringify(log)));
  return h;
}

async function attempt(p, env, request, upstreamPath, bodyObj) {
  const headers = new Headers();
  for (const k of ['content-type', 'accept', 'accept-encoding', 'accept-language']) {
    const v = request.headers.get(k);
    if (v) headers.set(k, v);
  }
  const auth = upstreamAuth(p, env, request);
  if (auth) headers.set('Authorization', auth);
  headers.set('User-Agent', 'AI-Gateway/2.0');

  const init = { method: request.method, headers };
  if (request.method !== 'GET' && request.method !== 'HEAD' && bodyObj) {
    init.body = JSON.stringify(bodyObj);
  }

  let res;
  try {
    res = await fetch(p.base + upstreamPath, init);
  } catch (e) {
    return { ok: false, status: 0, error: String(e && e.message ? e.message : e) };
  }
  if (res.ok) return { ok: true, status: res.status, res };

  let detail = '';
  try {
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('event-stream') && !ct.includes('stream')) {
      detail = (await res.text()).slice(0, 200);
    }
  } catch (e) {}
  return { ok: false, status: res.status, error: detail || (`HTTP ${res.status}`), res };
}

// ---------- 带降级的转发 ----------

async function proxy(request, env, upstreamPath, forced) {
  let bodyObj = null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      const buf = await request.arrayBuffer();
      if (buf.byteLength) bodyObj = JSON.parse(new TextDecoder().decode(buf));
    } catch (e) { /* 非 JSON，原样转发 */ }
  }

  const order = providerOrder(env, forced);
  const log = [];

  for (const name of order) {
    const p = PROVIDERS[name];
    if (!isAvailable(p, env)) {
      log.push({ provider: name, skipped: '未配置 Key' });
      continue;
    }
    const payload = bodyObj && bodyObj.model
      ? { ...bodyObj, model: mapModel(bodyObj.model, p) }
      : bodyObj;

    let r = await attempt(p, env, request, upstreamPath, payload);
    if (!r.ok && r.status === 404 && payload && payload.model && payload.model !== p.defaultModel) {
      log.push({ provider: name, status: 404, retryWith: p.defaultModel });
      r = await attempt(p, env, request, upstreamPath, { ...payload, model: p.defaultModel });
    }
    if (r.ok) {
      return new Response(r.res.body, {
        status: r.res.status,
        statusText: r.res.statusText,
        headers: buildOutHeaders(r.res, name, log)
      });
    }
    log.push({ provider: name, status: r.status || 'network_error', error: r.error });
  }

  const msg = `全部上游均失败。${log.map(l => `[${l.provider}] ${l.error || l.skipped || ''}`).join(' ')}`;
  return jsonError(msg, 502, 'all_upstreams_failed', { 'X-Fallback-Log': safeHeader(JSON.stringify(log)) });
}

// ---------- 连通性自检 ----------

async function healthAll(env) {
  const jobs = Object.keys(PROVIDERS).map(async (name) => {
    const p = PROVIDERS[name];
    const t0 = Date.now();
    if (!isAvailable(p, env)) {
      return { provider: name, label: p.label, available: false, note: '未配置 Key，且非匿名上游' };
    }
    try {
      const headers = {};
      const auth = env && env[p.keyEnv] ? `Bearer ${env[p.keyEnv]}`
                 : (p.anonymous ? `Bearer ${p.placeholderKey || 'unused'}` : '');
      if (auth) headers['Authorization'] = auth;
      const res = await fetch(p.base + '/models', { headers });
      const text = await res.text();
      return {
        provider: name, label: p.label, available: res.ok,
        http_status: res.status, elapsed_ms: Date.now() - t0,
        note: res.ok ? '✅ 可用' : '❌ 不可用（多为地区封锁或 Key 无效）',
        body_preview: text.slice(0, 200)
      };
    } catch (e) {
      return { provider: name, label: p.label, available: false, error: String(e && e.message ? e.message : e), note: '❌ 连接异常' };
    }
  });
  const details = await Promise.all(jobs);
  const ok = details.filter(d => d.available).map(d => d.provider);
  return {
    any_available: ok.length > 0,
    working_providers: ok,
    provider_order: providerOrder(env, null),
    note: ok.length
      ? `✅ 可用上游：${ok.join(', ')}`
      : '❌ 无可用上游。LLM7 无需 Key 应始终可用；若它也失败，说明当前节点网络受限。',
    details
  };
}

// ---------- 入口 ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

    if (url.pathname === '/healthz' || url.pathname === '/') {
      const info = await healthAll(env);
      return new Response(JSON.stringify(info, null, 2), {
        headers: corsHeaders({ 'Content-Type': 'application/json; charset=utf-8' })
      });
    }

    let forced = null;
    let path = url.pathname;
    if (path.startsWith('/groq/v1/')) {
      forced = 'groq'; path = path.slice('/groq/v1'.length);
    } else if (path.startsWith('/llm7/v1/')) {
      forced = 'llm7'; path = path.slice('/llm7/v1'.length);
    } else if (path.startsWith('/v1/')) {
      path = path.slice('/v1'.length);
    } else {
      return jsonError('路径不支持。可用：GET /healthz、/v1/*、/groq/v1/*、/llm7/v1/*', 404, 'not_found');
    }

    if (!checkAccess(request, env)) return jsonError('Unauthorized：ACCESS_KEY 不正确', 401, 'auth_error');
    return proxy(request, env, path, forced);
  }
};
