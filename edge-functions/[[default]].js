// 兜底路由：处理其余 /v1/* 以及带上游前缀的路径
//   /v1/xxx              → 按 PROVIDER_ORDER 自动选，失败降级
//   /groq/v1/xxx         → 强制 Groq
//   /llm7/v1/xxx         → 强制 LLM7
//   /kilo/v1/xxx         → 强制 Kilo
//   /nvidia/v1/xxx       → 强制 NVIDIA
import { proxy, checkAccess, jsonError, corsHeaders } from './_lib/proxy.js';

const PREFIXES = ['groq', 'llm7', 'kilo', 'nvidia'];

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

  let forced = null;
  let path = url.pathname;

  const hit = PREFIXES.find(p => path.startsWith(`/${p}/v1/`));
  if (hit) {
    forced = hit;
    path = path.slice(`/${hit}/v1`.length);
  } else if (path.startsWith('/v1/')) {
    path = path.slice('/v1'.length);
  } else {
    return jsonError(
      '路径不支持。可用：GET /healthz、/v1/*、/groq/v1/*、/llm7/v1/*、/kilo/v1/*、/nvidia/v1/*',
      404,
      'not_found'
    );
  }

  if (!checkAccess(request, env)) return jsonError('Unauthorized：ACCESS_KEY 不正确', 401, 'auth_error');
  return proxy(request, env, path, forced);
}
