const endpoint = process.env.RESUMATCH_ENDPOINT || "https://resumatch-gateway.hamhome-680ce447.workers.dev";
const adminToken = process.env.ADMIN_BYPASS_TOKEN || "";
const origin = process.env.RESUMATCH_ORIGIN || "https://resumatch-7cv.pages.dev";

const scenarios = [
  ["AI产品经理", "企业流程、AI工具、需求分析、原型验证、跨部门推进", "负责AI产品规划、用户研究、模型能力落地和迭代"],
  ["Java后端工程师", "Java、Spring Boot、MySQL、Redis、微服务、线上排障", "负责高并发后端服务、数据库优化和微服务治理"],
  ["数据分析师", "SQL、Excel、Python、可视化、经营分析、指标体系", "负责业务分析、指标体系建设、数据看板和专题洞察"],
  ["用户运营", "活动运营、社群维护、用户反馈、内容策划、留存分析", "负责用户增长、生命周期运营、活动策划和留存提升"],
  ["UI设计师", "界面设计、设计规范、交互协作、组件库、可用性测试", "负责移动端设计、组件库维护和设计体验优化"],
  ["财务产品经理", "财务结算、对账、规则梳理、异常校验、系统协同", "负责财务产品需求、结算流程和对账系统建设"],
  ["供应链产品经理", "采购、库存、供应商协同、流程优化、项目推进", "负责供应链系统规划、库存优化和供应商协同"],
  ["医疗产品经理", "企业工具、流程设计、数据分析、试点推进、用户访谈", "负责医疗信息化产品设计，要求医院业务和医疗行业经验"],
  ["教育产品经理", "课程运营、用户研究、学习路径、数据复盘、产品迭代", "负责在线教育产品规划、学习体验和课程转化"],
  ["SaaS产品经理", "B端流程、权限设计、字段规则、客户访谈、版本规划", "负责SaaS产品需求分析、权限体系和客户交付"],
  ["项目经理", "计划管理、风险识别、多方协同、交付验收、复盘", "负责项目计划、资源协调、风险管理和交付验收"],
  ["市场营销", "项目推进、内容策划、跨团队协同、数据观察、用户反馈", "负责品牌营销、投放策略、渠道增长和营销转化"],
  ["销售经理", "客户沟通、方案介绍、项目协同、合同流程、回款跟进", "负责客户开拓、销售目标、商务谈判和回款"],
  ["测试工程师", "需求评审、异常识别、验收口径、问题复盘、流程校验", "负责测试计划、自动化测试、缺陷管理和质量保障"],
  ["前端工程师", "HTML、CSS、JavaScript、Vue、交互实现、上线部署", "负责Web前端开发、性能优化和组件化建设"],
  ["人力资源产品", "招聘流程、用户访谈、数据统计、流程优化、工具落地", "负责人力资源数字化产品、招聘系统和组织数据分析"],
  ["物流运营", "排班协同、异常处理、日报统计、供应商协同、现场管理", "负责物流运营效率、运力调度和履约质量"],
  ["工业软件产品", "企业流程、现场问题拆解、规则设计、数据校验、试点", "负责工业软件需求、制造现场流程和数字化交付"],
  ["信息安全产品", "权限意识、网关设计、风险控制、日志观察、异常处理", "负责安全产品规划、身份权限、风险策略和合规"],
  ["内容产品经理", "信息订阅、内容分发、结构化摘要、用户反馈、迭代", "负责内容平台、推荐分发、创作者工具和用户增长"]
];

function buildResume(role, skills, index) {
  return `候选人目标方向为${role}。拥有三年项目与产品协作经历，主要工作内容包括${skills}。
曾负责一个跨部门工具项目，从访谈十余名使用者开始，梳理现有流程、角色权限、异常场景和验收口径，输出需求文档、流程图、交互原型和版本计划，并协调业务、技术和测试完成试点。
项目上线后持续收集反馈，按影响范围、使用频次和实现成本安排优先级。候选人在项目中记录了交付周期、异常数量和人工处理耗时，但部分项目描述没有写明具体用户规模或最终业务收益。
另有数据处理项目经验，使用Excel、SQL和Python完成数据清洗、规则校验、异常清单和结果导出。能够解释数据口径，并与业务人员确认人工复核节点。
在项目推进过程中，候选人会记录需求来源、方案取舍、上线验收和异常复盘，能够说明自己承担的职责边界，也能区分个人完成、协同完成和尚未实践的内容。对于陌生行业要求，候选人只说明已有的通用项目能力，不将相邻经验描述为已经拥有的专业行业经验。
候选人还参与过内部培训和交接材料整理，将复杂流程整理成操作说明、字段定义和常见问题清单，帮助新成员理解业务规则。该经历可以支撑沟通和知识沉淀能力，但不能直接证明候选人具备目标岗位要求的全部专业技能。
候选人具备沟通协作、需求拆解和项目推进能力。第${index + 1}组测试样本刻意不补充目标岗位未出现的专业经验，用于验证模型是否能区分信息表达不足与真实能力缺口。`;
}

