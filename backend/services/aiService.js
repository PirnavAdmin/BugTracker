const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const BEDROCK_REGION = process.env.BEDROCK_REGION || "ap-south-1";
const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID || "global.amazon.nova-2-lite-v1:0";
const MAX_DESCRIPTION_WORDS = 350;
const MAX_CODE_REVIEW_DIFF_CHARS = 30000;
const SUPPORTED_WORK_ITEM_TYPES = new Set(["Task", "Bug"]);

const systemPrompt = `You are CureCode AI, an engineering work-item assistant.

Generate a concise, practical software work-item description from the information provided.

Never fabricate technical details.

Never assume a specific technology, API, database, architecture, business rule, performance target, security requirement, deadline, dependency, effort estimate, or implementation detail unless explicitly provided.

Do not turn assumptions into requirements.

When information is missing, keep the description general and actionable.

For Bugs, do not claim a root cause unless the root cause is provided.

For Tasks, describe intended work without inventing implementation details.

For Bugs, naturally describe the reported problem, what should be investigated or fixed, and the expected behavior.

For Tasks, naturally describe what needs to be implemented and the expected outcome.

Return only one natural-language paragraph.

Do not return Markdown, headings, sections, bullet points, numbered lists, checklists, acceptance criteria sections, or implementation steps.

Do not start with phrases such as "Here is the description".

Keep the description professional, concise, and suitable for a software development work item.

Prefer 100 to 200 words when enough, and never exceed 350 words.`;

let bedrockClient;

const getBedrockClient = () => {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: BEDROCK_REGION,
    });
  }

  return bedrockClient;
};

const setBedrockClientForTests = (client) => {
  bedrockClient = client;
};

const normalizeWorkItemType = (value = "Task") => {
  const normalized = String(value || "Task").trim().toLowerCase();

  if (normalized === "bug") {
    return "Bug";
  }

  return "Task";
};

const buildUserPrompt = ({ title, workItemType, projectName, priority }) => {
  const contextLines = [
    `Title: ${title}`,
    `Work item type: ${workItemType}`,
    projectName ? `Project: ${projectName}` : "",
    priority ? `Priority: ${priority}` : "",
  ].filter(Boolean);

  if (workItemType === "Bug") {
    return `${contextLines.join("\n")}

Generate one concise natural-language paragraph for a Bug. Describe the reported issue, what should be investigated or fixed, and the expected behavior. Do not claim a specific root cause unless it is provided. Do not fabricate reproduction steps, browser versions, error messages, stack traces, APIs, database changes, HTTP status codes, technical root causes, or implementation details. Return only the paragraph, with no Markdown, headings, bullet points, numbered lists, checklists, or section labels.`;
  }

  return `${contextLines.join("\n")}

Generate one concise natural-language paragraph for a Task. Describe what needs to be implemented and the expected outcome based primarily on the title and supplied context. Do not invent exact token expiration times, file sizes, response times, technologies, APIs, database schemas, integrations, exact security mechanisms, effort estimates, dependencies, assignees, or business rules unless explicitly supplied. Return only the paragraph, with no Markdown, headings, bullet points, numbered lists, checklists, or section labels.`;
};

const extractTextFromConverseResponse = (response = {}) => {
  const content = response.output?.message?.content;

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => part?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
};

