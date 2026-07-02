import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createComment,
  createIssueWorklog,
  fetchComments,
  fetchIssueAttachments,
  fetchIssueHistory,
  fetchIssueWorklogs,
  resolveApiAssetUrl,
  suggestIssuePriority,
  uploadIssueAttachment,
  downloadAttachment,
} from "@/lib/api";
import {
  getIssueDisplayKey,
  getIssuePriorityVariant,
  getIssueStatusLabel,
  getIssueStatusVariant,
  getIssueTypeVariant,
  getWorkflowStatusOptionsForIssue,
  resolveIssueAssigneeId,
} from "@/lib/issues";
import { getProjectTeamMembers } from "@/lib/project-teams";
import { formatDate, formatDateTime, getInitials } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const createPlanningDraft = (issue) => ({
  epicId: issue?.epicId?._id || issue?.epicId || "",
  sprintId: issue?.sprintId?._id || issue?.sprintId || "",
  assigneeId: resolveIssueAssigneeId(issue),
  priority: issue?.priority || "Medium",
  storyPoints:
    issue?.storyPoints === null || typeof issue?.storyPoints === "undefined"
      ? ""
      : String(issue.storyPoints),
});

const createStoryDraft = (issue) => ({
  acceptanceCriteria: Array.isArray(issue?.acceptanceCriteria)
    ? issue.acceptanceCriteria.map((criterion) => ({ ...criterion }))
    : [],
  definitionOfDone: issue?.definitionOfDone || "",
  labels: Array.isArray(issue?.labels) ? issue.labels.join(", ") : "",
  timeEstimateMinutes: issue?.timeEstimateMinutes || 0,
});

