// 网关 UI：落地页 + 在线测试页
// 不回显任何真实 Key，只显示"已配置 / 未配置"布尔状态

export function configStatus(env) {
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
export function landingPage(origin, env) {
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
export function testPage(origin, env) {
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
