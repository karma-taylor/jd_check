# ResuMatch / 简历全检官

这是一个按 v1.0 workflow 落地的最小可运行版本：

- `index.html`：HTML5 + Tailwind CSS + Vue3 单页应用。
- `worker.js`：Cloudflare Workers 网关，负责 CORS、IP 频控、服务端密钥注入和 AI 请求转发。
- `wrangler.toml.example`：Cloudflare 部署配置样例。

## 前端能力

- 页面加载时读取 `LocalStorage` 中的历史简历文本并自动回显。
- 简历文本限制 `500-4000` 字，JD 文本限制 `100-3000` 字。
- 点击“开始检测”后锁定按钮为 loading，避免重复并发请求。
- 优先解析 AI 返回的 JSON，并按 `decision`、`match_score`、`hard_flaws`、`strengths`、`weaknesses`、`rewrite_suggestions` 渲染。
- 如果 JSON 解析失败，自动降级为原始 Markdown 报告展示。

## Worker 能力

- 仅允许 `ALLOWED_ORIGINS` 中配置的官方域名调用。
- 基于 `CF-Connecting-IP` 做 24 小时 15 次的频控。
- `AI_API_KEY` 只从 Worker Secret 读取，不暴露给浏览器。
- 默认调用 DeepSeek，也可通过环境变量切换到 OpenAI 兼容接口。
- 固定 `temperature = 0.3`，并要求模型输出 JSON。

## 部署

1. 复制配置：

   ```bash
   cp wrangler.toml.example wrangler.toml
   ```

2. 创建 KV 命名空间，并把返回的 ID 填入 `wrangler.toml`：

   ```bash
   wrangler kv namespace create RATE_LIMIT_KV
   ```

3. 配置密钥：

   ```bash
   wrangler secret put AI_API_KEY
   ```

4. 发布 Worker：

   ```bash
   wrangler deploy
   ```

5. 将 `index.html` 部署到你的官方网站，并把页面里的“Worker 网关地址”设置为 Worker 路由。

## 环境变量

| 名称 | 说明 |
| --- | --- |
| `AI_API_KEY` | AI Provider 密钥，必须通过 secret 配置 |
| `AI_PROVIDER` | `deepseek` 或 `openai` |
| `AI_MODEL` | 默认 `deepseek-chat`，OpenAI 可设为 `gpt-4o-mini` |
| `AI_API_BASE` | Chat Completions 兼容地址 |
| `ALLOWED_ORIGINS` | 官方前端域名，多个域名用英文逗号分隔 |

## 后续增强点

- 极端截断 JSON 可接入 `json-repair`，进一步提升解析成功率。
- 若后续支持 PDF/Word 原件存储，浏览器端应从 `LocalStorage` 升级到 `IndexedDB`。
