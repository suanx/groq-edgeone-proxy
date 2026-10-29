# AI 网关：Groq · LLM7 · Kilo · NVIDIA 四上游反向代理

把四个 OpenAI 兼容接口合成一个网关：**隐藏真实 API Key、统一入口、自动降级**。

- **Groq** —— 官方，速度快，需 API Key
- **LLM7.io** —— **可匿名使用**，永久兜底
- **Kilo Gateway** —— **完全匿名，零注册**，19+ 个 `:free` 模型
- **NVIDIA NIM** —— 100+ 开源模型，需 Key

任何一个挂了自动切下一个。完全不配置也能跑起来（Kilo / LLM7 匿名档）。

| 能力 | 说明 |
|---|---|
| OpenAI 协议兼容 | 改个 `base_url` 就能用，SDK 无需改 |
| SSE 流式透传 | 逐字输出，不被中间层缓冲 |
| 自动降级 | 上游 4xx/5xx/网络错误自动切下一个 |
| 模型名自动翻译 | `gpt-oss-120b` 在两个上游自动映射成各自 ID |
| 隐藏真实 Key | 客户端只用你设的 `ACCESS_KEY` |
| 零依赖 | 纯原生 JS，无 npm 包 |

---

## ⚠️ 地区限制先看这里

**Groq 明确封锁中国大陆 IP**（接口架在 Cloudflare 上，对大陆出口 IP 返回 403）。
EdgeOne 节点以国内/亚太为主，**有可能被拦**。

**LLM7.io 无此限制，且匿名可用** —— 这也是加它的最大意义：**保证网关永远有活路**。

部署后第一件事，访问：

```
https://你的域名/healthz
```

会同时探测两个上游，直接告诉你哪个能用。

---

## 快速开始（最省事：什么都不配）

1. 部署本项目
2. **一个环境变量都不用配**
3. 直接调：

```bash
curl https://你的域名/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-oss-120b","messages":[{"role":"user","content":"hi"}]}'
```

因为 LLM7 支持匿名，网关会用占位 Key 直接调通。Groq 因为没配 Key 会被跳过。

---

## 环境变量

| 变量名 | 说明 | 必填 |
|---|---|---|
| `GROQ_API_KEY` | Groq Key（`gsk_...`） | 否 |
| `LLM7_API_KEY` | LLM7 token（提速率用） | 否 |
| `KILO_API_KEY` | Kilo Key（可选，匿名档已够用） | 否 |
| `NVIDIA_API_KEY` | NVIDIA NIM Key（`nvapi-...`） | 否 |
| `ACCESS_KEY` | 你的网关密码 | 否（推荐） |
| `PROVIDER_ORDER` | 上游优先级，如 `kilo,llm7,groq,nvidia` | 否，默认 `groq,llm7,kilo,nvidia` |

**几种用法：**

| 场景 | 怎么配 | 效果 |
|---|---|---|
| 零配置 | 都不配 | Kilo + LLM7 匿名档直接可用 |
| 隐藏 Key（推荐） | 配上游 Key + `ACCESS_KEY` | 客户端只带 `ACCESS_KEY`，真实 Key 不泄露 |
| 只要匿名 | 只配 `ACCESS_KEY` | 走 Kilo + LLM7，无需任何注册 |

> 未配置 Key 的上游会被自动跳过，不参与降级链。

⚠️ 改完环境变量**必须重新部署**才生效。

---

## 路由

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | **落地页**：上游状态、端点清单、快速开始代码 |
| GET | `/test` | **在线测试页**：浏览器里直接发请求，看流式输出 |
| GET | `/healthz` | 连通性自检（探测所有上游，JSON） |
| * | `/v1/*` | 按 `PROVIDER_ORDER` 自动选，**失败自动降级** |
| * | `/groq/v1/*` | 强制走 Groq |
| * | `/llm7/v1/*` | 强制走 LLM7 |
| * | `/kilo/v1/*` | 强制走 Kilo |
| * | `/nvidia/v1/*` | 强制走 NVIDIA |

具体：`/v1/chat/completions`、`/v1/models`、`/kilo/v1/models`、`/nvidia/v1/chat/completions` ……

响应头会带 `X-Upstream-Provider`，告诉你这条请求实际由谁服务；降级过的话带 `X-Fallback-Log`。

### 两个页面

**落地页 `/`** —— 部署后直接打开域名就能看到：
- 两个上游的配置状态（只显示"已配置/未配置"，**不会回显任何真实 Key**）
- 当前调度顺序
- 全部端点清单
- 按你的域名自动生成的 Python / cURL 代码，一键复制
- 沉浸式翻译等客户端的填表参数

**测试页 `/test`** —— 不用装任何工具就能验证网关是否工作：
- 填 Access Key（自动存 localStorage，下次不用重填）
- 选模型、选端点（自动 / 强制 Groq / 强制 LLM7）
- 流式 SSE 或非流式
- 实时逐字显示输出，底部显示**这次请求命中的上游**、耗时、降级记录

调试时优先用 `/test` 区分是"网关问题"还是"上游问题"：切到 `/llm7/v1` 单独测，就能排除 Groq 的干扰。

---

## 怎么用

**接口地址填：** `https://你的域名/v1`

**Python：**

