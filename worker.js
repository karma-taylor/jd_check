const DEFAULT_ALLOWED_ORIGINS = [];
const DAILY_KEY_TTL_SECONDS = 48 * 60 * 60;
const DEFAULT_PER_IP_DAILY_LIMIT = 40;
const MAX_BODY_BYTES = 128 * 1024;
const DEFAULT_DAILY_COST_LIMIT_CNY = 1;
const DEFAULT_INPUT_CACHE_HIT_PRICE_CNY_PER_1M = 0.5;
const DEFAULT_INPUT_CACHE_MISS_PRICE_CNY_PER_1M = 2;
const DEFAULT_OUTPUT_PRICE_CNY_PER_1M = 8;
const ESTIMATED_SYSTEM_PROMPT_TOKENS = 1800;
const ESTIMATED_OUTPUT_TOKENS = 1200;

const SYSTEM_PROMPT = `# Role
你是一位拥有 10 年以上经验的大厂技术猎头兼研发主管。你只负责判断候选人简历与目标 JD 的匹配度，不改写简历，不提供包装话术，不鼓励夸大或造假。

# Task
请对比分析 [候选人简历] 与 [目标职位 JD]，从严苛筛选视角完成评分诊断：
1. 检查硬性门槛和明显风险，例如年限、核心技术栈、行业经验、学历或资质要求不匹配。
2. 评估简历中已经能支撑 JD 要求的匹配点，并给出简历原文证据、对应 JD 要求和证据强度。
3. 找出 JD 要求但简历证据不足的风险，严格区分“信息表达不足”和“真实能力缺口”。
4. 预测面试官最可能追问的问题。
5. 如果提供了 [用户求职画像]，请根据用户画像判断这份 JD 属于 A/B/C 哪一类；如果画像为空，则根据通用岗位匹配度做保守分档。
6. 给出匹配提升路径，只说明可补充的真实证据和需要准备的材料，不预测虚假的精确提分结果。

# Rules
- 只做匹配评分和风险诊断，不输出简历修改建议。
- 不假设简历没有写出的经历。
- 只有当简历中存在相邻、隐含或部分证据，但缺少范围、数字、结果或职责边界时，才允许将风险分类为 expression_gap（信息表达不足）。
- 如果简历中完全找不到支撑 JD 要求的证据，必须分类为 capability_gap（真实能力缺口），不得暗示候选人做过。
- resume_evidence 必须引用或忠实概括简历中真实存在的内容；找不到证据时必须返回空字符串。
- transferable_evidence 只能使用简历中已有经历，不得包装成候选人未做过的行业经验。
- interview_response 只能提供诚实回应思路，不得生成虚假经历或承诺。
- requirement_id 和 risk_id 必须使用稳定、简短的 snake_case 英文标识，描述能力类别或风险类别，不得包含本次生成的自然语言措辞、序号或随机值。
- 同一项能力或风险在不同简历版本中必须尽量复用同一个 ID，例如 ai_product_delivery、industry_experience_gap、quantified_results_gap。
- 年限差距在 1 年以内且项目证据很强时，可以作为风险点，不必直接判为硬伤。
- A/B/C 分档服务于“是否值得投递”，不能替代 match_score。
- C 类优先由用户明确不考虑项或硬性底线触发；如果只是轻微不匹配，应给 B 类。
- 输出必须稳定、严谨、可解析。

# Output Format
你必须且只能输出一个标准 JSON 对象，不要包含任何前导、后导文本或 Markdown 代码块标记。
Schema:
{
  "decision": "强匹配|可投递|谨慎投递|不建议投递",
  "job_tier": "A|B|C",
  "tier_label": "优先投递|可以尝试|暂不建议",
  "tier_reason": "不超过 100 字的分档原因",
  "matched_preferences": ["命中的用户求职偏好，没有则返回空数组"],
  "blocked_by_preferences": ["触发的用户不考虑项或硬性底线，没有则返回空数组"],
  "match_score": 0-100,
  "summary": "不超过 120 字的总体匹配结论",
  "hard_flaws": ["硬伤或一票否决项，没有则返回空数组"],
  "matched_points": [
    {
      "requirement_id": "稳定的能力要求英文 ID",
      "point": "简历中已经能支撑 JD 的匹配结论",
      "resume_evidence": "简历中的真实证据",
      "jd_requirement": "对应的 JD 要求",
      "evidence_strength": "strong|medium|weak",
      "evidence_gap": "若要增强说服力，需要补充的真实信息；没有则为空字符串"
    }
  ],
  "risk_points": [
    {
      "risk_id": "稳定的风险英文 ID",
      "requirement_id": "该风险对应的能力要求英文 ID",
      "risk": "投递、初筛或面试中的风险",
      "risk_type": "expression_gap|capability_gap|preference_conflict",
      "reason": "判断该风险的依据",
      "resume_evidence": "简历中与风险相关的真实证据；没有则为空字符串",
      "transferable_evidence": "可用于诚实回应风险的可迁移能力；没有则为空字符串",
      "interview_response": "面试时诚实回应该风险的思路",
      "evidence_to_prepare": "需要准备或补充的真实证据",
      "risk_level": 1-3
    }
  ],
  "improvement_path": [
    {
      "priority": 1-3,
      "action": "为重新评估需要补充或确认的真实证据",
      "impact_area": "该行动影响的 JD 要求或风险",
      "requires_real_evidence": true
    }
  ],
  "interview_focus": ["面试官可能追问的问题"]
}`;

