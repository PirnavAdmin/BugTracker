const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const BEDROCK_REGION = process.env.BEDROCK_REGION || "ap-south-1";
const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID || "global.amazon.nova-2-lite-v1:0";
const MAX_DESCRIPTION_WORDS = 350;
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

module.exports = {
  BEDROCK_MODEL_ID,
  BEDROCK_REGION,
  MAX_DESCRIPTION_WORDS,
  enforceDescriptionWordLimit,
  generateWorkItemDescription,
  setBedrockClientForTests,
};
