# Groq 反向代理 (EdgeOne Pages 版)

把 Groq 官方 OpenAI 兼容接口套一层自己的网关：隐藏真实 API Key、统一入口、可加自己的访问密码。

- 上游：`https://api.groq.com/openai/v1`
- 完全兼容 OpenAI SDK，改个 `base_url` 就能用
- 支持 SSE 流式输出
- 零依赖，纯原生 JS

---

## ⚠️ 先读这段：地区封锁风险

**Groq 明确封锁中国大陆 IP**，其接口架在 Cloudflare 上，对大陆出口 IP 直接返回 403，请求根本到不了鉴权那一步。

EdgeOne 的节点以国内和亚太为主，**有可能同样被拦**。

所以部署完**第一件事**是访问：

```
https://你的域名/healthz
```

- 返回 `groq_reachable: true` → 能用，继续
- 返回 `403` 或 `groq_reachable: false` → 当前节点被 Groq 封锁，反代不可用

**如果被封，换 Cloudflare Workers**（海外节点，访问 Groq 无阻碍）。同目录下的 `cf-workers/` 是等价版本。

> 你在美国加州，其实 Cloudflare Workers 才是更稳的选择。

---

## 部署步骤

### 1. 准备 Groq API Key

1. 打开 [console.groq.com](https://console.groq.com) 注册登录
2. 进 API Keys 页面创建一个 Key（以 `gsk_` 开头）
3. 复制保存

免费额度（2026-10 现状，随时可能调整）：

| 项目 | 限制 |
|---|---|
| 请求频率 | 30 次/分钟 |
| 每日请求 | 约 14,400 次 |
| Token | 8,000/分钟、200,000/天 |
| 信用卡 | 不需要 |

### 2. 部署到 EdgeOne Pages

方式一 **Git 导入**：把本目录推到 GitHub 仓库 → EdgeOne Pages 控制台导入 → 自动识别 `edge-functions/`

方式二 **CLI**：

```bash
npm i -g edgeone
edgeone pages init
edgeone pages deploy
```

### 3. 配置环境变量

EdgeOne Pages 控制台 → 你的项目 → **环境变量**，添加：

| 变量名 | 说明 | 是否必填 |
|---|---|---|
| `GROQ_API_KEY` | 你的 Groq Key（`gsk_...`）。配了它，客户端就不用带真实 Key | 推荐 |
| `ACCESS_KEY` | 你自己设的网关密码。配了它，客户端必须带这个才能调用 | 推荐 |

**两种用法，按需选：**

- **隐藏真实 Key**（推荐）：两个都配。客户端只带 `ACCESS_KEY`，真实 `gsk_` 永远不泄露。
- **纯透传**：只配 `GROQ_API_KEY` 或都不配，客户端自己带 Groq Key。

改完环境变量**必须重新部署**才生效。

---

## 怎么用

部署后你会拿到一个域名，比如 `xxx.edgeone.run`。

**接口地址填：**

```
https://xxx.edgeone.run/v1
```

**Python 示例：**

```python
from openai import OpenAI

client = OpenAI(
    api_key="你的 ACCESS_KEY",   # 或 Groq 真实 Key（透传模式）
    base_url="https://xxx.edgeone.run/v1"
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
curl https://xxx.edgeone.run/v1/chat/completions \
  -H "Authorization: Bearer 你的ACCESS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-oss-120b","messages":[{"role":"user","content":"hi"}]}'
```

**沉浸式翻译 / 其他客户端：**
- API 端点：`https://xxx.edgeone.run/v1/chat/completions`
- 密钥：你的 `ACCESS_KEY`
- 模型：`openai/gpt-oss-120b`

---

## 当前可用模型（2026-10）

| 模型 ID | 说明 |
|---|---|
| `openai/gpt-oss-120b` | 最强，500 tok/s |
| `openai/gpt-oss-20b` | 轻量快，1000 tok/s |
| `qwen/qwen3.8-27b` | 中文较好 |
| `whisper-large-v3` | 语音转文字 |

> `llama-3.3-70b-versatile`、`llama-3.1-8b-instant` 已于 2026-08-16 对免费档下架，别再填了。
> 实时列表：`GET https://xxx.edgeone.run/v1/models`

---

## 文件结构

```
edge-functions/
├── _lib/groq.js              # 共享转发库（不会暴露为路由）
├── healthz.js                # GET  /healthz        连通性自检
├── v1/
│   ├── models.js             # GET  /v1/models
│   └── chat/
│       └── completions.js    # POST /v1/chat/completions
└── [[default]].js            # 兜底：其余 /v1/* 全转发
```

---

## 排错

| 现象 | 原因 | 解决 |
|---|---|---|
| `/healthz` 返回 403 | 节点被 Groq 地区封锁 | 换 Cloudflare Workers |
| 返回 401 | `ACCESS_KEY` 不对 | 检查请求头 `Authorization: Bearer xxx` |
| 返回 502 带"无法连接" | 网络不通 | 同上 |
| 返回 429 | 超 Groq 免费额度 | 等一分钟，或换模型 |
| 模型 404 | 模型已下架 | 用 `/v1/models` 查实时列表 |
| 改了环境变量没生效 | 未重新部署 | 重新部署一次 |
