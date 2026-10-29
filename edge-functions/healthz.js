// 路由: GET /healthz
// 部署后务必先访问这个地址，确认当前节点能否连上 Groq
// 若返回 403，说明节点所在地区被 Groq 封锁，反代不可用
import { corsHeaders } from './_lib/groq.js';

export async function onRequest(context) {
  const { env } = context;
  const t0 = Date.now();
  let info;

  try {
    const headers = {};
    if (env && env.GROQ_API_KEY) headers['Authorization'] = `Bearer ${env.GROQ_API_KEY}`;
    const res = await fetch('https://api.groq.com/openai/v1/models', { headers });
    const text = await res.text();
    info = {
      groq_reachable: res.ok,
      http_status: res.status,
      elapsed_ms: Date.now() - t0,
      note: res.ok
        ? '✅ 节点可正常访问 Groq，反代可用'
        : '❌ 节点无法访问 Groq（多为地区封锁），请改用海外节点的平台',
      body_preview: text.slice(0, 300)
    };
  } catch (e) {
    info = {
      groq_reachable: false,
      error: String(e && e.message ? e.message : e),
      elapsed_ms: Date.now() - t0,
      note: '❌ 连接异常'
    };
  }

  return new Response(JSON.stringify(info, null, 2), {
    status: 200,
    headers: corsHeaders({ 'Content-Type': 'application/json; charset=utf-8' })
  });
}
