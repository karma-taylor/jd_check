# ResuMatch / 简历全检官

v2.1 简历与 JD 匹配评分版：用户上传简历文件并粘贴目标 JD，系统只做匹配度评分、风险诊断和面试追问预测，不提供简历改写或包装建议。

## 功能

- PDF / DOCX 简历在浏览器本地解析，不上传文件原件。
- 旧版 `.doc` 文件提供文本粘贴降级入口。
- 简历文本限制 `500-4000` 字，JD 文本限制 `100-3000` 字。
- 固定调用官方 Worker 网关，用户零配置。
- Worker 执行 CORS、IP 频控、Turnstile 校验入口和 AI Secret 注入。
- AI 返回 JSON 时渲染匹配分、总评、硬伤、匹配优势、能力缺口、投递风险和面试追问点。

## 已上线地址

- Pages: `https://resumatch-7cv.pages.dev`
- Worker: `https://resumatch-gateway.hamhome-680ce447.workers.dev`

## 输出 Schema

```json
{
  "decision": "强匹配|可投递|谨慎投递|不建议投递",
  "match_score": 0,
  "summary": "总体匹配结论",
  "hard_flaws": [],
  "matched_points": [],
  "missing_points": [],
  "risk_points": [],
  "interview_focus": []
}
```

## 部署

```bash
wrangler deploy
wrangler pages deploy <static-site-dir> --project-name=resumatch --branch=main --commit-dirty=true
```

建议 Pages 只发布包含 `index.html` 的静态目录，避免把 Worker 源码作为静态文件暴露。

## 环境变量

| 名称 | 说明 |
| --- | --- |
| `AI_API_KEY` | AI Provider 密钥，必须通过 secret 配置 |
| `AI_PROVIDER` | `deepseek` 或 `openai` |
| `AI_MODEL` | 默认 `deepseek-chat`，OpenAI 可设为 `gpt-4o-mini` |
| `AI_API_BASE` | Chat Completions 兼容地址 |
| `ALLOWED_ORIGINS` | 官方前端域名，多个域名用英文逗号分隔 |
| `TURNSTILE_REQUIRED` | 是否强制 Turnstile，默认 `false` |
| `TURNSTILE_SECRET_KEY` | Turnstile 服务端密钥，通过 secret 配置 |
| `DAILY_AI_LIMIT` | 全站每日 AI 调用上限，默认 `40` |
| `ADMIN_BYPASS_TOKEN` | 管理员测试绕过限流 token，通过 secret 配置 |

开启 Turnstile 时，还需要把 `index.html` 里的 `TURNSTILE_SITE_KEY` 设置为 Cloudflare Turnstile 站点 Key，并执行：

```bash
wrangler secret put TURNSTILE_SECRET_KEY
```

管理员测试期间如需绕过单 IP 和全站每日限流，先配置：

```bash
wrangler secret put ADMIN_BYPASS_TOKEN
```

然后在浏览器控制台写入同一个 token：

```js
localStorage.setItem("resumatch.adminBypassToken", "你的管理员 token")
```

清除管理员模式：

```js
localStorage.removeItem("resumatch.adminBypassToken")
```

## 成本控制

- Worker KV 按 `CF-Connecting-IP` 做 24 小时 10 次限流。
- Worker KV 按 UTC 日期做全站每日 AI 调用总上限，默认 `40` 次；达到上限后直接返回 `429`，不会继续请求 DeepSeek。
- DeepSeek 后台应设置每日消费 Hard Limit，建议先设低预算灰度观察。

## 安全加固

- Pages 通过 `_headers` 设置 CSP、`X-Frame-Options: DENY`、`nosniff`、Referrer Policy 和权限收敛。
- Worker 限制请求体最大 128KB，避免异常大 payload 消耗边缘资源。
- Worker JSON 响应使用 `Cache-Control: no-store`，避免错误或分析结果被中间层缓存。
- Cloudflare / GitHub 账号必须开启 2FA，并仅保留必要成员写权限。
- Turnstile 代码入口已预留；创建 Site Key / Secret 后，将 `TURNSTILE_REQUIRED` 改为 `true` 并重新部署。
