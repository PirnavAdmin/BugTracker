import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  FileText,
  Flag,
  Sparkle,
  UserCircle2,
  Users2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  BUG_PRIORITY_OPTIONS,
  BUG_MODULE_OPTIONS,
  BUG_PLATFORM_OPTIONS,
  BUG_SEVERITY_OPTIONS,
  BUG_STATUS_OPTIONS,
  BUG_TEAM_OPTIONS,
  ISSUE_STATUS,
  ISSUE_TYPE_OPTIONS,
  ISSUE_WORKFLOW_STATUS_OPTIONS,
  getSuggestedTeamForCategory,
} from "@/lib/issues";
import BugCategorySelect from "@/components/issues/BugCategorySelect";
import {
  fetchIssues,
  fetchModuleOwnerships,
  fetchProjectTeams,
  logTeamSelectionDebug,
} from "@/lib/api";
import {
  findProjectById,
  getProjectMembers,
  getProjectTeamMembers,
  getProjectTeams,
  resolveProjectId,
  resolveTeamId,
  resolveUserId,
} from "@/lib/project-teams";

const defaultTypeOptions = ISSUE_TYPE_OPTIONS;
const DEFAULT_ATTACHMENT_ACCEPT =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.log,.csv,.json,.xml,.zip";
const isImageFile = (file) => String(file?.type || "").startsWith("image/");
const isLikelyImageFile = (file) =>
  isImageFile(file) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(file?.name || ""));
const buildPastedAttachmentName = (file, index) => {
  const extension = String(file?.type || "").split("/")[1] || "png";
  return file?.name && file.name !== "image.png"
    ? file.name
    : `pasted-attachment-${Date.now()}-${index + 1}.${extension}`;
};
const getExtensionFromMimeType = (mimeType = "") =>
  ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/svg+xml": "svg",
  })[String(mimeType || "").toLowerCase()] || "png";
