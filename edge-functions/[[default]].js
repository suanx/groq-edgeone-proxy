// 兜底路由：把所有 /v1/* 请求转发到 Groq 对应路径
// 例如 /v1/audio/transcriptions -> https://api.groq.com/openai/v1/audio/transcriptions
// 已单独定义过的 /v1/chat/completions、/v1/models 优先命中各自文件，走不到这里
import { proxy, checkAccess, jsonError, corsHeaders } from './_lib/groq.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (!url.pathname.startsWith('/v1/')) {
    return jsonError(
      '仅代理 /v1/* 路径。可用：GET /healthz（连通性自检）、GET /v1/models、POST /v1/chat/completions',
      404,
      'not_found'
    );
  }

  if (!checkAccess(request, env)) {
    return jsonError('Unauthorized：ACCESS_KEY 不正确', 401, 'auth_error');
  }

  // /v1/xxx -> 上游 /xxx
  const upstreamPath = url.pathname.slice('/v1'.length);
  return proxy(request, env, upstreamPath);
}
