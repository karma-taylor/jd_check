const DEFAULT_ALLOWED_ORIGINS = [];
const RATE_LIMIT_WINDOW_SECONDS = 24 * 60 * 60;
const RATE_LIMIT_MAX = 15;

const SYSTEM_PROMPT = `你是一名拥有 10 年以上经验的大厂技术猎头兼研发主管。
请严苛评估候选人简历与目标 JD 的匹配度，重点识别硬性不匹配、履历疑点、技能栈缺口、项目可信度和可修改的表达问题。
你必须只输出 JSON，不要输出 Markdown，不要解释 JSON 外的任何内容。
Schema:
{
  "decision": "强烈推荐|推荐|谨慎推荐|不推荐",
  "match_score": 0-100,
  "hard_flaws": ["硬伤或一票否决点"],
  "strengths": ["与 JD 匹配的优势"],
  "weaknesses": ["短板、疑点或需要补证的地方"],
  "rewrite_suggestions": ["可直接用于修改简历的建议"],
  "interview_focus": ["面试官可能追问的问题"],
  "summary": "不超过 120 字的总体结论"
}`;

export default {
  async fetch(request, env, ctx) {
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

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const rateLimited = await hitRateLimit(ip, env);
    if (rateLimited) {
      return json({ error: "今日检测次数已达上限，请 24 小时后再试。" }, 429, corsHeaders);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (error) {
      return json({ error: "请求体必须是 JSON。" }, 400, corsHeaders);
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
  const allowedOrigins = getAllowedOrigins(env);
  return allowedOrigins.includes(origin);
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
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
