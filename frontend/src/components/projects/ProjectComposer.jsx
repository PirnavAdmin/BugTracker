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
  onCancel,
  users = [],
  teams = [],
  usersErrorMessage = "",
  teamsErrorMessage = "",
}) => {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    manager: "",
    teamLead: "",
    status: "Active",
    priority: "Medium",
    themeColor: "#2563EB",
  });
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [epicDraft, setEpicDraft] = useState("");
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

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleTeamToggle = (teamId) => {
    setSelectedTeamIds((current) =>
      current.includes(teamId)
        ? current.filter((selectedTeamId) => selectedTeamId !== teamId)
        : [...current, teamId]
    );
  };

  const handleAddEpic = () => {
    const nextEpic = epicDraft.trim();

    if (!nextEpic) {
      return;
    }

    setEpics((current) => {
      const existing = new Set(current.map((epic) => epic.toLowerCase()));

      if (existing.has(nextEpic.toLowerCase())) {
        return current;
      }

      return [...current, nextEpic];
    });
    setEpicDraft("");
  };

  const handleEpicKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddEpic();
    }
  };

  const handleRemoveEpic = (epicName) => {
    setEpics((current) => current.filter((epic) => epic !== epicName));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.name.trim()) {
      setError("A project name is required.");
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
      });
      setFormData({
        name: "",
        description: "",
        manager: "",
        teamLead: "",
        status: "Active",
        priority: "Medium",
        themeColor: "#2563EB",
      });
      setSelectedTeamIds([]);
      setEpicDraft("");
      setEpics([]);
    } catch (submitError) {
      setError(
        submitError.response?.data?.message || "Unable to create the project."
      );
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
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
              <div className="max-h-[210px] space-y-2 overflow-y-auto pr-1">
                {sortedTeams.map((team) => {
                  const isSelected = selectedTeamIds.includes(team._id);

                  return (
                    <button
                      key={team._id}
                      type="button"
                      onClick={() => handleTeamToggle(team._id)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                        isSelected
                          ? "border-blue-300 bg-blue-50 text-blue-950 shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold ${
                          isSelected ? "bg-white text-blue-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {(team.name || "Team")
                          .split(/\s+/)
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {team.name}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {team.memberCount || team.members?.length || 0} members
                        </span>
                      </span>
                      <span
                        className={`h-4 w-4 rounded-full border ${
                          isSelected ? "border-blue-600 bg-blue-600" : "border-slate-300"
                        }`}
                      />
                    </button>
                  );
                })}
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
                value={epicDraft}
                onChange={(event) => setEpicDraft(event.target.value)}
                onKeyDown={handleEpicKeyDown}
                placeholder="Epic name"
              />
              <Button
                type="button"
                variant="outline"
                className="h-12 w-12 shrink-0 rounded-xl px-0"
                onClick={handleAddEpic}
                disabled={!epicDraft.trim()}
                title="Add epic"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-3 space-y-2">
              {epics.length ? (
                epics.map((epic) => (
                  <div
                    key={epic}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <span className="truncate text-sm font-medium text-slate-700">
                      {epic}
                    </span>
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => handleRemoveEpic(epic)}
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

          <div className="flex flex-col-reverse gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-end">
            {onCancel ? (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isPending}
                className="h-11 min-w-[104px] rounded-xl px-5"
              >
                Cancel
              </Button>
            ) : null}
            <Button
              className="h-11 min-w-[164px] rounded-xl border border-blue-500/20 bg-[linear-gradient(90deg,#2563EB_0%,#4F46E5_100%)] px-5 text-white shadow-[0_16px_30px_-20px_rgba(37,99,235,0.82)] transition hover:-translate-y-0.5 hover:brightness-105"
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Creating project..." : "Create Project"}
            </Button>
          </div>
        </aside>
      </div>

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
