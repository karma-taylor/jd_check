const DEFAULT_ALLOWED_ORIGINS = [];
const RATE_LIMIT_WINDOW_SECONDS = 24 * 60 * 60;
const RATE_LIMIT_MAX = 10;
const MAX_BODY_BYTES = 128 * 1024;

const SYSTEM_PROMPT = `# Role
你是一位拥有 10 年以上经验的大厂技术猎头兼研发主管。你只负责判断候选人简历与目标 JD 的匹配度，不改写简历，不提供包装话术，不鼓励夸大或造假。

# Task
请对比分析 [候选人简历] 与 [目标职位 JD]，从严苛筛选视角完成评分诊断：
1. 检查硬性门槛和明显风险，例如年限、核心技术栈、行业经验、学历或资质要求不匹配。
2. 评估简历中已经能支撑 JD 要求的匹配点。
3. 找出 JD 要求但简历证据不足的能力缺口。
4. 预测面试官最可能追问的问题。

# Rules
- 只做匹配评分和风险诊断，不输出简历修改建议。
- 不假设简历没有写出的经历。
- 年限差距在 1 年以内且项目证据很强时，可以作为风险点，不必直接判为硬伤。
- 输出必须稳定、严谨、可解析。

# Output Format
你必须且只能输出一个标准 JSON 对象，不要包含任何前导、后导文本或 Markdown 代码块标记。
Schema:
{
  "decision": "强匹配|可投递|谨慎投递|不建议投递",
  "match_score": 0-100,
  "summary": "不超过 120 字的总体匹配结论",
  "hard_flaws": ["硬伤或一票否决项，没有则返回空数组"],
  "matched_points": ["简历中已经能支撑 JD 的匹配点"],
  "missing_points": ["JD 要求但简历证据不足的能力缺口"],
  "risk_points": ["投递、初筛或面试中的风险点"],
  "interview_focus": ["面试官可能追问的问题"]
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

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const rateLimited = await hitRateLimit(ip, env);
    if (rateLimited) {
      return json({ error: "今日检测次数已达上限，请 24 小时后再试。" }, 429, corsHeaders);
    }

    const resumeText = String(payload.resume_text || "").trim();
    const jdText = String(payload.jd_text || "").trim();
    const validationError = validatePayload(resumeText, jdText);
    if (validationError) {
      return json({ error: validationError }, 400, corsHeaders);
    }

    try {
      const aiContent = await evaluateWithAi(resumeText, jdText, env);
      return new Response(aiContent, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8"
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
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
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

async function hitRateLimit(ip, env) {
  if (!env.RATE_LIMIT_KV) {
    return false;
  }

  const key = `rate:${ip}`;
  const current = Number((await env.RATE_LIMIT_KV.get(key)) || "0");
  if (current >= RATE_LIMIT_MAX) {
    return true;
  }

  await env.RATE_LIMIT_KV.put(key, String(current + 1), {
    expirationTtl: RATE_LIMIT_WINDOW_SECONDS
  });
  return false;
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

function countText(value) {
  return String(value || "").replace(/\s+/g, "").length;
}

async function evaluateWithAi(resumeText, jdText, env) {
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
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `候选人简历：\n${resumeText}\n\n目标岗位 JD：\n${jdText}`
        }
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
