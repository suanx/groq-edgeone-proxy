// GET /v1/models —— 自动选上游，失败降级
import { proxy, checkAccess, jsonError, corsHeaders } from '../_lib/proxy.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== 'GET') return jsonError('仅支持 GET', 405, 'method_not_allowed');
  if (!checkAccess(request, env)) return jsonError('Unauthorized：ACCESS_KEY 不正确', 401, 'auth_error');
  return proxy(request, env, '/models', null);
}