```python
from openai import OpenAI

client = OpenAI(
    api_key="你的 ACCESS_KEY",   # 没配 ACCESS_KEY 就随便填，如 "unused"
    base_url="https://你的域名/v1"
)

resp = client.chat.completions.create(
    model="gpt-oss-120b",       # 通用别名，会自动按上游翻译
    messages=[{"role": "user", "content": "你好"}],
    stream=True
)
for chunk in resp:
    print(chunk.choices[0].delta.content or "", end="")
```

**沉浸式翻译 / 其他客户端：**
- API 端点：`https://你的域名/v1/chat/completions`
- 密钥：你的 `ACCESS_KEY`
- 模型：`gpt-oss-120b`

---

## 模型别名

填通用别名，网关自动按上游翻译；不认识的 ID 原样透传。

| 通用别名 | Groq | LLM7 | Kilo | NVIDIA |
|---|---|---|---|---|
| `gpt-oss-120b` | `openai/gpt-oss-120b` | `gpt-oss` | `kilo-auto/free` | `openai/gpt-oss-120b` |
| `gpt-oss-20b` | `openai/gpt-oss-20b` | `gpt-oss:20b` | `kilo-auto/free` | `openai/gpt-oss-20b` |
| `qwen` | `qwen/qwen3.8-27b` | `qwen3-235b` | `nvidia/nemotron-3-super-120b-a12b:free` | `qwen/qwen3-235b-a22b` |
| `deepseek` | — | — | `kilo-auto/free` | `deepseek-ai/deepseek-v4.1-flash` |
| `nemotron` | — | — | `nvidia/nemotron-3-ultra-550b-a55b:free` | — |

若上游返回 404（模型不存在），会自动用该上游的默认模型重试一次。

> **Kilo 特殊规则**：免费档只认带 `:free` 后缀的 ID。未登记的模型名会自动回退到 `kilo-auto/free`（自动路由）。
> 想指定具体模型，直接填完整 ID，如 `nvidia/nemotron-3-ultra-550b-a55b:free`。

> ⚠️ Groq 的 `llama-3.3-70b-versatile`、`llama-3.1-8b-instant` 已于 2026-08-16 对免费档下架。
> 实时列表：`GET /v1/models`

---

## 额度参考（2026-10，随时可能变）

| | Groq 免费档 | LLM7 匿名 | LLM7 免费 token | Kilo 匿名 | NVIDIA 免费 |
|---|---|---|---|---|---|
| 速率 | 30次/分 | 10次/分 | 60次/分 | **200次/小时** | 约 40 RPM |
| 每日 Token | 20万 | 50万 | 100万 | 未公布 | 1000 额度/月 |
| 注册 | 需邮箱 | **无需** | 邮箱即可 | **无需** | 需邮箱+手机 |

LLM7 匿名档速率较低（10次/分钟），高频用建议去 `token.llm7.io` 领个免费 token 填进 `LLM7_API_KEY`。

---

## 部署（EdgeOne Pages）

控制台 → 导入 Git 仓库 → 自动识别 `edge-functions/` 目录 → 配环境变量 → 部署。

或用 CLI：

```bash
npm i -g edgeone
edgeone pages init
edgeone pages deploy
```

> 若 `/healthz` 显示 Groq 403 且你需要 Groq，改用 `cf-workers/` 部署到 Cloudflare Workers（海外节点无封锁）。

---

## 文件结构

```
edge-functions/
├── _lib/proxy.js                    # 核心：上游注册、降级、模型翻译
├── _lib/ui.js                       # 落地页 + 测试页 HTML
├── index.js                         # GET  /        落地页
├── test.js                          # GET  /test    在线测试页
├── healthz.js                       # GET  /healthz 连通性自检
├── [[default]].js                   # 兜底：/v1/*、/groq|llm7|kilo|nvidia/v1/*
├── v1/
│   ├── models.js                    # GET  /v1/models
│   └── chat/completions.js          # POST /v1/chat/completions
├── groq/v1/{models.js, chat/completions.js}      # 强制 Groq
├── llm7/v1/{models.js, chat/completions.js}      # 强制 LLM7
├── kilo/v1/{models.js, chat/completions.js}      # 强制 Kilo
└── nvidia/v1/{models.js, chat/completions.js}    # 强制 NVIDIA

build/build-cf.js                    # 由 _lib/ 生成 cf-workers/worker.js（单一数据源）
cf-workers/{worker.js, wrangler.toml}             # Cloudflare Workers 单文件版
```

---

## 排错

| 现象 | 原因 | 解决 |
|---|---|---|
| `/healthz` 里 groq 403 | Groq 地区封锁 | 换 Cloudflare Workers，或只用 LLM7 |
| 两个都不通 | 节点网络受限 | 换平台部署 |
| 返回 401 | `ACCESS_KEY` 不对 | 检查 `Authorization: Bearer xxx` |
| 返回 429 | 超免费额度 | 等一分钟，或换上游 |
| 响应头 `X-Upstream-Provider: llm7` | Groq 挂了已降级 | 正常，看 `X-Fallback-Log` 了解原因 |
| 改了变量没生效 | 未重新部署 | 重新部署一次 |

---

## 关于 LLM7 的风险

LLM7.io 是**英国个人运营的第三方聚合网关**（AGPL 开源），背后转接 Azure / Cloudflare / DeepSeek / Mistral / OpenAI 等。

- 你的 prompt 会经过第三方，**别发敏感内容**
- 它可因"滥用"**无通知停你的访问**
- 声称的模型真实性无法完全核实

适合个人折腾、原型开发、作为兜底；别押生产，别发隐私数据。

---

MIT License