function buildJd(role, requirements) {
  return `招聘岗位：${role}。岗位职责：${requirements}。负责需求调研、方案设计、项目推进、上线验收和持续迭代。
任职要求：具备相关岗位经验，能够独立分析复杂业务问题并推动跨团队协作；能够使用数据判断问题优先级；有明确项目结果和量化指标者优先。`;
}

function assertReport(report, index) {
  const errors = [];
  if (!["A", "B", "C"].includes(report.job_tier)) errors.push("job_tier");
  if (!Number.isFinite(Number(report.match_score))) errors.push("match_score");
  if (!Array.isArray(report.matched_points)) errors.push("matched_points");
  if (!Array.isArray(report.risk_points)) errors.push("risk_points");
  if (!Array.isArray(report.improvement_path)) errors.push("improvement_path");
  for (const point of report.matched_points || []) {
    if (!point || typeof point !== "object") errors.push("matched_point_object");
    for (const key of ["requirement_id", "point", "resume_evidence", "jd_requirement", "evidence_strength", "evidence_gap"]) {
      if (!(key in (point || {}))) errors.push(`matched_point.${key}`);
    }
    if (!/^[a-z0-9_]+$/.test(point?.requirement_id || "")) errors.push("matched_point.requirement_id_format");
  }
  for (const risk of report.risk_points || []) {
    if (!risk || typeof risk !== "object") errors.push("risk_object");
    if (!["expression_gap", "capability_gap", "preference_conflict"].includes(risk?.risk_type)) errors.push("risk_type");
    for (const key of ["risk_id", "requirement_id", "risk", "reason", "resume_evidence", "transferable_evidence", "interview_response", "evidence_to_prepare", "risk_level"]) {
      if (!(key in (risk || {}))) errors.push(`risk.${key}`);
    }
    if (!/^[a-z0-9_]+$/.test(risk?.risk_id || "")) errors.push("risk.risk_id_format");
    if (!/^[a-z0-9_]+$/.test(risk?.requirement_id || "")) errors.push("risk.requirement_id_format");
  }
  if (errors.length) throw new Error(`样本 ${index + 1} Schema 异常：${[...new Set(errors)].join(", ")}`);
}

async function runScenario(scenario, index) {
  const [role, skills, requirements] = scenario;
  const request = {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(adminToken ? { "X-Admin-Bypass": adminToken } : {})
    },
    body: JSON.stringify({
      action: "evaluate",
      resume_text: buildResume(role, skills, index),
      jd_text: buildJd(role, requirements),
      user_profile: { target_roles: [role], acceptable_roles: [], rejected_roles: [], target_industries: [], rejected_industries: [], experience_preference: "", salary_preference: "", location_preference: "", hard_constraints: [] }
    })
  };
  let response;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(endpoint, { ...request, signal: AbortSignal.timeout(60_000) });
      break;
    } catch (error) {
      lastError = error;
      console.warn(`样本 ${index + 1} 第 ${attempt} 次连接失败，准备重试。`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  if (!response) throw lastError;
  const raw = await response.text();
  if (!response.ok) throw new Error(`样本 ${index + 1} HTTP ${response.status}: ${raw.slice(0, 200)}`);
  const report = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""));
  assertReport(report, index);
  const types = [...new Set(report.risk_points.map((item) => item.risk_type))].join(",");
  return { index: index + 1, role, score: report.match_score, tier: report.job_tier, riskTypes: types };
}

const results = [];
for (let index = 0; index < scenarios.length; index += 1) {
  const result = await runScenario(scenarios[index], index);
  results.push(result);
  console.log(`${result.index}/20 ${result.role}: ${result.tier} / ${result.score} / ${result.riskTypes}`);
}

console.log(`PASS: ${results.length}/20 个跨行业匿名化真实场景样本通过新 Schema 校验。`);
