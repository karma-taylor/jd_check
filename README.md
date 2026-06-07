# ResuMatch / 简历全检官

v2.5 持续准备工作台版：用户上传简历文件并粘贴目标 JD，系统提供阶段式分析反馈、匹配度评分、证据溯源、风险回应准备、本地待办清单、版本 Diff 和朴实打招呼语，不提供虚假经历包装。

## 功能

- PDF / DOCX 简历在浏览器本地解析，不上传文件原件。
- 旧版 `.doc` 文件提供文本粘贴降级入口。
- 简历文本限制 `500-4000` 字，JD 文本限制 `100-3000` 字。
- 固定调用官方 Worker 网关，用户零配置。
- 用户可配置本地求职画像，用于判断 JD 属于 A 类、B 类还是 C 类。
- Worker 执行 CORS、IP 频控、Turnstile 校验入口和 AI Secret 注入。
- AI 返回 JSON 时渲染投递等级、匹配分、总评、硬伤、匹配优势、能力缺口、投递风险和面试追问点。
- 匹配亮点支持展开查看简历证据、对应 JD 要求、证据强度和强化方向。
- 风险项支持手风琴展开，提供风险依据、可迁移能力、诚实回应思路和需要准备的真实证据。
- 匹配提升路径只提示可补充的真实证据，不承诺虚假的精确提分结果。
- 支持导出求职准备清单，承接用户后续面试和材料准备动作。
- 检测期间展示可信阶段文案和报告骨架屏，降低长任务等待焦虑。
- 风险回应思路和真实证据准备项支持复制或加入本地待办清单。
- 最近 10 次报告保存在浏览器本地；同一 JD 重新检测时按稳定 ID 展示新增匹配点、已消除风险和风险降级项。
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
  "matched_points": [
    {
      "requirement_id": "ai_product_delivery",
      "point": "匹配结论",
      "resume_evidence": "简历真实证据",
      "jd_requirement": "对应 JD 要求",
      "evidence_strength": "strong|medium|weak",
      "evidence_gap": "需要补充的真实信息"
    }
  ],
  "risk_points": [
    {
      "risk_id": "industry_experience_gap",
      "requirement_id": "industry_experience",
      "risk": "风险",
      "risk_type": "expression_gap|capability_gap|preference_conflict",
      "reason": "判断依据",
      "resume_evidence": "相关简历证据",
      "transferable_evidence": "可迁移能力",
      "interview_response": "诚实回应思路",
      "evidence_to_prepare": "需要准备的真实证据",
      "risk_level": 1
    }
  ],
  "improvement_path": [],
  "interview_focus": []
}
```

`expression_gap` 仅允许用于“简历已有相邻或部分证据，但缺少范围、数字、结果或职责边界”的情况。简历完全没有支撑证据时，必须返回 `capability_gap`。

`requirement_id` 和 `risk_id` 使用稳定 snake_case 英文标识。前端不依赖模型每次生成的自然语言措辞，而是按稳定 ID 完成版本 Diff。

## 本地状态

- 准备清单保存在 `localStorage` 的 `resumatch.preparationTodos`。
- 最近 10 次报告保存在 `localStorage` 的 `resumatch.reportHistory`。
- 历史报告只用于同一浏览器内的版本 Diff，不上传云端。

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

## Schema 压力测试

`tests/schema-pressure.mjs` 包含 20 组跨行业匿名化真实场景样本，用于检查新 Schema 是否稳定，以及模型能否区分信息表达不足和真实能力缺口。

```bash
set ADMIN_BYPASS_TOKEN=your_admin_token
node tests/schema-pressure.mjs
```

Windows PowerShell 5 如遇中文脚本编码问题，可执行：

```powershell
$env:ADMIN_BYPASS_TOKEN = "your_admin_token"
$script = Get-Content -Raw -Encoding utf8 .\tests\schema-pressure.ps1
Invoke-Expression $script
```

压力测试会真实调用 AI Provider，应在测试环境或管理员模式下谨慎运行。

2026-06-07 实测结果：两轮共 40 次跨行业匿名化真实场景测试均通过新 Schema 校验。第二轮 20/20 样本全部返回 `requirement_id`、`risk_id`，同时保持 `expression_gap` 与 `capability_gap` 分类能力。

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
