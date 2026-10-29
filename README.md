# Groq 反向代理 —— Cloudflare Workers 版

把 Groq 官方 OpenAI 兼容接口套一层自己的网关：隐藏真实 API Key、统一入口、可加自己的访问密码。

> 本分支是 Cloudflare Workers 专用版，文件已在根目录，Workers Git 集成直接选这个分支即可。
> EdgeOne Pages 版请看 `main` 分支。

## 为什么推荐这个版本

Groq 接口架在 Cloudflare 上，**明确封锁中国大陆 IP**（对大陆出口 IP 直接返回 403）。
EdgeOne 节点以国内/亚太为主，很可能同样被拦。Cloudflare Workers 跑在海外节点，访问 Groq 无阻碍。

---

## 部署步骤

### 1. 准备 Groq API Key

1. 打开 [console.groq.com](https://console.groq.com) 注册登录
2. API Keys 页面创建 Key（以 `gsk_` 开头）

免费额度（2026-10 现状，随时可能调整）：

| 项目 | 限制 |
|---|---|
| 请求频率 | 30 次/分钟 |
| 每日请求 | 约 14,400 次 |
| Token | 8,000/分钟、200,000/天 |
| 信用卡 | 不需要 |

### 2. 部署

**方式一：Git 集成（推荐）**

Cloudflare Dashboard → Workers & Pages → Create → Connect to Git → 选本仓库、**`cloudflare` 分支**

| 配置项 | 值 |
|---|---|
| Build command | 留空 |
| Deploy command | `npx wrangler deploy` |

**方式二：命令行**

```bash
git clone -b cloudflare https://github.com/suanx/groq-edgeone-proxy.git
cd groq-edgeone-proxy
npx wrangler deploy
```

### 3. 配置环境变量

Dashboard → 你的 Worker → Settings → **Variables and Secrets** → Add

| 变量名 | 说明 | 是否必填 |
|---|---|---|
| `GROQ_API_KEY` | Groq Key（`gsk_...`）。配了它，客户端不用带真实 Key | 推荐 |
| `ACCESS_KEY` | 网关密码。配了它，客户端必须带这个才能调用 | 推荐 |

**两种用法：**

- **隐藏真实 Key（推荐）**：两个都配。客户端只带 `ACCESS_KEY`，`gsk_` 永远不泄露。
- **纯透传**：都不配，客户端自己带 Groq Key。

⚠️ 改完环境变量**必须重新部署**（Deployments → Retry deployment）才生效。
`wrangler.toml` 里已加 `keep_vars = true`，以后部署不会被清空。

---

## 怎么用

**接口地址：** `https://你的worker.workers.dev/v1`

**Python：**

```python
from openai import OpenAI

client = OpenAI(
    api_key="你的 ACCESS_KEY",
    base_url="https://你的worker.workers.dev/v1"
)

resp = client.chat.completions.create(
    model="openai/gpt-oss-120b",
    messages=[{"role": "user", "content": "你好"}],
    stream=True
)
for chunk in resp:
    print(chunk.choices[0].delta.content or "", end="")
```

**curl 自检：**

```bash
curl https://你的worker.workers.dev/v1/chat/completions \
  -H "Authorization: Bearer 你的ACCESS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-oss-120b","messages":[{"role":"user","content":"hi"}]}'
```

**沉浸式翻译等客户端：**
- API 端点：`https://你的worker.workers.dev/v1/chat/completions`
- 密钥：你的 `ACCESS_KEY`
- 模型：`openai/gpt-oss-120b`

---

## 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/healthz` | 连通性自检 |
| GET | `/v1/models` | 实时模型列表 |
| POST | `/v1/chat/completions` | 对话（支持流式） |
| * | `/v1/*` | 其余路径全转发（语音转写等） |

---

## 当前可用模型（2026-10）

| 模型 ID | 说明 |
|---|---|
| `openai/gpt-oss-120b` | 最强，约 500 tok/s |
| `openai/gpt-oss-20b` | 轻量快，约 1000 tok/s |
| `qwen/qwen3.8-27b` | 中文较好 |
| `whisper-large-v3` | 语音转文字 |

> ⚠️ `llama-3.3-70b-versatile`、`llama-3.1-8b-instant` 已于 2026-08-16 对免费档下架，网上大量教程还在教这个，填了就是 404。
> 实时列表：`GET /v1/models`

---

## 排错

| 现象 | 原因 | 解决 |
|---|---|---|
| `/healthz` 返回 403 | 节点被 Groq 地区封锁 | 换 Worker 部署区域或检查 Key |
| 返回 401 | `ACCESS_KEY` 不对 | 检查请求头 `Authorization: Bearer xxx` |
| 返回 429 | 超免费额度 | 等一分钟，或换模型 |
| 模型 404 | 模型已下架 | 用 `/v1/models` 查实时列表 |
| 改了变量没生效 | 未重新部署 | Deployments → Retry |

---

MIT License
