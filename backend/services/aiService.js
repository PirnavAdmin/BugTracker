const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const BEDROCK_REGION = "ap-south-1";
const BEDROCK_MODEL_ID = "global.amazon.nova-2-lite-v1:0";
const SUPPORTED_WORK_ITEM_TYPES = new Set(["Task", "Bug"]);

const systemPrompt = `You are CureCode AI, an engineering work-item assistant.

Generate a concise, practical description from the information provided.

Never fabricate technical details.

Never assume a specific technology, API, database, architecture, business rule, performance target, security requirement, deadline, dependency, effort estimate, or implementation detail unless explicitly provided.

Do not turn assumptions into requirements.

When information is missing, keep the description general and actionable.

For Bugs, do not claim a root cause unless the root cause is provided.

For Tasks, describe intended work without inventing implementation details.

For Bugs, describe the reported problem, investigation/fix scope, expected behavior, and testable acceptance criteria.

Return only the requested Markdown description.`;

let bedrockClient;

const getBedrockClient = () => {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: BEDROCK_REGION,
    });
  }

  return bedrockClient;
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

Generate a concise bug description using exactly these Markdown sections:

## Problem

## Scope

## Expected Behavior

## Acceptance Criteria

Do not fabricate reproduction steps, browser versions, error messages, stack traces, APIs, database changes, HTTP status codes, technical root causes, or implementation details. If the exact root cause is not provided, use wording such as "Investigate the cause of the reported issue."`;
  }

  return `${contextLines.join("\n")}

Generate a concise task description using exactly these Markdown sections:

## Objective

## Scope

## Acceptance Criteria

Do not invent exact token expiration times, file sizes, response times, technologies, APIs, database schemas, integrations, exact security mechanisms, effort estimates, dependencies, assignees, or business rules unless explicitly supplied.`;
};

const extractMarkdownFromConverseResponse = (response = {}) => {
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
          maxTokens: 700,
          temperature: 0.2,
          topP: 0.9,
        },
      })
    );
    const description = extractMarkdownFromConverseResponse(response);

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
  generateWorkItemDescription,
};
