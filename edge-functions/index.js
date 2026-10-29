// GET / —— 落地页
import { landingPage, configStatus } from './_lib/ui.js';
import { corsHeaders } from './_lib/proxy.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  const origin = new URL(request.url).origin;
  return new Response(landingPage(origin, env), {
    headers: corsHeaders({ 'Content-Type': 'text/html; charset=utf-8' })
  });
}
