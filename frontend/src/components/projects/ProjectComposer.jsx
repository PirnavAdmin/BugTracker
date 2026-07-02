import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
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
  usersErrorMessage = "",
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
  const [error, setError] = useState("");

  const generatedProjectKey = deriveProjectKey(formData.name);
  const inputClassName =
    "h-11 rounded-xl border-slate-200 bg-white text-sm shadow-sm shadow-slate-950/[0.02] transition hover:border-slate-300 focus-visible:border-blue-400 focus-visible:ring-4 focus-visible:ring-blue-500/12";
  const textAreaClassName =
    "min-h-[96px] rounded-xl border-slate-200 bg-white text-sm shadow-sm shadow-slate-950/[0.02] transition hover:border-slate-300 focus-visible:border-blue-400 focus-visible:ring-4 focus-visible:ring-blue-500/12";
  const selectClassName =
    "field-select h-11 rounded-xl border-slate-200 bg-white px-3 text-sm shadow-sm shadow-slate-950/[0.02] transition hover:border-slate-300 focus-visible:border-blue-400 focus-visible:ring-4 focus-visible:ring-blue-500/12";
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

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
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
        epics: [],
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
    } catch (submitError) {
      setError(
        submitError.response?.data?.message || "Unable to create the project."
      );
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
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

      <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t border-slate-200/80 bg-white/94 px-4 py-3 backdrop-blur sm:-mx-5 sm:flex-row sm:items-center sm:justify-end sm:px-5">
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
    </form>
  );
};

export default ProjectComposer;
