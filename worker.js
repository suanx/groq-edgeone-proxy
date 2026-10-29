// AI 网关 — Groq / LLM7 / Kilo / NVIDIA 四上游反向代理 (Cloudflare Workers 单文件版)
// 本文件由 build/build-cf.js 自动生成，请勿手改；改 edge-functions/_lib/ 后重新构建
// 海外节点，访问 Groq / NVIDIA 无地区封锁问题。

// 多上游 AI 网关核心：Groq / LLM7 / Kilo / NVIDIA，支持自动降级

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
  },
  kilo: {
    id: 'kilo',
    label: 'Kilo Gateway（匿名）',
    base: 'https://api.kilo.ai/api/gateway',
    keyEnv: 'KILO_API_KEY',
    anonymous: true,
    noAuth: true,            // 匿名通道不带 Authorization 头
    requireFreeSuffix: true, // 免费模型 ID 必须带 :free
    defaultModel: 'kilo-auto/free',
    // 免费模型 ID 必须带 :free 后缀，未登记的通用名统一交给自动路由
    models: {
      'gpt-oss-120b': 'kilo-auto/free',
      'gpt-oss-20b': 'kilo-auto/free',
      'gpt-oss': 'kilo-auto/free',
      'qwen': 'nvidia/nemotron-3-super-120b-a12b:free',
      'nemotron': 'nvidia/nemotron-3-ultra-550b-a55b:free'
    }
  },
  nvidia: {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    base: 'https://integrate.api.nvidia.com/v1',
    keyEnv: 'NVIDIA_API_KEY',
    anonymous: false,
    defaultModel: 'openai/gpt-oss-20b',
    models: {
      'gpt-oss-120b': 'openai/gpt-oss-120b',
      'gpt-oss-20b': 'openai/gpt-oss-20b',
      'gpt-oss': 'openai/gpt-oss-120b',
      'qwen': 'qwen/qwen3-235b-a22b',
      'deepseek': 'deepseek-ai/deepseek-v4.1-flash'
    }
  }
};

// ---- 通用工具 ----

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

// 网关自身访问密码：配了 ACCESS_KEY 才校验
function checkAccess(request, env) {
  if (!env || !env.ACCESS_KEY) return true;
  const auth = request.headers.get('Authorization') || '';
  return auth === `Bearer ${env.ACCESS_KEY}`;
}

function hasGatewayKey(env) {
  return !!(env && env.ACCESS_KEY);
}

// 决定发往上游的 Authorization
// 返回 null 表示完全不带该头（Kilo 匿名通道不接受 Bearer）
function upstreamAuth(p, env, request) {
  if (env && env[p.keyEnv]) return `Bearer ${env[p.keyEnv]}`;
  if (p.noAuth) return null;
  if (p.anonymous) return `Bearer ${p.placeholderKey || 'unused'}`;
  if (!hasGatewayKey(env)) return request.headers.get('Authorization') || ''; // 透传模式
  return ''; // 配了网关密码却没配上游 Key：该上游不可用
}

function isAvailable(p, env) {
  if (env && env[p.keyEnv]) return true;
  if (p.anonymous) return true;
  return !hasGatewayKey(env); // 透传模式可用
}

// 上游优先级
function providerOrder(env, forced) {
  if (forced && PROVIDERS[forced]) return [forced];
  const raw = env && env.PROVIDER_ORDER;
  if (raw) {
    const list = String(raw).split(',').map(s => s.trim()).filter(s => PROVIDERS[s]);
    if (list.length) return list;
  }
  return ['groq', 'llm7', 'kilo', 'nvidia'];
}

// 模型名翻译：同一别名在不同上游有不同 ID
function mapModel(model, p) {
  if (!model) return model;
  if (p.models && p.models[model]) return p.models[model];
  // Kilo 免费通道只认带 :free 的 ID，其他一律交给自动路由
  if (p.requireFreeSuffix && !model.endsWith(':free')) return p.defaultModel;
  return model; // 未登记的模型原样透传
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

// 单次尝试
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
  if (res.ok) {
    return { ok: true, status: res.status, res };
  }
  // 失败时读一点响应体用于排错（非流式情况下才是 JSON）
  let detail = '';
  try {
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('event-stream') && !ct.includes('stream')) {
      const t = await res.text();
      detail = t.slice(0, 200);
    }
  } catch (e) {}
  return { ok: false, status: res.status, error: detail || (`HTTP ${res.status}`), res };
}

