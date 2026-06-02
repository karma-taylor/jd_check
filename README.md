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

开启 Turnstile 时，还需要把 `index.html` 里的 `TURNSTILE_SITE_KEY` 设置为 Cloudflare Turnstile 站点 Key，并执行：

```bash
wrangler secret put TURNSTILE_SECRET_KEY
```

## 成本控制

- Worker KV 按 `CF-Connecting-IP` 做 24 小时 10 次限流。
- DeepSeek 后台应设置每日消费 Hard Limit，建议先设低预算灰度观察。