const stripMarkdownStructure = (value = "") =>
  String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^#{1,6}\s+\S+/.test(line))
    .filter(
      (line) =>
        !/^(objective|scope|acceptance criteria|problem|expected behavior|implementation steps|checklist):?$/i.test(
          line
        )
    )
    .map((line) =>
      line
        .replace(/^[-*+]\s+/, "")
        .replace(/^\d+[.)]\s+/, "")
        .replace(/[`*_~]/g, "")
        .trim()
    )
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

const removeIncompleteTrailingSentence = (value = "") => {
  const trimmed = String(value || "").trim();

  if (!trimmed) {
    return "";
  }

  if (/[.!?]$/.test(trimmed)) {
    return trimmed;
  }

  const lastSentenceEnd = Math.max(
    trimmed.lastIndexOf("."),
    trimmed.lastIndexOf("!"),
    trimmed.lastIndexOf("?")
  );

  return lastSentenceEnd > 40 ? trimmed.slice(0, lastSentenceEnd + 1).trim() : trimmed;
};

const enforceDescriptionWordLimit = (value = "", maxWords = MAX_DESCRIPTION_WORDS) => {
  const paragraph = stripMarkdownStructure(value);
  const words = paragraph.split(/\s+/).filter(Boolean);

  if (words.length <= maxWords) {
    return paragraph;
  }

  return removeIncompleteTrailingSentence(words.slice(0, maxWords).join(" "));
};

const codeReviewSystemPrompt = `You are CureCode AI Code Review, a senior software reviewer.

Review only the provided commit context and diffs. Do not infer unrelated repository behavior.

Focus on correctness, security, validation, error handling, data consistency, regressions, performance, code quality, testing impact, and release risk.

Produce one comprehensive review that can serve developers, testers, managers, and administrators. Do not produce separate role-specific reviews.

Never invent files, line numbers, APIs, stack traces, credentials, database schemas, or implementation details.

If a line number is not obvious from the diff hunk, return null for line.

Return only valid JSON. No Markdown. No prose outside JSON.

JSON shape:
{
  "score": 0-100,
  "rating": "Good|Needs Attention|Risky",
  "summary": "one concise paragraph",
  "findings": [
    {
      "severity": "CRITICAL|HIGH|MEDIUM|LOW|SUGGESTION",
      "title": "short title",
      "file": "path from diff",
      "line": number or null,
      "confidence": 0-100,
      "description": "specific issue",
      "whyItMatters": "technical or product impact",
      "recommendation": "specific recommendation"
    }
  ],
  "security": [
    {
      "severity": "CRITICAL|HIGH|MEDIUM|LOW|SUGGESTION",
      "title": "short title",
      "file": "path from diff",
      "line": number or null,
      "confidence": 0-100,
      "description": "specific security issue or empty if none",
      "whyItMatters": "security impact",
      "recommendation": "specific recommendation"
    }
  ],
  "performance": [],
  "codeQuality": [],
  "regressionRisk": {
    "level": "low|medium|high|critical",
    "areas": ["affected feature/module"],
    "reason": "why regression risk is at this level"
  },
  "testing": {
    "risk": "low|medium|high|critical",
    "recommendedTests": ["specific QA scenario"],
    "edgeCases": ["edge case to verify"],
    "affectedModules": ["module or feature"]
  },
  "release": {
    "readiness": "ready|needs_attention|blocked",
    "risks": ["release risk"],
    "recommendations": ["team action"]
  },
  "testingRecommendations": ["..."],
  "positiveObservations": ["..."]
}`;

const buildCodeReviewPrompt = ({
  projectName = "",
  repository = "",
  branch = "",
  commitSha = "",
  commitMessage = "",
  filesChanged = [],
  modulesChanged = [],
  diff = {},
}) => {
  const files = Array.isArray(diff.files) ? diff.files : [];
  const diffText = files
    .map((file) =>
      [
        `File: ${file.filename}`,
        `Status: ${file.status || "modified"}`,
        `Additions: ${file.additions || 0}`,
        `Deletions: ${file.deletions || 0}`,
        file.patch ? `Patch:\n${file.patch}` : "Patch: unavailable",
        file.patchTruncated ? "Patch was truncated for safety." : "",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n---\n\n")
    .slice(0, MAX_CODE_REVIEW_DIFF_CHARS);

  return `Project: ${projectName || "Unknown"}
Repository: ${repository || "Unknown"}
Branch: ${branch || "Unknown"}
Commit SHA: ${commitSha || "Unknown"}
Commit message: ${commitMessage || "No message provided"}
Changed files: ${(filesChanged || []).join(", ") || files.map((file) => file.filename).join(", ") || "Unknown"}
Modules affected: ${(modulesChanged || []).join(", ") || "Unknown"}

Review the following commit diff and return the JSON object only.

${diffText || "No patch text was available."}`;
};

const projectInsightsSystemPrompt = `You are CureCode Project AI Assist, a concise engineering delivery analyst.

Use only the supplied project-scoped facts. Numeric metrics are authoritative: never recalculate, alter, or invent a number. Keep Task metrics and Bug metrics explicitly separate; never call bugs tasks, never call tasks bugs, and never combine their pending/open counts. Never infer people, work items, dates, causes, or activity that are not present. If evidence is limited, say so plainly.

Return only valid JSON:
{"healthSummary":"concise factual interpretation","developerObservations":[{"userId":"supplied id","observation":"factual observation"}],"testerObservations":[{"userId":"supplied id","observation":"factual observation"}],"sprintSummary":"concise sprint interpretation","deliveryRisks":[{"severity":"Critical|High|Medium|Low","risk":"short risk","evidence":"supplied evidence","recommendedAction":"practical action"}],"recommendations":["specific recommendation"]}`;

const extractJsonObject = (value = "") => {
  const text = String(value || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
};

const normalizeFindingSeverity = (value = "") => {
  const normalized = String(value || "").trim().toUpperCase();

  return ["CRITICAL", "HIGH", "MEDIUM", "LOW", "SUGGESTION"].includes(normalized)
    ? normalized
    : "SUGGESTION";
};

const normalizeRiskLevel = (value = "", fallback = "low") => {
  const normalized = String(value || fallback).trim().toLowerCase();

  return ["low", "medium", "high", "critical"].includes(normalized) ? normalized : fallback;
};

const normalizeReleaseReadiness = (value = "") => {
  const normalized = String(value || "needs_attention").trim().toLowerCase();

  return ["ready", "needs_attention", "blocked"].includes(normalized)
    ? normalized
    : "needs_attention";
};

const normalizeStringList = (value, limit = 8, maxLength = 300) =>
  (Array.isArray(value) ? value : [])
    .map((item) => stripMarkdownStructure(item).slice(0, maxLength))
    .filter(Boolean)
    .slice(0, limit);

const normalizeFindingList = (findings = [], limit = 20) =>
  (Array.isArray(findings) ? findings : []).slice(0, limit).map((finding) => ({
    severity: normalizeFindingSeverity(finding?.severity),
    category: String(finding?.category || "").trim().toLowerCase().slice(0, 40),
    title: String(finding?.title || "").trim().slice(0, 160),
    file: String(finding?.file || "").trim().slice(0, 260),
    line:
      finding?.line === null || finding?.line === undefined || finding?.line === ""
        ? null
        : Number.isFinite(Number(finding.line))
          ? Number(finding.line)
          : null,
    confidence: Number.isFinite(Number(finding?.confidence))
      ? Math.max(0, Math.min(100, Number(finding.confidence)))
      : null,
    description: stripMarkdownStructure(finding?.description || "").slice(0, 1000),
    whyItMatters: stripMarkdownStructure(finding?.whyItMatters || finding?.impact || "").slice(0, 1000),
    recommendation: stripMarkdownStructure(finding?.recommendation || "").slice(0, 1000),
    regressionImpact: stripMarkdownStructure(finding?.regressionImpact || "").slice(0, 1000),
  }));

const normalizeCodeReviewResult = (value) => {
  const parsed = typeof value === "string" ? extractJsonObject(value) : value;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid AI code review response");
  }

  const score = Math.max(0, Math.min(100, Number(parsed.score)));

  if (!Number.isFinite(score)) {
    throw new Error("Invalid AI code review score");
  }

  const findings = normalizeFindingList(parsed.findings, 20);
  const testingRecommendations = normalizeStringList(parsed.testingRecommendations, 8, 300);
  const affectedModules = normalizeStringList(
    parsed.testing?.affectedModules || parsed.regressionRisk?.areas,
    12,
    160
  );

  return {
    status: "COMPLETED",
    score: Math.round(score),
    rating: String(parsed.rating || "").trim().slice(0, 80) || "Needs Attention",
    summary: stripMarkdownStructure(parsed.summary || "").slice(0, 1200),
    findings,
    security: normalizeFindingList(parsed.security, 12),
    performance: normalizeFindingList(parsed.performance, 12),
    codeQuality: normalizeFindingList(parsed.codeQuality || parsed.code_quality, 12),
    regressionRisk: {
      level: normalizeRiskLevel(parsed.regressionRisk?.level),
      areas: normalizeStringList(parsed.regressionRisk?.areas, 12, 160),
      reason: stripMarkdownStructure(parsed.regressionRisk?.reason || "").slice(0, 1000),
    },
    testing: {
      risk: normalizeRiskLevel(parsed.testing?.risk),
      recommendedTests: normalizeStringList(
        parsed.testing?.recommendedTests || testingRecommendations,
        12,
        300
      ),
      edgeCases: normalizeStringList(parsed.testing?.edgeCases, 12, 300),
      affectedModules,
    },
    release: {
      readiness: normalizeReleaseReadiness(parsed.release?.readiness),
      risks: normalizeStringList(parsed.release?.risks, 12, 300),
      recommendations: normalizeStringList(parsed.release?.recommendations, 12, 300),
    },
    testingRecommendations,
    positiveObservations: normalizeStringList(parsed.positiveObservations, 8, 300),
  };
};

const normalizeProjectInsightsResult = (value) => {
  const parsed = typeof value === "string" ? extractJsonObject(value) : value;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid AI project insights response");
  }

  const observations = (items) =>
    (Array.isArray(items) ? items : [])
      .slice(0, 30)
      .map((item) => ({
        userId: String(item?.userId || "").trim().slice(0, 80),
        observation: stripMarkdownStructure(item?.observation || "").slice(0, 600),
      }))
      .filter((item) => item.userId && item.observation);
  const severities = new Set(["Critical", "High", "Medium", "Low"]);

  return {
    healthSummary: stripMarkdownStructure(parsed.healthSummary || "").slice(0, 1200),
    developerObservations: observations(parsed.developerObservations),
    testerObservations: observations(parsed.testerObservations),
    sprintSummary: stripMarkdownStructure(parsed.sprintSummary || "").slice(0, 800),
    deliveryRisks: (Array.isArray(parsed.deliveryRisks) ? parsed.deliveryRisks : [])
      .slice(0, 10)
      .map((item) => ({
        severity: severities.has(item?.severity) ? item.severity : "Low",
        risk: stripMarkdownStructure(item?.risk || "").slice(0, 300),
        evidence: stripMarkdownStructure(item?.evidence || "").slice(0, 600),
        recommendedAction: stripMarkdownStructure(item?.recommendedAction || "").slice(0, 600),
      }))
      .filter((item) => item.risk),
    recommendations: normalizeStringList(parsed.recommendations, 10, 500),
  };
};

const generateWorkItemDescription = async ({
  title,
  workItemType = "Task",
  projectName = "",
  priority = "",
} = {}) => {
  const normalizedTitle = String(title || "").trim();

  if (!normalizedTitle) {
    throw new Error("Title is required");
  }

  const normalizedWorkItemType = normalizeWorkItemType(workItemType);

  if (!SUPPORTED_WORK_ITEM_TYPES.has(normalizedWorkItemType)) {
    throw new Error("Unsupported work item type");
  }

  try {
    const response = await getBedrockClient().send(
      new ConverseCommand({
        modelId: BEDROCK_MODEL_ID,
        system: [{ text: systemPrompt }],
        messages: [
          {
            role: "user",
            content: [
              {
                text: buildUserPrompt({
                  title: normalizedTitle,
                  workItemType: normalizedWorkItemType,
                  projectName: String(projectName || "").trim(),
                  priority: String(priority || "").trim(),
                }),
              },
            ],
          },
        ],
        inferenceConfig: {
          maxTokens: 450,
          temperature: 0.2,
          topP: 0.9,
        },
      })
    );
    const description = enforceDescriptionWordLimit(extractTextFromConverseResponse(response));

    if (!description) {
      throw new Error("Empty Bedrock response");
    }

    return description;
  } catch (error) {
    const sanitizedError = new Error("Unable to generate work item description");
    sanitizedError.cause = error;
    throw sanitizedError;
  }
};

const generateCodeReview = async (context = {}) => {
  try {
    const response = await getBedrockClient().send(
      new ConverseCommand({
        modelId: BEDROCK_MODEL_ID,
        system: [{ text: codeReviewSystemPrompt }],
        messages: [
          {
            role: "user",
            content: [{ text: buildCodeReviewPrompt(context) }],
          },
        ],
        inferenceConfig: {
          maxTokens: 1800,
          temperature: 0.1,
          topP: 0.8,
        },
      })
    );
    const reviewText = extractTextFromConverseResponse(response);

    if (!reviewText) {
      throw new Error("Empty Bedrock response");
    }

    const normalizedReview = normalizeCodeReviewResult(reviewText);

    Object.defineProperty(normalizedReview, "__usage", {
      value: response.usage || {},
      enumerable: false,
    });

    return normalizedReview;
  } catch (error) {
    const sanitizedError = new Error("Unable to generate code review");
    sanitizedError.cause = error;
    throw sanitizedError;
  }
};

const generateProjectInsights = async (context = {}) => {
  try {
    const response = await getBedrockClient().send(
      new ConverseCommand({
        modelId: BEDROCK_MODEL_ID,
        system: [{ text: projectInsightsSystemPrompt }],
        messages: [{ role: "user", content: [{ text: JSON.stringify(context) }] }],
        inferenceConfig: { maxTokens: 1800, temperature: 0.1, topP: 0.8 },
      })
    );
    const insights = normalizeProjectInsightsResult(extractTextFromConverseResponse(response));
    Object.defineProperty(insights, "__usage", {
      value: response.usage || {},
      enumerable: false,
    });
    return insights;
  } catch (error) {
    const sanitizedError = new Error("Unable to generate project insights");
    sanitizedError.cause = error;
    throw sanitizedError;
  }
};

module.exports = {
  BEDROCK_MODEL_ID,
  BEDROCK_REGION,
  MAX_CODE_REVIEW_DIFF_CHARS,
  MAX_DESCRIPTION_WORDS,
  enforceDescriptionWordLimit,
  generateCodeReview,
  generateProjectInsights,
  generateWorkItemDescription,
  getBedrockClient,
  normalizeCodeReviewResult,
  normalizeProjectInsightsResult,
  setBedrockClientForTests,
};
