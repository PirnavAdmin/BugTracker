import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Download,
  Eye,
  FileText,
  ImageIcon,
  LoaderCircle,
  MessageSquareText,
  PencilLine,
  Trash2,
  UserCircle2,
  Users2,
} from "lucide-react";
import {
  createComment,
  fetchComments,
  fetchIssueAttachments,
  fetchIssueHistory,
  fetchAttachmentBlob,
  resolveApiAssetUrl,
  uploadIssueAttachment,
  downloadAttachment,
} from "@/lib/api";
import {
  BUG_ALTERNATE_TRANSITIONS,
  BUG_SEVERITY_OPTIONS,
  BUG_STATUS_FLOW,
  BUG_STATUS_OPTIONS,
  getIssueDisplayKey,
  getIssuePriorityVariant,
  getWorkflowStatusOptionsForIssue,
  ISSUE_STATUS,
  ISSUE_TYPE_OPTIONS,
  isBugIssue,
  normalizeBugStatusForIssue,
  normalizeIssueStatus,
  resolveBugDetails,
  resolveIssueAssignee,
  resolveIssueAssigneeId,
  resolveIssueDependency,
  resolveIssueDependencyId,
  getIssueStatusLabel,
  getIssueStatusVariant,
  getIssueTypeVariant,
} from "@/lib/issues";
import {
  findProjectById,
  getProjectTeamMembers,
  getProjectTeams,
  resolveUserId,
} from "@/lib/project-teams";
import { cn, formatDate, formatDateTime, formatTime, getInitials } from "@/lib/utils";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const toDateTimeLocalValue = (value) => {
  if (!value) {
    return "";
  }

  const parsedValue = new Date(value);

  if (Number.isNaN(parsedValue.getTime())) {
    return "";
  }

  return new Date(parsedValue.getTime() - parsedValue.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

const formatDueAt = (value) => (value ? formatDateTime(value) : "No due date");
const ATTACHMENT_ACCEPT =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.log,.csv,.json,.xml,.zip";
const DETAIL_PANEL_TABS = [
  { id: "discussion", label: "Discussion" },
  { id: "attachments", label: "Attachments" },
  { id: "activity", label: "Activity" },
  { id: "comments", label: "Comments" },
];

const formatDependencyLabel = (issue) =>
  issue ? `${getIssueDisplayKey(issue)} ${issue.title}` : "No dependency";

const resolveNestedUserId = (value) => String(value?._id || value || "");
const isPreviewableImage = (attachment) =>
  String(attachment?.mimeType || "").toLowerCase().startsWith("image/");

const getBugDetailsDraft = (issue) => {
  const bugDetails = resolveBugDetails(issue);

  return {
    severity: bugDetails.severity || "",
    testerOwnerId: resolveNestedUserId(bugDetails.testerOwner),
    developerLeadId: resolveNestedUserId(bugDetails.developerLead),
    stepsToReproduce: bugDetails.stepsToReproduce || "",
    expectedResult: bugDetails.expectedResult || "",
    actualResult: bugDetails.actualResult || "",
    reopenReason: "",
    rejectionReason: "",
    targetRelease: bugDetails.targetRelease || "",
    statusChangeComment: "",
  };
};

const buildDetailDraft = (issue) => ({
  title: issue?.title || "",
  description: issue?.description || "",
  type: issue?.type || "Task",
  projectId: issue?.projectId?._id || issue?.projectId || "",
  teamId: issue?.teamId?._id || issue?.teamId || "",
  assigneeId: resolveIssueAssigneeId(issue),
  priority: issue?.priority || "Medium",
  status: isBugIssue(issue) ? normalizeBugStatusForIssue(issue) : normalizeIssueStatus(issue?.status),
  dueAt: toDateTimeLocalValue(issue?.dueAt),
  dependsOnIssueId: resolveIssueDependencyId(issue),
  storyPoints: issue?.storyPoints ?? "",
  acceptanceCriteria: Array.isArray(issue?.acceptanceCriteria)
    ? issue.acceptanceCriteria.map((criterion) => ({ ...criterion }))
    : [],
  definitionOfDone: issue?.definitionOfDone || "",
  labels: Array.isArray(issue?.labels) ? issue.labels.join(", ") : "",
  timeEstimateMinutes: issue?.timeEstimateMinutes || 0,
  bugDetails: getBugDetailsDraft(issue),
});

const IssueDetailsDialog = ({
  issue,
  open,
  onOpenChange,
  projects = [],
  availableIssues = [],
  onUpdateIssue,
  onDeleteIssue,
  updatingId,
  deletingId,
  canEditCoreDetails = false,
  canEditStatus = true,
  canEditPriority = true,
  canEditAssignee = true,
  canDeleteIssue = true,
  compactDrawer = false,
  contentClassName = "",
}) => {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const [commentText, setCommentText] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [detailDraft, setDetailDraft] = useState(buildDetailDraft(issue));
  const [detailsError, setDetailsError] = useState("");
  const [activeDetailTab, setActiveDetailTab] = useState("discussion");
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewLoadingId, setPreviewLoadingId] = useState("");

  const selectedProject = useMemo(
    () => findProjectById(projects, detailDraft.projectId),
    [detailDraft.projectId, projects]
  );
  const availableTeams = useMemo(
    () => getProjectTeams(selectedProject),
    [selectedProject]
  );
  const availableAssignees = useMemo(
    () => getProjectTeamMembers(selectedProject, detailDraft.teamId),
    [detailDraft.teamId, selectedProject]
  );
  const dependencyOptions = useMemo(
    () =>
      availableIssues
        .filter(
          (candidateIssue) =>
            String(candidateIssue._id) !== String(issue?._id) &&
            String(candidateIssue?.projectId?._id || candidateIssue?.projectId || "") ===
              String(detailDraft.projectId)
        )
        .sort(
          (left, right) =>
            new Date(right.createdAt || 0) - new Date(left.createdAt || 0)
        ),
    [availableIssues, detailDraft.projectId, issue?._id]
  );

  useEffect(() => {
    if (!issue) {
      return;
    }

    setDetailDraft(buildDetailDraft(issue));
    setDetailsError("");
    setSelectedFile(null);
    setActiveDetailTab("discussion");
    setPreviewAttachment(null);
    setPreviewError("");
  }, [issue]);

  useEffect(() => {
    const issueId = issue?._id;

    if (!issueId || !previewAttachment) {
      return undefined;
    }

    let objectUrl = "";
    let isCurrent = true;

    const loadPreview = async () => {
      setPreviewError("");
      setPreviewImageUrl("");
      setPreviewLoadingId(previewAttachment._id);

      try {
        const blob = await fetchAttachmentBlob(previewAttachment, issueId);
        objectUrl = URL.createObjectURL(blob);

        if (isCurrent) {
          setPreviewImageUrl(objectUrl);
        }
      } catch (error) {
        if (isCurrent) {
          setPreviewError(
            error.response?.data?.message || "Unable to load attachment preview."
          );
        }
      } finally {
        if (isCurrent) {
          setPreviewLoadingId("");
        }
      }
    };

    loadPreview();

    return () => {
      isCurrent = false;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [issue?._id, previewAttachment]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!availableTeams.length) {
      if (!detailDraft.teamId) {
        return;
      }

      setDetailDraft((current) => ({
        ...current,
        teamId: "",
        assigneeId: "",
      }));
      return;
    }

    if (
      availableTeams.some((team) => String(team._id) === String(detailDraft.teamId))
    ) {
      return;
    }

    setDetailDraft((current) => ({
      ...current,
      teamId: availableTeams[0]._id,
      assigneeId: "",
    }));
  }, [availableTeams, detailDraft.teamId]);

  useEffect(() => {
    const assigneeIds = new Set(
      availableAssignees.map((assignee) => resolveUserId(assignee))
    );

    if (!detailDraft.assigneeId || assigneeIds.has(String(detailDraft.assigneeId))) {
      return;
    }

    setDetailDraft((current) => ({
      ...current,
      assigneeId: "",
    }));
  }, [availableAssignees, detailDraft.assigneeId]);

  useEffect(() => {
    const assigneeIds = new Set(
      availableAssignees.map((assignee) => resolveUserId(assignee))
    );
    const testerOwnerValid =
      !detailDraft.bugDetails.testerOwnerId ||
      assigneeIds.has(String(detailDraft.bugDetails.testerOwnerId));
    const developerLeadValid =
      !detailDraft.bugDetails.developerLeadId ||
      assigneeIds.has(String(detailDraft.bugDetails.developerLeadId));

    if (testerOwnerValid && developerLeadValid) {
      return;
    }

    setDetailDraft((current) => ({
      ...current,
      bugDetails: {
        ...current.bugDetails,
        testerOwnerId: testerOwnerValid ? current.bugDetails.testerOwnerId : "",
        developerLeadId: developerLeadValid ? current.bugDetails.developerLeadId : "",
      },
    }));
  }, [
    availableAssignees,
    detailDraft.bugDetails.developerLeadId,
    detailDraft.bugDetails.testerOwnerId,
  ]);

  useEffect(() => {
    if (
      !detailDraft.dependsOnIssueId ||
      dependencyOptions.some(
        (candidateIssue) =>
          String(candidateIssue._id) === String(detailDraft.dependsOnIssueId)
      )
    ) {
      return;
    }

    setDetailDraft((current) => ({
      ...current,
      dependsOnIssueId: "",
    }));
  }, [dependencyOptions, detailDraft.dependsOnIssueId]);

  const { data: comments = [], isLoading: isCommentsLoading } = useQuery({
    queryKey: ["comments", issue?._id],
    queryFn: () => fetchComments(issue._id),
    enabled: open && Boolean(issue?._id),
  });
  const { data: attachments = [], isLoading: isAttachmentsLoading } = useQuery({
    queryKey: ["issue", issue?._id, "attachments"],
    queryFn: () => fetchIssueAttachments(issue._id),
    enabled: open && Boolean(issue?._id),
  });
  const { data: history = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: ["issue", issue?._id, "history"],
    queryFn: () => fetchIssueHistory(issue._id),
    enabled: open && Boolean(issue?._id),
  });

  const createCommentMutation = useMutation({
    mutationFn: createComment,
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({
        queryKey: ["comments", issue?._id],
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

  const handleSubmitComment = async (event) => {
    event.preventDefault();

    if (!commentText.trim()) {
      return;
    }

    await createCommentMutation.mutateAsync({
      issueId: issue._id,
      text: commentText.trim(),
    });
  };

  if (!issue) {
    return null;
  }

  const isUpdatingCurrentIssue = updatingId === issue._id;
  const issueAssignee = resolveIssueAssignee(issue);
  const issueAssigneeId = resolveIssueAssigneeId(issue);
  const issueDependency = resolveIssueDependency(issue);
  const issueDependencyId = resolveIssueDependencyId(issue);
  const issueTeamName = issue.teamId?.name || "No team assigned";
  const issueKey = getIssueDisplayKey(issue);
  const isBug = isBugIssue(issue);
  const currentBugStatus = normalizeBugStatusForIssue(issue);
  const statusOptions = getWorkflowStatusOptionsForIssue({ type: detailDraft.type });
  const bugDetails = resolveBugDetails(issue);
  const testerOwner = bugDetails.testerOwner;
  const developerLead = bugDetails.developerLead;
  const testerOwnerName =
    testerOwner?.name || issue.testerOwnerName || issue.reporterName || "Unassigned";
  const reporterName = issue.reporter?.name || issue.reporterName || "Unknown reporter";
  const reporterRole = issue.reporter?.role || "Tester";
  const canChangeStatusForRole = Boolean(role) && canEditStatus;
  const canShowDeleteAction = canDeleteIssue && typeof onDeleteIssue === "function";
  const deleteLabel = isBug ? "Delete Bug" : "Delete Task";
  const handleDeleteIssue = async () => {
    const result = await onDeleteIssue(issue._id);

    if (result !== false) {
      onOpenChange(false);
    }
  };
  const commentComposer = (
    <form className="space-y-3 rounded-2xl border border-blue-100 bg-white p-3 shadow-sm" onSubmit={handleSubmitComment}>
      <Input
        className="rounded-xl border-slate-200 bg-slate-50"
        placeholder="Add a status update or implementation note"
        value={commentText}
        onChange={(event) => setCommentText(event.target.value)}
      />
      <Button
        className="w-full"
        disabled={createCommentMutation.isPending}
        type="submit"
      >
        {createCommentMutation.isPending ? "Posting..." : "Add Comment"}
      </Button>
    </form>
  );
  const commentsList = (
    <div className="space-y-4">
      {isCommentsLoading ? (
        <>
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </>
      ) : comments.length ? (
        comments.map((comment) => (
          <div
            key={comment._id}
            className="rounded-[24px] border border-white bg-white p-4 shadow-[0_16px_42px_-32px_rgba(15,23,42,0.48)]"
          >
            <div className="flex items-start gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback>
                  {getInitials(comment.userId?.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">
                    {comment.userId?.name}
                  </p>
                  <span className="text-xs text-gray-500">
                    {formatDate(comment.createdAt)} at {formatTime(comment.createdAt)}
                  </span>
                </div>
                <p className="mt-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm leading-6 text-gray-700">
                  {comment.comment || comment.text}
                </p>
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="rounded-[24px] border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm leading-6 text-gray-500 shadow-sm">
          No comments yet. Add the first delivery note for this issue.
        </div>
      )}
    </div>
  );
  const attachmentsPanel = (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-dashed border-blue-200 bg-white p-3 shadow-sm">
        <Input
          className="cursor-pointer rounded-xl border-slate-200 bg-blue-50/50 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:bg-blue-50"
          type="file"
          accept={ATTACHMENT_ACCEPT}
          onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
        />
        <Button
          className="w-full"
          disabled={!selectedFile || uploadAttachmentMutation.isPending}
          type="button"
          onClick={async () => {
            if (!selectedFile) {
              return;
            }

            try {
              setDetailsError("");
              await uploadAttachmentMutation.mutateAsync({
                issueId: issue._id,
                file: selectedFile,
              });
            } catch (error) {
              setDetailsError(
                error.response?.data?.message || "Unable to upload attachment."
              );
            }
          }}
        >
          {uploadAttachmentMutation.isPending ? "Uploading..." : "Upload Attachment"}
        </Button>
      </div>

      {previewAttachment ? (
        <div className="rounded-[20px] border border-blue-100 bg-blue-50/50 p-3 shadow-sm">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">
                {previewAttachment.fileName || "Image preview"}
              </p>
              <p className="text-xs text-gray-500">Preview</p>
            </div>
            <Button
              className="h-8 rounded-lg px-3 text-xs"
              type="button"
              variant="outline"
              onClick={() => {
                setPreviewAttachment(null);
                setPreviewError("");
                setPreviewImageUrl("");
              }}
            >
              Close
            </Button>
          </div>

          {previewLoadingId === previewAttachment._id ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-blue-100 bg-white text-sm text-gray-500">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              Loading preview
            </div>
          ) : previewError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
              {previewError}
            </div>
          ) : previewImageUrl ? (
            <div className="max-h-[62vh] overflow-auto rounded-2xl border border-blue-100 bg-white p-2">
              <img
                alt={previewAttachment.fileName || "Attachment preview"}
                className="mx-auto max-h-[58vh] max-w-full rounded-xl object-contain"
                src={previewImageUrl}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        {isAttachmentsLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : attachments.length ? (
          attachments.map((attachment) => {
            const canPreview = isPreviewableImage(attachment);

            return (
              <div
                key={attachment._id}
                className="rounded-[20px] border border-gray-200 bg-white p-3 text-sm shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    {canPreview ? (
                      <ImageIcon className="h-5 w-5" />
                    ) : (
                      <FileText className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-900">
                      {attachment.fileName}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {attachment.uploadedBy?.name || "Unknown user"} at{" "}
                      {formatDateTime(attachment.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 pl-0 sm:pl-13">
                  {canPreview ? (
                    <Button
                      className="h-9 rounded-xl px-3"
                      disabled={previewLoadingId === attachment._id}
                      type="button"
                      variant="outline"
                      onClick={() => setPreviewAttachment(attachment)}
                    >
                      {previewLoadingId === attachment._id ? (
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Eye className="mr-2 h-4 w-4" />
                      )}
                      Preview
                    </Button>
                  ) : null}
                  <Button
                    className="h-9 rounded-xl px-3"
                    type="button"
                    variant="outline"
                    onClick={() => downloadAttachment(attachment, issue._id)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-[20px] border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500 shadow-sm">
            No attachments uploaded yet.
          </div>
        )}
      </div>
    </div>
  );
  const historyPanel = (
    <div className="space-y-3">
      {isHistoryLoading ? (
        <>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </>
      ) : history.length ? (
        history.map((entry) => (
          <div
            key={entry._id}
            className="relative rounded-[20px] border border-gray-200 bg-white p-3 pl-4 shadow-sm before:absolute before:left-0 before:top-4 before:h-2 before:w-2 before:-translate-x-1/2 before:rounded-full before:bg-blue-500"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">
                {entry.actorId?.name || "Unknown user"}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {String(entry.eventType || "Updated").replace(/_/g, " ")}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              {entry.field === "status"
                ? `${getIssueStatusLabel(entry.fromValue)} -> ${getIssueStatusLabel(entry.toValue)}`
                : `${entry.field || "item"}: ${
                    entry.toValue !== null &&
                    typeof entry.toValue !== "undefined"
                      ? String(entry.toValue)
                      : "Updated"
                  }`}
            </p>
            {entry.meta?.reason ? (
              <p className="mt-1 text-sm leading-6 text-gray-500">
                {entry.meta.reason}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-gray-500">
              {formatDateTime(entry.createdAt)}
            </p>
          </div>
        ))
      ) : (
        <div className="rounded-[20px] border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500 shadow-sm">
          No history entries yet.
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-50 bg-black/40 backdrop-blur-sm"
        className={cn(
          compactDrawer
            ? "issue-detail-drawer grid grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden"
            : "left-0 top-0 z-[60] grid h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-2xl sm:left-1/2 sm:top-20 sm:h-[88vh] sm:max-h-[calc(100vh-5.5rem)] sm:w-[92vw] sm:max-w-[1400px] sm:-translate-x-1/2 sm:rounded-3xl sm:border sm:border-white/80 lg:top-24 lg:max-h-[calc(100vh-7rem)]",
          contentClassName
        )}
      >
        <DialogHeader
          className={cn(
            "sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 px-4 py-3 pr-44 shadow-sm backdrop-blur-xl sm:px-6 sm:py-4 sm:pr-56",
            compactDrawer && "pr-14 sm:pr-14"
          )}
        >
          {canShowDeleteAction ? (
            <Button
              className={cn(
                "absolute right-16 top-3 h-9 rounded-xl px-3 text-xs font-semibold shadow-sm sm:top-4 sm:h-10 sm:px-4 sm:text-sm",
                compactDrawer && "hidden"
              )}
              variant="destructive"
              type="button"
              disabled={deletingId === issue._id}
              onClick={handleDeleteIssue}
            >
              {deletingId === issue._id ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {deleteLabel}
            </Button>
          ) : null}
          <div className={cn("flex min-w-0 flex-wrap items-center gap-2", compactDrawer && "gap-1.5")}>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              {issueKey}
            </span>
            <Badge variant={getIssueStatusVariant(issue.status)}>
              {getIssueStatusLabel(issue.status)}
            </Badge>
            <Badge variant={getIssuePriorityVariant(issue.priority)}>{issue.priority}</Badge>
            <Badge variant={getIssueTypeVariant(issue.type)}>{issue.type}</Badge>
            {issue.teamId?.name ? (
              <Badge className="border border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                {issue.teamId.name}
              </Badge>
            ) : null}
          </div>
          <DialogTitle className={cn("min-w-0 truncate pr-4 text-lg leading-7 sm:text-xl", compactDrawer && "pr-0 text-base leading-6")}>
            {issue.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {issue.description || "No detailed description has been added yet."}
          </DialogDescription>
        </DialogHeader>

        <div className={cn("min-h-0 overflow-hidden", compactDrawer && "overflow-y-auto overscroll-contain scroll-smooth px-4 py-4")}>
        <div className={cn("grid h-full min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,65%)_minmax(0,35%)]", compactDrawer && "h-auto gap-4 overflow-visible lg:grid-cols-1")}>
          <section className={cn("min-h-0 space-y-6 overflow-y-auto overscroll-contain bg-white p-4 sm:p-6", compactDrawer && "overflow-visible p-0")}>
            <div className="rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-5 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.5)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Description
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                {issue.description || "No detailed description has been added yet."}
              </p>
            </div>

            {canEditCoreDetails ? (
              <form
                className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.5)]"
                onSubmit={async (event) => {
                  event.preventDefault();

                  if (!detailDraft.title.trim() || !detailDraft.projectId || !detailDraft.teamId) {
                    setDetailsError("Title, project, and team are required.");
                    return;
                  }

                  const draftIsBug = detailDraft.type === "Bug";

                  if (draftIsBug) {
                    if (!detailDraft.bugDetails.severity || !detailDraft.priority) {
                      setDetailsError("Severity and priority are required for bugs.");
                      return;
                    }

                    if (
                      !detailDraft.bugDetails.stepsToReproduce.trim() ||
                      !detailDraft.bugDetails.expectedResult.trim() ||
                      !detailDraft.bugDetails.actualResult.trim()
                    ) {
                      setDetailsError(
                        "Steps to Reproduce, Expected Result, and Actual Result are required for bugs."
                      );
                      return;
                    }

                    if (
                      detailDraft.status === ISSUE_STATUS.REOPEN &&
                      !detailDraft.bugDetails.statusChangeComment.trim() &&
                      !detailDraft.bugDetails.reopenReason.trim()
                    ) {
                      setDetailsError("Reopen requires a reason or comment.");
                      return;
                    }

                    if (
                      detailDraft.status === ISSUE_STATUS.REJECTED &&
                      !detailDraft.bugDetails.statusChangeComment.trim() &&
                      !detailDraft.bugDetails.rejectionReason.trim()
                    ) {
                      setDetailsError("Rejected requires a rejection reason.");
                      return;
                    }

                    if (
                      detailDraft.status === ISSUE_STATUS.DEFERRED &&
                      !detailDraft.bugDetails.targetRelease.trim()
                    ) {
                      setDetailsError("Deferred requires a target future release.");
                      return;
                    }
                  }

                  setDetailsError("");

                  try {
                    const updatePayload = {
                      title: detailDraft.title.trim(),
                      description: detailDraft.description.trim(),
                      type: detailDraft.type,
                      projectId: detailDraft.projectId,
                      teamId: detailDraft.teamId,
                      assigneeId: detailDraft.assigneeId || null,
                      priority: detailDraft.priority,
                      status: detailDraft.status,
                      dueAt: detailDraft.dueAt || null,
                      dependsOnIssueId: detailDraft.dependsOnIssueId || null,
                      storyPoints:
                        detailDraft.storyPoints === ""
                          ? null
                          : Number(detailDraft.storyPoints),
                      acceptanceCriteria: detailDraft.acceptanceCriteria,
                      definitionOfDone: detailDraft.definitionOfDone.trim(),
                      labels: detailDraft.labels
                        .split(",")
                        .map((label) => label.trim())
                        .filter(Boolean),
                      timeEstimateMinutes: Number(detailDraft.timeEstimateMinutes || 0),
                    };

                    if (draftIsBug) {
                      updatePayload.bugDetails = {
                        severity: detailDraft.bugDetails.severity,
                        testerOwnerId: detailDraft.bugDetails.testerOwnerId || null,
                        developerLeadId: detailDraft.bugDetails.developerLeadId || null,
                        stepsToReproduce:
                          detailDraft.bugDetails.stepsToReproduce.trim(),
                        expectedResult: detailDraft.bugDetails.expectedResult.trim(),
                        actualResult: detailDraft.bugDetails.actualResult.trim(),
                        reopenReason: detailDraft.bugDetails.reopenReason.trim(),
                        rejectionReason: detailDraft.bugDetails.rejectionReason.trim(),
                        targetRelease: detailDraft.bugDetails.targetRelease.trim(),
                      };
                      updatePayload.statusChangeComment =
                        detailDraft.bugDetails.statusChangeComment.trim();
                    }

                    await onUpdateIssue(issue._id, updatePayload);
                  } catch (error) {
                    setDetailsError(
                      error.response?.data?.message || "Unable to save work item details."
                    );
                  }
                }}
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <PencilLine className="h-4 w-4 text-blue-600" />
                  <span>Edit work item details</span>
                </div>

                <div className="space-y-2">
                  <label
                    className="text-xs uppercase tracking-[0.22em] text-gray-500"
                    htmlFor="issue-title"
                  >
                    Title
                  </label>
                  <Input
                    id="issue-title"
                    value={detailDraft.title}
                    onChange={(event) =>
                      setDetailDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label
                    className="text-xs uppercase tracking-[0.22em] text-gray-500"
                    htmlFor="issue-description"
                  >
                    Description
                  </label>
                  <Textarea
                    id="issue-description"
                    value={detailDraft.description}
                    onChange={(event) =>
                      setDetailDraft((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </div>

                {detailDraft.type === "Bug" ? (
                  <div className="rounded-[24px] border border-rose-100 bg-white p-4">
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      <label className="space-y-2">
                        <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                          Severity
                        </span>
                        <select
                          className="field-select"
                          value={detailDraft.bugDetails.severity}
                          onChange={(event) =>
                            setDetailDraft((current) => ({
                              ...current,
                              bugDetails: {
                                ...current.bugDetails,
                                severity: event.target.value,
                              },
                            }))
                          }
                        >
                          <option value="">Select severity</option>
                          {BUG_SEVERITY_OPTIONS.map((severity) => (
                            <option key={severity} value={severity}>
                              {severity}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-2">
                        <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                          Tester / QA Owner
                        </span>
                        <select
                          className="field-select"
                          value={detailDraft.bugDetails.testerOwnerId}
                          onChange={(event) =>
                            setDetailDraft((current) => ({
                              ...current,
                              bugDetails: {
                                ...current.bugDetails,
                                testerOwnerId: event.target.value,
                              },
                            }))
                          }
                        >
                          <option value="">Unassigned</option>
                          {availableAssignees.map((assignee) => (
                            <option key={assignee._id} value={assignee._id}>
                              {assignee.name} ({assignee.role})
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-2">
                        <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                          Developer / Dev Lead
                        </span>
                        <select
                          className="field-select"
                          value={detailDraft.bugDetails.developerLeadId}
                          onChange={(event) =>
                            setDetailDraft((current) => ({
                              ...current,
                              bugDetails: {
                                ...current.bugDetails,
                                developerLeadId: event.target.value,
                              },
                            }))
                          }
                        >
                          <option value="">Unassigned</option>
                          {availableAssignees.map((assignee) => (
                            <option key={assignee._id} value={assignee._id}>
                              {assignee.name} ({assignee.role})
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="mt-4 space-y-4">
                      <label className="space-y-2">
                        <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                          Steps to Reproduce
                        </span>
                        <Textarea
                          value={detailDraft.bugDetails.stepsToReproduce}
                          onChange={(event) =>
                            setDetailDraft((current) => ({
                              ...current,
                              bugDetails: {
                                ...current.bugDetails,
                                stepsToReproduce: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-2">
                          <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                            Expected Result
                          </span>
                          <Textarea
                            value={detailDraft.bugDetails.expectedResult}
                            onChange={(event) =>
                              setDetailDraft((current) => ({
                                ...current,
                                bugDetails: {
                                  ...current.bugDetails,
                                  expectedResult: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>

                        <label className="space-y-2">
                          <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                            Actual Result
                          </span>
                          <Textarea
                            value={detailDraft.bugDetails.actualResult}
                            onChange={(event) =>
                              setDetailDraft((current) => ({
                                ...current,
                                bugDetails: {
                                  ...current.bugDetails,
                                  actualResult: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                      Project
                    </span>
                    <select
                      className="field-select"
                      value={detailDraft.projectId}
                      onChange={(event) =>
                        setDetailDraft((current) => ({
                          ...current,
                          projectId: event.target.value,
                          teamId: "",
                          assigneeId: "",
                          bugDetails: {
                            ...current.bugDetails,
                            testerOwnerId: "",
                            developerLeadId: "",
                          },
                        }))
                      }
                    >
                      {projects.map((project) => (
                        <option key={project._id} value={project._id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                      Team
                    </span>
                    <select
                      className="field-select"
                      value={detailDraft.teamId}
                      onChange={(event) =>
                        setDetailDraft((current) => ({
                          ...current,
                          teamId: event.target.value,
                          assigneeId: "",
                          bugDetails: {
                            ...current.bugDetails,
                            testerOwnerId: "",
                            developerLeadId: "",
                          },
                        }))
                      }
                      disabled={!availableTeams.length}
                    >
                      {availableTeams.length ? (
                        availableTeams.map((team) => (
                          <option key={team._id} value={team._id}>
                            {team.name}
                          </option>
                        ))
                      ) : (
                        <option value="">No attached teams</option>
                      )}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                      Assignee
                    </span>
                    <select
                      className="field-select"
                      value={detailDraft.assigneeId}
                      onChange={(event) =>
                        setDetailDraft((current) => ({
                          ...current,
                          assigneeId: event.target.value,
                        }))
                      }
                      disabled={!detailDraft.teamId}
                    >
                      <option value="">Unassigned</option>
                      {availableAssignees.map((assignee) => (
                        <option key={assignee._id} value={assignee._id}>
                          {assignee.name} ({assignee.role})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                      Type
                    </span>
                    <select
                      className="field-select"
                      value={detailDraft.type}
                      onChange={(event) =>
                        setDetailDraft((current) => ({
                          ...current,
                          type: event.target.value,
                          status:
                            event.target.value === "Bug"
                              ? ISSUE_STATUS.NEW
                              : ISSUE_STATUS.TODO,
                          priority:
                            event.target.value === "Bug" && current.priority === "Low"
                              ? "High"
                              : current.priority,
                        }))
                      }
                    >
                      {ISSUE_TYPE_OPTIONS.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                      Priority
                    </span>
                    <select
                      className="field-select"
                      value={detailDraft.priority}
                      onChange={(event) =>
                        setDetailDraft((current) => ({
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
                    <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                      Status
                    </span>
                    <select
                      className="field-select"
                      value={detailDraft.status}
                      onChange={(event) =>
                        setDetailDraft((current) => ({
                          ...current,
                          status: event.target.value,
                        }))
                      }
                    >
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {detailDraft.type === "Bug" &&
                [ISSUE_STATUS.REOPEN, ISSUE_STATUS.REJECTED, ISSUE_STATUS.DEFERRED].includes(
                  detailDraft.status
                ) ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {detailDraft.status === ISSUE_STATUS.DEFERRED ? (
                      <label className="space-y-2">
                        <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                          Target Future Release
                        </span>
                        <Input
                          value={detailDraft.bugDetails.targetRelease}
                          onChange={(event) =>
                            setDetailDraft((current) => ({
                              ...current,
                              bugDetails: {
                                ...current.bugDetails,
                                targetRelease: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    ) : null}

                    <label className="space-y-2 sm:col-span-2">
                      <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                        Status Reason / Comment
                      </span>
                      <Textarea
                        value={detailDraft.bugDetails.statusChangeComment}
                        onChange={(event) =>
                          setDetailDraft((current) => ({
                            ...current,
                            bugDetails: {
                              ...current.bugDetails,
                              statusChangeComment: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                      Due Date & Time
                    </span>
                    <Input
                      type="datetime-local"
                      value={detailDraft.dueAt}
                      onChange={(event) =>
                        setDetailDraft((current) => ({
                          ...current,
                          dueAt: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                      Depends On
                    </span>
                    <select
                      className="field-select"
                      value={detailDraft.dependsOnIssueId}
                      onChange={(event) =>
                        setDetailDraft((current) => ({
                          ...current,
                          dependsOnIssueId: event.target.value,
                        }))
                      }
                    >
                      <option value="">No dependency</option>
                      {dependencyOptions.map((candidateIssue) => (
                        <option key={candidateIssue._id} value={candidateIssue._id}>
                          {formatDependencyLabel(candidateIssue)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {detailDraft.type === "Story" ? (
                  <div className="space-y-4 rounded-[20px] border border-blue-100 bg-blue-50/40 p-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <label className="space-y-2">
                        <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                          Story Points
                        </span>
                        <Input
                          type="number"
                          min="0"
                          value={detailDraft.storyPoints}
                          onChange={(event) =>
                            setDetailDraft((current) => ({
                              ...current,
                              storyPoints: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                          Estimate (minutes)
                        </span>
                        <Input
                          type="number"
                          min="0"
                          value={detailDraft.timeEstimateMinutes}
                          onChange={(event) =>
                            setDetailDraft((current) => ({
                              ...current,
                              timeEstimateMinutes: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                          Labels
                        </span>
                        <Input
                          value={detailDraft.labels}
                          onChange={(event) =>
                            setDetailDraft((current) => ({
                              ...current,
                              labels: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>

                    <label className="space-y-2">
                      <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                        Definition of Done
                      </span>
                      <Textarea
                        value={detailDraft.definitionOfDone}
                        onChange={(event) =>
                          setDetailDraft((current) => ({
                            ...current,
                            definitionOfDone: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <div className="space-y-2">
                      <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                        Acceptance Criteria
                      </span>
                      {detailDraft.acceptanceCriteria.map((criterion, index) => (
                        <label
                          key={criterion._id || `${criterion.text}-${index}`}
                          className="flex items-start gap-3 rounded-xl border border-blue-100 bg-white px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4"
                            checked={Boolean(criterion.completed)}
                            onChange={(event) =>
                              setDetailDraft((current) => ({
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
                  </div>
                ) : null}

                {!availableTeams.length ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    Attach a team to this project before assigning or moving this work item.
                  </div>
                ) : null}

                {detailsError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {detailsError}
                  </div>
                ) : null}

                <Button
                  className="w-full sm:w-auto"
                  disabled={isUpdatingCurrentIssue || !availableTeams.length}
                  type="submit"
                >
                  {isUpdatingCurrentIssue ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.22em] text-gray-500">Project</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">
                  {issue.projectId?.name || "Unknown project"}
                </p>
              </div>

              <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-gray-500">
                  <Users2 className="h-3.5 w-3.5" />
                  Team
                </div>
                <p className="mt-2 text-sm font-semibold text-gray-900">{issueTeamName}</p>
              </div>

              <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-gray-500">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Created
                </div>
                <p className="mt-2 text-sm font-semibold text-gray-900">
                  {formatDateTime(issue.createdAt)}
                </p>
              </div>

              <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-gray-500">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Started
                </div>
                <p className="mt-2 text-sm font-semibold text-gray-900">
                  {formatDateTime(issue.startedAt)}
                </p>
              </div>

              <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-gray-500">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Due
                </div>
                <p className="mt-2 text-sm font-semibold text-gray-900">
                  {formatDueAt(issue.dueAt)}
                </p>
              </div>

              <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.22em] text-gray-500">
                  Depends On
                </p>
                {issueDependency ? (
                  <>
                    <p className="mt-2 text-sm font-semibold text-gray-900">
                      {formatDependencyLabel(issueDependency)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {getIssueStatusLabel(issueDependency.status)}
                    </p>
                  </>
                ) : issueDependencyId ? (
                  <p className="mt-2 text-sm font-semibold text-gray-900">Linked work item</p>
                ) : (
                  <p className="mt-2 text-sm font-semibold text-gray-900">No dependency</p>
                )}
              </div>
            </div>

            {isBug ? (
              <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.5)]">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    Defect Life Cycle
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {BUG_STATUS_FLOW.map((status, index) => {
                    const isActive = currentBugStatus === status;

                    return (
                      <div key={status} className="flex items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                            isActive
                              ? "border-blue-200 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-slate-50 text-slate-600"
                          }`}
                        >
                          {getIssueStatusLabel(status)}
                        </span>
                        {index < BUG_STATUS_FLOW.length - 1 ? (
                          <span className="text-slate-300">-&gt;</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {BUG_ALTERNATE_TRANSITIONS.map((transition) => (
                    <div
                      key={transition.join("-")}
                      className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600"
                    >
                      {transition.map(getIssueStatusLabel).join(" -> ")}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {isBug ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-[24px] border border-rose-100 bg-rose-50 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.22em] text-rose-500">
                    Severity
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {bugDetails.severity || "Not set"}
                  </p>
                </div>
                <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.22em] text-gray-500">
                    Tester / QA Owner
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {testerOwnerName}
                  </p>
                </div>
                <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.22em] text-gray-500">
                    Developer / Dev Lead
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {developerLead?.name || "Unassigned"}
                  </p>
                </div>
                <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm sm:col-span-2 xl:col-span-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-gray-500">
                    Steps to Reproduce
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                    {bugDetails.stepsToReproduce || "Not provided"}
                  </p>
                </div>
                <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.22em] text-gray-500">
                    Expected Result
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                    {bugDetails.expectedResult || "Not provided"}
                  </p>
                </div>
                <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.22em] text-gray-500">
                    Actual Result
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                    {bugDetails.actualResult || "Not provided"}
                  </p>
                </div>
                <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.22em] text-gray-500">
                    Target Release
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {bugDetails.targetRelease || "Not set"}
                  </p>
                </div>
              </div>
            ) : null}

            {!canEditCoreDetails ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <form
                  className="space-y-2 sm:col-span-1"
                  onSubmit={async (event) => {
                    event.preventDefault();

                    try {
                      setDetailsError("");
                      const payload = {
                        status: detailDraft.status,
                      };

                      if (isBug) {
                        if (
                          detailDraft.status === ISSUE_STATUS.REOPEN &&
                          !detailDraft.bugDetails.statusChangeComment.trim()
                        ) {
                          setDetailsError("Reopen requires a reason or comment.");
                          return;
                        }

                        if (
                          detailDraft.status === ISSUE_STATUS.REJECTED &&
                          !detailDraft.bugDetails.statusChangeComment.trim()
                        ) {
                          setDetailsError("Rejected requires a rejection reason.");
                          return;
                        }

                        if (
                          detailDraft.status === ISSUE_STATUS.DEFERRED &&
                          !detailDraft.bugDetails.targetRelease.trim()
                        ) {
                          setDetailsError("Deferred requires a target future release.");
                          return;
                        }

                        payload.statusChangeComment =
                          detailDraft.bugDetails.statusChangeComment.trim();
                        payload.targetRelease =
                          detailDraft.bugDetails.targetRelease.trim();
                      }

                      await onUpdateIssue(issue._id, payload);
                    } catch (error) {
                      setDetailsError(
                        error.response?.data?.message || "Unable to update status."
                      );
                    }
                  }}
                >
                  <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                    Status
                  </span>
                  <select
                    className="field-select"
                    value={detailDraft.status}
                    onChange={(event) =>
                      setDetailDraft((current) => ({
                        ...current,
                        status: event.target.value,
                      }))
                    }
                    disabled={!canChangeStatusForRole || isUpdatingCurrentIssue}
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {isBug &&
                  [ISSUE_STATUS.REOPEN, ISSUE_STATUS.REJECTED, ISSUE_STATUS.DEFERRED].includes(
                    detailDraft.status
                  ) ? (
                    <div className="space-y-2">
                      {detailDraft.status === ISSUE_STATUS.DEFERRED ? (
                        <Input
                          placeholder="Target future release"
                          value={detailDraft.bugDetails.targetRelease}
                          onChange={(event) =>
                            setDetailDraft((current) => ({
                              ...current,
                              bugDetails: {
                                ...current.bugDetails,
                                targetRelease: event.target.value,
                              },
                            }))
                          }
                        />
                      ) : null}
                      <Textarea
                        placeholder="Status reason or comment"
                        value={detailDraft.bugDetails.statusChangeComment}
                        onChange={(event) =>
                          setDetailDraft((current) => ({
                            ...current,
                            bugDetails: {
                              ...current.bugDetails,
                              statusChangeComment: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  ) : null}
                  <Button
                    className="w-full"
                    size="sm"
                    disabled={!canChangeStatusForRole || isUpdatingCurrentIssue}
                    type="submit"
                  >
                    Update Status
                  </Button>
                </form>

                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                    Priority
                  </span>
                  <select
                    className="field-select"
                    value={issue.priority}
                    onChange={(event) =>
                      onUpdateIssue(issue._id, { priority: event.target.value })
                    }
                    disabled={!canEditPriority || isUpdatingCurrentIssue}
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                    Assignee
                  </span>
                  <select
                    className="field-select"
                    value={issueAssigneeId}
                    onChange={(event) =>
                      onUpdateIssue(issue._id, {
                        assigneeId: event.target.value || null,
                      })
                    }
                    disabled={!canEditAssignee || isUpdatingCurrentIssue || !issue.teamId?._id}
                  >
                    <option value="">Unassigned</option>
                    {availableAssignees.map((assignee) => (
                      <option key={assignee._id} value={assignee._id}>
                        {assignee.name} ({assignee.role})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {!canEditCoreDetails && detailsError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {detailsError}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.22em] text-gray-500">Reporter</p>
                <div className="mt-3 flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>{getInitials(reporterName)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {reporterName}
                    </p>
                    <p className="text-xs text-gray-500">{reporterRole}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.22em] text-gray-500">
                  Current owner
                </p>
                {issueAssignee ? (
                  <div className="mt-3 flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>{getInitials(issueAssignee.name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {issueAssignee.name}
                      </p>
                      <p className="text-xs text-gray-500">{issueAssignee.role}</p>
                    </div>
                  </div>
                ) : issueAssigneeId ? (
                  <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                    <UserCircle2 className="h-4 w-4" />
                    <span>Assigned user</span>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                    <UserCircle2 className="h-4 w-4" />
                    <span>No one is assigned yet.</span>
                  </div>
                )}
              </div>
            </div>

          </section>

          <section className={cn("min-h-0 overflow-y-auto overscroll-contain border-t border-slate-200 bg-slate-50 p-4 sm:p-6 lg:border-l lg:border-t-0", compactDrawer && "rounded-2xl border border-gray-200 p-3")}>
            {compactDrawer ? (
              <>
                <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1 sm:grid-cols-4">
                  {DETAIL_PANEL_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      className={cn(
                        "h-8 whitespace-nowrap rounded-lg px-1.5 text-[10px] font-bold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 sm:text-[11px]",
                        activeDetailTab === tab.id && "bg-blue-50 text-blue-700 shadow-sm"
                      )}
                      type="button"
                      onClick={() => setActiveDetailTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {activeDetailTab === "discussion" ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <MessageSquareText className="h-4 w-4 text-blue-600" />
                      <p className="font-semibold text-gray-900">Discussion</p>
                    </div>
                    {commentComposer}
                    <Separator />
                    {commentsList}
                  </div>
                ) : null}

                {activeDetailTab === "attachments" ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-600" />
                      <p className="font-semibold text-gray-900">Attachments</p>
                    </div>
                    {attachmentsPanel}
                  </div>
                ) : null}

                {activeDetailTab === "activity" ? (
                  <div className="space-y-3">
                    <p className="font-semibold text-gray-900">Activity</p>
                    {historyPanel}
                  </div>
                ) : null}

                {activeDetailTab === "comments" ? (
                  <div className="space-y-3">
                    <p className="font-semibold text-gray-900">Comments</p>
                    {commentsList}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4 text-blue-600" />
                  <p className="font-semibold text-gray-900">Discussion</p>
                </div>
                <div className="space-y-5">
                  {commentComposer}
                  {commentsList}
                  <div className="rounded-[28px] border border-slate-200 bg-white/70 p-4 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-600" />
                      <p className="font-semibold text-gray-900">Attachments</p>
                    </div>
                    {attachmentsPanel}
                  </div>
                  <div className="rounded-[28px] border border-slate-200 bg-white/70 p-4 shadow-sm">
                    <p className="mb-4 font-semibold text-gray-900">Activity</p>
                    {historyPanel}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default IssueDetailsDialog;
