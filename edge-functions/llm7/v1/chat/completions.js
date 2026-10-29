// POST /llm7/v1/chat/completions —— 强制走 LLM7（无需 Key）
import { proxy, checkAccess, jsonError, corsHeaders } from '../../_lib/proxy.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== 'POST') return jsonError('仅支持 POST', 405, 'method_not_allowed');
  if (!checkAccess(request, env)) return jsonError('Unauthorized：ACCESS_KEY 不正确', 401, 'auth_error');
  return proxy(request, env, '/chat/completions', 'llm7');
}