const IssueDetailsDrawer = ({
  issue,
  open,
  onOpenChange,
  project,
  epics = [],
  sprints = [],
  permissions = {},
  onUpdatePlanning,
  onUpdateIssue,
  onUpdateStatus,
  isPlanningPending = false,
  isStatusPending = false,
}) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [planningDraft, setPlanningDraft] = useState(createPlanningDraft(issue));
  const [storyDraft, setStoryDraft] = useState(createStoryDraft(issue));
  const [commentText, setCommentText] = useState("");
  const [worklogDraft, setWorklogDraft] = useState({
    minutes: "",
    note: "",
    loggedAt: "",
  });
  const [suggestionDraft, setSuggestionDraft] = useState({
    priority: issue?.priority || "High",
    reason: "",
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!issue) {
      return;
    }

    setPlanningDraft(createPlanningDraft(issue));
    setStoryDraft(createStoryDraft(issue));
    setSuggestionDraft({
      priority: issue.priority || "High",
      reason: "",
    });
    setCommentText("");
    setWorklogDraft({
      minutes: "",
      note: "",
      loggedAt: "",
    });
    setSelectedFile(null);
    setFeedback("");
    setError("");
  }, [issue]);

  const availableMembers = useMemo(
    () => getProjectTeamMembers(project, issue?.teamId?._id || issue?.teamId || ""),
    [issue?.teamId, project]
  );
  const canManagePlanning = Boolean(permissions.canManagePlanning);
  const canUpdateStatus =
    canManagePlanning || String(resolveIssueAssigneeId(issue)) === String(user?._id || "");

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", issue?._id, "backlog"],
    queryFn: () => fetchComments(issue._id),
    enabled: open && Boolean(issue?._id),
  });
  const { data: attachments = [] } = useQuery({
    queryKey: ["issue", issue?._id, "attachments"],
    queryFn: () => fetchIssueAttachments(issue._id),
    enabled: open && Boolean(issue?._id),
  });
  const { data: worklogs = [] } = useQuery({
    queryKey: ["issue", issue?._id, "worklogs"],
    queryFn: () => fetchIssueWorklogs(issue._id),
    enabled: open && Boolean(issue?._id),
  });
  const { data: history = [] } = useQuery({
    queryKey: ["issue", issue?._id, "history"],
    queryFn: () => fetchIssueHistory(issue._id),
    enabled: open && Boolean(issue?._id),
  });

  const createCommentMutation = useMutation({
    mutationFn: createComment,
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({
        queryKey: ["comments", issue?._id, "backlog"],
      });
    },
  });
  const uploadAttachmentMutation = useMutation({
    mutationFn: uploadIssueAttachment,
    onSuccess: () => {
      setSelectedFile(null);
      queryClient.invalidateQueries({
        queryKey: ["issue", issue?._id, "attachments"],
      });
      queryClient.invalidateQueries({
        queryKey: ["issue", issue?._id, "history"],
      });
    },
  });
  const createWorklogMutation = useMutation({
    mutationFn: createIssueWorklog,
    onSuccess: () => {
      setWorklogDraft({
        minutes: "",
        note: "",
        loggedAt: "",
      });
      queryClient.invalidateQueries({
        queryKey: ["issue", issue?._id, "worklogs"],
      });
      queryClient.invalidateQueries({
        queryKey: ["issue", issue?._id, "history"],
      });
    },
  });
  const suggestPriorityMutation = useMutation({
    mutationFn: suggestIssuePriority,
    onSuccess: () => {
      setSuggestionDraft((current) => ({
        ...current,
        reason: "",
      }));
      setFeedback("Priority suggestion sent to the planning history.");
      queryClient.invalidateQueries({
        queryKey: ["comments", issue?._id, "backlog"],
      });
      queryClient.invalidateQueries({
        queryKey: ["issue", issue?._id, "history"],
      });
    },
  });

  if (!issue) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getIssuePriorityVariant(issue.priority)}>{issue.priority}</Badge>
            <Badge variant={getIssueTypeVariant(issue.type)}>{issue.type}</Badge>
            <Badge variant={getIssueStatusVariant(issue.status)}>
              {getIssueStatusLabel(issue.status)}
            </Badge>
            {issue?.epicId?.name ? (
              <Badge className="border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-50">
                {issue.epicId.name}
              </Badge>
            ) : null}
          </div>
          <DialogTitle className="pr-10">
            <span className="mr-3 inline-flex rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {getIssueDisplayKey(issue)}
            </span>
            {issue.title}
          </DialogTitle>
          <DialogDescription>
            {issue.description || "No additional work item description has been added yet."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Project
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-950">
                  {issue?.projectId?.name || project?.name || "Unknown project"}
                </p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Team
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-950">
                  {issue?.teamId?.name || "No team"}
                </p>
              </div>
            </div>

            {issue.type === "Story" ? (
              <form
                className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"
                onSubmit={async (event) => {
                  event.preventDefault();

                  try {
                    setError("");
                    await onUpdateIssue(issue._id, {
                      acceptanceCriteria: storyDraft.acceptanceCriteria,
                      definitionOfDone: storyDraft.definitionOfDone,
                      labels: storyDraft.labels
                        .split(",")
                        .map((label) => label.trim())
                        .filter(Boolean),
                      timeEstimateMinutes: Number(storyDraft.timeEstimateMinutes || 0),
                    });
                    setFeedback("Story delivery criteria updated.");
                  } catch (submitError) {
                    setError(
                      submitError.response?.data?.message ||
                        "Unable to update Story criteria."
                    );
                  }
                }}
              >
                <p className="text-sm font-semibold text-slate-950">Story Delivery</p>
                <label className="block space-y-2">
                  <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                    Definition of Done
                  </span>
                  <Textarea
                    value={storyDraft.definitionOfDone}
                    onChange={(event) =>
                      setStoryDraft((current) => ({
                        ...current,
                        definitionOfDone: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                    Acceptance Criteria
                  </span>
                  {storyDraft.acceptanceCriteria.map((criterion, index) => (
                    <label
                      key={criterion._id || `${criterion.text}-${index}`}
                      className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={Boolean(criterion.completed)}
                        onChange={(event) =>
                          setStoryDraft((current) => ({
                            ...current,
                            acceptanceCriteria: current.acceptanceCriteria.map(
                              (item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, completed: event.target.checked }
                                  : item
                            ),
                          }))
                        }
                      />
                      <span className="text-sm text-slate-700">{criterion.text}</span>
                    </label>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    value={storyDraft.labels}
                    placeholder="Labels, comma separated"
                    onChange={(event) =>
                      setStoryDraft((current) => ({
                        ...current,
                        labels: event.target.value,
                      }))
                    }
                  />
                  <Input
                    type="number"
                    min="0"
                    value={storyDraft.timeEstimateMinutes}
                    placeholder="Estimate in minutes"
                    onChange={(event) =>
                      setStoryDraft((current) => ({
                        ...current,
                        timeEstimateMinutes: event.target.value,
                      }))
                    }
                  />
                </div>
                <Button type="submit" disabled={!canUpdateStatus || isPlanningPending}>
                  Save Story
                </Button>
              </form>
            ) : null}

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Planning</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Keep backlog placement, sprint scope, and ownership separate from the
                    execution workflow.
                  </p>
                </div>
              </div>

              {canManagePlanning ? (
                <form
                  className="mt-4 space-y-4"
                  onSubmit={async (event) => {
                    event.preventDefault();

                    try {
                      setError("");
                      setFeedback("");
                      await onUpdatePlanning(issue._id, {
                        epicId: planningDraft.epicId || null,
                        sprintId: planningDraft.sprintId || null,
                        assigneeId: planningDraft.assigneeId || null,
                        priority: planningDraft.priority,
                        storyPoints:
                          planningDraft.storyPoints === ""
                            ? null
                            : Number(planningDraft.storyPoints),
                      });
                      setFeedback("Planning details updated.");
                    } catch (submitError) {
                      setError(
                        submitError.response?.data?.message ||
                          "Unable to update planning details."
                      );
                    }
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        Epic
                      </span>
                      <select
                        className="field-select"
                        value={planningDraft.epicId}
                        onChange={(event) =>
                          setPlanningDraft((current) => ({
                            ...current,
                            epicId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Unassigned</option>
                        {epics.map((epic) => (
                          <option key={epic._id} value={epic._id}>
                            {epic.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        Sprint
                      </span>
                      <select
                        className="field-select"
                        value={planningDraft.sprintId}
                        onChange={(event) =>
                          setPlanningDraft((current) => ({
                            ...current,
                            sprintId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Backlog</option>
                        {sprints.map((sprint) => (
                          <option key={sprint._id} value={sprint._id}>
                            {sprint.name} ({sprint.state})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="space-y-2">
                      <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        Assignee
                      </span>
                      <select
                        className="field-select"
                        value={planningDraft.assigneeId}
                        onChange={(event) =>
                          setPlanningDraft((current) => ({
                            ...current,
                            assigneeId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Unassigned</option>
                        {availableMembers.map((member) => (
                          <option key={member._id} value={member._id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        Priority
                      </span>
                      <select
                        className="field-select"
                        value={planningDraft.priority}
                        onChange={(event) =>
                          setPlanningDraft((current) => ({
                            ...current,
                            priority: event.target.value,
                          }))
                        }
                      >
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        Story Points
                      </span>
                      <Input
                        type="number"
                        min="0"
                        value={planningDraft.storyPoints}
                        onChange={(event) =>
                          setPlanningDraft((current) => ({
                            ...current,
                            storyPoints: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={isPlanningPending}>
                      {isPlanningPending ? "Saving..." : "Save Planning"}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/90 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Sprint
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">
                      {issue?.sprintId?.name || "Backlog"}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/90 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Story Points
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">
                      {issue.storyPoints ?? "Not estimated"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-950">Execution Status</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Planning state stays separate from workflow status, so this only affects the
                active execution board.
              </p>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <select
                  className="field-select sm:max-w-[220px]"
                  value={issue.status}
                  disabled={!canUpdateStatus || isStatusPending}
                  onChange={async (event) => {
                    try {
                      setError("");
                      setFeedback("");
                      await onUpdateStatus(issue._id, event.target.value);
                      setFeedback("Execution status updated.");
                    } catch (submitError) {
                      setError(
                        submitError.response?.data?.message ||
                          "Unable to update execution status."
                      );
                    }
                  }}
                >
                  {getWorkflowStatusOptionsForIssue(issue).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <div className="text-xs text-slate-500">
                  Created {formatDateTime(issue.createdAt)}
                </div>
              </div>
            </div>

            {!canManagePlanning ? (
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-950">Suggest Priority</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Share a planning recommendation without directly overriding protected
                  priority controls.
                </p>

                <form
                  className="mt-4 space-y-4"
                  onSubmit={async (event) => {
                    event.preventDefault();

                    try {
                      setError("");
                      setFeedback("");
                      await suggestPriorityMutation.mutateAsync({
                        issueId: issue._id,
                        payload: {
                          priority: suggestionDraft.priority,
                          reason: suggestionDraft.reason,
                        },
                      });
                    } catch (submitError) {
                      setError(
                        submitError.response?.data?.message ||
                          "Unable to send that priority suggestion."
                      );
                    }
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                    <select
                      className="field-select"
                      value={suggestionDraft.priority}
                      onChange={(event) =>
                        setSuggestionDraft((current) => ({
                          ...current,
                          priority: event.target.value,
                        }))
                      }
                    >
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                    <Input
                      placeholder="Why should this priority change?"
                      value={suggestionDraft.reason}
                      onChange={(event) =>
                        setSuggestionDraft((current) => ({
                          ...current,
                          reason: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={suggestPriorityMutation.isPending}>
                      {suggestPriorityMutation.isPending
                        ? "Sending..."
                        : "Submit Suggestion"}
                    </Button>
                  </div>
                </form>
              </div>
            ) : null}
          </section>

          <section className="space-y-5">
            <details open className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <summary className="cursor-pointer text-sm font-semibold text-slate-950">
                Discussion
              </summary>
              <form
                className="mt-4 space-y-3"
                onSubmit={async (event) => {
                  event.preventDefault();

                  if (!commentText.trim()) {
                    return;
                  }

                  try {
                    await createCommentMutation.mutateAsync({
                      issueId: issue._id,
                      text: commentText.trim(),
                    });
                  } catch (submitError) {
                    setError(
                      submitError.response?.data?.message || "Unable to post comment."
                    );
                  }
                }}
              >
                <Textarea
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="Add a planning note or delivery update"
                />
                <div className="flex justify-end">
                  <Button type="submit" disabled={createCommentMutation.isPending}>
                    {createCommentMutation.isPending ? "Posting..." : "Add Comment"}
                  </Button>
                </div>
              </form>

              <div className="mt-4 space-y-3">
                {comments.length ? (
                  comments.map((comment) => (
                    <div
                      key={comment._id}
                      className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-9 w-9 rounded-xl">
                          <AvatarFallback>{getInitials(comment.userId?.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-950">
                              {comment.userId?.name}
                            </p>
                            <span className="text-xs text-slate-500">
                              {formatDateTime(comment.createdAt)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {comment.comment || comment.text}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm leading-6 text-slate-500">
                    No comments yet.
                  </div>
                )}
              </div>
            </details>

            <details className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <summary className="cursor-pointer text-sm font-semibold text-slate-950">
                Attachments
              </summary>
              <div className="mt-4 flex flex-col gap-3">
                <Input
                  type="file"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    disabled={!selectedFile || uploadAttachmentMutation.isPending}
                    onClick={async () => {
                      if (!selectedFile) {
                        return;
                      }

                      try {
                        await uploadAttachmentMutation.mutateAsync({
                          issueId: issue._id,
                          file: selectedFile,
                        });
                      } catch (submitError) {
                        setError(
                          submitError.response?.data?.message ||
                            "Unable to upload attachment."
                        );
                      }
                    }}
                  >
                    {uploadAttachmentMutation.isPending ? "Uploading..." : "Upload File"}
                  </Button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {attachments.length ? (
                  attachments.map((attachment) => (
                    <button
                      key={attachment._id}
                      type="button"
                      onClick={() => downloadAttachment(attachment, issue._id)}
                      className="block w-full rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4 transition hover:border-blue-200 hover:bg-white cursor-pointer text-left"
                    >
                      <p className="text-sm font-semibold text-slate-950">
                        {attachment.fileName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {attachment.uploadedBy?.name || "Unknown user"} •{" "}
                        {formatDateTime(attachment.createdAt)}
                      </p>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm leading-6 text-slate-500">
                    No attachments uploaded yet.
                  </div>
                )}
              </div>
            </details>

            <details className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <summary className="cursor-pointer text-sm font-semibold text-slate-950">
                Work Log
              </summary>
              <form
                className="mt-4 space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault();

                  try {
                    await createWorklogMutation.mutateAsync({
                      issueId: issue._id,
                      payload: {
                        minutes: Number(worklogDraft.minutes),
                        note: worklogDraft.note,
                        loggedAt: worklogDraft.loggedAt || undefined,
                      },
                    });
                  } catch (submitError) {
                    setError(
                      submitError.response?.data?.message || "Unable to add work log."
                    );
                  }
                }}
              >
                <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <Input
                    type="number"
                    min="1"
                    placeholder="Minutes"
                    value={worklogDraft.minutes}
                    onChange={(event) =>
                      setWorklogDraft((current) => ({
                        ...current,
                        minutes: event.target.value,
                      }))
                    }
                  />
                  <Input
                    type="datetime-local"
                    value={worklogDraft.loggedAt}
                    onChange={(event) =>
                      setWorklogDraft((current) => ({
                        ...current,
                        loggedAt: event.target.value,
                      }))
                    }
                  />
                </div>
                <Textarea
                  placeholder="What did you work on?"
                  value={worklogDraft.note}
                  onChange={(event) =>
                    setWorklogDraft((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                />
                <div className="flex justify-end">
                  <Button type="submit" disabled={createWorklogMutation.isPending}>
                    {createWorklogMutation.isPending ? "Saving..." : "Add Work Log"}
                  </Button>
                </div>
              </form>

              <div className="mt-4 space-y-3">
                {worklogs.length ? (
                  worklogs.map((worklog) => (
                    <div
                      key={worklog._id}
                      className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-950">
                          {worklog.minutes} min
                        </p>
                        <span className="text-xs text-slate-500">
                          {formatDateTime(worklog.loggedAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {worklog.note || "No work note was added."}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm leading-6 text-slate-500">
                    No work logged yet.
                  </div>
                )}
              </div>
            </details>

            <details className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <summary className="cursor-pointer text-sm font-semibold text-slate-950">
                History
              </summary>
              <div className="mt-4 space-y-3">
                {history.length ? (
                  history.map((entry) => (
                    <div
                      key={entry._id}
                      className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-950">
                          {entry.actorId?.name || "Unknown user"}
                        </p>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {entry.eventType.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {entry.field ? `${entry.field}: ` : ""}
                        {entry.toValue !== null && typeof entry.toValue !== "undefined"
                          ? String(entry.toValue)
                          : "Updated"}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        {formatDate(entry.createdAt)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm leading-6 text-slate-500">
                    No history entries yet.
                  </div>
                )}
              </div>
            </details>
          </section>
        </div>

        {feedback ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {feedback}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

export default IssueDetailsDrawer;
