// Cloudflare Workers 单文件版构建脚本
// 从 edge-functions/_lib/{proxy,ui}.js 生成 cf-workers/worker.js
// 保证 EdgeOne 版与 Workers 版共用同一份核心逻辑

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf-8');
const stripExports = (s) => s.replace(/^export\s+/gm, '');

const core = stripExports(read('edge-functions/_lib/proxy.js'));
const ui = stripExports(read('edge-functions/_lib/ui.js'));

const entry = `
// ---------- 入口 ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

    // 落地页 / 测试页
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const origin = new URL(request.url).origin;
      return new Response(landingPage(origin, env), {
        headers: corsHeaders({ 'Content-Type': 'text/html; charset=utf-8' })
      });
    }
    if (url.pathname === '/test' || url.pathname === '/test.html') {
      const origin = new URL(request.url).origin;
      return new Response(testPage(origin, env), {
        headers: corsHeaders({ 'Content-Type': 'text/html; charset=utf-8' })
      });
    }

    if (url.pathname === '/healthz') {
      const info = await healthAll(env);
      return new Response(JSON.stringify(info, null, 2), {
        headers: corsHeaders({ 'Content-Type': 'application/json; charset=utf-8' })
      });
    }

    // 强制指定上游: /<provider>/v1/*
    let forced = null;
    let path = url.pathname;
    const pfx = path.match(/^\\/(groq|llm7|kilo|nvidia)\\/v1(\\/.*)?$/);
    if (pfx) {
      forced = pfx[1];
      path = pfx[2] || '/';
    } else if (path.startsWith('/v1/')) {
      path = path.slice('/v1'.length);
    } else {
      return jsonError('路径不支持。可用: GET /healthz、/v1/*、/groq/v1/*、/llm7/v1/*、/kilo/v1/*、/nvidia/v1/*', 404, 'not_found');
    }

    if (!checkAccess(request, env)) return jsonError('Unauthorized：ACCESS_KEY 不正确', 401, 'auth_error');
    return proxy(request, env, path, forced);
  }
};
`;

const header = `// AI 网关 — Groq / LLM7 / Kilo / NVIDIA 四上游反向代理 (Cloudflare Workers 单文件版)
// 本文件由 build/build-cf.js 自动生成，请勿手改；改 edge-functions/_lib/ 后重新构建
// 海外节点，访问 Groq / NVIDIA 无地区封锁问题。

`;

writeFileSync(join(root, 'cf-workers/worker.js'), header + core + '\n' + ui + entry);
console.log('✅ 已生成 cf-workers/worker.js');
