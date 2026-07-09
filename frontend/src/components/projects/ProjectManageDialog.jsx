import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Link2,
  LoaderCircle,
  PencilLine,
  Plus,
  Trash2,
  Unlink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getInitials } from "@/lib/utils";
import { getProjectTeams } from "@/lib/project-teams";
import {
  projectDialogBodyClass,
  projectDialogContentClass,
  projectDialogFooterClass,
  projectDialogHeaderClass,
} from "@/components/projects/projectDialogStyles";

const MANAGER_ROLES = ["Admin", "Manager"];
const TEAM_LEAD_ROLES = ["Admin", "Manager", "Developer"];
const QA_LEAD_ROLES = ["Admin", "Manager", "Tester"];
const PROJECT_STATUSES = ["Active", "On Hold", "Completed"];
const PROJECT_PRIORITIES = ["Low", "Medium", "High", "Critical"];

const resolveId = (value) => String(value?._id || value || "");

const getProjectStatus = (project) =>
  project?.status || (project?.isCompleted ? "Completed" : "Active");

const sortUsers = (users = []) =>
  [...users].sort((left, right) => (left.name || "").localeCompare(right.name || ""));

const UserOptionList = ({ users = [] }) =>
  users.map((user) => (
    <option key={user._id} value={user._id}>
      {user.name || user.email} ({user.role})
    </option>
  ));

const FieldLabel = ({ children }) => (
  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
    {children}
  </span>
);

