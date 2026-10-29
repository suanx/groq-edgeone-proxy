# AI 网关：Groq + LLM7 双上游反向代理（Cloudflare Workers 版）

> 本分支是 Cloudflare Workers 专用版，文件已在根目录，Workers Git 集成直接选 **`cloudflare`** 分支即可。
> EdgeOne Pages 版请看 `main` 分支。

把两个 OpenAI 兼容接口合成一个网关：**隐藏真实 API Key、统一入口、自动降级**。

- **Groq** —— 官方，速度快，需 API Key
- **LLM7.io** —— **可匿名使用（无需注册、无需 Key）**，作为永久兜底

任何一个挂了，自动切另一个。**推荐用这个版本**：Workers 跑在海外节点，访问 Groq 无地区封锁。

---

## 快速开始（最省事：什么都不配）

1. 部署
2. **一个环境变量都不用配**
3. 直接调：

```bash
curl https://你的worker.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-oss-120b","messages":[{"role":"user","content":"hi"}]}'
```

LLM7 支持匿名，网关会用占位 Key 直接调通。

---

## 部署

**方式一：Git 集成（推荐）**

Cloudflare Dashboard → Workers & Pages → Create → Connect to Git → 选本仓库、**分支 `cloudflare`**

| 配置项 | 值 |
|---|---|
| Build command | 留空 |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

**方式二：命令行**

```bash
git clone -b cloudflare https://github.com/suanx/groq-edgeone-proxy.git
cd groq-edgeone-proxy
npx wrangler deploy
```

---

## 环境变量

Dashboard → 你的 Worker → Settings → **Variables and Secrets** → Add

| 变量名 | 说明 | 必填 |
|---|---|---|
| `GROQ_API_KEY` | Groq Key（`gsk_...`） | 否 |
| `LLM7_API_KEY` | LLM7 token（可选，提速率） | 否 |
| `ACCESS_KEY` | 你的网关密码 | 否（推荐） |
| `PROVIDER_ORDER` | 上游优先级，如 `llm7,groq` | 否，默认 `groq,llm7` |

| 场景 | 怎么配 | 效果 |
|---|---|---|
| 零配置 | 都不配 | 走 LLM7 匿名 |
| 隐藏 Key（推荐） | `GROQ_API_KEY` + `ACCESS_KEY` | 客户端只带 `ACCESS_KEY`，真实 Key 不泄露 |
| 只要 LLM7 | 只配 `ACCESS_KEY` | Groq 跳过，LLM7 兜底 |

⚠️ 改完**必须重新部署**（Deployments → Retry）才生效。
`wrangler.toml` 已加 `keep_vars = true`，以后部署不会被清空。

---

## 路由

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | **落地页**：上游状态、端点清单、快速开始代码 |
| GET | `/test` | **在线测试页**：浏览器里直接发请求，看流式输出 |
| GET | `/healthz` | 连通性自检（探测所有上游，JSON） |
| * | `/v1/*` | 自动选上游，**失败自动降级** |
| * | `/groq/v1/*` | 强制走 Groq |
| * | `/llm7/v1/*` | 强制走 LLM7 |

响应头 `X-Upstream-Provider` 告诉你实际由谁服务；降级过会带 `X-Fallback-Log`。

### 两个页面

**落地页 `/`** —— 部署完直接打开域名：
- 两个上游的配置状态（只显示"已配置/未配置"，**不回显任何真实 Key**）
- 当前调度顺序、全部端点清单
- 按你的域名自动生成的 Python / cURL 代码，一键复制
- 沉浸式翻译等客户端的填表参数

**测试页 `/test`** —— 不用装任何工具就能验证网关：
- Access Key 自动存 localStorage
- 选模型、选端点（自动 / 强制 Groq / 强制 LLM7）
- 流式 SSE 实时逐字输出
- 底部显示**这次请求命中的上游**、耗时、降级记录

调试时用它区分"网关问题"还是"上游问题"：切到 `/llm7/v1` 单独测，能排除 Groq 干扰。

---

## 怎么用

**接口地址：** `https://你的worker.workers.dev/v1`

```python
from openai import OpenAI

client = OpenAI(
    api_key="你的 ACCESS_KEY",   # 没配 ACCESS_KEY 就随便填，如 "unused"
    base_url="https://你的worker.workers.dev/v1"
)

resp = client.chat.completions.create(
    model="gpt-oss-120b",       # 通用别名，自动按上游翻译
    messages=[{"role": "user", "content": "你好"}],
    stream=True
)
for chunk in resp:
    print(chunk.choices[0].delta.content or "", end="")
```

**沉浸式翻译等客户端：**
- API 端点：`https://你的worker.workers.dev/v1/chat/completions`
- 密钥：你的 `ACCESS_KEY`
- 模型：`gpt-oss-120b`

---

## 模型别名

| 通用别名 | Groq 实际 ID | LLM7 实际 ID |
|---|---|---|
| `gpt-oss-120b` | `openai/gpt-oss-120b` | `gpt-oss` |
| `gpt-oss-20b` | `openai/gpt-oss-20b` | `gpt-oss:20b` |
| `qwen` | `qwen/qwen3.8-27b` | `qwen3-235b` |

上游返回 404 时会自动用默认模型重试一次。

> ⚠️ Groq 的 `llama-3.3-70b-versatile`、`llama-3.1-8b-instant` 已于 2026-08-16 对免费档下架。
> 实时列表：`GET /v1/models`

---

## 额度参考（2026-10，随时可能变）

| | Groq 免费档 | LLM7 匿名 | LLM7 免费 token |
|---|---|---|---|
| 每日 Token | — | 50万 | 100万 |
| 速率 | 30次/分 | 10次/分 | 60次/分 |
| 每小时 | — | 60次 | 250次 |
| 注册 | 需邮箱 | **无需** | 邮箱即可 |

---

## 排错

| 现象 | 原因 | 解决 |
|---|---|---|
| `/healthz` 里 groq 403 | Groq 地区封锁或 Key 无效 | 换部署区域 / 检查 Key / 只用 LLM7 |
| 返回 401 | `ACCESS_KEY` 不对 | 检查 `Authorization: Bearer xxx` |
| 返回 429 | 超免费额度 | 等一分钟，或换上游 |
| 响应头显示走了 llm7 | Groq 挂了已降级 | 正常，看 `X-Fallback-Log` |
| 改了变量没生效 | 未重新部署 | Deployments → Retry |

---

## 关于 LLM7 的风险

LLM7.io 是**英国个人运营的第三方聚合网关**（AGPL 开源），背后转接 Azure / Cloudflare / DeepSeek / Mistral / OpenAI 等。

- prompt 会经过第三方，**别发敏感内容**
- 可因"滥用"**无通知停你的访问**
- 模型真实性无法完全核实

适合个人折腾、原型、兜底；别押生产，别发隐私数据。

---

MIT License
