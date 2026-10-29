// 兜底路由：处理其余 /v1/* 以及带上游前缀的路径
//   /v1/xxx            → 按 PROVIDER_ORDER 自动选，失败降级
//   /groq/v1/xxx       → 强制 Groq
//   /llm7/v1/xxx       → 强制 LLM7
import { proxy, checkAccess, jsonError, corsHeaders } from './_lib/proxy.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

  let forced = null;
  let path = url.pathname;

  if (path.startsWith('/groq/v1/')) {
    forced = 'groq';
    path = path.slice('/groq/v1'.length);
  } else if (path.startsWith('/llm7/v1/')) {
    forced = 'llm7';
    path = path.slice('/llm7/v1'.length);
  } else if (path.startsWith('/v1/')) {
    path = path.slice('/v1'.length);
  } else {
    return jsonError(
      '路径不支持。可用：GET /healthz、/v1/*、/groq/v1/*、/llm7/v1/*',
      404,
      'not_found'
    );
  }

  if (!checkAccess(request, env)) return jsonError('Unauthorized：ACCESS_KEY 不正确', 401, 'auth_error');
  return proxy(request, env, path, forced);
}
