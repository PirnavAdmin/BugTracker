import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Select from "react-select";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Layers3,
  Link2,
  ListChecks,
  LoaderCircle,
  RotateCcw,
  Settings2,
  Trash2,
  UserPlus,
  Users,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getInitials } from "@/lib/utils";
import { getProjectTeams, resolveUserId } from "@/lib/project-teams";
import { fetchEpics } from "@/lib/api";
import { memberSelectStyles } from "@/components/projects/memberSelectTheme";
import ProjectManageDialog from "@/components/projects/ProjectManageDialog";
import {
  projectDialogBodyClass,
  projectDialogContentClass,
  projectDialogFooterClass,
  projectDialogHeaderClass,
} from "@/components/projects/projectDialogStyles";

const TEAMS_NEW_MEETING_BASE_URL = "https://teams.microsoft.com/l/meeting/new";
const buildTeamOption = (team) => ({
  value: team._id,
  label: team.name,
  description: team.description || "",
  memberCount: team.memberCount || team.members?.length || 0,
});

const buildUserOption = (user) => ({
  value: user._id,
  label: user.name || user.email || "Unnamed user",
  email: user.email || "",
  role: user.role || "Developer",
});

const formatUserOptionLabel = (option, { context }) => {
  if (context !== "menu") {
    return option.label;
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
        {getInitials(option.label)}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{option.label}</p>
        <p className="truncate text-xs text-slate-500">
          {option.role}{option.email ? ` - ${option.email}` : ""}
        </p>
      </div>
    </div>
  );
};

const formatTeamOptionLabel = (option, { context }) => {
  if (context !== "menu") {
    return option.label;
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-sm">
        {getInitials(option.label)}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{option.label}</p>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
            {option.memberCount} members
          </span>
          <span className="min-w-0 truncate">
            {option.description || "No team description provided."}
          </span>
        </div>
      </div>
    </div>
  );
};

const attachTeamSelectStyles = {
  ...memberSelectStyles,
  control: (base, state) => ({
    ...memberSelectStyles.control(base, state),
    minHeight: 62,
    borderRadius: 18,
    borderColor: state.isFocused ? "rgba(37, 99, 235, 0.5)" : "rgba(203, 213, 225, 0.95)",
    background: "#ffffff",
    boxShadow: state.isFocused
      ? "0 0 0 4px rgba(37, 99, 235, 0.12)"
      : "0 12px 28px -24px rgba(15, 23, 42, 0.45)",
  }),
  valueContainer: (base) => ({
    ...memberSelectStyles.valueContainer(base),
    paddingLeft: 8,
    paddingRight: 8,
  }),
  placeholder: (base) => ({
    ...memberSelectStyles.placeholder(base),
    color: "#94a3b8",
    fontWeight: 500,
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 120,
  }),
  menu: (base) => ({
    ...memberSelectStyles.menu(base),
    borderRadius: 18,
    border: "1px solid rgba(203, 213, 225, 0.95)",
    background: "#ffffff",
    boxShadow: "0 24px 60px -28px rgba(15, 23, 42, 0.45)",
  }),
  menuList: (base) => ({
    ...memberSelectStyles.menuList(base),
    maxHeight: 320,
    padding: 8,
  }),
  option: (base, state) => ({
    ...memberSelectStyles.option(base, state),
    borderRadius: 14,
    padding: "12px 14px",
    background: state.isSelected
      ? "rgba(219, 234, 254, 0.9)"
      : state.isFocused
        ? "rgba(248, 250, 252, 1)"
        : "#ffffff",
  }),
};

const getProjectStatus = (project) =>
  project?.status || (project?.isCompleted ? "Completed" : "Active");

const StatusBadge = ({ status = "Active" }) => (
  <span
    className={
      status === "Completed"
        ? "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700"
        : status === "On Hold"
          ? "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 text-[11px] font-semibold text-amber-700"
        : "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2 text-[11px] font-semibold text-blue-700"
    }
  >
    <span
      className={
        status === "Completed"
          ? "h-1.5 w-1.5 rounded-full bg-emerald-500"
          : status === "On Hold"
            ? "h-1.5 w-1.5 rounded-full bg-amber-500"
          : "h-1.5 w-1.5 rounded-full bg-blue-500"
      }
    />
    {status}
  </span>
);

