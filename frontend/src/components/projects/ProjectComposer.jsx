import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Layers3,
  Palette,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ProjectDeliveryConfiguration, {
  createDeliveryConfiguration,
} from "@/components/projects/ProjectDeliveryConfiguration";

const MANAGER_ROLES = ["Admin", "Manager"];
const TEAM_LEAD_ROLES = ["Admin", "Manager", "Developer"];
const PROJECT_STATUSES = ["Active", "On Hold", "Completed"];
const PROJECT_PRIORITIES = ["Low", "Medium", "High", "Critical"];

const deriveProjectKey = (name = "") => {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return "";
  }

  const key =
    words.length === 1
      ? words[0].slice(0, 4)
      : words.map((word) => word[0]).join("");

  return key.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase();
};

const ProjectComposer = ({
  onSubmit,
  isPending,
  users = [],
  teams = [],
  usersErrorMessage = "",
  teamsErrorMessage = "",
  formId = "create-project-form",
}) => {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    manager: "",
    teamLead: "",
    status: "Active",
    priority: "Medium",
    themeColor: "#2563EB",
    startDate: "",
    targetDate: "",
  });
  const [deliveryConfig, setDeliveryConfig] = useState(() =>
    createDeliveryConfiguration()
  );
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [epicDraft, setEpicDraft] = useState({
    name: "",
    startDate: "",
    targetDate: "",
  });
  const [epics, setEpics] = useState([]);
  const [error, setError] = useState("");

  const generatedProjectKey = deriveProjectKey(formData.name);
  const inputClassName =
    "h-12 rounded-xl border-slate-200 bg-white text-sm shadow-sm shadow-slate-950/[0.02] transition hover:border-slate-300 focus-visible:border-blue-400 focus-visible:ring-4 focus-visible:ring-blue-500/12";
  const textAreaClassName =
    "min-h-[124px] rounded-xl border-slate-200 bg-white text-sm shadow-sm shadow-slate-950/[0.02] transition hover:border-slate-300 focus-visible:border-blue-400 focus-visible:ring-4 focus-visible:ring-blue-500/12";
  const selectClassName =
    "field-select h-12 rounded-xl border-slate-200 bg-white px-3 text-sm shadow-sm shadow-slate-950/[0.02] transition hover:border-slate-300 focus-visible:border-blue-400 focus-visible:ring-4 focus-visible:ring-blue-500/12";
  const labelClassName = "text-sm font-semibold text-slate-700";
  const hintClassName = "text-[12px] leading-5 text-slate-500";

  const managerOptions = useMemo(
    () =>
      [...users]
        .filter((user) => MANAGER_ROLES.includes(user.role))
        .sort((left, right) => (left.name || "").localeCompare(right.name || "")),
    [users]
  );

  const teamLeadOptions = useMemo(
    () =>
      [...users]
        .filter((user) => TEAM_LEAD_ROLES.includes(user.role))
        .sort((left, right) => (left.name || "").localeCompare(right.name || "")),
    [users]
  );

  const sortedTeams = useMemo(
    () => [...teams].sort((left, right) => (left.name || "").localeCompare(right.name || "")),
    [teams]
  );
  const selectedTeams = useMemo(
    () => sortedTeams.filter((team) => selectedTeamIds.includes(team._id)),
    [selectedTeamIds, sortedTeams]
  );
  const projectPeriodDays = useMemo(() => {
    if (!formData.startDate || !formData.targetDate) {
      return "";
    }

    const start = new Date(formData.startDate);
    const end = new Date(formData.targetDate);
    const diff = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;

    return Number.isFinite(diff) && diff > 0 ? `${diff} days` : "";
  }, [formData.startDate, formData.targetDate]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleTeamSelect = (event) => {
    const teamId = event.target.value;

    if (!teamId) {
      return;
    }

    setSelectedTeamIds((current) =>
      current.includes(teamId) ? current : [...current, teamId]
    );
    event.target.value = "";
  };

  const handleRemoveTeam = (teamId) => {
    setSelectedTeamIds((current) =>
      current.filter((selectedTeamId) => selectedTeamId !== teamId)
    );
  };

  const handleAddEpic = () => {
    const nextEpic = epicDraft.name.trim();

    if (!nextEpic) {
      return;
    }

    setEpics((current) => {
      const existing = new Set(current.map((epic) => epic.name.toLowerCase()));

      if (existing.has(nextEpic.toLowerCase())) {
        return current;
      }

      return [
        ...current,
        {
          name: nextEpic,
          startDate: epicDraft.startDate,
          targetDate: epicDraft.targetDate,
        },
      ];
    });
    setEpicDraft({ name: "", startDate: "", targetDate: "" });
  };

  const handleEpicKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddEpic();
    }
  };

  const handleRemoveEpic = (epicName) => {
    setEpics((current) => current.filter((epic) => epic.name !== epicName));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.name.trim()) {
      setError("A project name is required.");
      return;
    }
    if (!formData.description.trim()) {
      setError("A project description is required.");
      return;
    }
    if (!formData.manager) {
      setError("Select a project manager before creating the project.");
      return;
    }
    if (!formData.startDate) {
      setError("Start date is required.");
      return;
    }
    if (!deliveryConfig.repository.provider) {
      setError("Git provider is required.");
      return;
    }
    if (!deliveryConfig.repository.name.trim()) {
      setError("Repository name is required.");
      return;
    }
    if (!deliveryConfig.repository.url.trim()) {
      setError("Repository URL is required.");
      return;
    }
    if (!deliveryConfig.repository.defaultBranch.trim()) {
      setError("Default branch is required.");
      return;
    }
    if (!deliveryConfig.deliveryModules.some((module) => module.name.trim())) {
      setError("At least one project module is required.");
      return;
    }

    try {
      setError("");
      await onSubmit({
        name: formData.name.trim(),
        description: formData.description.trim(),
        epics,
        teamIds: selectedTeamIds,
        manager: formData.manager || null,
        teamLead: formData.teamLead || null,
        status: formData.status,
        priority: formData.priority,
        themeColor: formData.themeColor,
        startDate: formData.startDate || null,
        targetDate: formData.targetDate || null,
        repository: deliveryConfig.repository,
        deliveryWorkflow: deliveryConfig.deliveryWorkflow,
        deliveryModules: deliveryConfig.deliveryModules,
        defaultTestSuites: deliveryConfig.defaultTestSuites,
        testCases: deliveryConfig.testCases,
      });
      setFormData({
        name: "",
        description: "",
        manager: "",
        teamLead: "",
        status: "Active",
        priority: "Medium",
        themeColor: "#2563EB",
        startDate: "",
        targetDate: "",
      });
      setSelectedTeamIds([]);
      setDeliveryConfig(createDeliveryConfiguration());
      setEpicDraft({ name: "", startDate: "", targetDate: "" });
      setEpics([]);
    } catch (submitError) {
      setError(
        submitError.response?.data?.message || "Unable to create the project."
      );
    }
  };

  return (
    <form className="space-y-5" id={formId} onSubmit={handleSubmit}>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Project Identity</h3>
                <p className={hintClassName}>Name, key, and purpose.</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(220px,0.8fr)]">
              <div className="space-y-1.5">
          <label className={labelClassName} htmlFor="name">
            Project Name <span className="text-rose-500">*</span>
          </label>
          <Input
            id="name"
            name="name"
            className={inputClassName}
            placeholder="Enter project name"
            value={formData.name}
            onChange={handleChange}
            autoFocus
          />
              </div>

              <div className="space-y-1.5">
          <label className={labelClassName} htmlFor="projectKeyPreview">
            Project Key
          </label>
          <Input
            id="projectKeyPreview"
            className={`${inputClassName} bg-slate-50 text-slate-500`}
            value={generatedProjectKey}
            placeholder="Auto-generated from name"
            readOnly
          />
          <p className={hintClassName}>
            Short unique prefix is generated automatically.
          </p>
              </div>
            </div>
        </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <label className={labelClassName} htmlFor="description">
            Description
          </label>
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
            Optional
          </span>
        </div>
        <Textarea
          id="description"
          name="description"
          className={textAreaClassName}
          placeholder="Summarize the scope, goals, or context for this project."
          value={formData.description}
          onChange={handleChange}
        />
        <p className={hintClassName}>
          Give the team enough context to understand what this project is for.
        </p>
      </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Ownership</h3>
                <p className={hintClassName}>Assign leads now or keep them open.</p>
              </div>
            </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor="manager">
            Manager
          </label>
          <select
            id="manager"
            name="manager"
            className={selectClassName}
            value={formData.manager}
            onChange={handleChange}
            disabled={!managerOptions.length}
          >
            <option value="">Unassigned</option>
            {managerOptions.map((user) => (
              <option key={user._id} value={user._id}>
                {user.name} ({user.role})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor="teamLead">
            Team Lead
          </label>
          <select
            id="teamLead"
            name="teamLead"
            className={selectClassName}
            value={formData.teamLead}
            onChange={handleChange}
            disabled={!teamLeadOptions.length}
          >
            <option value="">Unassigned</option>
            {teamLeadOptions.map((user) => (
              <option key={user._id} value={user._id}>
                {user.name} ({user.role})
              </option>
            ))}
          </select>
        </div>
      </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <Palette className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Planning Defaults</h3>
                <p className={hintClassName}>Priority, lifecycle state, and theme.</p>
              </div>
            </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor="priority">
            Priority
          </label>
          <select
            id="priority"
            name="priority"
            className={selectClassName}
            value={formData.priority}
            onChange={handleChange}
          >
            {PROJECT_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor="status">
            Status
          </label>
          <select
            id="status"
            name="status"
            className={selectClassName}
            value={formData.status}
            onChange={handleChange}
          >
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor="themeColor">
            Theme
          </label>
          <Input
            id="themeColor"
            name="themeColor"
            type="color"
            className={`${inputClassName} p-1.5`}
            value={formData.themeColor}
            onChange={handleChange}
          />
        </div>
      </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                <Users2 className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Attach Teams</h3>
                <p className={hintClassName}>Connect workspace teams at creation.</p>
              </div>
            </div>

            {teamsErrorMessage ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                {teamsErrorMessage}
              </div>
            ) : sortedTeams.length ? (
              <div className="space-y-3">
                <select
                  className={selectClassName}
                  defaultValue=""
                  onChange={handleTeamSelect}
                  disabled={selectedTeamIds.length === sortedTeams.length}
                >
                  <option value="">
                    {selectedTeamIds.length === sortedTeams.length
                      ? "All teams selected"
                      : "Select team to attach"}
                  </option>
                  {sortedTeams
                    .filter((team) => !selectedTeamIds.includes(team._id))
                    .map((team) => (
                      <option key={team._id} value={team._id}>
                        {team.name} - {team.memberCount || team.members?.length || 0} members
                      </option>
                    ))}
                </select>

                <div className="space-y-2">
                  {selectedTeams.length ? (
                    selectedTeams.map((team) => (
                      <div
                        key={team._id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-blue-950">
                            {team.name}
                          </span>
                          <span className="block text-xs text-blue-700/80">
                            {team.memberCount || team.members?.length || 0} members
                          </span>
                        </span>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-blue-500 transition hover:bg-white hover:text-rose-600"
                          onClick={() => handleRemoveTeam(team._id)}
                          title="Remove team"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                      No teams selected.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                No workspace teams available yet.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                <Layers3 className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Create Epics</h3>
                <p className={hintClassName}>Add the first planning workstreams.</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                className={inputClassName}
                value={epicDraft.name}
                onChange={(event) =>
                  setEpicDraft((current) => ({ ...current, name: event.target.value }))
                }
                onKeyDown={handleEpicKeyDown}
                placeholder="Epic name"
              />
              <Button
                type="button"
                variant="outline"
                className="h-12 w-12 shrink-0 rounded-xl px-0"
                onClick={handleAddEpic}
                disabled={!epicDraft.name.trim()}
                title="Add epic"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Input
                className={inputClassName}
                type="date"
                value={epicDraft.startDate}
                onChange={(event) =>
                  setEpicDraft((current) => ({
                    ...current,
                    startDate: event.target.value,
                  }))
                }
              />
              <Input
                className={inputClassName}
                type="date"
                value={epicDraft.targetDate}
                onChange={(event) =>
                  setEpicDraft((current) => ({
                    ...current,
                    targetDate: event.target.value,
                  }))
                }
              />
            </div>

            <div className="mt-3 space-y-2">
              {epics.length ? (
                epics.map((epic) => (
                  <div
                    key={epic.name}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-700">
                        {epic.name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {epic.targetDate
                          ? `Deadline ${epic.targetDate}`
                          : "No deadline set"}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => handleRemoveEpic(epic.name)}
                      title="Remove epic"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                  No epics added.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <Palette className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Project Timeline</h3>
                <p className={hintClassName}>Set period and final deadline.</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={labelClassName} htmlFor="projectStartDate">
                  Start date
                </label>
                <Input
                  id="projectStartDate"
                  name="startDate"
                  type="date"
                  className={inputClassName}
                  value={formData.startDate}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClassName} htmlFor="projectTargetDate">
                  Deadline
                </label>
                <Input
                  id="projectTargetDate"
                  name="targetDate"
                  type="date"
                  className={inputClassName}
                  value={formData.targetDate}
                  onChange={handleChange}
                />
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
              Period: {projectPeriodDays || "Select start and deadline"}
            </div>
          </div>

        </aside>
      </div>

      <ProjectDeliveryConfiguration
        value={deliveryConfig}
        onChange={setDeliveryConfig}
        mode="create"
      />

      {usersErrorMessage ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {usersErrorMessage} You can still create the project without assigning
            a manager or team lead.
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

    </form>
  );
};

export default ProjectComposer;