const GREETING_PROMPT = `# Role
你是一位务实的求职沟通顾问，只负责生成候选人联系 HR 或招聘方时的简短打招呼语。

# Task
请根据候选人简历、目标 JD、用户求职画像和已有匹配报告，生成 3 条可选打招呼语。

# Rules
- 每条 40-80 个中文字符，适合 Boss、拉勾、猎聘等平台私信开场。
- 语气必须朴实、直接、真诚、简洁。
- 每条引用 1-2 个真实匹配点，只能来自简历、JD 或 report_context，不能编造经历。
- 不使用夸张词或自我包装词，例如“非常优秀”“高度契合”“完美匹配”“强烈推荐自己”。
- 不使用低姿态表达，例如“跪求”“打扰了”“给个机会”。
- A 类可以稍主动；B 类保持克制，表达想进一步确认匹配度；C 类必须谨慎，不能强行说自己匹配。
- 不输出简历改写建议，不输出解释文字。

# Output Format
你必须且只能输出一个标准 JSON 对象，不要包含任何前导、后导文本或 Markdown 代码块标记。
Schema:
{
  "greetings": ["打招呼语 1", "打招呼语 2", "打招呼语 3"]
}`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsHeaders = buildCorsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return json({ error: "Method Not Allowed" }, 405, corsHeaders);
    }

    if (!isAllowedOrigin(origin, env)) {
      return json({ error: "Forbidden origin" }, 403, corsHeaders);
    }

    const contentLength = Number(request.headers.get("Content-Length") || "0");
    if (contentLength > MAX_BODY_BYTES) {
      return json({ error: "请求体过大，请缩短简历或 JD 后重试。" }, 413, corsHeaders);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (error) {
      return json({ error: "请求体必须是 JSON。" }, 400, corsHeaders);
    }

    const turnstileError = await verifyTurnstile(payload.turnstile_token, request, env);
    if (turnstileError) {
      return json({ error: turnstileError }, 403, corsHeaders);
    }

    const resumeText = String(payload.resume_text || "").trim();
    const jdText = String(payload.jd_text || "").trim();
    const action = String(payload.action || "evaluate").trim().toLowerCase();
    const validationError = validatePayload(resumeText, jdText);
    if (validationError) {
      return json({ error: validationError }, 400, corsHeaders);
    }
    if (!["evaluate", "greeting"].includes(action)) {
      return json({ error: "不支持的 action。" }, 400, corsHeaders);
    }

    const isAdminBypass = isAdminBypassRequest(request, env);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const userProfile = normalizeUserProfile(payload.user_profile);
    const reportContext = normalizeReportContext(payload.report_context);
    const userContent =
      action === "greeting"
        ? buildGreetingUserContent(resumeText, jdText, userProfile, reportContext)
        : buildEvaluateUserContent(resumeText, jdText, userProfile);
    const estimatedCostCny = estimateRequestCostCny(userContent);

    if (!isAdminBypass) {
      if (await isRateLimited(ip, env)) {
        return json({ error: "今日该 IP 检测次数已达 40 次上限，请明天再试。" }, 429, corsHeaders);
      }

      if (await wouldExceedDailyCostLimit(env, estimatedCostCny)) {
        return json({ error: "今日全站 AI 预算已接近 1 元上限，请明天再试。" }, 429, corsHeaders);
      }
    }

    try {
      const aiResult =
        action === "greeting"
          ? await generateGreetings(userContent, env)
          : await evaluateWithAi(userContent, env);
      if (!isAdminBypass) {
        await Promise.all([
          incrementRateLimit(ip, env),
          incrementDailyCost(env, calculateUsageCostCny(aiResult.usage) || estimatedCostCny)
        ]);
      }
      return new Response(aiResult.content, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Cache-Control": "no-store"
        }
      });
    } catch (error) {
      return json({ error: error.message || "AI 服务暂时不可用。" }, 502, corsHeaders);
    }
  }
};

function getAllowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || env.OFFICIAL_ORIGIN || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function isAllowedOrigin(origin, env) {
  return getAllowedOrigins(env).includes(origin);
}

function buildCorsHeaders(origin, env) {
  const allowed = isAllowedOrigin(origin, env);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Bypass",
    "Access-Control-Max-Age": "86400"
  };
}

function isAdminBypassRequest(request, env) {
  const expectedToken = String(env.ADMIN_BYPASS_TOKEN || "").trim();
  const providedToken = String(request.headers.get("X-Admin-Bypass") || "").trim();
  return Boolean(expectedToken && providedToken && expectedToken === providedToken);
}

async function verifyTurnstile(token, request, env) {
  const required = String(env.TURNSTILE_REQUIRED || "false").toLowerCase() === "true";
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!required && !secret) return "";
  if (!secret) return "Turnstile 未配置服务端密钥。";
  if (!token) return "请先完成人机校验。";

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);
  formData.append("remoteip", request.headers.get("CF-Connecting-IP") || "");

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData
  });
  const result = await response.json();
  return result.success ? "" : "人机校验未通过，请刷新页面后重试。";
}

async function isRateLimited(ip, env) {
  if (!env.RATE_LIMIT_KV) return false;
  const current = Number((await env.RATE_LIMIT_KV.get(getRateLimitKey(ip))) || "0");
  return current >= getPerIpDailyLimit(env);
}

async function incrementRateLimit(ip, env) {
  if (!env.RATE_LIMIT_KV) return;
  const key = getRateLimitKey(ip);
  const current = Number((await env.RATE_LIMIT_KV.get(key)) || "0");
  await env.RATE_LIMIT_KV.put(key, String(current + 1), {
    expirationTtl: DAILY_KEY_TTL_SECONDS
  });
}

async function wouldExceedDailyCostLimit(env, estimatedCostCny) {
  if (!env.RATE_LIMIT_KV) return false;
  const limit = getDailyCostLimitCny(env);
  if (limit <= 0) return false;
  const current = Number((await env.RATE_LIMIT_KV.get(getDailyCostKey())) || "0");
  return current + Math.max(estimatedCostCny, 0) > limit;
}

async function incrementDailyCost(env, costCny) {
  if (!env.RATE_LIMIT_KV) return;
  const limit = getDailyCostLimitCny(env);
  if (limit <= 0) return;
  const key = getDailyCostKey();
  const current = Number((await env.RATE_LIMIT_KV.get(key)) || "0");
  await env.RATE_LIMIT_KV.put(key, String(roundMoney(current + Math.max(costCny, 0))), {
    expirationTtl: DAILY_KEY_TTL_SECONDS
  });
}

function getPerIpDailyLimit(env) {
  const limit = Number(env.PER_IP_DAILY_LIMIT || DEFAULT_PER_IP_DAILY_LIMIT);
  return Number.isFinite(limit) ? limit : DEFAULT_PER_IP_DAILY_LIMIT;
}

function getDailyCostLimitCny(env) {
  const limit = Number(env.DAILY_COST_LIMIT_CNY || DEFAULT_DAILY_COST_LIMIT_CNY);
  return Number.isFinite(limit) ? limit : DEFAULT_DAILY_COST_LIMIT_CNY;
}

function getRateLimitKey(ip) {
  return `rate:${getTodayKey()}:${ip}`;
}

function getDailyCostKey() {
  return `daily-cost-cny:${getTodayKey()}`;
}

function getTodayKey() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function validatePayload(resumeText, jdText) {
  const resumeCount = countText(resumeText);
  const jdCount = countText(jdText);
  if (resumeCount < 500 || resumeCount > 4000) {
    return `简历文本需控制在 500-4000 字，当前为 ${resumeCount} 字。`;
  }
  if (jdCount < 100 || jdCount > 3000) {
    return `JD 文本需控制在 100-3000 字，当前为 ${jdCount} 字。`;
  }
  return "";
}

function normalizeUserProfile(value) {
  const profile = value && typeof value === "object" ? value : {};
  return {
    target_roles: normalizeStringArray(profile.target_roles),
    acceptable_roles: normalizeStringArray(profile.acceptable_roles),
    rejected_roles: normalizeStringArray(profile.rejected_roles),
    target_industries: normalizeStringArray(profile.target_industries),
    rejected_industries: normalizeStringArray(profile.rejected_industries),
    experience_preference: normalizeString(profile.experience_preference),
    salary_preference: normalizeString(profile.salary_preference),
    location_preference: normalizeString(profile.location_preference),
    hard_constraints: normalizeStringArray(profile.hard_constraints)
  };
}