const getProjectAssignmentName = (value) => {
  if (!value || typeof value !== "object") {
    return "Unassigned";
  }

  const name = typeof value.name === "string" ? value.name.trim() : "";
  const email = typeof value.email === "string" ? value.email.trim() : "";

  return name || email || "Unassigned";
};

const CompactBadge = ({ children }) => (
  <span className="inline-flex h-6 min-w-0 max-w-full items-center rounded-full border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-slate-600">
    <span className="truncate">{children}</span>
  </span>
);

const ProjectCard = ({
  project,
  index = 0,
  workspaceTeams = [],
  users = [],
  canManageProject = false,
  onAttachTeam,
  onDetachTeam,
  onUpdateProject,
  onUpdateStatus,
  onDeleteProject,
  onAddProjectMember,
  onRemoveProjectMember,
  onCreateEpic,
  onUpdateEpic,
  onDeleteEpic,
  onOpenTeamsComposer,
  isAttachingTeam = false,
  isUpdatingProject = false,
  isUpdatingStatus = false,
  isDeletingProject = false,
  isAddingProjectMember = false,
  removingProjectMemberUserId = "",
  isSavingEpic = false,
  deletingEpicId = "",
  detachingTeamId = "",
  teamsErrorMessage = "",
  usersErrorMessage = "",
}) => {
  const navigate = useNavigate();
  const [isTeamDialogOpen, setIsTeamDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [isMembersDialogOpen, setIsMembersDialogOpen] = useState(false);
  const [isTeamsDialogOpen, setIsTeamsDialogOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedProjectMemberId, setSelectedProjectMemberId] = useState("");
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [deleteConfirmationValue, setDeleteConfirmationValue] = useState("");
  const [teamError, setTeamError] = useState("");
  const [memberError, setMemberError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [teamsActionError, setTeamsActionError] = useState("");
  const managerName = getProjectAssignmentName(project?.projectManager || project?.manager);
  const teamLeadName = getProjectAssignmentName(project?.teamLead);
  const projectStatus = getProjectStatus(project);
  const projectTitle = String(project?.name || "").trim() || "Untitled project";
  const projectShortCode = String(project?.shortCode || "").trim().toUpperCase();

  const attachedTeams = useMemo(() => getProjectTeams(project), [project]);
  const fallbackEpics = useMemo(
    () =>
      Array.isArray(project?.epics)
        ? project.epics
            .map((epic, epicIndex) =>
              typeof epic === "string"
                ? {
                    _id: "",
                    name: epic,
                    color: project?.themeColor || "#7C3AED",
                    planningOrder: epicIndex + 1,
                  }
                : epic
            )
            .filter((epic) => epic?.name)
        : [],
    [project?.epics, project?.themeColor]
  );
  const { data: projectEpicsData = [] } = useQuery({
    queryKey: ["project-epics", project?._id],
    queryFn: () => fetchEpics({ projectId: project._id }),
    enabled: Boolean(project?._id),
  });
  const projectEpics = useMemo(
    () =>
      Array.isArray(projectEpicsData) && projectEpicsData.length
        ? projectEpicsData
        : fallbackEpics,
    [fallbackEpics, projectEpicsData]
  );
  const projectMembers = useMemo(() => {
    const uniqueMembers = new Map();
    const collectMember = (member) => {
      const memberId = resolveUserId(member);

      if (!memberId || uniqueMembers.has(memberId)) {
        return;
      }

      uniqueMembers.set(memberId, member);
    };

    (project?.members || []).forEach(collectMember);
    attachedTeams.forEach((team) => (team?.members || []).forEach(collectMember));

    return Array.from(uniqueMembers.values()).sort((left, right) =>
      (left.name || left.email || "").localeCompare(right.name || right.email || "")
    );
  }, [attachedTeams, project?.members]);
  const directProjectMembers = useMemo(
    () =>
      (project?.projectMembers || [])
        .map((member) => ({
          ...(member.user || member.userId || {}),
          projectRole: member.role || member.user?.role || member.userId?.role || "Developer",
          membershipSource: "project",
          membershipId: member._id,
        }))
        .filter((member) => resolveUserId(member))
        .sort((left, right) =>
          (left.name || left.email || "").localeCompare(right.name || right.email || "")
        ),
    [project?.projectMembers]
  );
  const directProjectMemberIds = useMemo(
    () => new Set(directProjectMembers.map((member) => resolveUserId(member))),
    [directProjectMembers]
  );
  const memberUserOptions = useMemo(
    () =>
      users
        .filter((candidate) => candidate?._id && !directProjectMemberIds.has(String(candidate._id)))
        .map(buildUserOption)
        .sort((left, right) => left.label.localeCompare(right.label)),
    [directProjectMemberIds, users]
  );
  const selectedProjectMemberOption = useMemo(
    () =>
      memberUserOptions.find((option) => option.value === selectedProjectMemberId) || null,
    [memberUserOptions, selectedProjectMemberId]
  );
  const attachedTeamIds = useMemo(
    () =>
      new Set(
        attachedTeams
          .map((team) => team?._id || team)
          .filter(Boolean)
          .map((teamId) => String(teamId))
      ),
    [attachedTeams]
  );

  const availableTeams = useMemo(
    () =>
      [...workspaceTeams]
        .filter((team) => !attachedTeamIds.has(String(team._id)))
        .sort((left, right) => (left.name || "").localeCompare(right.name || "")),
    [workspaceTeams, attachedTeamIds]
  );

  const availableTeamOptions = useMemo(
    () => availableTeams.map(buildTeamOption),
    [availableTeams]
  );

  const selectedTeamOption = useMemo(
    () =>
      availableTeamOptions.find((option) => option.value === selectedTeamId) || null,
    [availableTeamOptions, selectedTeamId]
  );

  useEffect(() => {
    if (!isTeamDialogOpen) {
      setTeamError("");
      return;
    }

    if (
      selectedTeamId &&
      !availableTeams.some((team) => team._id === selectedTeamId)
    ) {
      setSelectedTeamId("");
    }
  }, [availableTeams, isTeamDialogOpen, selectedTeamId]);

  useEffect(() => {
    setTeamsActionError("");
    setMemberError("");
    setMemberToRemove(null);
    setSelectedProjectMemberId("");
  }, [project?._id]);

  useEffect(() => {
    setDeleteConfirmationValue("");
    setIsDeleteDialogOpen(false);
  }, [project?._id]);

  const handleTeamDialogChange = (open) => {
    setIsTeamDialogOpen(open);

    if (!open) {
      setTeamError("");
      setSelectedTeamId("");
    }
  };

  const handleDeleteDialogChange = (open) => {
    if (isDeletingProject && !open) {
      return;
    }

    setIsDeleteDialogOpen(open);

    if (!open) {
      setDeleteConfirmationValue("");
    }
  };

  const handleAttachTeam = async () => {
    if (!selectedTeamId) {
      setTeamError("Select a workspace team to attach.");
      return;
    }

    try {
      setTeamError("");
      await onAttachTeam({
        projectId: project._id,
        teamId: selectedTeamId,
      });
      handleTeamDialogChange(false);
    } catch (error) {
      setTeamError(
        error.response?.data?.message || "Unable to attach the selected team."
      );
    }
  };

  const handleStatusToggle = async () => {
    try {
      setStatusError("");
      await onUpdateStatus({
        projectId: project._id,
        isCompleted: !project.isCompleted,
      });
    } catch (error) {
      setStatusError(
        error.response?.data?.message || "Unable to update project status."
      );
    }
  };

  const handleDeleteProject = async () => {
    if (typeof onDeleteProject !== "function") {
      return;
    }

    await onDeleteProject(project._id);

    navigate("/projects", {
      replace: true,
      state: {
        toast: {
          type: "success",
          message: "Project deleted successfully",
        },
      },
    });
  };

  const handleOpenTeams = () => {
    const subject = `${String(project?.name || "Project").trim() || "Project"} Meeting`;
    const teamsMeetingUrl = `${TEAMS_NEW_MEETING_BASE_URL}?subject=${encodeURIComponent(subject)}`;
    const openedWindow = window.open(teamsMeetingUrl, "_blank", "noopener,noreferrer");

    if (!openedWindow) {
      setTeamsActionError(
        "Unable to open Microsoft Teams. Please allow pop-ups and try again."
      );
      return;
    }

    if (typeof onOpenTeamsComposer === "function") {
      onOpenTeamsComposer();
    }

    setTeamsActionError("");
  };

  const handleSelectEpic = (epic) => {
    const params = new URLSearchParams({
      projectId: project._id,
    });

    if (epic?._id) {
      params.set("epicId", epic._id);
    }

    navigate(`/issues?${params.toString()}`);
  };

  const handleAddProjectMember = async () => {
    if (!selectedProjectMemberId) {
      setMemberError("Search and select a user to add.");
      return;
    }

    const selectedUser = users.find((candidate) => candidate._id === selectedProjectMemberId);

    try {
      setMemberError("");
      await onAddProjectMember?.({
        projectId: project._id,
        userId: selectedProjectMemberId,
        role: selectedUser?.role || "Developer",
      });
      setSelectedProjectMemberId("");
    } catch (error) {
      setMemberError(error.response?.data?.message || "Unable to add this member.");
    }
  };

  const handleConfirmRemoveProjectMember = async () => {
    if (!memberToRemove) {
      return;
    }

    try {
      setMemberError("");
      await onRemoveProjectMember?.({
        projectId: project._id,
        userId: resolveUserId(memberToRemove),
      });
      setMemberToRemove(null);
    } catch (error) {
      setMemberError(error.response?.data?.message || "Unable to remove this member.");
      setMemberToRemove(null);
    }
  };

  const handleMetricKeyDown = (event, action) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  };

  const actionButtonClass =
    "interactive-button h-9 flex-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700";
  const isDeleteConfirmationValid =
    deleteConfirmationValue.trim() === String(project.name || "").trim();
  const metricItems = [
    {
      label: "Issues",
      value: project.issueCount || 0,
      icon: ListChecks,
      action: () => navigate(`/issues?projectId=${project._id}`),
    },
    {
      label: "Members",
      value: project.memberCount || projectMembers.length || 0,
      icon: Users,
      action: () => setIsMembersDialogOpen(true),
    },
    {
      label: "Teams",
      value: project.teamCount || attachedTeams.length || 0,
      icon: Layers3,
      action: () => setIsTeamsDialogOpen(true),
    },
  ];

  return (
    <>
      <Card
        className="page-shell-enter interactive-card flex h-[286px] min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_16px_38px_-32px_rgba(15,23,42,0.42)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_-36px_rgba(15,23,42,0.5)]"
        style={{ animationDelay: `${index * 45}ms` }}
      >
        <CardContent className="flex h-full flex-col justify-between gap-3 p-4">
          <div className="min-w-0 space-y-2.5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex min-w-0 items-center gap-1.5">
                  {projectShortCode ? <CompactBadge>{projectShortCode}</CompactBadge> : null}
                  <CompactBadge>{projectEpics.length} epics</CompactBadge>
                  <CompactBadge>{attachedTeams.length} teams</CompactBadge>
                </div>
                <h3
                  className="truncate text-base font-semibold leading-6 text-slate-950"
                  title={projectTitle}
                >
                  {projectTitle}
                </h3>
                <p
                  className="mt-0.5 truncate text-xs font-medium text-slate-500"
                  title={`Owner: ${managerName}`}
                >
                  Owner: {managerName}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <StatusBadge status={projectStatus} />
                {canManageProject ? (
                  <>
                    <Button
                      aria-label={project.isCompleted ? "Reopen Project" : "Mark as Completed"}
                      className="interactive-button h-7 w-7 rounded-lg border border-slate-200 bg-white p-0 text-slate-500 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                      disabled={isUpdatingStatus}
                      title={project.isCompleted ? "Reopen Project" : "Mark as Completed"}
                      type="button"
                      onClick={handleStatusToggle}
                    >
                      {isUpdatingStatus ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : project.isCompleted ? (
                        <RotateCcw className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      <span className="sr-only">
                        {project.isCompleted ? "Reopen Project" : "Mark as Completed"}
                      </span>
                    </Button>
                    <Button
                      className="interactive-button h-7 w-7 rounded-lg border border-rose-100 bg-white p-0 text-rose-500 shadow-sm hover:border-rose-200 hover:bg-rose-50"
                      disabled={isDeletingProject}
                      size="icon"
                      title="Delete Project"
                      type="button"
                      onClick={() => handleDeleteDialogChange(true)}
                    >
                      {isDeletingProject ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      <span className="sr-only">Delete Project</span>
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            <p
              className="h-5 truncate text-sm leading-5 text-slate-600"
              title={project.description || "No description added yet."}
            >
              {project.description || "No description added yet."}
            </p>
          </div>

          {statusError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {statusError}
            </div>
          ) : null}

          <div className="grid h-[76px] grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">
            {metricItems.map((item) => {
              const MetricIcon = item.icon;

              return (
                <button
                  key={item.label}
                  className="group flex h-full min-w-0 cursor-pointer flex-col items-center justify-center gap-1 border-r border-slate-200 px-2 text-center transition duration-200 last:border-r-0 hover:z-10 hover:scale-[1.025] hover:bg-white hover:shadow-[0_12px_24px_-20px_rgba(37,99,235,0.7)] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35"
                  type="button"
                  onClick={item.action}
                  onKeyDown={(event) => handleMetricKeyDown(event, item.action)}
                >
                  <span className="flex items-center gap-1 text-[11px] font-semibold uppercase text-slate-500 group-hover:text-blue-700">
                    <MetricIcon className="h-3.5 w-3.5" />
                    {item.label}
                  </span>
                  <span className="text-xl font-semibold leading-none text-slate-950">
                    {item.value}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            {canManageProject ? (
              <Button
                className={actionButtonClass}
                type="button"
                onClick={() => setIsManageDialogOpen(true)}
              >
                <Settings2 className="h-3.5 w-3.5" />
                Manage
              </Button>
            ) : null}

            {canManageProject ? (
              <Button
                className={actionButtonClass}
                disabled={Boolean(teamsErrorMessage) || !availableTeams.length}
                type="button"
                onClick={() => handleTeamDialogChange(true)}
              >
                <Link2 className="h-3.5 w-3.5" />
                Team
              </Button>
            ) : null}

            <Button
              className={`${actionButtonClass} border-blue-500/20 bg-blue-600 text-white shadow-[0_18px_32px_-24px_rgba(37,99,235,0.95)] hover:border-blue-500/30 hover:bg-blue-700`}
              type="button"
              onClick={() => navigate(`/issues?projectId=${project._id}&compose=1`)}
            >
              <Bug className="h-3.5 w-3.5" />
              Issue
            </Button>
          </div>

          {teamError && !isTeamDialogOpen ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {teamError}
            </div>
          ) : null}

          {teamsActionError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {teamsActionError}
            </div>
          ) : null}

          {teamsErrorMessage ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {teamsErrorMessage}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ProjectManageDialog
        open={isManageDialogOpen}
        onOpenChange={setIsManageDialogOpen}
        project={project}
        users={users}
        workspaceTeams={workspaceTeams}
        epics={projectEpics}
        canManageProject={canManageProject}
        onUpdateProject={onUpdateProject}
        onAttachTeam={onAttachTeam}
        onDetachTeam={onDetachTeam}
        onCreateEpic={onCreateEpic}
        onUpdateEpic={onUpdateEpic}
        onDeleteEpic={onDeleteEpic}
        onEpicClick={handleSelectEpic}
        isUpdatingProject={isUpdatingProject}
        isAttachingTeam={isAttachingTeam}
        detachingTeamId={detachingTeamId}
        isSavingEpic={isSavingEpic}
        deletingEpicId={deletingEpicId}
        teamsErrorMessage={teamsErrorMessage}
        usersErrorMessage={usersErrorMessage}
      />

      <Dialog open={isMembersDialogOpen} onOpenChange={setIsMembersDialogOpen}>
        <DialogContent
          className={projectDialogContentClass(
            "grid max-h-[calc(100svh-6.25rem)] w-[calc(100%-2rem)] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] rounded-[24px] sm:max-h-[calc(100vh-7.5rem)]"
          )}
        >
          <DialogHeader className={projectDialogHeaderClass()}>
            <DialogTitle>Project Members</DialogTitle>
            <DialogDescription>{project.name}</DialogDescription>
          </DialogHeader>

          <div className={projectDialogBodyClass("space-y-3")}>
            {canManageProject ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Select
                    options={memberUserOptions}
                    value={selectedProjectMemberOption}
                    styles={memberSelectStyles}
                    formatOptionLabel={formatUserOptionLabel}
                    placeholder="Search users to add"
                    noOptionsMessage={() => "No available users."}
                    isDisabled={isAddingProjectMember || Boolean(usersErrorMessage)}
                    onChange={(option) => setSelectedProjectMemberId(option?.value || "")}
                  />
                  <Button
                    className="h-10 rounded-xl"
                    disabled={
                      isAddingProjectMember ||
                      Boolean(usersErrorMessage) ||
                      !selectedProjectMemberId
                    }
                    type="button"
                    onClick={handleAddProjectMember}
                  >
                    {isAddingProjectMember ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    Add Member
                  </Button>
                </div>
                {memberError || usersErrorMessage ? (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {memberError || usersErrorMessage}
                  </div>
                ) : null}
              </div>
            ) : null}

            {projectMembers.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {projectMembers.map((member) => (
                  <div
                    key={resolveUserId(member)}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                        {getInitials(member.name || member.email || "Member")}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">
                          {member.name || member.email || "Unnamed member"}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {member.projectRole || member.role || "Project member"}
                          {member.membershipSource === "project" ? " - direct" : " - team"}
                        </span>
                      </span>
                    </span>
                    {canManageProject && directProjectMemberIds.has(resolveUserId(member)) ? (
                      <Button
                        aria-label="Remove member"
                        className="h-8 w-8 shrink-0 rounded-lg p-0"
                        disabled={removingProjectMemberUserId === resolveUserId(member)}
                        size="icon"
                        title="Remove member"
                        type="button"
                        variant="outline"
                        onClick={() => setMemberToRemove(member)}
                      >
                        {removingProjectMemberUserId === resolveUserId(member) ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                No members are assigned to this project yet.
              </div>
            )}
          </div>

          <DialogFooter className={projectDialogFooterClass()}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setIsMembersDialogOpen(false)}
            >
              Close
            </Button>
            {canManageProject ? (
              <Button
                type="button"
                onClick={() => {
                  setIsMembersDialogOpen(false);
                  setIsManageDialogOpen(true);
                }}
              >
                <Settings2 className="h-4 w-4" />
                Manage Members
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(memberToRemove)} onOpenChange={(nextOpen) => !nextOpen && setMemberToRemove(null)}>
        <DialogContent
          className={projectDialogContentClass(
            "grid max-h-[calc(100svh-6.25rem)] w-[calc(100%-2rem)] max-w-md grid-rows-[auto_auto] rounded-[24px] sm:max-h-[calc(100vh-7.5rem)]"
          )}
        >
          <DialogHeader className={projectDialogHeaderClass()}>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this member from the project?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className={projectDialogFooterClass()}>
            <Button type="button" variant="ghost" onClick={() => setMemberToRemove(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removingProjectMemberUserId === resolveUserId(memberToRemove)}
              onClick={handleConfirmRemoveProjectMember}
            >
              {removingProjectMemberUserId === resolveUserId(memberToRemove) ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isTeamsDialogOpen} onOpenChange={setIsTeamsDialogOpen}>
        <DialogContent
          className={projectDialogContentClass(
            "grid max-h-[calc(100svh-6.25rem)] w-[calc(100%-2rem)] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] rounded-[24px] sm:max-h-[calc(100vh-7.5rem)]"
          )}
        >
          <DialogHeader className={projectDialogHeaderClass()}>
            <DialogTitle>Attached Teams</DialogTitle>
            <DialogDescription>{project.name}</DialogDescription>
          </DialogHeader>

          <div className={projectDialogBodyClass("space-y-3")}>
            {attachedTeams.length ? (
              <div className="space-y-2">
                {attachedTeams.map((team) => (
                  <div
                    key={team._id || team.name}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
                        {getInitials(team.name || "Team")}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">
                          {team.name || "Untitled team"}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {team.memberCount || team.members?.length || 0} members
                        </span>
                      </span>
                    </div>
                    {team._id ? (
                      <Button
                        className="h-8 rounded-lg px-2.5 text-xs"
                        variant="outline"
                        type="button"
                        onClick={() => navigate(`/teams/${team._id}`)}
                      >
                        Open
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                No teams are attached to this project yet.
              </div>
            )}
          </div>

          <DialogFooter className={projectDialogFooterClass()}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setIsTeamsDialogOpen(false)}
            >
              Close
            </Button>
            <Button type="button" variant="outline" onClick={handleOpenTeams}>
              <Video className="h-4 w-4" />
              Teams Meeting
            </Button>
            {canManageProject ? (
              <Button
                type="button"
                disabled={Boolean(teamsErrorMessage) || !availableTeams.length}
                onClick={() => {
                  setIsTeamsDialogOpen(false);
                  handleTeamDialogChange(true);
                }}
              >
                <Link2 className="h-4 w-4" />
                Attach Team
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isTeamDialogOpen} onOpenChange={handleTeamDialogChange}>
        <DialogContent
          className={projectDialogContentClass(
            "grid max-h-[calc(100svh-4.5rem)] w-[calc(100%-2rem)] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] rounded-[26px] sm:max-h-[calc(100vh-6rem)]"
          )}
          onInteractOutside={(event) => {
            if (event.target?.closest?.(".attach-team-select__menu")) {
              event.preventDefault();
            }
          }}
        >
          <DialogHeader className={projectDialogHeaderClass()}>
            <DialogTitle>Attach Team</DialogTitle>
            <DialogDescription>
              Link a workspace team to{" "}
              <span className="font-semibold text-slate-950">{project.name}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className={projectDialogBodyClass("space-y-4")}>
            {teamsErrorMessage ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {teamsErrorMessage}
              </div>
            ) : !availableTeams.length ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                All workspace teams are already attached to this project.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <span className="text-sm font-medium text-gray-700">Select team</span>
                  <Select
                    classNamePrefix="attach-team-select"
                    options={availableTeamOptions}
                    value={selectedTeamOption}
                    styles={attachTeamSelectStyles}
                    formatOptionLabel={formatTeamOptionLabel}
                    placeholder="Select a workspace team"
                    noOptionsMessage={() => "No available teams to attach."}
                    menuPortalTarget={
                      typeof document !== "undefined" ? document.body : null
                    }
                    menuPosition="fixed"
                    menuShouldScrollIntoView={false}
                    onChange={(option) => setSelectedTeamId(option?.value || "")}
                  />
                </div>

                {selectedTeamOption ? (
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/85 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {selectedTeamOption.label}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          {selectedTeamOption.description ||
                            "No team description provided yet."}
                        </p>
                      </div>
                      <Badge className="border border-slate-200 bg-white text-slate-700 hover:bg-white">
                        {selectedTeamOption.memberCount} members
                      </Badge>
                    </div>
                  </div>
                ) : null}
              </>
            )}

            {teamError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {teamError}
              </div>
            ) : null}
          </div>

          <DialogFooter className={projectDialogFooterClass()}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => handleTeamDialogChange(false)}
            >
              Cancel
            </Button>
            <Button
              className="interactive-button"
              disabled={
                isAttachingTeam ||
                Boolean(teamsErrorMessage) ||
                !availableTeams.length ||
                !selectedTeamId
              }
              type="button"
              onClick={handleAttachTeam}
            >
              {isAttachingTeam ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              {isAttachingTeam ? "Attaching..." : "Attach Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
        <DialogContent
          className={projectDialogContentClass(
            "grid max-h-[calc(100svh-6.25rem)] w-[calc(100%-2rem)] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto] rounded-[26px] sm:max-h-[calc(100vh-7.5rem)]"
          )}
        >
          <DialogHeader className={projectDialogHeaderClass("space-y-4")}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 shadow-sm">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <DialogTitle>Delete Project</DialogTitle>
              <DialogDescription>
                This action will permanently delete the project and all associated
                data.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className={projectDialogBodyClass("space-y-4")}>
            <div className="rounded-[24px] border border-rose-200 bg-[linear-gradient(145deg,rgba(255,241,242,0.96),rgba(255,255,255,0.98))] p-4 text-sm text-rose-900 shadow-sm">
              <p className="font-semibold">This action cannot be undone.</p>
              <p className="mt-2 leading-6 text-rose-700">
                Type the project name exactly as shown to confirm the deletion.
              </p>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50/85 p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase text-slate-500">
                Project Name
              </p>
              <p className="mt-2 break-words text-lg font-semibold text-slate-950">
                {project.name}
              </p>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Confirmation
              </span>
              <Input
                autoComplete="off"
                className="rounded-[20px] border-slate-300"
                disabled={isDeletingProject}
                placeholder={`Type "${project.name}"`}
                value={deleteConfirmationValue}
                onChange={(event) => setDeleteConfirmationValue(event.target.value)}
              />
            </label>
          </div>

          <DialogFooter className={projectDialogFooterClass()}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => handleDeleteDialogChange(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!isDeleteConfirmationValid || isDeletingProject}
              type="button"
              onClick={handleDeleteProject}
            >
              {isDeletingProject ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {isDeletingProject ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProjectCard;

