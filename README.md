# ResuMatch / 简历全检官

v2.3 简历与 JD 匹配评分版：用户上传简历文件并粘贴目标 JD，系统只做匹配度评分、A/B/C 投递分档、风险诊断、面试追问预测和朴实打招呼语生成，不提供简历改写或包装建议。

## 功能

- PDF / DOCX 简历在浏览器本地解析，不上传文件原件。
- 旧版 `.doc` 文件提供文本粘贴降级入口。
- 简历文本限制 `500-4000` 字，JD 文本限制 `100-3000` 字。
- 固定调用官方 Worker 网关，用户零配置。
- 用户可配置本地求职画像，用于判断 JD 属于 A 类、B 类还是 C 类。
- Worker 执行 CORS、IP 频控、Turnstile 校验入口和 AI Secret 注入。
- AI 返回 JSON 时渲染投递等级、匹配分、总评、硬伤、匹配优势、能力缺口、投递风险和面试追问点。
- 报告生成后可单独点击“生成打招呼语”，一次返回 3 条朴实、直接、真诚、简洁的 HR 私信开场白。

## 已上线地址

- Pages: `https://resumatch-7cv.pages.dev`
- Worker: `https://resumatch-gateway.hamhome-680ce447.workers.dev`

## 输出 Schema

```json
{
  "decision": "强匹配|可投递|谨慎投递|不建议投递",
  "job_tier": "A|B|C",
  "tier_label": "优先投递|可以尝试|暂不建议",
  "tier_reason": "分档原因",
  "matched_preferences": [],
  "blocked_by_preferences": [],
  "match_score": 0,
  "summary": "总体匹配结论",
  "hard_flaws": [],
  "matched_points": [],
  "missing_points": [],
  "risk_points": [],
  "interview_focus": []
}
```

## 用户画像

第一版不做账号和云端数据库，画像只保存在浏览器 `localStorage`。点击检测时，前端会把画像随本次请求发送给 Worker，用于本次 A/B/C 分档。

```json
{
  "target_roles": [],
  "acceptable_roles": [],
  "rejected_roles": [],
  "target_industries": [],
  "rejected_industries": [],
  "experience_preference": "",
  "salary_preference": "",
  "location_preference": "",
  "hard_constraints": []
}
```

A 类代表优先投递，B 类代表可以尝试，C 类代表暂不建议。C 类优先由用户明确不考虑项或硬性底线触发。

## 打招呼语

前端不会自动生成打招呼语，避免额外消耗 AI 调用。用户点击按钮后，前端会向同一个 Worker POST 接口发送：

```json
{
  "action": "greeting",
  "resume_text": "...",
  "jd_text": "...",
  "user_profile": {},
  "report_context": {
    "job_tier": "A|B|C",
    "matched_points": [],
    "missing_points": [],
    "risk_points": []
  }
}
```

Worker 返回：

```json
{
  "greetings": ["...", "...", "..."]
}
```

打招呼语生成属于一次 AI 调用，受现有单 IP 每日次数、全站每日预算和管理员绕过规则控制。

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
| `PER_IP_DAILY_LIMIT` | 单个 IP 每日 AI 调用上限，默认 `40` |
| `DAILY_COST_LIMIT_CNY` | 全站每日 AI 预算上限，默认 `1` 元 |
| `ADMIN_BYPASS_TOKEN` | 管理员测试绕过限流 token，通过 secret 配置 |

开启 Turnstile 时，还需要把 `index.html` 里的 `TURNSTILE_SITE_KEY` 设置为 Cloudflare Turnstile 站点 Key，并执行：

```bash
wrangler secret put TURNSTILE_SECRET_KEY
```

管理员测试期间如需绕过单 IP 每日次数和全站每日预算，先配置：

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

- Worker KV 按北京时间日期和 `CF-Connecting-IP` 做单 IP 每日限流，默认每个 IP 每天 `40` 次。
- Worker KV 按北京时间日期记录全站每日 AI 成本，默认预算 `1` 元；达到预算前会按保守估算拦截，成功调用后按 DeepSeek usage 记账。
- 成本估算默认按 `deepseek-chat` 保守价格：缓存命中输入 0.5 元 / 100 万 tokens，缓存未命中输入 2 元 / 100 万 tokens，输出 8 元 / 100 万 tokens。
- DeepSeek 后台应设置每日消费 Hard Limit，建议先设低预算灰度观察。

## 安全加固

- Pages 通过 `_headers` 设置 CSP、`X-Frame-Options: DENY`、`nosniff`、Referrer Policy 和权限收敛。
- Worker 限制请求体最大 128KB，避免异常大 payload 消耗边缘资源。
- Worker JSON 响应使用 `Cache-Control: no-store`，避免错误或分析结果被中间层缓存。
- Cloudflare / GitHub 账号必须开启 2FA，并仅保留必要成员写权限。
- Turnstile 代码入口已预留；创建 Site Key / Secret 后，将 `TURNSTILE_REQUIRED` 改为 `true` 并重新部署。