const fileFromDataUrl = (dataUrl, index) => {
  const match = String(dataUrl || "").match(/^data:([^;,]+)(;base64)?,(.*)$/i);

  if (!match) {
    return null;
  }

  const mimeType = match[1] || "image/png";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);

  for (let byteIndex = 0; byteIndex < binary.length; byteIndex += 1) {
    bytes[byteIndex] = binary.charCodeAt(byteIndex);
  }

  return new File(
    [bytes],
    `pasted-document-image-${Date.now()}-${index + 1}.${getExtensionFromMimeType(mimeType)}`,
    { type: mimeType }
  );
};
const getImageUrlsFromHtml = (html = "") => {
  const container = document.createElement("div");
  container.innerHTML = html;

  return Array.from(container.querySelectorAll("img"))
    .map((image) => image.getAttribute("src") || "")
    .filter(Boolean);
};
const getClipboardAttachmentFiles = async (clipboardData) => {
  const files = Array.from(clipboardData?.files || []);

  if (files.length) {
    return files;
  }

  const itemFiles = Array.from(clipboardData?.items || [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter(Boolean);

  if (itemFiles.length) {
    return itemFiles;
  }

  const html = clipboardData?.getData?.("text/html") || "";
  const imageUrls = getImageUrlsFromHtml(html);
  const dataUrlFiles = imageUrls
    .filter((url) => /^data:image\//i.test(url))
    .map(fileFromDataUrl)
    .filter(Boolean);

  if (dataUrlFiles.length) {
    return dataUrlFiles;
  }

  const remoteImageUrls = imageUrls.filter((url) => /^https?:\/\//i.test(url));
  const remoteFiles = await Promise.all(
    remoteImageUrls.map(async (url, index) => {
      try {
        const response = await fetch(url);
        const blob = await response.blob();

        if (!blob.type.startsWith("image/")) {
          return null;
        }

        return new File(
          [blob],
          `pasted-document-image-${Date.now()}-${index + 1}.${getExtensionFromMimeType(blob.type)}`,
          { type: blob.type }
        );
      } catch (error) {
        return null;
      }
    })
  );

  return remoteFiles.filter(Boolean);
};

const resolveProjectSelection = (defaultProjectId, projects = []) => {
  if (
    defaultProjectId &&
    defaultProjectId !== "all" &&
    findProjectById(projects, defaultProjectId)
  ) {
    return String(defaultProjectId);
  }

  return resolveProjectId(projects[0]);
};

const hasTeamMember = (team, userId = "") =>
  Boolean(userId) &&
  (team?.members || []).some((member) => resolveUserId(member) === String(userId));

const resolveTeamSelection = (defaultTeamId, teams = [], preferredMemberId = "") => {
  const projectTeams = getProjectTeams({ teams });

  if (
    defaultTeamId &&
    projectTeams.some((team) => resolveTeamId(team) === String(defaultTeamId))
  ) {
    return String(defaultTeamId);
  }

  const preferredTeam = projectTeams.find((team) =>
    hasTeamMember(team, preferredMemberId)
  );

  return resolveTeamId(preferredTeam || projectTeams[0]);
};

const buildInitialState = ({
  projects,
  defaultProjectId,
  defaultTeamId,
  defaultType,
  defaultStatus,
  defaultAssigneeId,
}) => {
  const projectId = resolveProjectSelection(defaultProjectId, projects);
  const project = findProjectById(projects, projectId);
  const projectTeams = getProjectTeams(project);
  const teamId = resolveTeamSelection(defaultTeamId, projectTeams, defaultAssigneeId);
  const teamMembers = getProjectTeamMembers(project, teamId);
  const defaultAssigneeKey = String(defaultAssigneeId || "");
  const assigneeId = teamMembers.some(
    (member) => resolveUserId(member) === defaultAssigneeKey
  )
    ? defaultAssigneeKey
    : "";
  const isBug = defaultType === "Bug";

  return {
    title: "",
    description: "",
    type: defaultType,
    status: isBug ? ISSUE_STATUS.NEW : defaultStatus,
    priority: isBug ? "High" : "Medium",
    projectId,
    teamId,
    assigneeId,
    parentStoryId: "",
    bugDetails: {
      moduleName: "",
      category: "",
      affectedPlatform: "Web",
      suggestedTeam: "",
      addToBucket: isBug,
      sendToTriage: false,
      estimatedEffort: "",
      severity: "",
      testerOwnerId: defaultAssigneeKey,
      developerLeadId: "",
      stepsToReproduce: "",
      expectedResult: "",
      actualResult: "",
    },
  };
};

const IssueComposer = ({
  projects = [],
  defaultProjectId,
  defaultTeamId = "",
  onSubmit,
  isPending,
  allowedTypes = defaultTypeOptions,
  defaultType = "Task",
  defaultStatus = ISSUE_STATUS.TODO,
  defaultAssigneeId = "",
  lockType = false,
  showAssigneeField = true,
  showStatusField = true,
  submitLabel = "Assign task",
  variant = "card",
  headerLabel = "Assign task",
  cardTitle = "Add work to the planning workspace",
  cardDescription = "Create project-scoped work with team ownership and assignees limited to the selected delivery team.",
  projectLabel = "Project",
  titleLabel = "Title",
  titlePlaceholder = "Payments retry job fails on expired tokens",
  descriptionPlaceholder = "Add the current behavior, expected result, and any reproduction notes.",
  includeAttachments = false,
  attachmentAccept = DEFAULT_ATTACHMENT_ACCEPT,
  onUploadAttachment,
  isTesterBugReport = false,
  reporterName = "",
}) => {
  const resolvedDefaultType = allowedTypes.includes(defaultType)
    ? defaultType
    : allowedTypes[0] || defaultTypeOptions[0];
  const [formData, setFormData] = useState(() =>
    buildInitialState({
      projects,
      defaultProjectId,
      defaultTeamId,
      defaultType: resolvedDefaultType,
      defaultStatus,
      defaultAssigneeId,
    })
  );
  const [error, setError] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [attachmentNote, setAttachmentNote] = useState("");
  const [attachmentPasteHint, setAttachmentPasteHint] = useState("");
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [attachmentPreviews, setAttachmentPreviews] = useState([]);
  const attachmentInputRef = useRef(null);

  const selectedProject = useMemo(
    () => findProjectById(projects, formData.projectId),
    [formData.projectId, projects]
  );
  const selectedProjectId = String(formData.projectId || "");
  const { data: projectTeamsData } = useQuery({
    queryKey: ["project-teams", selectedProjectId],
    queryFn: () => fetchProjectTeams(selectedProjectId),
    enabled: Boolean(selectedProjectId),
    refetchOnMount: "always",
  });
  const { data: moduleOwnerships = [] } = useQuery({
    queryKey: ["module-ownerships"],
    queryFn: fetchModuleOwnerships,
    enabled: isTesterBugReport,
  });
  const { data: projectStories = [] } = useQuery({
    queryKey: ["project-stories", selectedProjectId],
    queryFn: () => fetchIssues({ projectId: selectedProjectId, type: "Story" }),
    enabled: Boolean(selectedProjectId),
  });
  const selectedProjectTeams = useMemo(
    () => getProjectTeams(selectedProject),
    [selectedProject]
  );
  const useProjectTeamsApi =
    Array.isArray(projectTeamsData) && projectTeamsData.length > 0;
  const projectTeamsSource = useProjectTeamsApi
    ? "project-teams-api"
    : Array.isArray(projectTeamsData)
      ? "projects-api-fallback-empty-project-teams"
      : "projects-api";
  const availableTeams = useMemo(
    () =>
      useProjectTeamsApi
        ? getProjectTeams({ teams: projectTeamsData })
        : selectedProjectTeams,
    [projectTeamsData, selectedProjectTeams, useProjectTeamsApi]
  );
  const selectedProjectWithTeams = useMemo(
    () =>
      selectedProject
        ? {
            ...selectedProject,
            teams: availableTeams,
          }
        : {
            teams: availableTeams,
          },
    [availableTeams, selectedProject]
  );
  const projectMembers = useMemo(
    () => getProjectMembers(selectedProjectWithTeams),
    [selectedProjectWithTeams]
  );
  const availableAssignees = useMemo(
    () => getProjectTeamMembers(selectedProjectWithTeams, formData.teamId),
    [formData.teamId, selectedProjectWithTeams]
  );
  const isBugType = formData.type === "Bug";

  useEffect(() => {
    const previews = attachmentFiles
      .filter(isImageFile)
      .map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
      }));

    setAttachmentPreviews(previews);

    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [attachmentFiles]);
  const testerOptions = useMemo(
    () =>
      projectMembers.filter((assignee) => assignee.role === "Tester").length
        ? projectMembers.filter((assignee) => assignee.role === "Tester")
        : projectMembers,
    [projectMembers]
  );
  const developerOptions = useMemo(
    () => {
      const developers = availableAssignees.filter(
        (assignee) => assignee.role === "Developer"
      );

      if (isTesterBugReport) {
        return developers;
      }

      return developers.length ? developers : availableAssignees;
    },
    [availableAssignees, isTesterBugReport]
  );
  const defaultAssigneeKey = String(defaultAssigneeId || "");
  const defaultAssigneeInTeam = useMemo(
    () =>
      !defaultAssigneeKey ||
      availableAssignees.some(
        (assignee) => resolveUserId(assignee) === defaultAssigneeKey
      ),
    [availableAssignees, defaultAssigneeKey]
  );
  const defaultAssigneeInProject = useMemo(
    () =>
      !defaultAssigneeKey ||
      projectMembers.some(
        (member) => resolveUserId(member) === defaultAssigneeKey
      ),
    [defaultAssigneeKey, projectMembers]
  );

  useEffect(() => {
    logTeamSelectionDebug("Selected project", {
      component: "IssueComposer",
      projectId: selectedProjectId,
      projectName: selectedProject?.name || "",
    });
  }, [selectedProject?.name, selectedProjectId]);

  useEffect(() => {
    logTeamSelectionDebug("Filtered teams", {
      component: "IssueComposer",
      projectId: selectedProjectId,
      source: projectTeamsSource,
      teams: availableTeams.map((team) => ({
        id: resolveTeamId(team),
        name: team?.name || "",
        memberCount: team?.memberCount || team?.members?.length || 0,
      })),
    });
  }, [availableTeams, projectTeamsSource, selectedProjectId]);

  useEffect(() => {
    const currentProject = findProjectById(projects, formData.projectId);

    if (currentProject) {
      return;
    }

    setFormData((current) => ({
      ...current,
      projectId: resolveProjectSelection(defaultProjectId, projects),
    }));
  }, [defaultProjectId, formData.projectId, projects]);

  useEffect(() => {
    const nextTeamId = availableTeams.some(
      (team) => resolveTeamId(team) === String(formData.teamId)
    )
      ? String(formData.teamId)
      : resolveTeamSelection(defaultTeamId, availableTeams, defaultAssigneeKey);

    if (nextTeamId === String(formData.teamId || "")) {
      return;
    }

    setFormData((current) => ({
      ...current,
      teamId: nextTeamId,
    }));
  }, [availableTeams, defaultAssigneeKey, defaultTeamId, formData.teamId]);

  useEffect(() => {
    const availableAssigneeIds = new Set(
      availableAssignees.map((assignee) => resolveUserId(assignee))
    );
    let nextAssigneeId = "";

    if (!isTesterBugReport) {
      nextAssigneeId = showAssigneeField
        ? availableAssigneeIds.has(String(formData.assigneeId || ""))
          ? String(formData.assigneeId || "")
          : ""
        : defaultAssigneeInTeam
          ? defaultAssigneeKey
          : "";
    }

    if (nextAssigneeId === String(formData.assigneeId || "")) {
      return;
    }

    setFormData((current) => ({
      ...current,
      assigneeId: nextAssigneeId,
    }));
  }, [
    availableAssignees,
    defaultAssigneeInTeam,
    defaultAssigneeKey,
    formData.assigneeId,
    isTesterBugReport,
    showAssigneeField,
  ]);

  useEffect(() => {
    const availableAssigneeIds = new Set(
      availableAssignees.map((assignee) => resolveUserId(assignee))
    );
    const projectMemberIds = new Set(
      projectMembers.map((member) => resolveUserId(member))
    );
    let testerOwnerId = "";

    if (isTesterBugReport) {
      testerOwnerId = defaultAssigneeKey;
    } else if (
      formData.bugDetails.testerOwnerId &&
      projectMemberIds.has(String(formData.bugDetails.testerOwnerId))
    ) {
      testerOwnerId = formData.bugDetails.testerOwnerId;
    } else if (defaultAssigneeInProject) {
      testerOwnerId = defaultAssigneeKey;
    }
    const developerLeadId =
      formData.bugDetails.developerLeadId &&
      availableAssigneeIds.has(String(formData.bugDetails.developerLeadId))
        ? formData.bugDetails.developerLeadId
        : "";

    if (
      testerOwnerId === formData.bugDetails.testerOwnerId &&
      developerLeadId === formData.bugDetails.developerLeadId
    ) {
      return;
    }

    setFormData((current) => ({
      ...current,
      bugDetails: {
        ...current.bugDetails,
        testerOwnerId,
        developerLeadId,
      },
    }));
  }, [
    availableAssignees,
    defaultAssigneeInProject,
    defaultAssigneeKey,
    formData.bugDetails.developerLeadId,
    formData.bugDetails.testerOwnerId,
    isTesterBugReport,
    projectMembers,
  ]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((current) => {
      if (name === "projectId") {
        const nextProject = findProjectById(projects, value);

        return {
          ...current,
          projectId: value,
          teamId: resolveTeamSelection(
            "",
            getProjectTeams(nextProject),
            defaultAssigneeKey
          ),
          assigneeId: "",
          parentStoryId: "",
          bugDetails: {
            ...current.bugDetails,
            testerOwnerId: defaultAssigneeKey,
            developerLeadId: "",
          },
        };
      }

      if (name === "teamId") {
        return {
          ...current,
          teamId: value,
          assigneeId: "",
          bugDetails: {
            ...current.bugDetails,
            testerOwnerId: defaultAssigneeKey,
            developerLeadId: "",
          },
        };
      }

      if (name === "type") {
        return {
          ...current,
          type: value,
          status: value === "Bug" ? ISSUE_STATUS.NEW : defaultStatus,
          priority: value === "Bug" && current.priority === "Low" ? "High" : current.priority,
        };
      }

      return {
        ...current,
        [name]: value,
      };
    });
  };

  const submitBlockedMessage = useMemo(() => {
    if (!projects.length) {
      return "Create a project before planning work.";
    }

    if (!selectedProject) {
      return "Select a project to continue.";
    }

    if (!availableTeams.length) {
      return "No teams were returned for this project. Attach a team or ask an admin to verify the project-team links.";
    }

    return "";
  }, [
    availableTeams.length,
    projects.length,
    selectedProject,
  ]);
  const isSubmitPending = isPending || isUploadingAttachments;

  const handleAttachmentFileChange = (event) => {
    setAttachmentFiles((current) => [
      ...current,
      ...Array.from(event.target.files || []),
    ]);
    setAttachmentPasteHint("");
  };

  const handleAttachmentPaste = async (event) => {
    if (event.defaultPrevented) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const pastedAttachments = await getClipboardAttachmentFiles(event.clipboardData);

    if (!pastedAttachments.length) {
      setAttachmentPasteHint("No image or file was found in clipboard. Copy the image itself, then paste here.");
      return;
    }

    const renamedImages = pastedAttachments.map((file, index) =>
      new File([file], buildPastedAttachmentName(file, index), {
        type: file.type || (isLikelyImageFile(file) ? "image/png" : "application/octet-stream"),
      })
    );

    setAttachmentFiles((current) => [...current, ...renamedImages]);
    setAttachmentPasteHint(`${renamedImages.length} pasted item${renamedImages.length === 1 ? "" : "s"} added.`);

    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  };

  const removeAttachmentFile = (indexToRemove) => {
    setAttachmentFiles((current) =>
      current.filter((_, fileIndex) => fileIndex !== indexToRemove)
    );

    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  };

  const attachmentComposerClass =
    "space-y-3 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/70 to-white p-3 shadow-sm";
  const attachmentDropClass =
    "flex min-h-[96px] cursor-text flex-col justify-center rounded-xl border border-dashed border-blue-200 bg-white px-3 py-2 transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/15";
  const attachmentPreviewGridClass = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

  const applyModuleOwnership = (moduleName) => {
    const ownership = moduleOwnerships.find(
      (item) =>
        String(item.moduleName || "").trim().toLowerCase() ===
        String(moduleName || "").trim().toLowerCase()
    );

    setFormData((current) => ({
      ...current,
      teamId: ownership?.teamId || current.teamId,
      assigneeId: "",
      bugDetails: {
        ...current.bugDetails,
        moduleName,
        developerLeadId: ownership?.developerId || current.bugDetails.developerLeadId,
        suggestedTeam:
          ownership?.responsibleTeamName ||
          ownership?.team?.name ||
          current.bugDetails.suggestedTeam,
      },
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.title.trim() || !formData.projectId || !formData.teamId) {
      setError("Title, project, and team are required.");
      return;
    }

    if (submitBlockedMessage) {
      setError(submitBlockedMessage);
      return;
    }

    if (isBugType) {
      if (
        !formData.bugDetails.moduleName.trim() ||
        !formData.bugDetails.category ||
        !formData.bugDetails.affectedPlatform
      ) {
        setError("Module/Page, category, and affected platform are required for bugs.");
        return;
      }

      if (!formData.priority) {
        setError("Priority is required for bugs.");
        return;
      }

      if (
        !formData.bugDetails.stepsToReproduce.trim() ||
        !formData.bugDetails.expectedResult.trim() ||
        !formData.bugDetails.actualResult.trim()
      ) {
        setError("Steps to Reproduce, Expected Result, and Actual Result are required for bugs.");
        return;
      }
    }

    try {
      setError("");

      const createdIssue = await onSubmit({
        title: formData.title.trim(),
        description: [formData.description.trim(), attachmentNote.trim()]
          .filter(Boolean)
          .join("\n\nAttachment notes:\n"),
        type: formData.type,
        status: isBugType ? ISSUE_STATUS.NEW : formData.status,
        priority: formData.priority,
        projectId: formData.projectId,
        teamId: formData.teamId,
        parentStoryId: formData.parentStoryId || null,
        assigneeId: (isTesterBugReport && !formData.bugDetails.developerLeadId)
          ? null
          : isTesterBugReport
          ? formData.bugDetails.developerLeadId
          : showAssigneeField
          ? formData.assigneeId || null
          : defaultAssigneeInTeam
            ? defaultAssigneeKey || null
            : null,
        ...(isBugType
          ? {
              bugDetails: {
                moduleName: formData.bugDetails.moduleName.trim(),
                category: formData.bugDetails.category,
                affectedPlatform: formData.bugDetails.affectedPlatform,
                suggestedTeam: formData.bugDetails.suggestedTeam,
                addToBucket: Boolean(formData.bugDetails.addToBucket),
                sendToTriage: Boolean(formData.bugDetails.sendToTriage),
                estimatedEffort: formData.bugDetails.estimatedEffort,
                severity: formData.bugDetails.severity || "Major",
                testerOwnerId: isTesterBugReport
                  ? defaultAssigneeKey || null
                  : formData.bugDetails.testerOwnerId || null,
                developerLeadId: (formData.bugDetails.addToBucket || formData.bugDetails.sendToTriage)
                  ? null
                  : formData.bugDetails.developerLeadId || null,
                stepsToReproduce: formData.bugDetails.stepsToReproduce.trim(),
                expectedResult: formData.bugDetails.expectedResult.trim(),
                actualResult: formData.bugDetails.actualResult.trim(),
              },
            }
          : {}),
      });

      if (includeAttachments && onUploadAttachment && attachmentFiles.length) {
        setIsUploadingAttachments(true);

        await Promise.all(
          attachmentFiles.map((file) =>
            onUploadAttachment({
              issueId: createdIssue._id,
              file,
            })
          )
        );
      }

      setFormData(
        buildInitialState({
          projects,
          defaultProjectId: formData.projectId,
          defaultTeamId: formData.teamId,
          defaultType: resolvedDefaultType,
          defaultStatus,
          defaultAssigneeId,
        })
      );
      setAttachmentFiles([]);
      setAttachmentNote("");
    } catch (submitError) {
      setError(
        submitError.response?.data?.message || "Unable to create the work item."
      );
    } finally {
      setIsUploadingAttachments(false);
    }
  };

  const reporterLabel = reporterName || "Logged-in tester";
  const testerFieldLabelClass = "text-xs font-semibold text-slate-700";
  const testerFieldGroupClass = "space-y-1";
  const testerInputClass =
    "h-9 rounded-lg border-slate-300 px-3 text-sm shadow-none focus-visible:border-blue-500 focus-visible:ring-blue-500/20";
  const testerSelectClass =
    "field-select h-9 rounded-lg border-slate-300 px-3 text-sm shadow-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20";
  const testerTextareaClass =
    "rounded-lg border-slate-300 px-3 py-2 text-sm shadow-none focus-visible:border-blue-500 focus-visible:ring-blue-500/20";
  const testerMetaGroupClass = "space-y-1 rounded-lg border border-slate-200 bg-white p-2";
  const testerCompactActionClass =
    "flex min-h-[56px] cursor-pointer items-start gap-2 rounded-lg border bg-white px-2.5 py-2 transition hover:border-blue-300 hover:bg-blue-50/40";

  const formContent = (
    <form className={isTesterBugReport ? "space-y-3" : "space-y-5"} onSubmit={handleSubmit}>
      {submitBlockedMessage ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {submitBlockedMessage}
        </div>
      ) : null}

      {["Task", "Sub-task", "Bug"].includes(formData.type) ? (
        <label className={isTesterBugReport ? testerFieldGroupClass : "space-y-2"}>
          <span className={isTesterBugReport ? testerFieldLabelClass : "text-sm font-medium text-gray-700"}>
            Parent Story (Optional)
          </span>
          <select
            className={isTesterBugReport ? testerSelectClass : "field-select"}
            value={formData.parentStoryId}
            onChange={(event) => {
              const story = projectStories.find(
                (candidate) => String(candidate._id) === event.target.value
              );

              setFormData((current) => ({
                ...current,
                parentStoryId: event.target.value,
                teamId: story?.teamId?._id || story?.teamId || current.teamId,
              }));
            }}
            disabled={!formData.projectId}
          >
            <option value="">No parent Story</option>
            {projectStories.map((story) => (
              <option key={story._id} value={story._id}>
                {story.displayBugId || story.issueKey || "Story"} - {story.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {!isTesterBugReport ? (
        <>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700" htmlFor="title">
              {titleLabel}
            </label>
            <Input
              id="title"
              name="title"
              placeholder={titlePlaceholder}
              value={formData.title}
              onChange={handleChange}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700" htmlFor="description">
              Description
            </label>
            <Textarea
              id="description"
              name="description"
              placeholder={descriptionPlaceholder}
              value={formData.description}
              onChange={handleChange}
            />
          </div>
        </>
      ) : null}

      {isTesterBugReport && isBugType ? (
        <div className="space-y-2.5 rounded-[14px] border border-slate-200 bg-slate-50/70 p-3 shadow-sm">
          <div className="inline-flex w-fit rounded-full border border-blue-100 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-600">
            Reported by: {reporterLabel}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(260px,3fr)]">
            <div className="grid gap-2">
              <div className={testerFieldGroupClass}>
                <label className={testerFieldLabelClass} htmlFor="title">
                  {titleLabel}
                </label>
                <Input
                  id="title"
                  name="title"
                  className={testerInputClass}
                  placeholder={titlePlaceholder}
                  value={formData.title}
                  onChange={handleChange}
                />
              </div>

              <div className={testerFieldGroupClass}>
                <label className={testerFieldLabelClass} htmlFor="description">
                  Description
                </label>
                <Textarea
                  id="description"
                  name="description"
                  className={cn(testerTextareaClass, "h-[140px] min-h-[140px] resize-y")}
                  placeholder={descriptionPlaceholder}
                  value={formData.description}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="grid content-start gap-2 sm:grid-cols-2 lg:grid-cols-2">
              <label className={testerFieldGroupClass}>
                <span className={cn(testerFieldLabelClass, "flex items-center gap-2")}>
                  <ClipboardList className="h-4 w-4 text-blue-600" />
                  {projectLabel}
                </span>
                <select
                  className={testerSelectClass}
                  name="projectId"
                  value={formData.projectId}
                  onChange={handleChange}
                >
                  {projects.length ? (
                    projects.map((project) => (
                      <option key={project._id} value={project._id}>
                        {project.name}
                      </option>
                    ))
                  ) : (
                    <option value="">No projects available</option>
                  )}
                </select>
              </label>

              <label className={testerFieldGroupClass}>
                <span className={cn(testerFieldLabelClass, "flex items-center gap-2")}>
                  <Users2 className="h-4 w-4 text-blue-600" />
                  Team
                </span>
                <select
                  className={testerSelectClass}
                  name="teamId"
                  value={formData.teamId}
                  onChange={handleChange}
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

              <label className={testerFieldGroupClass}>
                <span className={testerFieldLabelClass}>Suggested Team</span>
                <select
                  className={testerSelectClass}
                  value={formData.bugDetails.suggestedTeam}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      bugDetails: {
                        ...current.bugDetails,
                        suggestedTeam: event.target.value,
                      },
                    }))
                  }
                >
                  <option value="">Auto-select</option>
                  {BUG_TEAM_OPTIONS.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              </label>

              <label className={testerFieldGroupClass}>
                <span className={testerFieldLabelClass}>Suggested Developer</span>
                <select
                  className={testerSelectClass}
                  value={formData.bugDetails.developerLeadId}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      bugDetails: {
                        ...current.bugDetails,
                        developerLeadId: event.target.value,
                      },
                    }))
                  }
                  disabled={!formData.teamId || formData.bugDetails.addToBucket || formData.bugDetails.sendToTriage}
                >
                  <option value="">Unassigned</option>
                  {developerOptions.map((assignee) => (
                    <option key={assignee._id} value={assignee._id}>
                      {assignee.name} ({assignee.role})
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-2 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-2">
                <label
                  className={cn(
                    testerCompactActionClass,
                    formData.bugDetails.addToBucket
                      ? "border-blue-300 bg-blue-50 ring-1 ring-blue-200"
                      : "border-slate-200"
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={formData.bugDetails.addToBucket}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        bugDetails: {
                          ...current.bugDetails,
                          addToBucket: event.target.checked,
                          sendToTriage: event.target.checked ? false : current.bugDetails.sendToTriage,
                          developerLeadId: event.target.checked
                            ? ""
                            : current.bugDetails.developerLeadId,
                        },
                      }))
                    }
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold leading-4 text-slate-800">
                      Add to Work Queue
                    </span>
                    <span className="block text-xs leading-4 text-slate-500">
                      Assign later
                    </span>
                  </span>
                </label>

                <label
                  className={cn(
                    testerCompactActionClass,
                    formData.bugDetails.sendToTriage
                      ? "border-blue-300 bg-blue-50 ring-1 ring-blue-200"
                      : "border-slate-200"
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={formData.bugDetails.sendToTriage}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        bugDetails: {
                          ...current.bugDetails,
                          sendToTriage: event.target.checked,
                          addToBucket: event.target.checked ? false : current.bugDetails.addToBucket,
                          developerLeadId: event.target.checked
                            ? ""
                            : current.bugDetails.developerLeadId,
                        },
                      }))
                    }
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold leading-4 text-slate-800">
                      Send to Triage Board
                    </span>
                    <span className="block text-xs leading-4 text-slate-500">
                      Admin review workflow
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <label className={testerMetaGroupClass}>
                <span className={testerFieldLabelClass}>Module/Page</span>
                <Input
                  className={testerInputClass}
                  list="bug-module-options"
                  value={formData.bugDetails.moduleName}
                  onChange={(event) => applyModuleOwnership(event.target.value)}
                  placeholder="Login Page"
                />
                <datalist id="bug-module-options">
                  {BUG_MODULE_OPTIONS.map((moduleName) => (
                    <option key={moduleName} value={moduleName} />
                  ))}
                </datalist>
              </label>

              <label className={testerMetaGroupClass}>
                <span className={testerFieldLabelClass}>Bug Category</span>
                <BugCategorySelect
                  value={formData.bugDetails.category}
                  onChange={(category) => {
                    const suggestedTeam = getSuggestedTeamForCategory(category);

                    setFormData((current) => ({
                      ...current,
                      bugDetails: {
                        ...current.bugDetails,
                        category,
                        suggestedTeam,
                      },
                    }));
                  }}
                />
              </label>

              <label className={testerMetaGroupClass}>
                <span className={testerFieldLabelClass}>Affected Platform</span>
                <select
                  className={testerSelectClass}
                  value={formData.bugDetails.affectedPlatform}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      bugDetails: {
                        ...current.bugDetails,
                        affectedPlatform: event.target.value,
                      },
                    }))
                  }
                >
                  {BUG_PLATFORM_OPTIONS.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              </label>

              <label className={testerMetaGroupClass}>
                <span className={testerFieldLabelClass}>Severity</span>
                <select
                  className={testerSelectClass}
                  value={formData.bugDetails.severity}
                  onChange={(event) =>
                    setFormData((current) => ({
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

              <label className={testerMetaGroupClass}>
                <span className={testerFieldLabelClass}>Priority</span>
                <select
                  className={testerSelectClass}
                  value={formData.priority}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      priority: event.target.value,
                    }))
                  }
                >
                  {BUG_PRIORITY_OPTIONS.map((priorityOption) => (
                    <option key={priorityOption} value={priorityOption}>
                      {priorityOption}
                    </option>
                  ))}
                </select>
              </label>

              <label className={testerMetaGroupClass}>
                <span className={testerFieldLabelClass}>Reproducibility</span>
                <select
                  className={testerSelectClass}
                  value={formData.bugDetails.estimatedEffort}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      bugDetails: {
                        ...current.bugDetails,
                        estimatedEffort: event.target.value,
                      },
                    }))
                  }
                >
                  <option value="">Select reproducibility</option>
                  <option value="Always">Always</option>
                  <option value="Often">Often</option>
                  <option value="Sometimes">Sometimes</option>
                  <option value="Rarely">Rarely</option>
                  <option value="Unable to reproduce">Unable to reproduce</option>
                </select>
              </label>

              <label className={testerMetaGroupClass}>
                <span className={testerFieldLabelClass}>Environment</span>
                <select
                  className={testerSelectClass}
                  value={formData.bugDetails.affectedPlatform}
                  disabled
                >
                  {BUG_PLATFORM_OPTIONS.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              </label>
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-2.5">
            <label className={testerFieldGroupClass}>
              <span className={testerFieldLabelClass}>Steps to Reproduce</span>
              <Textarea
                className={cn(testerTextareaClass, "min-h-[160px]")}
                value={formData.bugDetails.stepsToReproduce}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    bugDetails: {
                      ...current.bugDetails,
                      stepsToReproduce: event.target.value,
                    },
                  }))
                }
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className={testerFieldGroupClass}>
                <span className={testerFieldLabelClass}>Expected Result</span>
                <Textarea
                  className={cn(testerTextareaClass, "min-h-[112px]")}
                  value={formData.bugDetails.expectedResult}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      bugDetails: {
                        ...current.bugDetails,
                        expectedResult: event.target.value,
                      },
                    }))
                  }
                />
              </label>

              <label className={testerFieldGroupClass}>
                <span className={testerFieldLabelClass}>Actual Result</span>
                <Textarea
                  className={cn(testerTextareaClass, "min-h-[112px]")}
                  value={formData.bugDetails.actualResult}
                  onChange={(event) =>
                    setFormData((current) => ({
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

            {includeAttachments ? (
              <div className={testerFieldGroupClass}>
                <span className={cn(testerFieldLabelClass, "flex items-center gap-2")}>
                  <FileText className="h-4 w-4 text-blue-600" />
                  Message / Screenshots
                </span>
                <div className={attachmentComposerClass}>
                  <div className={attachmentDropClass} onPaste={handleAttachmentPaste}>
                    <Textarea
                      className="min-h-[70px] resize-y border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                      placeholder="Write a note for this attachment, then paste a screenshot here"
                      value={attachmentNote}
                      onChange={(event) => setAttachmentNote(event.target.value)}
                      onPaste={handleAttachmentPaste}
                      onPasteCapture={handleAttachmentPaste}
                      disabled={isSubmitPending}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      className="h-9 rounded-xl px-3 text-xs"
                      type="button"
                      variant="outline"
                      disabled={isSubmitPending}
                      onClick={() => attachmentInputRef.current?.click()}
                    >
                      Choose Files
                    </Button>
                    <span className="text-xs font-medium text-slate-500">Paste screenshots directly into the message box.</span>
                  </div>
                  {attachmentPasteHint ? (
                    <p className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-semibold text-blue-700">
                      {attachmentPasteHint}
                    </p>
                  ) : null}
                  <Input
                    ref={attachmentInputRef}
                    type="file"
                    multiple
                    accept={attachmentAccept}
                    className="sr-only"
                    onChange={handleAttachmentFileChange}
                    disabled={isSubmitPending}
                  />
                  {attachmentFiles.length ? (
                  <div className="space-y-3 text-xs leading-5 text-slate-600">
                    {attachmentPreviews.length ? (
                      <div className={attachmentPreviewGridClass}>
                        {attachmentPreviews.map((preview) => {
                          const fileIndex = attachmentFiles.findIndex((file) => file.name === preview.name);

                          return (
                          <figure key={preview.url} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                            <button
                              aria-label={`Remove ${preview.name}`}
                              className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-base font-bold leading-none text-slate-600 shadow transition hover:bg-rose-50 hover:text-rose-600"
                              type="button"
                              onClick={() => removeAttachmentFile(fileIndex)}
                            >
                              x
                            </button>
                            <img
                              alt={preview.name}
                              className="h-44 w-full object-contain"
                              src={preview.url}
                            />
                          </figure>
                          );
                        })}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {attachmentFiles.map((file, fileIndex) => !isImageFile(file) ? (
                        <span key={`${file.name}-${fileIndex}`} className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                          <span className="truncate">{file.name}</span>
                          <button
                            aria-label={`Remove ${file.name}`}
                            className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-sm font-bold leading-none text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                            type="button"
                            onClick={() => removeAttachmentFile(fileIndex)}
                          >
                            x
                          </button>
                        </span>
                      ) : null)}
                    </div>
                  </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isBugType && !isTesterBugReport ? (
        <div className="rounded-[24px] border border-rose-100 bg-rose-50/60 p-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">Severity</span>
              <select
                className="field-select"
                value={formData.bugDetails.severity}
                onChange={(event) =>
                  setFormData((current) => ({
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
              <span className="text-sm font-medium text-gray-700">Priority</span>
              <select
                className="field-select"
                value={formData.priority}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    priority: event.target.value,
                  }))
                }
              >
                {BUG_PRIORITY_OPTIONS.map((priorityOption) => (
                  <option key={priorityOption} value={priorityOption}>
                    {priorityOption}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">Status</span>
              <select className="field-select" value={ISSUE_STATUS.NEW} disabled>
                {BUG_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">
                Tester / QA Owner
              </span>
              <select
                className="field-select"
                value={formData.bugDetails.testerOwnerId}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    bugDetails: {
                      ...current.bugDetails,
                      testerOwnerId: event.target.value,
                    },
                  }))
                }
              >
                <option value="">Unassigned</option>
                {testerOptions.map((assignee) => (
                  <option key={assignee._id} value={assignee._id}>
                    {assignee.name} ({assignee.role})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">
                Developer / Dev Lead
              </span>
              <select
                className="field-select"
                value={formData.bugDetails.developerLeadId}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    bugDetails: {
                      ...current.bugDetails,
                      developerLeadId: event.target.value,
                    },
                  }))
                }
              >
                <option value="">Unassigned</option>
                {developerOptions.map((assignee) => (
                  <option key={assignee._id} value={assignee._id}>
                    {assignee.name} ({assignee.role})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 space-y-4">
            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">
                Steps to Reproduce
              </span>
              <Textarea
                value={formData.bugDetails.stepsToReproduce}
                onChange={(event) =>
                  setFormData((current) => ({
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
                <span className="text-sm font-medium text-gray-700">
                  Expected Result
                </span>
                <Textarea
                  value={formData.bugDetails.expectedResult}
                  onChange={(event) =>
                    setFormData((current) => ({
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
                <span className="text-sm font-medium text-gray-700">
                  Actual Result
                </span>
                <Textarea
                  value={formData.bugDetails.actualResult}
                  onChange={(event) =>
                    setFormData((current) => ({
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

            {includeAttachments ? (
              <div className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <FileText className="h-4 w-4 text-blue-600" />
                  Message / Screenshots
                </span>
                <div className={attachmentComposerClass}>
                  <div className={attachmentDropClass} onPaste={handleAttachmentPaste}>
                    <Textarea
                      className="min-h-[82px] resize-y border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                      placeholder="Write a note for this attachment, then paste a screenshot here"
                      value={attachmentNote}
                      onChange={(event) => setAttachmentNote(event.target.value)}
                      onPaste={handleAttachmentPaste}
                      onPasteCapture={handleAttachmentPaste}
                      disabled={isSubmitPending}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      className="h-9 rounded-xl px-3 text-xs"
                      type="button"
                      variant="outline"
                      disabled={isSubmitPending}
                      onClick={() => attachmentInputRef.current?.click()}
                    >
                      Choose Files
                    </Button>
                    <span className="text-xs font-medium text-slate-500">Paste screenshots directly into the message box.</span>
                  </div>
                  {attachmentPasteHint ? (
                    <p className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-semibold text-blue-700">
                      {attachmentPasteHint}
                    </p>
                  ) : null}
                  <Input
                    ref={attachmentInputRef}
                    type="file"
                    multiple
                    accept={attachmentAccept}
                    className="sr-only"
                    onChange={handleAttachmentFileChange}
                    disabled={isSubmitPending}
                  />
                  {attachmentFiles.length ? (
                  <div className="space-y-3 text-xs leading-5 text-slate-600">
                    {attachmentPreviews.length ? (
                      <div className={attachmentPreviewGridClass}>
                        {attachmentPreviews.map((preview) => {
                          const fileIndex = attachmentFiles.findIndex((file) => file.name === preview.name);

                          return (
                          <figure key={preview.url} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            <button
                              aria-label={`Remove ${preview.name}`}
                              className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-base font-bold leading-none text-slate-600 shadow transition hover:bg-rose-50 hover:text-rose-600"
                              type="button"
                              onClick={() => removeAttachmentFile(fileIndex)}
                            >
                              x
                            </button>
                            <img
                              alt={preview.name}
                              className="h-48 w-full object-contain"
                              src={preview.url}
                            />
                          </figure>
                          );
                        })}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {attachmentFiles.map((file, fileIndex) => !isImageFile(file) ? (
                        <span key={`${file.name}-${fileIndex}`} className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                          <span className="truncate">{file.name}</span>
                          <button
                            aria-label={`Remove ${file.name}`}
                            className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-sm font-bold leading-none text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                            type="button"
                            onClick={() => removeAttachmentFile(fileIndex)}
                          >
                            x
                          </button>
                        </span>
                      ) : null)}
                    </div>
                  </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!isTesterBugReport ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <ClipboardList className="h-4 w-4 text-blue-600" />
                {projectLabel}
              </span>
              <select
                className="field-select"
                name="projectId"
                value={formData.projectId}
                onChange={handleChange}
              >
                {projects.length ? (
                  projects.map((project) => (
                    <option key={project._id} value={project._id}>
                      {project.name}
                    </option>
                  ))
                ) : (
                  <option value="">No projects available</option>
                )}
              </select>
            </label>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Users2 className="h-4 w-4 text-blue-600" />
                Team
              </span>
              <select
                className="field-select"
                name="teamId"
                value={formData.teamId}
                onChange={handleChange}
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

            {showAssigneeField ? (
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <UserCircle2 className="h-4 w-4 text-blue-600" />
                  Assignee
                </span>
                <select
                  className="field-select"
                  name="assigneeId"
                  value={formData.assigneeId}
                  onChange={handleChange}
                  disabled={!formData.teamId}
                >
                  <option value="">Unassigned</option>
                  {availableAssignees.length ? (
                    availableAssignees.map((assignee) => (
                      <option key={assignee._id} value={assignee._id}>
                        {assignee.name} ({assignee.role})
                      </option>
                    ))
                  ) : (
                    <option disabled value="__empty">
                      No team members available
                    </option>
                  )}
                </select>
              </label>
            ) : null}
          </div>

          <div
            className={`grid gap-4 ${
              showStatusField ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2 xl:grid-cols-3"
            }`}
          >
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <ClipboardList className="h-4 w-4 text-blue-600" />
                Type
              </span>
              <select
                className="field-select"
                name="type"
                value={formData.type}
                disabled={lockType || allowedTypes.length === 1}
                onChange={handleChange}
              >
                {allowedTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            {!isBugType ? (
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Flag className="h-4 w-4 text-blue-600" />
                  Priority
                </span>
                <select
                  className="field-select"
                  name="priority"
                  value={formData.priority}
                  onChange={handleChange}
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </label>
            ) : null}

            {showStatusField && !isBugType ? (
              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-700">Status</span>
                <select
                  className="field-select"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                >
                  {ISSUE_WORKFLOW_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <Button
        className={isTesterBugReport ? "ml-auto flex w-full sm:w-auto" : "w-full"}
        disabled={isSubmitPending || Boolean(submitBlockedMessage)}
        type="submit"
      >
        {isSubmitPending ? "Saving..." : submitLabel}
      </Button>
    </form>
  );

  if (variant === "plain") {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-blue-600">
            <Sparkle className="h-3.5 w-3.5" />
            {headerLabel}
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">
            {cardTitle}
          </h2>
          <p className="text-sm leading-6 text-slate-600">
            {cardDescription}
          </p>
        </div>
        {formContent}
      </div>
    );
  }

  return (
    <Card className="h-full overflow-hidden border-white/70 bg-white/92 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.45)] backdrop-blur">
      <CardHeader className={isTesterBugReport ? "space-y-2 px-4 py-4 sm:px-5" : undefined}>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-blue-600">
          <Sparkle className="h-3.5 w-3.5" />
          {headerLabel}
        </div>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>

      <CardContent className={isTesterBugReport ? "px-4 pb-4 sm:px-5" : undefined}>
        {formContent}
      </CardContent>
    </Card>
  );
};

export default IssueComposer;
