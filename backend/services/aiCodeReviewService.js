const { ConverseCommand } = require("@aws-sdk/client-bedrock-runtime");
const { getBedrockClient, BEDROCK_MODEL_ID } = require("./aiService");

const MAX_DIFF_LENGTH = 60000;
const MAX_CONTEXT_LENGTH = 4000;

const CODE_REVIEW_SYSTEM_PROMPT = `You are CureCode AI, a senior software engineer performing a focused code review.

Review ONLY the supplied code changes and context. Do not invent files, code, requirements, vulnerabilities, or root causes that are not supported by the supplied input.

Focus on actionable findings in these categories:
- security: authentication, authorization, secrets, injection, unsafe input, sensitive data exposure
- bug: incorrect logic, null/undefined risks, runtime failures, edge cases, error handling, race conditions
- performance: unnecessary database queries, expensive operations, memory or API inefficiency
- quality: duplication, maintainability, complexity, error handling, architecture, naming when materially relevant
- devops: Docker, CI/CD, environment configuration, health checks, deployment/resource configuration when applicable
- testing: missing tests, edge cases, regression risks, and useful test recommendations

Do not report purely stylistic preferences.
Do not claim a finding is certain when the diff does not prove it.
Use confidence from 0 to 100.
Use severity critical, high, medium, low, or info.

Return ONLY valid JSON. No Markdown fences and no explanatory text.
The JSON must have exactly this top-level shape:
{
  "score": 0,
  "summary": "",
  "findings": [],
  "positiveObservations": [],
  "testingRecommendations": []
}

Each finding must have:
{
  "severity": "critical|high|medium|low|info",
  "category": "security|bug|performance|quality|devops|testing",
  "title": "",
  "description": "",
  "file": "",
  "line": null,
  "confidence": 0,
  "recommendation": ""
}

Score the submitted change from 0 to 100 based on correctness, security, maintainability, and testing readiness. A score is an assessment, not a gate.`;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizeText = (value, maxLength) =>
  String(value || "").trim().slice(0, maxLength);

const normalizeChangedFiles = (changedFiles = []) => {
  if (!Array.isArray(changedFiles)) {
    return [];
  }

  return changedFiles
    .slice(0, 100)
    .map((file) => {
      if (typeof file === "string") {
        return file.trim().slice(0, 500);
      }

      return {
        filename: normalizeText(file?.filename || file?.path, 500),
        status: normalizeText(file?.status, 40),
        additions: Number.isFinite(Number(file?.additions)) ? Number(file.additions) : 0,
        deletions: Number.isFinite(Number(file?.deletions)) ? Number(file.deletions) : 0,
      };
    })
    .filter((file) => (typeof file === "string" ? file : file.filename));
};

const buildCodeReviewPrompt = ({
  diff,
  changedFiles,
  commitMessage,
  projectContext,
  storyContext,
}) => {
  const files = JSON.stringify(normalizeChangedFiles(changedFiles), null, 2);

  return `Review this CureCode change.

Commit message:
${normalizeText(commitMessage, 1000) || "Not provided"}

Changed files:
${files}

Project context:
${normalizeText(projectContext, MAX_CONTEXT_LENGTH) || "Not provided"}

Story/task context:
${normalizeText(storyContext, MAX_CONTEXT_LENGTH) || "Not provided"}

Unified diff:
${normalizeText(diff, MAX_DIFF_LENGTH)}

Important: review the actual diff. When a line can be identified from the diff, return the relevant changed line number; otherwise use null. Do not fabricate a line number.`;
};

const extractText = (response = {}) => {
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

const extractJsonObject = (text = "") => {
  const normalized = String(text || "").trim();

  try {
    return JSON.parse(normalized);
  } catch {
    const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced) {
      return JSON.parse(fenced[1]);
    }

    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(normalized.slice(start, end + 1));
    }

    throw new Error("Invalid AI review JSON");
  }
};

const normalizeFinding = (finding = {}) => {
  const allowedSeverities = new Set(["critical", "high", "medium", "low", "info"]);
  const allowedCategories = new Set([
    "security",
    "bug",
    "performance",
    "quality",
    "devops",
    "testing",
  ]);

  const severity = String(finding.severity || "info").toLowerCase();
  const category = String(finding.category || "quality").toLowerCase();

  return {
    severity: allowedSeverities.has(severity) ? severity : "info",
    category: allowedCategories.has(category) ? category : "quality",
    title: normalizeText(finding.title, 300),
    description: normalizeText(finding.description, 2000),
    file: normalizeText(finding.file, 500),
    line: Number.isInteger(finding.line) && finding.line > 0 ? finding.line : null,
    confidence: clamp(Number.isFinite(Number(finding.confidence)) ? Number(finding.confidence) : 0, 0, 100),
    recommendation: normalizeText(finding.recommendation, 2000),
  };
};

const normalizeReview = (review = {}) => ({
  score: clamp(Number.isFinite(Number(review.score)) ? Number(review.score) : 0, 0, 100),
  summary: normalizeText(review.summary, 3000),
  findings: Array.isArray(review.findings)
    ? review.findings.slice(0, 50).map(normalizeFinding).filter((finding) => finding.title && finding.description)
    : [],
  positiveObservations: Array.isArray(review.positiveObservations)
    ? review.positiveObservations.slice(0, 20).map((item) => normalizeText(item, 1000)).filter(Boolean)
    : [],
  testingRecommendations: Array.isArray(review.testingRecommendations)
    ? review.testingRecommendations.slice(0, 30).map((item) => normalizeText(item, 1000)).filter(Boolean)
    : [],
});

const reviewCodeChanges = async ({
  diff,
  changedFiles = [],
  commitMessage = "",
  projectContext = "",
  storyContext = "",
} = {}) => {
  const normalizedDiff = normalizeText(diff, MAX_DIFF_LENGTH);

  if (!normalizedDiff) {
    throw new Error("Code diff is required");
  }

  try {
    const response = await getBedrockClient().send(
      new ConverseCommand({
        modelId: BEDROCK_MODEL_ID,
        system: [{ text: CODE_REVIEW_SYSTEM_PROMPT }],
        messages: [
          {
            role: "user",
            content: [
              {
                text: buildCodeReviewPrompt({
                  diff: normalizedDiff,
                  changedFiles,
                  commitMessage,
                  projectContext,
                  storyContext,
                }),
              },
            ],
          },
        ],
        inferenceConfig: {
          maxTokens: 1800,
          temperature: 0.1,
          topP: 0.9,
        },
      })
    );

    const rawText = extractText(response);
    const review = normalizeReview(extractJsonObject(rawText));

    if (!review.summary && review.findings.length === 0 && review.testingRecommendations.length === 0) {
      throw new Error("Empty AI code review");
    }

    return {
      ...review,
      modelId: BEDROCK_MODEL_ID,
    };
  } catch (error) {
    const sanitizedError = new Error("Unable to complete AI code review");
    sanitizedError.cause = error;
    throw sanitizedError;
  }
};

module.exports = {
  CODE_REVIEW_SYSTEM_PROMPT,
  MAX_DIFF_LENGTH,
  reviewCodeChanges,
};