// ---- 主入口：带降级的转发 ----
async function proxy(request, env, upstreamPath, forced) {
  // body 先读一次，后续重试复用
  let bodyObj = null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      const buf = await request.arrayBuffer();
      if (buf.byteLength) bodyObj = JSON.parse(new TextDecoder().decode(buf));
    } catch (e) { /* 非 JSON 请求，按原样转发 */ }
  }

  const order = providerOrder(env, forced);
  const log = [];

  for (const name of order) {
    const p = PROVIDERS[name];
    if (!isAvailable(p, env)) {
      log.push({ provider: name, skipped: '未配置 Key' });
      continue;
    }

    // 模型名按上游翻译
    const payload = bodyObj && bodyObj.model
      ? { ...bodyObj, model: mapModel(bodyObj.model, p) }
      : bodyObj;

    let r = await attempt(p, env, request, upstreamPath, payload);

    // 模型不存在 → 用该上游的默认模型再试一次
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

// ---- 全部上游连通性自检 ----
async function healthAll(env) {
  const names = Object.keys(PROVIDERS);
  const jobs = names.map(async (name) => {
    const p = PROVIDERS[name];
    const t0 = Date.now();
    if (!isAvailable(p, env)) {
      return { provider: name, label: p.label, available: false, note: '未配置 Key，且非匿名上游' };
    }
    try {
      const headers = {};
      const auth = env && env[p.keyEnv] ? `Bearer ${env[p.keyEnv]}`
                 : (p.noAuth ? null : (p.anonymous ? `Bearer ${p.placeholderKey || 'unused'}` : ''));
      if (auth) headers['Authorization'] = auth;
      const res = await fetch(p.base + '/models', { headers });
      const text = await res.text();
      return {
        provider: name,
        label: p.label,
        available: res.ok,
        http_status: res.status,
        elapsed_ms: Date.now() - t0,
        note: res.ok ? '✅ 可用' : '❌ 不可用（多为地区封锁或 Key 无效）',
        body_preview: text.slice(0, 200)
      };
    } catch (e) {
      return { provider: name, label: p.label, available: false, error: String(e && e.message ? e.message : e), note: '❌ 连接异常' };
    }
  });
  const results = await Promise.all(jobs);
  const ok = results.filter(r => r.available).map(r => r.provider);
  return {
    any_available: ok.length > 0,
    working_providers: ok,
    provider_order: providerOrder(env, null),
    note: ok.length
      ? `✅ 可用上游：${ok.join(', ')}`
      : '❌ 无可用上游。LLM7 无需 Key 应始终可用；若它也失败，说明当前节点网络受限。',
    details: results
  };
}

// 网关 UI：落地页 + 在线测试页
// 不回显任何真实 Key，只显示"已配置 / 未配置"布尔状态

function configStatus(env) {
  return {
    groqConfigured: !!(env && env.GROQ_API_KEY),
    llm7Configured: !!(env && env.LLM7_API_KEY),
    kiloConfigured: !!(env && env.KILO_API_KEY),
    nvidiaConfigured: !!(env && env.NVIDIA_API_KEY),
    accessProtected: !!(env && env.ACCESS_KEY),
    order: (env && env.PROVIDER_ORDER) || 'groq,llm7,kilo,nvidia'
  };
}

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;
background:#0a0e1a;color:#e6edf3;line-height:1.6;min-height:100vh;
background-image:radial-gradient(circle at 20% 20%,rgba(34,211,238,.12),transparent 50%),radial-gradient(circle at 80% 60%,rgba(168,85,247,.10),transparent 50%);}
.wrap{max-width:900px;margin:0 auto;padding:40px 20px 60px}
header{text-align:center;margin-bottom:36px}
.logo{font-size:44px;font-weight:800;letter-spacing:-1px;
background:linear-gradient(135deg,#22d3ee,#a855f7);-webkit-background-clip:text;background-clip:text;color:transparent}
.tagline{color:#8b98a8;margin-top:8px;font-size:15px}
.badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;margin-top:14px}
.badge-ok{background:rgba(34,197,94,.15);color:#4ade80;border:1px solid rgba(34,197,94,.3)}
.badge-warn{background:rgba(251,191,36,.15);color:#fbbf24;border:1px solid rgba(251,191,36,.3)}
.card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);
border-radius:14px;padding:22px;margin-bottom:18px;backdrop-filter:blur(10px)}
h2{font-size:17px;margin-bottom:14px;color:#22d3ee;display:flex;align-items:center;gap:8px}
h3{font-size:14px;margin:16px 0 8px;color:#c9d4e0}
table{width:100%;border-collapse:collapse;font-size:14px}
td,th{padding:9px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.07)}
th{color:#8b98a8;font-weight:600;font-size:13px}
code{font-family:'SF Mono',Menlo,Consolas,monospace;background:rgba(34,211,238,.12);
color:#67e8f9;padding:2px 6px;border-radius:5px;font-size:13px}
pre{background:#070b14;border:1px solid rgba(255,255,255,.09);border-radius:10px;
padding:16px;overflow-x:auto;font-size:13px;line-height:1.7;position:relative}
pre code{background:none;color:#c9d4e0;padding:0}
.copy{position:absolute;top:8px;right:8px;background:rgba(34,211,238,.15);color:#67e8f9;
border:1px solid rgba(34,211,238,.3);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer}
.copy:hover{background:rgba(34,211,238,.28)}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:7px}
.dot-on{background:#4ade80;box-shadow:0 0 8px #4ade80}
.dot-off{background:#64748b}
.dot-anon{background:#38bdf8;box-shadow:0 0 8px #38bdf8}
.btn{display:inline-block;padding:11px 22px;border-radius:10px;border:none;cursor:pointer;
font-size:14px;font-weight:600;background:linear-gradient(135deg,#22d3ee,#a855f7);color:#fff;
text-decoration:none;transition:opacity .2s}
.btn:hover{opacity:.85}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-ghost{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:#c9d4e0}
input,select,textarea{width:100%;background:#070b14;border:1px solid rgba(255,255,255,.13);
border-radius:9px;padding:10px 12px;color:#e6edf3;font-size:14px;font-family:inherit}
input:focus,select:focus,textarea:focus{outline:none;border-color:#22d3ee}
textarea{resize:vertical;min-height:90px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:13px}
label{display:block;font-size:13px;color:#8b98a8;margin-bottom:6px}
.field{margin-bottom:14px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.row>*{flex:1;min-width:150px}
#out{background:#070b14;border:1px solid rgba(255,255,255,.09);border-radius:10px;
padding:16px;min-height:120px;white-space:pre-wrap;font-size:13.5px;line-height:1.7;
font-family:'SF Mono',Menlo,Consolas,monospace;color:#c9d4e0;max-height:420px;overflow-y:auto}
.meta{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#8b98a8;margin-top:12px}
.meta span{background:rgba(255,255,255,.05);padding:4px 10px;border-radius:6px}
.nav{text-align:center;margin-top:26px}
a{color:#22d3ee}
.foot{text-align:center;color:#64748b;font-size:12px;margin-top:30px}
.warn{background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.25);
border-radius:10px;padding:13px;font-size:13px;color:#fbbf24;margin-top:14px}
`;

function shell(title, body, navHtml) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>${CSS}</style></head><body>
<div class="wrap">${body}${navHtml || ''}
<div class="foot">AI Gateway · Groq + LLM7 双上游 · 自动降级</div></div>
<script>
function cp(b){var p=b.previousElementSibling||b.parentElement.querySelector('code');
navigator.clipboard.writeText(p.innerText);var o=b.innerText;b.innerText='已复制';
setTimeout(function(){b.innerText=o},1500)}
</script></body></html>`;
}

// ---------- 落地页 ----------
function landingPage(origin, env) {
  const s = configStatus(env);

  const groqState = s.groqConfigured
    ? '<span class="dot dot-on"></span>已配置 Key'
    : '<span class="dot dot-off"></span>未配置（将跳过）';
  const llm7State = s.llm7Configured
    ? '<span class="dot dot-on"></span>已配置 Key（60 次/分）'
    : '<span class="dot dot-anon"></span>匿名模式（10 次/分）';
  const kiloState = '<span class="dot dot-anon"></span>匿名可用（200 次/小时）';
  const nvidiaState = s.nvidiaConfigured
    ? '<span class="dot dot-on"></span>已配置 Key（约 40 RPM）'
    : '<span class="dot dot-off"></span>未配置（将跳过）';
  const guard = s.accessProtected
    ? '<span class="badge badge-ok">🔒 已启用访问密码</span>'
    : '<span class="badge badge-warn">⚠️ 未设密码，任何人可调用</span>';

  const body = `
<header>
  <div class="logo">AI Gateway</div>
  <div class="tagline">Groq · LLM7 · Kilo · NVIDIA 四上游反向代理 · 自动降级 · OpenAI 协议兼容</div>
  ${guard}
</header>

<div class="card">
  <h2>📡 上游状态</h2>
  <table>
    <tr><th>上游</th><th>状态</th><th>说明</th></tr>
    <tr><td><b>Groq</b></td><td>${groqState}</td><td>速度快，有地区封锁风险</td></tr>
    <tr><td><b>LLM7.io</b></td><td>${llm7State}</td><td>无需注册即可用，永久兜底</td></tr>
    <tr><td><b>Kilo Gateway</b></td><td>${kiloState}</td><td>免密钥，19+ 个 <code>:free</code> 模型</td></tr>
    <tr><td><b>NVIDIA NIM</b></td><td>${nvidiaState}</td><td>100+ 开源模型，需 Key</td></tr>
  </table>
  <div class="meta">
    <span>调度顺序：<code>${s.order}</code></span>
    <span>失败自动降级：✅</span>
  </div>
</div>

<div class="card">
  <h2>🔗 端点</h2>
  <table>
    <tr><th>方法</th><th>路径</th><th>说明</th></tr>
    <tr><td>GET</td><td><code>/healthz</code></td><td>连通性自检（探测所有上游）</td></tr>
    <tr><td>POST</td><td><code>/v1/chat/completions</code></td><td>对话，自动选上游</td></tr>
    <tr><td>GET</td><td><code>/v1/models</code></td><td>模型列表</td></tr>
    <tr><td>*</td><td><code>/groq/v1/*</code></td><td>强制走 Groq</td></tr>
    <tr><td>*</td><td><code>/llm7/v1/*</code></td><td>强制走 LLM7</td></tr>
    <tr><td>*</td><td><code>/kilo/v1/*</code></td><td>强制走 Kilo</td></tr>
    <tr><td>*</td><td><code>/nvidia/v1/*</code></td><td>强制走 NVIDIA</td></tr>
  </table>
  <div class="meta">
    <span>响应头 <code>X-Upstream-Provider</code> 告诉你实际由谁服务</span>
  </div>
</div>

<div class="card">
  <h2>🚀 快速开始</h2>
  <h3>Python</h3>
  <pre><button class="copy" onclick="cp(this)">复制</button><code>from openai import OpenAI

client = OpenAI(
    api_key="${s.accessProtected ? '你的ACCESS_KEY' : 'unused'}",
    base_url="${origin}/v1"
)

resp = client.chat.completions.create(
    model="gpt-oss-120b",
    messages=[{"role": "user", "content": "你好"}],
    stream=True
)
for chunk in resp:
    print(chunk.choices[0].delta.content or "", end="")</code></pre>

  <h3>cURL</h3>
  <pre><button class="copy" onclick="cp(this)">复制</button><code>curl ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer ${s.accessProtected ? '你的ACCESS_KEY' : 'unused'}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-oss-120b","messages":[{"role":"user","content":"hi"}]}'</code></pre>

  <h3>沉浸式翻译 / 其他客户端</h3>
  <table>
    <tr><td>API 端点</td><td><code>${origin}/v1/chat/completions</code></td></tr>
    <tr><td>密钥</td><td><code>${s.accessProtected ? '你的 ACCESS_KEY' : '随意填，如 unused'}</code></td></tr>
    <tr><td>模型</td><td><code>gpt-oss-120b</code></td></tr>
  </table>
</div>

<div class="card">
  <h2>🧩 模型别名（自动按上游翻译）</h2>
  <table>
    <tr><th>你填</th><th>Groq</th><th>LLM7</th><th>Kilo</th><th>NVIDIA</th></tr>
    <tr><td><code>gpt-oss-120b</code></td><td><code>openai/gpt-oss-120b</code></td><td><code>gpt-oss</code></td><td><code>kilo-auto/free</code></td><td><code>openai/gpt-oss-120b</code></td></tr>
    <tr><td><code>gpt-oss-20b</code></td><td><code>openai/gpt-oss-20b</code></td><td><code>gpt-oss:20b</code></td><td><code>kilo-auto/free</code></td><td><code>openai/gpt-oss-20b</code></td></tr>
    <tr><td><code>qwen</code></td><td><code>qwen/qwen3.8-27b</code></td><td><code>qwen3-235b</code></td><td><code>nemotron-3-super…:free</code></td><td><code>qwen/qwen3-235b-a22b</code></td></tr>
    <tr><td><code>deepseek</code></td><td>—</td><td>—</td><td><code>kilo-auto/free</code></td><td><code>deepseek-ai/deepseek-v4.1-flash</code></td></tr>
  </table>
  <div class="warn">Groq 的 <code>llama-3.3-70b-versatile</code>、<code>llama-3.1-8b-instant</code> 已于 2026-08-16 对免费档下架，填了会 404。<br>
  Kilo 免费档只认带 <code>:free</code> 后缀的 ID，其他模型名会自动回退到 <code>kilo-auto/free</code>。</div>
</div>
`;

  const nav = `<div class="nav">
    <a class="btn" href="/test">🧪 打开在线测试页</a>
    &nbsp;<a class="btn btn-ghost" href="/healthz">📊 查看 /healthz</a>
  </div>`;

  return shell('AI Gateway', body, nav);
}

// ---------- 测试页 ----------
function testPage(origin, env) {
  const s = configStatus(env);

  const body = `
<header>
  <div class="logo">🧪 在线测试</div>
  <div class="tagline">直接在这里发请求，实时看流式输出和命中的上游</div>
</header>

<div class="card">
  <div class="field">
    <label>Access Key${s.accessProtected ? '' : '（未启用密码，可留空或填 unused）'}</label>
    <input id="key" placeholder="${s.accessProtected ? '你的 ACCESS_KEY' : 'unused'}" autocomplete="off">
  </div>
  <div class="row">
    <div class="field" style="margin-bottom:0">
      <label>模型</label>
      <input id="model" value="gpt-oss-120b">
    </div>
    <div class="field" style="margin-bottom:0">
      <label>端点</label>
      <select id="route">
        <option value="/v1/chat/completions">/v1（自动选上游）</option>
        <option value="/groq/v1/chat/completions">/groq/v1（强制 Groq）</option>
        <option value="/llm7/v1/chat/completions">/llm7/v1（强制 LLM7）</option>
        <option value="/kilo/v1/chat/completions">/kilo/v1（强制 Kilo）</option>
        <option value="/nvidia/v1/chat/completions">/nvidia/v1（强制 NVIDIA）</option>
      </select>
    </div>
    <div class="field" style="margin-bottom:0">
      <label>模式</label>
      <select id="stream">
        <option value="true">流式 SSE</option>
        <option value="false">非流式</option>
      </select>
    </div>
  </div>
  <div class="field" style="margin-top:14px">
    <label>消息</label>
    <textarea id="msg">用一句话介绍你自己</textarea>
  </div>
  <div class="row" style="align-items:center">
    <button class="btn" id="send" onclick="send()">发送</button>
    <button class="btn btn-ghost" onclick="document.getElementById('out').textContent=''">清空输出</button>
  </div>
</div>

<div class="card">
  <h2>📤 输出</h2>
  <div id="out">等待请求…</div>
  <div class="meta" id="meta"></div>
</div>
`;

  const nav = `<div class="nav"><a class="btn btn-ghost" href="/">← 返回首页</a></div>`;

  // 页面脚本：所有 ${} 均已转义，避免与模板字符串冲突
  const script = `
var ORIGIN = "${origin}";
var keyEl = document.getElementById('key');
var saved = localStorage.getItem('gw_key');
if (saved) keyEl.value = saved;

function setMeta(html){ document.getElementById('meta').innerHTML = html; }

async function send(){
  var out = document.getElementById('out');
  var btn = document.getElementById('send');
  var key = keyEl.value.trim();
  localStorage.setItem('gw_key', key);
  var route = document.getElementById('route').value;
  var model = document.getElementById('model').value.trim();
  var text = document.getElementById('msg').value;
  var useStream = document.getElementById('stream').value === 'true';

  out.textContent = '';
  btn.disabled = true; btn.textContent = '请求中…';
  var t0 = Date.now();

  try {
    var resp = await fetch(ORIGIN + route, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (key || 'unused')
      },
      body: JSON.stringify({
        model: model,
        messages: [{role:'user', content: text}],
        stream: useStream
      })
    });

    var provider = resp.headers.get('X-Upstream-Provider') || '-';
    var fb = resp.headers.get('X-Fallback-Log');

    if (!resp.ok) {
      var errTxt = await resp.text();
      out.textContent = 'HTTP ' + resp.status + '\\n\\n' + errTxt;
      setMeta('<span>状态：<b style="color:#f87171">' + resp.status + '</b></span><span>上游：' + provider + '</span>');
      btn.disabled = false; btn.textContent = '发送';
      return;
    }

    if (!useStream) {
      var j = await resp.json();
      var content = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '(空)';
      out.textContent = content;
      setMeta('<span>状态：<b style="color:#4ade80">200</b></span><span>上游：<b>' + provider + '</b></span><span>耗时：' + (Date.now()-t0) + 'ms</span>');
      btn.disabled = false; btn.textContent = '发送';
      return;
    }

    // 流式
    var reader = resp.body.getReader();
    var dec = new TextDecoder();
    var buf = '';
    var acc = '';
    while (true) {
      var r = await reader.read();
      if (r.done) break;
      buf += dec.decode(r.value, {stream:true});
      var lines = buf.split('\\n');
      buf = lines.pop();
      for (var i=0;i<lines.length;i++) {
        var line = lines[i].trim();
        if (!line) continue;
        if (line.indexOf('data:') !== 0) continue;
        var d = line.slice(5).trim();
        if (!d || d === '[DONE]') continue;
        try {
          var o = JSON.parse(d);
          var delta = o.choices && o.choices[0] && o.choices[0].delta;
          if (delta && delta.content) { acc += delta.content; out.textContent = acc; out.scrollTop = out.scrollHeight; }
        } catch(e) {}
      }
    }
    if (!acc) out.textContent = '(未解析到内容，可能是上游返回异常)';
    var m = '<span>状态：<b style="color:#4ade80">200</b></span><span>上游：<b>' + provider + '</b></span><span>耗时：' + (Date.now()-t0) + 'ms</span>';
    if (fb) m += '<span>降级记录：' + decodeURIComponent(fb).slice(0,120) + '</span>';
    setMeta(m);
  } catch (e) {
    out.textContent = '请求失败：' + e.message;
    setMeta('<span style="color:#f87171">网络错误</span>');
  }
  btn.disabled = false; btn.textContent = '发送';
}

document.getElementById('msg').addEventListener('keydown', function(e){
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
});
`;

  const html = shell('在线测试 · AI Gateway', body, nav);
  return html.replace('</body>', `<script>${script}</script></body>`);
}

// ---------- 入口 ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

    // 落地页 / 测试页
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const origin = new URL(request.url).origin;
      return new Response(landingPage(origin, env), {
        headers: corsHeaders({ 'Content-Type': 'text/html; charset=utf-8' })
      });
    }
    if (url.pathname === '/test' || url.pathname === '/test.html') {
      const origin = new URL(request.url).origin;
      return new Response(testPage(origin, env), {
        headers: corsHeaders({ 'Content-Type': 'text/html; charset=utf-8' })
      });
    }

    if (url.pathname === '/healthz') {
      const info = await healthAll(env);
      return new Response(JSON.stringify(info, null, 2), {
        headers: corsHeaders({ 'Content-Type': 'application/json; charset=utf-8' })
      });
    }

    // 强制指定上游: /<provider>/v1/*
    let forced = null;
    let path = url.pathname;
    const pfx = path.match(/^\/(groq|llm7|kilo|nvidia)\/v1(\/.*)?$/);
    if (pfx) {
      forced = pfx[1];
      path = pfx[2] || '/';
    } else if (path.startsWith('/v1/')) {
      path = path.slice('/v1'.length);
    } else {
      return jsonError('路径不支持。可用: GET /healthz、/v1/*、/groq/v1/*、/llm7/v1/*、/kilo/v1/*、/nvidia/v1/*', 404, 'not_found');
    }

    if (!checkAccess(request, env)) return jsonError('Unauthorized：ACCESS_KEY 不正确', 401, 'auth_error');
    return proxy(request, env, path, forced);
  }
};
