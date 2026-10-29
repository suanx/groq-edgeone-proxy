// 路由: POST /v1/chat/completions  ->  https://api.groq.com/openai/v1/chat/completions
import { proxy, checkAccess, jsonError, corsHeaders } from '../../_lib/groq.js';

export async function onRequest(context) {
  const { request, env } = context;

  // CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== 'POST') {
    return jsonError('仅支持 POST', 405, 'method_not_allowed');
  }
  if (!checkAccess(request, env)) {
    return jsonError('Unauthorized：ACCESS_KEY 不正确', 401, 'auth_error');
  }

  return proxy(request, env, '/chat/completions');
}
