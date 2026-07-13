const { formatDate } = require("../utils/dateTime");

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatIssueListHtml = (issues = []) =>
  issues
    .map(
      (issue) => `
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; font-weight: 600;">${escapeHtml(
            issue.key
          )}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0;">${escapeHtml(
            issue.title
          )}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0;">${escapeHtml(
            issue.type
          )}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0;">${escapeHtml(
            issue.priority
          )}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0;">${escapeHtml(
            issue.status
          )}</td>
        </tr>
      `
    )
    .join("");

const formatIssueListText = (issues = []) =>
  issues
    .map(
      (issue) =>
        `- ${issue.key} | ${issue.title} | ${issue.type} | ${issue.priority} | ${issue.status}`
    )
    .join("\n");

const buildSprintStartedAssigneeEmail = (payload = {}) => {
  const sprintName = payload?.sprint?.name || "Sprint";
  const projectName = payload?.project?.name || "Project";
  const boardUrl = payload?.sprint?.boardUrl || payload?.project?.boardUrl || "";
  const issues = Array.isArray(payload?.issues) ? payload.issues : [];

  return {
    subject: `Sprint Started - New Assigned Work Items: ${sprintName}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #2563EB;">Sprint work has started</h2>
        <p>Hello ${escapeHtml(payload?.recipientName || "teammate")},</p>
        <p>Your assigned sprint work is now active.</p>

        <p><b>Sprint:</b> ${escapeHtml(sprintName)}</p>
        <p><b>Project:</b> ${escapeHtml(projectName)}</p>
        <p><b>Dates:</b> ${escapeHtml(formatDate(payload?.sprint?.startDate))} to ${escapeHtml(
          formatDate(payload?.sprint?.endDate)
        )}</p>

        <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
          <thead>
            <tr style="background: #F8FAFC; color: #334155; text-align: left;">
              <th style="padding: 10px 12px; border-bottom: 1px solid #CBD5E1;">Issue Key</th>
              <th style="padding: 10px 12px; border-bottom: 1px solid #CBD5E1;">Title</th>
              <th style="padding: 10px 12px; border-bottom: 1px solid #CBD5E1;">Type</th>
              <th style="padding: 10px 12px; border-bottom: 1px solid #CBD5E1;">Priority</th>
              <th style="padding: 10px 12px; border-bottom: 1px solid #CBD5E1;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${formatIssueListHtml(issues)}
          </tbody>
        </table>

        ${
          boardUrl
            ? `
          <p style="margin-top: 20px;">
            <a
              href="${escapeHtml(boardUrl)}"
              style="display: inline-block; background: #2563EB; color: #FFFFFF; text-decoration: none; padding: 10px 16px; border-radius: 6px;"
            >
              Open Sprint Board
            </a>
          </p>
        `
            : ""
        }

        <p style="margin-top: 20px; color: #64748B; font-size: 12px;">
          Automated sprint notification from Pirnav Workspace
        </p>
      </div>
    `,
    text: [
      `Your sprint work has started: ${sprintName}`,
      ``,
      `Project: ${projectName}`,
      `Dates: ${formatDate(payload?.sprint?.startDate)} to ${formatDate(payload?.sprint?.endDate)}`,
      ``,
      `Assigned issues:`,
      formatIssueListText(issues),
      boardUrl ? `\nOpen sprint board: ${boardUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
};

const buildSprintStartedStakeholderEmail = (payload = {}) => {
  const sprintName = payload?.sprint?.name || "Sprint";
  const projectName = payload?.project?.name || "Project";
  const boardUrl = payload?.sprint?.boardUrl || payload?.project?.boardUrl || "";
  const assigneeSummaries = Array.isArray(payload?.assigneeSummaries)
    ? payload.assigneeSummaries
    : [];

  return {
    subject: `Sprint started summary: ${sprintName}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #2563EB;">Sprint started summary</h2>
        <p>Hello ${escapeHtml(payload?.recipientName || "stakeholder")},</p>
        <p>${escapeHtml(sprintName)} is now active.</p>

        <p><b>Project:</b> ${escapeHtml(projectName)}</p>
        <p><b>Sprint:</b> ${escapeHtml(sprintName)}</p>
        <p><b>Dates:</b> ${escapeHtml(formatDate(payload?.sprint?.startDate))} to ${escapeHtml(
          formatDate(payload?.sprint?.endDate)
        )}</p>
        <p><b>Total work items:</b> ${Number(payload?.summary?.totalIssues || 0)}</p>
        <p><b>Assigned work items:</b> ${Number(payload?.summary?.assignedIssues || 0)}</p>
        <p><b>Unassigned work items:</b> ${Number(payload?.summary?.unassignedIssues || 0)}</p>

        <div style="margin-top: 16px;">
          ${assigneeSummaries
            .map(
              (entry) => `
                <div style="border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px; margin-bottom: 10px;">
                  <p style="margin: 0 0 8px; font-weight: 700; color: #0F172A;">${escapeHtml(
                    entry.assigneeName || "Unassigned"
                  )}</p>
                  <p style="margin: 0 0 8px; color: #475569; font-size: 13px;">${
                    Number(entry.issueCount || 0)
                  } work item${Number(entry.issueCount || 0) === 1 ? "" : "s"}</p>
                  <div style="color: #334155; font-size: 13px;">${formatIssueListText(
                    entry.issues || []
                  )
                    .split("\n")
                    .map((line) => `<div>${escapeHtml(line)}</div>`)
                    .join("")}</div>
                </div>
              `
            )
            .join("")}
        </div>

        ${
          boardUrl
            ? `
          <p style="margin-top: 20px;">
            <a
              href="${escapeHtml(boardUrl)}"
              style="display: inline-block; background: #2563EB; color: #FFFFFF; text-decoration: none; padding: 10px 16px; border-radius: 6px;"
            >
              Open Sprint Board
            </a>
          </p>
        `
            : ""
        }

        <p style="margin-top: 20px; color: #64748B; font-size: 12px;">
          Automated sprint notification from Pirnav Workspace
        </p>
      </div>
    `,
    text: [
      `Sprint started summary: ${sprintName}`,
      ``,
      `Project: ${projectName}`,
      `Dates: ${formatDate(payload?.sprint?.startDate)} to ${formatDate(payload?.sprint?.endDate)}`,
      `Total work items: ${Number(payload?.summary?.totalIssues || 0)}`,
      `Assigned work items: ${Number(payload?.summary?.assignedIssues || 0)}`,
      `Unassigned work items: ${Number(payload?.summary?.unassignedIssues || 0)}`,
      ``,
      ...assigneeSummaries.map(
        (entry) =>
          `${entry.assigneeName || "Unassigned"} (${Number(entry.issueCount || 0)}):\n${formatIssueListText(
            entry.issues || []
          )}`
      ),
      boardUrl ? `\nOpen sprint board: ${boardUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
};

const buildIssueNotificationEmail = (payload = {}, { subjectPrefix = "" } = {}) => {
  const sprintName = payload?.sprint?.name || "Sprint";
  const projectName = payload?.project?.name || "Project";
  const issue = payload?.issue || {};
  const issueUrl = issue.url || payload?.sprint?.boardUrl || "";

  return {
    subject: `${subjectPrefix}: ${issue.key || "Issue"} ${issue.title || ""}`.trim(),
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #2563EB;">${escapeHtml(subjectPrefix)}</h2>
        <p>Hello ${escapeHtml(payload?.recipientName || "teammate")},</p>
        <p>You have new active sprint work to review.</p>

        <p><b>Sprint:</b> ${escapeHtml(sprintName)}</p>
        <p><b>Project:</b> ${escapeHtml(projectName)}</p>
        <p><b>Issue Key:</b> ${escapeHtml(issue.key || "N/A")}</p>
        <p><b>Title:</b> ${escapeHtml(issue.title || "Untitled work item")}</p>
        <p><b>Type:</b> ${escapeHtml(issue.type || "Task")}</p>
        <p><b>Priority:</b> ${escapeHtml(issue.priority || "Medium")}</p>
        <p><b>Status:</b> ${escapeHtml(issue.status || "To Do")}</p>

        ${
          issueUrl
            ? `
          <p style="margin-top: 20px;">
            <a
              href="${escapeHtml(issueUrl)}"
              style="display: inline-block; background: #2563EB; color: #FFFFFF; text-decoration: none; padding: 10px 16px; border-radius: 6px;"
            >
              Open Work Item
            </a>
          </p>
        `
            : ""
        }

        <p style="margin-top: 20px; color: #64748B; font-size: 12px;">
          Automated sprint notification from Pirnav Workspace
        </p>
      </div>
    `,
    text: [
      `${subjectPrefix}: ${(issue.key || "Issue").trim()} ${(issue.title || "").trim()}`.trim(),
      ``,
      `Sprint: ${sprintName}`,
      `Project: ${projectName}`,
      `Issue Key: ${issue.key || "N/A"}`,
      `Title: ${issue.title || "Untitled work item"}`,
      `Type: ${issue.type || "Task"}`,
      `Priority: ${issue.priority || "Medium"}`,
      `Status: ${issue.status || "To Do"}`,
      issueUrl ? `\nOpen work item: ${issueUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
};

const buildTaskAddedToActiveSprintEmail = (payload = {}) =>
  buildIssueNotificationEmail(payload, {
    subjectPrefix: "New work added to active sprint",
  });

const buildAssigneeChangedInActiveSprintEmail = (payload = {}) =>
  buildIssueNotificationEmail(payload, {
    subjectPrefix: "You have been assigned work in active sprint",
  });

module.exports = {
  buildSprintStartedAssigneeEmail,
  buildSprintStartedStakeholderEmail,
  buildTaskAddedToActiveSprintEmail,
  buildAssigneeChangedInActiveSprintEmail,
};
