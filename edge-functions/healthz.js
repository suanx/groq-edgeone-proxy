// GET /healthz —— 自检所有上游连通性
import { healthAll, corsHeaders } from './_lib/proxy.js';

export async function onRequest(context) {
  const { env } = context;
  const info = await healthAll(env);
  return new Response(JSON.stringify(info, null, 2), {
    status: 200,
    headers: corsHeaders({ 'Content-Type': 'application/json; charset=utf-8' })
  });
}