const ProjectManageDialog = ({
  open,
  onOpenChange,
  project,
  users = [],
  workspaceTeams = [],
  epics = [],
  canManageProject = false,
  onUpdateProject,
  onAttachTeam,
  onDetachTeam,
  onCreateEpic,
  onUpdateEpic,
  onDeleteEpic,
  onEpicClick,
  isUpdatingProject = false,
  isAttachingTeam = false,
  detachingTeamId = "",
  isSavingEpic = false,
  deletingEpicId = "",
  teamsErrorMessage = "",
  usersErrorMessage = "",
}) => {
  const [details, setDetails] = useState({
    name: "",
    description: "",
    status: "Active",
    priority: "Medium",
    themeColor: "#2563EB",
    projectManager: "",
    teamLead: "",
    qaLead: "",
  });
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [teamToDetach, setTeamToDetach] = useState(null);
  const [teamError, setTeamError] = useState("");
  const [detailsError, setDetailsError] = useState("");
  const [epicError, setEpicError] = useState("");
  const [epicDraft, setEpicDraft] = useState({
    name: "",
    description: "",
    color: "#3B82F6",
  });
  const [editingEpicId, setEditingEpicId] = useState("");
  const [epicToDelete, setEpicToDelete] = useState(null);

  const attachedTeams = useMemo(() => getProjectTeams(project), [project]);
  const attachedTeamIds = useMemo(
    () => new Set(attachedTeams.map((team) => String(team?._id || team))),
    [attachedTeams]
  );
  const availableTeams = useMemo(
    () =>
      [...workspaceTeams]
        .filter((team) => !attachedTeamIds.has(String(team._id)))
        .sort((left, right) => (left.name || "").localeCompare(right.name || "")),
    [attachedTeamIds, workspaceTeams]
  );
  const managerOptions = useMemo(
    () => sortUsers(users.filter((user) => MANAGER_ROLES.includes(user.role))),
    [users]
  );
  const teamLeadOptions = useMemo(
    () => sortUsers(users.filter((user) => TEAM_LEAD_ROLES.includes(user.role))),
    [users]
  );
  const qaLeadOptions = useMemo(
    () => sortUsers(users.filter((user) => QA_LEAD_ROLES.includes(user.role))),
    [users]
  );

  useEffect(() => {
    if (!open || !project) {
      return;
    }

    setDetails({
      name: project.name || "",
      description: project.description || "",
      status: getProjectStatus(project),
      priority: project.priority || "Medium",
      themeColor: project.themeColor || "#2563EB",
      projectManager: resolveId(project.projectManager || project.manager),
      teamLead: resolveId(project.teamLead),
      qaLead: resolveId(project.qaLead),
    });
    setSelectedTeamId("");
    setTeamToDetach(null);
    setDetailsError("");
    setTeamError("");
    setEpicError("");
    setEditingEpicId("");
    setEpicDraft({
      name: "",
      description: "",
      color: "#3B82F6",
    });
    setEpicToDelete(null);
  }, [open, project]);

  useEffect(() => {
    if (!availableTeams.length) {
      setSelectedTeamId("");
      return;
    }

    if (!selectedTeamId || !availableTeams.some((team) => team._id === selectedTeamId)) {
      setSelectedTeamId(availableTeams[0]._id);
    }
  }, [availableTeams, selectedTeamId]);

  const handleDetailsChange = (field, value) => {
    setDetails((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSaveDetails = async () => {
    if (!details.name.trim()) {
      setDetailsError("Project name is required.");
      return;
    }

    try {
      setDetailsError("");
      await onUpdateProject?.({
        projectId: project._id,
        payload: {
          name: details.name.trim(),
          description: details.description.trim(),
          status: details.status,
          priority: details.priority,
          themeColor: details.themeColor,
          projectManager: details.projectManager || null,
          teamLead: details.teamLead || null,
          qaLead: details.qaLead || null,
        },
      });
    } catch (error) {
      setDetailsError(error.response?.data?.message || "Unable to update project.");
    }
  };

  const handleAttachTeam = async () => {
    if (!selectedTeamId) {
      setTeamError("Select a team to attach.");
      return;
    }

    try {
      setTeamError("");
      await onAttachTeam?.({
        projectId: project._id,
        teamId: selectedTeamId,
      });
      setSelectedTeamId("");
    } catch (error) {
      setTeamError(error.response?.data?.message || "Unable to attach team.");
    }
  };

  const handleConfirmDetach = async () => {
    if (!teamToDetach) {
      return;
    }

    try {
      setTeamError("");
      await onDetachTeam?.({
        projectId: project._id,
        teamId: teamToDetach._id,
      });
      setTeamToDetach(null);
    } catch (error) {
      setTeamError(error.response?.data?.message || "Unable to detach team.");
      setTeamToDetach(null);
    }
  };

  const resetEpicDraft = () => {
    setEditingEpicId("");
    setEpicDraft({
      name: "",
      description: "",
      color: "#3B82F6",
    });
  };

  const handleEditEpic = (epic) => {
    setEditingEpicId(epic._id);
    setEpicDraft({
      name: epic.name || "",
      description: epic.description || "",
      color: epic.color || "#3B82F6",
    });
    setEpicError("");
  };

  const handleSaveEpic = async () => {
    if (!epicDraft.name.trim()) {
      setEpicError("Epic name is required.");
      return;
    }

    try {
      setEpicError("");

      if (editingEpicId) {
        await onUpdateEpic?.({
          id: editingEpicId,
          payload: {
            name: epicDraft.name.trim(),
            description: epicDraft.description.trim(),
            color: epicDraft.color,
          },
        });
      } else {
        await onCreateEpic?.({
          projectId: project._id,
          name: epicDraft.name.trim(),
          description: epicDraft.description.trim(),
          color: epicDraft.color,
        });
      }

      resetEpicDraft();
    } catch (error) {
      setEpicError(error.response?.data?.message || "Unable to save epic.");
    }
  };

  const handleDeleteEpic = async () => {
    if (!epicToDelete) {
      return;
    }

    try {
      setEpicError("");
      await onDeleteEpic?.({
        id: epicToDelete._id,
        payload: {
          clearIssues: true,
        },
      });
      setEpicToDelete(null);
      if (editingEpicId === epicToDelete._id) {
        resetEpicDraft();
      }
    } catch (error) {
      setEpicError(error.response?.data?.message || "Unable to delete epic.");
      setEpicToDelete(null);
    }
  };

  if (!project) {
    return null;
  }

  const inputClassName =
    "h-10 rounded-xl border-slate-200 bg-white text-sm shadow-none focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-500/20";
  const selectClassName =
    "field-select h-10 rounded-xl border-slate-200 bg-white px-3 text-sm shadow-none focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-500/20";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={projectDialogContentClass(
            "grid h-[100svh] w-[calc(100vw-2rem)] max-w-[1500px] grid-rows-[auto_minmax(0,1fr)] rounded-t-none rounded-b-[24px] !top-0 max-sm:h-[100svh] max-sm:w-[calc(100vw-1rem)]"
          )}
        >
          <DialogHeader className={projectDialogHeaderClass("pr-16")}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <DialogTitle>Manage Project</DialogTitle>
                <DialogDescription>{project.name}</DialogDescription>
              </div>
              <Button
                type="button"
                className="h-10 rounded-xl sm:mr-1"
                disabled={!canManageProject || isUpdatingProject}
                onClick={handleSaveDetails}
              >
                {isUpdatingProject ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Save Changes
              </Button>
            </div>
          </DialogHeader>

          <div className={projectDialogBodyClass("space-y-4 py-4")}>
            {!canManageProject ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Project structure is read-only for this role.
              </div>
            ) : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">Details</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Name, status, priority, and ownership.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_140px]">
                <label className="space-y-1.5">
                  <FieldLabel>Name</FieldLabel>
                  <Input
                    className={inputClassName}
                    value={details.name}
                    disabled={!canManageProject || isUpdatingProject}
                    onChange={(event) => handleDetailsChange("name", event.target.value)}
                  />
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>Status</FieldLabel>
                  <select
                    className={selectClassName}
                    value={details.status}
                    disabled={!canManageProject || isUpdatingProject}
                    onChange={(event) => handleDetailsChange("status", event.target.value)}
                  >
                    {PROJECT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>Priority</FieldLabel>
                  <select
                    className={selectClassName}
                    value={details.priority}
                    disabled={!canManageProject || isUpdatingProject}
                    onChange={(event) => handleDetailsChange("priority", event.target.value)}
                  >
                    {PROJECT_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>Theme</FieldLabel>
                  <Input
                    type="color"
                    className="h-10 rounded-xl border-slate-200 bg-white p-1"
                    value={details.themeColor}
                    disabled={!canManageProject || isUpdatingProject}
                    onChange={(event) => handleDetailsChange("themeColor", event.target.value)}
                  />
                </label>
              </div>

              <label className="mt-3 block space-y-1.5">
                <FieldLabel>Description</FieldLabel>
                <Textarea
                  className="min-h-[92px] rounded-xl border-slate-200 bg-white text-sm shadow-none focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-500/20"
                  value={details.description}
                  disabled={!canManageProject || isUpdatingProject}
                  onChange={(event) =>
                    handleDetailsChange("description", event.target.value)
                  }
                />
              </label>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="space-y-1.5">
                  <FieldLabel>Project Manager</FieldLabel>
                  <select
                    className={selectClassName}
                    value={details.projectManager}
                    disabled={!canManageProject || isUpdatingProject || !managerOptions.length}
                    onChange={(event) =>
                      handleDetailsChange("projectManager", event.target.value)
                    }
                  >
                    <option value="">Unassigned</option>
                    <UserOptionList users={managerOptions} />
                  </select>
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>Team Lead</FieldLabel>
                  <select
                    className={selectClassName}
                    value={details.teamLead}
                    disabled={!canManageProject || isUpdatingProject || !teamLeadOptions.length}
                    onChange={(event) => handleDetailsChange("teamLead", event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    <UserOptionList users={teamLeadOptions} />
                  </select>
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>QA Lead</FieldLabel>
                  <select
                    className={selectClassName}
                    value={details.qaLead}
                    disabled={!canManageProject || isUpdatingProject || !qaLeadOptions.length}
                    onChange={(event) => handleDetailsChange("qaLead", event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    <UserOptionList users={qaLeadOptions} />
                  </select>
                </label>
              </div>

              {detailsError ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {detailsError}
                </div>
              ) : null}
              {usersErrorMessage ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  {usersErrorMessage}
                </div>
              ) : null}
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.45fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">Teams</h3>
                    <p className="mt-1 text-xs text-slate-500">{attachedTeams.length} attached</p>
                  </div>
                  <Badge className="border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50">
                    {attachedTeams.length}
                  </Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {attachedTeams.length ? (
                    attachedTeams.map((team) => (
                      <span
                        key={team._id}
                        className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200">
                          {getInitials(team.name)}
                        </span>
                        <span className="max-w-[12rem] truncate">{team.name}</span>
                        {canManageProject ? (
                          <button
                            type="button"
                            className="rounded-full p-1 text-slate-400 transition hover:bg-white hover:text-rose-600"
                            disabled={detachingTeamId === team._id}
                            title="Detach team"
                            onClick={() => setTeamToDetach(team)}
                          >
                            {detachingTeamId === team._id ? (
                              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Unlink className="h-3.5 w-3.5" />
                            )}
                          </button>
                        ) : null}
                      </span>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      No teams attached.
                    </div>
                  )}
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <select
                    className={selectClassName}
                    value={selectedTeamId}
                    disabled={
                      !canManageProject ||
                      isAttachingTeam ||
                      Boolean(teamsErrorMessage) ||
                      !availableTeams.length
                    }
                    onChange={(event) => setSelectedTeamId(event.target.value)}
                  >
                    {availableTeams.length ? (
                      availableTeams.map((team) => (
                        <option key={team._id} value={team._id}>
                          {team.name}
                        </option>
                      ))
                    ) : (
                      <option value="">No available teams</option>
                    )}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl"
                    disabled={
                      !canManageProject ||
                      isAttachingTeam ||
                      Boolean(teamsErrorMessage) ||
                      !selectedTeamId
                    }
                    onClick={handleAttachTeam}
                  >
                    {isAttachingTeam ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                    Attach
                  </Button>
                </div>

                {teamError || teamsErrorMessage ? (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {teamError || teamsErrorMessage}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">Epics</h3>
                    <p className="mt-1 text-xs text-slate-500">{epics.length} streams</p>
                  </div>
                  <Badge className="border border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-50">
                    {epics.length}
                  </Badge>
                </div>

                <div className="mt-4 space-y-2">
                  {epics.length ? (
                    epics.map((epic) => (
                      <div
                        key={epic._id || epic.name}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() => onEpicClick?.(epic)}
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: epic.color || "#3B82F6" }}
                          />
                          <span className="truncate text-sm font-medium text-slate-800">
                            {epic.name}
                          </span>
                        </button>
                        {canManageProject ? (
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white hover:text-blue-600"
                              title="Edit epic"
                              onClick={() => handleEditEpic(epic)}
                            >
                              <PencilLine className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white hover:text-rose-600"
                              title="Delete epic"
                              disabled={deletingEpicId === epic._id}
                              onClick={() => setEpicToDelete(epic)}
                            >
                              {deletingEpicId === epic._id ? (
                                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </span>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      No epics yet.
                    </div>
                  )}
                </div>

                {canManageProject ? (
                  <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_48px]">
                      <Input
                        className={inputClassName}
                        placeholder="Epic name"
                        value={epicDraft.name}
                        disabled={isSavingEpic}
                        onChange={(event) =>
                          setEpicDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                      <Input
                        type="color"
                        className="h-10 rounded-xl border-slate-200 bg-white p-1"
                        value={epicDraft.color}
                        disabled={isSavingEpic}
                        onChange={(event) =>
                          setEpicDraft((current) => ({
                            ...current,
                            color: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <Textarea
                      className="min-h-[72px] rounded-xl border-slate-200 bg-white text-sm shadow-none"
                      placeholder="Epic description"
                      value={epicDraft.description}
                      disabled={isSavingEpic}
                      onChange={(event) =>
                        setEpicDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      {editingEpicId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9 rounded-xl"
                          disabled={isSavingEpic}
                          onClick={resetEpicDraft}
                        >
                          Cancel
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        className="h-9 rounded-xl"
                        disabled={isSavingEpic || !epicDraft.name.trim()}
                        onClick={handleSaveEpic}
                      >
                        {isSavingEpic ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : editingEpicId ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        {editingEpicId ? "Update Epic" : "Add Epic"}
                      </Button>
                    </div>
                    {epicError ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {epicError}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(teamToDetach)} onOpenChange={(nextOpen) => !nextOpen && setTeamToDetach(null)}>
        <DialogContent
          className={projectDialogContentClass(
            "grid max-h-[calc(100svh-6.25rem)] w-[calc(100%-2rem)] max-w-md grid-rows-[auto_auto] rounded-[24px] sm:max-h-[calc(100vh-7.5rem)]"
          )}
        >
          <DialogHeader className={projectDialogHeaderClass()}>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <DialogTitle>Detach Team</DialogTitle>
            <DialogDescription>
              Detach {teamToDetach?.name} from {project.name}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className={projectDialogFooterClass()}>
            <Button type="button" variant="ghost" onClick={() => setTeamToDetach(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={detachingTeamId === teamToDetach?._id}
              onClick={handleConfirmDetach}
            >
              {detachingTeamId === teamToDetach?._id ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="h-4 w-4" />
              )}
              Detach
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(epicToDelete)} onOpenChange={(nextOpen) => !nextOpen && setEpicToDelete(null)}>
        <DialogContent
          className={projectDialogContentClass(
            "grid max-h-[calc(100svh-6.25rem)] w-[calc(100%-2rem)] max-w-md grid-rows-[auto_auto] rounded-[24px] sm:max-h-[calc(100vh-7.5rem)]"
          )}
        >
          <DialogHeader className={projectDialogHeaderClass()}>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <DialogTitle>Delete Epic</DialogTitle>
            <DialogDescription>
              Delete {epicToDelete?.name}? Linked work items will move to no epic.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className={projectDialogFooterClass()}>
            <Button type="button" variant="ghost" onClick={() => setEpicToDelete(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingEpicId === epicToDelete?._id}
              onClick={handleDeleteEpic}
            >
              {deletingEpicId === epicToDelete?._id ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProjectManageDialog;