function normalizeReportContext(value) {
  const context = value && typeof value === "object" ? value : {};
  return {
    job_tier: normalizeString(context.job_tier).toUpperCase().slice(0, 1),
    matched_points: normalizeContextItems(context.matched_points, ["point", "resume_evidence"]).slice(0, 8),
    missing_points: normalizeContextItems(context.missing_points, ["risk", "reason"]).slice(0, 8),
    risk_points: normalizeContextItems(context.risk_points, ["risk", "reason"]).slice(0, 8)
  };
}

function normalizeContextItems(value, fields) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return normalizeString(item);
      return fields.map((field) => normalizeString(item[field])).filter(Boolean).join("：");
    })
    .filter(Boolean);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item)).filter(Boolean).slice(0, 20);
}

function normalizeString(value) {
  return String(value || "").trim().slice(0, 200);
}

function countText(value) {
  return String(value || "").replace(/\s+/g, "").length;
}

function buildEvaluateUserContent(resumeText, jdText, userProfile) {
  return `用户求职画像：\n${JSON.stringify(userProfile, null, 2)}\n\n候选人简历：\n${resumeText}\n\n目标岗位 JD：\n${jdText}`;
}

function buildGreetingUserContent(resumeText, jdText, userProfile, reportContext) {
  return `用户求职画像：\n${JSON.stringify(userProfile, null, 2)}\n\n已有匹配报告上下文：\n${JSON.stringify(reportContext, null, 2)}\n\n候选人简历：\n${resumeText}\n\n目标岗位 JD：\n${jdText}`;
}

async function evaluateWithAi(userContent, env) {
  return chatCompletion(env, SYSTEM_PROMPT, userContent);
}

async function generateGreetings(userContent, env) {
  return chatCompletion(env, GREETING_PROMPT, userContent);
}

async function chatCompletion(env, systemPrompt, userContent) {
  const provider = String(env.AI_PROVIDER || "deepseek").toLowerCase();
  const apiKey = env.AI_API_KEY;
  if (!apiKey) {
    throw new Error("Worker 未配置 AI_API_KEY。");
  }

  const endpoint =
    env.AI_API_BASE ||
    (provider === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://api.deepseek.com/chat/completions");
  const model = env.AI_MODEL || (provider === "openai" ? "gpt-4o-mini" : "deepseek-chat");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
    })
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`AI Provider Error ${response.status}: ${raw.slice(0, 500)}`);
  }

  const data = JSON.parse(raw);
  return {
    content: data.choices?.[0]?.message?.content || raw,
    usage: data.usage || null
  };
}

function estimateRequestCostCny(userContent) {
  const inputTokens = countText(userContent) + ESTIMATED_SYSTEM_PROMPT_TOKENS;
  return calculateTokenCostCny({
    prompt_cache_miss_tokens: inputTokens,
    completion_tokens: ESTIMATED_OUTPUT_TOKENS
  });
}

function calculateUsageCostCny(usage) {
  if (!usage || typeof usage !== "object") return 0;
  const promptTokens = Number(usage.prompt_tokens || 0);
  const completionTokens = Number(usage.completion_tokens || 0);
  const cacheHitTokens = Number(usage.prompt_cache_hit_tokens || 0);
  const cacheMissTokens = Number(usage.prompt_cache_miss_tokens || Math.max(promptTokens - cacheHitTokens, 0));
  if (!promptTokens && !completionTokens && !cacheHitTokens && !cacheMissTokens) return 0;
  return calculateTokenCostCny({
    prompt_cache_hit_tokens: cacheHitTokens,
    prompt_cache_miss_tokens: cacheMissTokens,
    completion_tokens: completionTokens
  });
}

function calculateTokenCostCny(tokens) {
  const hitPrice = DEFAULT_INPUT_CACHE_HIT_PRICE_CNY_PER_1M;
  const missPrice = DEFAULT_INPUT_CACHE_MISS_PRICE_CNY_PER_1M;
  const outputPrice = DEFAULT_OUTPUT_PRICE_CNY_PER_1M;
  const hitCost = (Number(tokens.prompt_cache_hit_tokens || 0) * hitPrice) / 1_000_000;
  const missCost = (Number(tokens.prompt_cache_miss_tokens || 0) * missPrice) / 1_000_000;
  const outputCost = (Number(tokens.completion_tokens || 0) * outputPrice) / 1_000_000;
  return roundMoney(hitCost + missCost + outputCost);
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 1_000_000) / 1_000_000;
}

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cache-Control": "no-store"
    }
  });
}
