const DEFAULT_ALLOWED_ORIGINS = [];
const RATE_LIMIT_WINDOW_SECONDS = 24 * 60 * 60;
const RATE_LIMIT_MAX = 10;
const MAX_BODY_BYTES = 128 * 1024;
const DEFAULT_DAILY_AI_LIMIT = 40;

const SYSTEM_PROMPT = `# Role
你是一位拥有 10 年以上经验的大厂技术猎头兼研发主管。你只负责判断候选人简历与目标 JD 的匹配度，不改写简历，不提供包装话术，不鼓励夸大或造假。

# Task
请对比分析 [候选人简历] 与 [目标职位 JD]，从严苛筛选视角完成评分诊断：
1. 检查硬性门槛和明显风险，例如年限、核心技术栈、行业经验、学历或资质要求不匹配。
2. 评估简历中已经能支撑 JD 要求的匹配点。
3. 找出 JD 要求但简历证据不足的能力缺口。
4. 预测面试官最可能追问的问题。
5. 如果提供了 [用户求职画像]，请根据用户画像判断这份 JD 属于 A/B/C 哪一类；如果画像为空，则根据通用岗位匹配度做保守分档。

# Rules
- 只做匹配评分和风险诊断，不输出简历修改建议。
- 不假设简历没有写出的经历。
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
  "matched_points": ["简历中已经能支撑 JD 的匹配点"],
  "missing_points": ["JD 要求但简历证据不足的能力缺口"],
  "risk_points": ["投递、初筛或面试中的风险点"],
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
    if (!isAdminBypass) {
      if (await isRateLimited(ip, env)) {
        return json({ error: "今日检测次数已达上限，请 24 小时后再试。" }, 429, corsHeaders);
      }

      if (await isDailyAiLimited(env)) {
        return json({ error: "今日全站 AI 检测额度已用完，请明天再试。" }, 429, corsHeaders);
      }
    }

    try {
      const userProfile = normalizeUserProfile(payload.user_profile);
      const aiContent =
        action === "greeting"
          ? await generateGreetings(resumeText, jdText, userProfile, normalizeReportContext(payload.report_context), env)
          : await evaluateWithAi(resumeText, jdText, userProfile, env);
      if (!isAdminBypass) {
        await Promise.all([incrementRateLimit(ip, env), incrementDailyAiLimit(env)]);
      }
      return new Response(aiContent, {
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
  const current = Number((await env.RATE_LIMIT_KV.get(`rate:${ip}`)) || "0");
  return current >= RATE_LIMIT_MAX;
}

async function incrementRateLimit(ip, env) {
  if (!env.RATE_LIMIT_KV) return;
  const key = `rate:${ip}`;
  const current = Number((await env.RATE_LIMIT_KV.get(key)) || "0");
  await env.RATE_LIMIT_KV.put(key, String(current + 1), {
    expirationTtl: RATE_LIMIT_WINDOW_SECONDS
  });
}

async function isDailyAiLimited(env) {
  if (!env.RATE_LIMIT_KV) return false;
  const limit = getDailyAiLimit(env);
  if (limit <= 0) return false;
  const current = Number((await env.RATE_LIMIT_KV.get(getDailyAiKey())) || "0");
  return current >= limit;
}

async function incrementDailyAiLimit(env) {
  if (!env.RATE_LIMIT_KV) return;
  const limit = getDailyAiLimit(env);
  if (limit <= 0) return;
  const key = getDailyAiKey();
  const current = Number((await env.RATE_LIMIT_KV.get(key)) || "0");
  await env.RATE_LIMIT_KV.put(key, String(current + 1), {
    expirationTtl: RATE_LIMIT_WINDOW_SECONDS + 60 * 60
  });
}

function getDailyAiLimit(env) {
  const limit = Number(env.DAILY_AI_LIMIT || DEFAULT_DAILY_AI_LIMIT);
  return Number.isFinite(limit) ? limit : DEFAULT_DAILY_AI_LIMIT;
}

function getDailyAiKey() {
  return `daily-ai:${new Date().toISOString().slice(0, 10)}`;
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
    matched_points: normalizeStringArray(context.matched_points).slice(0, 8),
    missing_points: normalizeStringArray(context.missing_points).slice(0, 8),
    risk_points: normalizeStringArray(context.risk_points).slice(0, 8)
  };
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

async function evaluateWithAi(resumeText, jdText, userProfile, env) {
  return chatCompletion(
    env,
    SYSTEM_PROMPT,
    `用户求职画像：\n${JSON.stringify(userProfile, null, 2)}\n\n候选人简历：\n${resumeText}\n\n目标岗位 JD：\n${jdText}`
  );
}

async function generateGreetings(resumeText, jdText, userProfile, reportContext, env) {
  return chatCompletion(
    env,
    GREETING_PROMPT,
    `用户求职画像：\n${JSON.stringify(userProfile, null, 2)}\n\n已有匹配报告上下文：\n${JSON.stringify(reportContext, null, 2)}\n\n候选人简历：\n${resumeText}\n\n目标岗位 JD：\n${jdText}`
  );
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
  return data.choices?.[0]?.message?.content || raw;
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
