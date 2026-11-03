import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  GitBranch,
  GitCommit,
  Layers3,
  Package,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import {
  getLatestGitActivity,
  getProjectDeliveryMetrics,
  getRepositorySummary,
  normalizeDeliveryModules,
} from "@/lib/delivery-workflow";
import AiCodeReviewPanel from "@/components/ai/AiCodeReviewPanel";
import { cn, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const metricTone = {
  blue: "bg-blue-50 text-blue-700",
  emerald: "bg-emerald-50 text-emerald-700",
  rose: "bg-rose-50 text-rose-700",
  amber: "bg-amber-50 text-amber-700",
  slate: "bg-slate-100 text-slate-700",
};
const WORK_QUEUE_CHART_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#e11d48", "#4f46e5", "#64748b"];

const MetricPill = ({ label, value, tone = "blue" }) => (
  <div className={cn("rounded-xl px-3 py-2", metricTone[tone] || metricTone.blue)}>
    <p className="text-[10px] font-bold uppercase tracking-[0.1em]">{label}</p>
    <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
  </div>
);

const getProjectId = (project = {}) => String(project.id || project._id || project.raw?._id || "");
const getProjectRecord = (project = {}) => project.raw || project;
const getCommitShortSha = (sha = "") => String(sha || "").slice(0, 7);
const formatActivityTime = (value) => (value ? formatDateTime(value) : "-");
const formatActivityClock = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};
const getActivityGroupLabel = (value) => {
  if (!value) {
    return "Older";
  }

  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return "Older";
};
const hasRecordedPush = (activity = {}) =>
  Boolean(
    activity.commitSha ||
    (activity.commitMessage && activity.commitMessage !== "No pushes recorded yet") ||
    getFilesChangedCount(activity) > 0
  );
const getActivityModules = (project = {}) => {
  const record = getProjectRecord(project);
  const activity = getLatestGitActivity(record);
  const modules = activity.modulesChanged.length
    ? activity.modulesChanged
    : normalizeDeliveryModules(record);

  return modules.filter(Boolean);
};
const getFilesChangedCount = (activity = {}) =>
  activity.filesChanged.length || Number(activity.filesChangedCount || activity.changedFiles || 0);
const getChangeTotals = (activity = {}, filesChanged = 0) => {
  const hasAdditions = activity.additions !== null && activity.additions !== undefined;
  const hasDeletions = activity.deletions !== null && activity.deletions !== undefined;

  return {
    additions: hasAdditions ? activity.additions : filesChanged,
    deletions: hasDeletions ? activity.deletions : 0,
  };
};
const formatRepositoryName = (repository = {}) => {
  if (repository.owner && repository.name) {
    return `${repository.owner}/${repository.name}`;
  }

  if (repository.name) {
    return repository.name;
  }

  if (repository.url) {
    return repository.url.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/i, "").split("/").slice(0, 2).join("/");
  }

  return repository.provider || "Repository";
};
const getActivityStatusTone = (status = "") => {
  const normalized = String(status).toLowerCase();

  if (normalized.includes("pass") || normalized.includes("complete") || normalized.includes("verified")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (normalized.includes("progress") || normalized.includes("test")) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (normalized.includes("waiting") || normalized.includes("ready")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (normalized.includes("request") || normalized.includes("fail") || normalized.includes("reject") || normalized.includes("retest")) {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  return "border-blue-200 bg-blue-50 text-blue-700";
};
const getActivityStatusLabel = (status = "") => {
  const normalized = String(status).toLowerCase();

  if (normalized.includes("waiting") || normalized.includes("ready")) {
    return "Ready for Testing";
  }

  if (normalized.includes("progress") || normalized.includes("test")) {
    return "Testing in Progress";
  }

  if (normalized.includes("pass") || normalized.includes("complete") || normalized.includes("verified")) {
    return "QA Passed";
  }

  if (normalized.includes("fail") || normalized.includes("reject")) {
    return "QA Failed";
  }

  if (normalized.includes("request") || normalized.includes("retest")) {
    return "Retest Required";
  }

  return status || "Ready for Testing";
};
const getPersonInitials = (name = "QA") =>
  String(name || "QA")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "QA";

const ActivityAvatar = ({ name, compact = false }) => (
  <div className={cn("relative shrink-0", compact ? "h-9 w-9" : "h-11 w-11")}>
    <div className={cn("grid place-items-center rounded-full border border-slate-200 bg-slate-100 text-sm font-bold text-slate-700", compact ? "h-9 w-9" : "h-11 w-11")}>
      {getPersonInitials(name)}
    </div>
    <span className="absolute -bottom-0.5 -right-1 grid h-4 w-4 place-items-center rounded-full border-2 border-white bg-slate-950 text-white">
      <GitCommit className="h-2.5 w-2.5" />
    </span>
  </div>
);

export const QAGitActivityPanel = ({
  onSelectProject,
  onStartTesting,
  projects = [],
  selectedProject,
}) => {
  const activityRows = projects
    .map((project) => {
      const record = getProjectRecord(project);
      const activity = getLatestGitActivity(record);
      const repository = getRepositorySummary(record);
      const modules = getActivityModules(project);

      return {
        id: getProjectId(project),
        project,
        record,
        activity,
        repository,
        modules,
        filesChanged: getFilesChangedCount(activity),
      };
    })
    .sort((left, right) =>
      new Date(right.activity.pushedAt || 0).getTime() -
      new Date(left.activity.pushedAt || 0).getTime()
    );
  const visibleActivityRows = activityRows.filter((row) => hasRecordedPush(row.activity));
  const selectedId = getProjectId(selectedProject || visibleActivityRows[0]?.project || {});
  const selectedRow =
    visibleActivityRows.find((row) => row.id === selectedId) ||
    visibleActivityRows[0] ||
    null;
  const latestActivity = selectedRow?.activity || {};
  const latestRepository = selectedRow?.repository || {};
  const latestModules = selectedRow?.modules || [];
  const latestSha = getCommitShortSha(latestActivity.commitSha);
  const changeTotals = getChangeTotals(latestActivity, selectedRow?.filesChanged || 0);

  if (!activityRows.length || !visibleActivityRows.length) {
    return (
      <Card className="rounded-2xl border-dashed border-blue-200 bg-white/90 xl:col-span-2">
        <CardContent className="p-6 text-center">
          <GitBranch className="mx-auto h-8 w-8 text-blue-400" />
          <p className="mt-3 text-sm font-semibold text-slate-900">No QA git activity yet</p>
          <p className="mt-1 text-xs text-slate-500">New builds waiting for QA will appear here after a real push is received.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-violet-200 bg-gradient-to-br from-violet-100 via-purple-50 to-indigo-100 shadow-[0_18px_46px_-30px_rgba(124,58,237,0.5)]">
      <CardContent className="grid gap-3 p-3 sm:p-4 xl:grid-cols-2">
        <div className="min-w-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-blue-600">
                <GitBranch className="h-4 w-4" />
                QA Git Activity
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600">
                Testing Queue · {visibleActivityRows.length} {visibleActivityRows.length === 1 ? "build" : "builds"} waiting for QA.
              </p>
            </div>
            <select
              className="h-9 rounded-xl border border-violet-200 bg-white/90 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
              value={selectedRow?.id || ""}
              onChange={(event) => onSelectProject?.(event.target.value)}
            >
              <option value="">All Projects</option>
              {visibleActivityRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.activity.projectName}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 space-y-2">
            {visibleActivityRows.map((row, index) => {
              const isSelected = row.id === selectedRow?.id;
              const commitShortSha = getCommitShortSha(row.activity.commitSha);
              const groupLabel = getActivityGroupLabel(row.activity.pushedAt);
              const previousGroupLabel = index > 0
                ? getActivityGroupLabel(visibleActivityRows[index - 1].activity.pushedAt)
                : "";
              const moduleLabel = row.modules.length
                ? row.modules.slice(0, 2).join(", ")
                : "No module changes detected";

              return (
                <div key={row.id}>
                  {groupLabel !== previousGroupLabel && (
                    <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      {groupLabel}
                    </p>
                  )}
                  <button
                    className={cn(
                      "grid w-full gap-2 rounded-xl border bg-white/90 px-3 py-2 text-left transition hover:border-violet-300 hover:bg-white md:grid-cols-[minmax(0,1.05fr)_minmax(140px,0.95fr)_auto] md:items-center",
                      isSelected && "border-violet-400 bg-white shadow-[0_12px_28px_-24px_rgba(124,58,237,0.7)]"
                    )}
                    onClick={() => onSelectProject?.(row.id)}
                    type="button"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <ActivityAvatar compact name={row.activity.pushedByName} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {formatRepositoryName(row.repository)}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                          <GitBranch className="h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 truncate">{row.activity.branch}</span>
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {row.activity.pushedByName}
                        </p>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        pushed {commitShortSha || "-"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-600">
                        {row.activity.branch} · {row.filesChanged} {row.filesChanged === 1 ? "file" : "files"} · {moduleLabel}
                      </p>
                      <p className="text-[11px] font-medium text-slate-500">
                        {formatActivityClock(row.activity.pushedAt)}
                      </p>
                    </div>
                    <Badge className={cn("justify-self-start rounded-full border px-2 py-0.5 text-[10px]", getActivityStatusTone(row.activity.qaStatus))} variant="outline">
                      {getActivityStatusLabel(row.activity.qaStatus)}
                    </Badge>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 border-t border-violet-300/80 pt-3 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-blue-600">
                <Rocket className="h-4 w-4" />
                Latest Push
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-200/80 text-violet-700">
                  <Package className="h-4 w-4" />
                </span>
                <h3 className="text-base font-semibold text-slate-950">
                  {latestActivity.projectName}
                </h3>
              </div>
            </div>
            <Badge className={cn("rounded-full border px-3 py-1 text-xs", getActivityStatusTone(latestActivity.qaStatus))} variant="outline">
              {getActivityStatusLabel(latestActivity.qaStatus)}
            </Badge>
          </div>

          <div className="mt-3 border-t border-violet-200 pt-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Pushed By</p>
                <div className="mt-2 flex items-center gap-2">
                  <ActivityAvatar compact name={latestActivity.pushedByName} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{latestActivity.pushedByName}</p>
                    <p className="truncate text-xs text-slate-500">{formatRepositoryName(latestRepository)}</p>
                  </div>
                </div>
              </div>
              <div className="border-slate-200 sm:border-l sm:pl-3">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Branch</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-950">
                  <GitBranch className="h-4 w-4 text-blue-600" />
                  {latestActivity.branch}
                </p>
              </div>
              <div className="border-slate-200 sm:border-l sm:pl-3">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Push Time</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">
                  {formatActivityTime(latestActivity.pushedAt)}
                </p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-violet-200 bg-white/90 px-3 py-2">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Commit</p>
                <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-950">
                  {latestSha || "-"}
                  {latestSha ? (
                    <button
                      className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-blue-600"
                      onClick={() => navigator.clipboard?.writeText(latestActivity.commitSha)}
                      type="button"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  ) : null}
                </p>
              </div>
              <div className="rounded-xl border border-violet-200 bg-white/90 px-3 py-2">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Commit Message</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-950">{latestActivity.commitMessage}</p>
              </div>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <MetricPill label="Files Changed" value={selectedRow?.filesChanged || 0} tone="blue" />
              <MetricPill label="Modules Affected" value={latestModules.length} tone="blue" />
              <div className="rounded-xl bg-white/90 px-3 py-2 ring-1 ring-violet-200">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Additions / Deletions</p>
                <p className="mt-1 text-base font-semibold">
                  <span className="text-emerald-600">+{changeTotals.additions || 0}</span>
                  <span className="mx-5 text-slate-300"> </span>
                  <span className="text-rose-600">-{changeTotals.deletions || 0}</span>
                </p>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Changed Modules</p>
              <div className="flex flex-wrap gap-1.5">
                {(latestModules.length ? latestModules : ["No module changes detected"]).map((module) => (
                  <span className="rounded-full border border-violet-200 bg-white/80 px-2 py-0.5 text-xs font-semibold text-violet-700" key={module}>
                    {module}
                  </span>
                ))}
              </div>
            </div>

            <AiCodeReviewPanel
              activity={latestActivity}
              className="mt-2"
              project={selectedRow?.record || selectedRow?.project}
            />

          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const LatestGitActivityCard = ({ project, roleLabel = "Delivery" }) => {
  const repository = getRepositorySummary(project);
  const activity = getLatestGitActivity(project);
  const modulesChanged = activity.modulesChanged.length ? activity.modulesChanged : ["No module changes detected"];

  return (
    <Card className="rounded-2xl border-blue-100/80 bg-white/90 shadow-[0_18px_46px_-36px_rgba(37,99,235,0.45)]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-600">{roleLabel}</p>
            <h3 className="mt-1 text-base font-semibold text-slate-950">Latest Commit</h3>
          </div>
          <Badge className="rounded-full border-blue-200 bg-blue-50 text-blue-700" variant="outline">
            {activity.qaStatus}
          </Badge>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Project</p>
            <p className="mt-1 font-semibold text-slate-900">{activity.projectName}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Repository</p>
              <p className="mt-1 truncate font-semibold text-slate-900">{activity.repository}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Branch</p>
              <p className="mt-1 flex items-center gap-1.5 font-semibold text-slate-900">
                <GitBranch className="h-3.5 w-3.5 text-blue-500" />
                {activity.branch}
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-blue-50/70 px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-blue-700">Commit Message</p>
            <p className="mt-1 font-semibold text-slate-950">{activity.commitMessage}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <MetricPill label="Files Changed" value={activity.filesChanged.length} tone="slate" />
            <MetricPill label="Push Time" value={activity.pushedAt ? formatDateTime(activity.pushedAt) : "-"} tone="blue" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {modulesChanged.map((module) => (
              <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700" key={module}>
                {module}
              </span>
            ))}
          </div>
          <AiCodeReviewPanel activity={activity} project={project} />
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            <span>{repository.provider}</span>
            <span>{repository.status}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const ProjectTestSetupSummary = ({ onOpenSetup, project }) => {
  const modules = normalizeDeliveryModules(project);
  const testCases = Array.isArray(project?.testCases)
    ? project.testCases.filter((testCase) => testCase?.active !== false)
    : [];
  const estimatedMinutes = testCases.reduce((sum, testCase) => sum + (Number(testCase.estimatedMinutes) || 0), 0);
  const ready = modules.length > 0 && testCases.length > 0;

  return (
    <Card className="rounded-2xl border-emerald-100 bg-white/90 shadow-[0_18px_46px_-36px_rgba(16,185,129,0.42)]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-600">Project Test Setup</p>
            <h3 className="mt-1 text-base font-semibold text-slate-950">{project?.name || "Select a project"}</h3>
          </div>
          <Badge className={cn("rounded-full", ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
            {ready ? "Ready" : "Setup Required"}
          </Badge>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MetricPill label="Modules" value={modules.length} tone="blue" />
          <MetricPill label="Test Cases" value={testCases.length} tone="emerald" />
          <MetricPill label="Est. Time" value={`${estimatedMinutes}m`} tone="amber" />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(modules.length ? modules : ["No modules selected"]).slice(0, 6).map((module) => (
            <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700" key={module}>
              {module}
            </span>
          ))}
        </div>
        <Button className="mt-3 h-9 w-full rounded-xl" disabled={!project} onClick={onOpenSetup} type="button">
          <ShieldCheck className="h-4 w-4" />
          Configure Test Flow
        </Button>
      </CardContent>
    </Card>
  );
};

const isGitConnected = (project = {}) => {
  const repository = getRepositorySummary(project);
  const normalizedStatus = String(repository.status || "").toLowerCase();

  return Boolean(repository.url || repository.name || normalizedStatus.includes("connected"));
};

export const ProjectOverviewDashboardPanel = ({ issues = [], onViewGitActivity, projects = [], workQueueBugs = [] }) => {
  const [selectedGitProjectId, setSelectedGitProjectId] = useState("");
  const activeProjects = projects.filter((project) => project.status !== "Completed");
  const projectRows = useMemo(
    () =>
      activeProjects
        .map((project) => {
          const metrics = getProjectDeliveryMetrics({ project, issues });
          const activity = getLatestGitActivity(project);
          const repository = getRepositorySummary(project);
          const modules = activity.modulesChanged.length
            ? activity.modulesChanged
            : normalizeDeliveryModules(project);
          const connected = isGitConnected(project);
          return {
            activity,
            connected,
            metrics,
            modules,
            project,
            projectId: getProjectId(project),
            repository,
          };
        })
        .sort(
          (left, right) =>
            new Date(right.activity.pushedAt || right.project.updatedAt || 0).getTime() -
            new Date(left.activity.pushedAt || left.project.updatedAt || 0).getTime()
        ),
    [activeProjects, issues]
  );
  const connectedProjectRows = useMemo(
    () => projectRows.filter((row) => row.connected),
    [projectRows]
  );
  const latestConnectedPush = connectedProjectRows.find((row) => hasRecordedPush(row.activity)) || null;
  const selectedGitProject = connectedProjectRows.find(
    (row) => row.projectId === selectedGitProjectId
  );
  const latestPush = selectedGitProject || latestConnectedPush || null;
  const workQueueProjectRows = useMemo(() => {
    const projectNames = new Map(projects.map((project) => [
      getProjectId(project),
      project.name || "Untitled project",
    ]));
    const counts = new Map();

    workQueueBugs.forEach((bug) => {
      const projectId = String(bug.project?._id || bug.project || bug.projectId?._id || bug.projectId || "");
      const name = projectNames.get(projectId) || bug.project?.name || bug.projectId?.name || "Other projects";
      counts.set(name, (counts.get(name) || 0) + 1);
    });

    return Array.from(counts, ([name, value]) => ({ name, value }))
      .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
  }, [projects, workQueueBugs]);
  const workQueueTotal = workQueueProjectRows.reduce((total, row) => total + row.value, 0);
  let pieOffset = 0;
  const workQueuePieGradient = workQueueProjectRows.map((row, index) => {
    const start = pieOffset;
    pieOffset += workQueueTotal ? (row.value / workQueueTotal) * 100 : 0;
    return `${WORK_QUEUE_CHART_COLORS[index % WORK_QUEUE_CHART_COLORS.length]} ${start}% ${pieOffset}%`;
  }).join(", ");

  useEffect(() => {
    const nextSelectedId =
      selectedGitProjectId && connectedProjectRows.some((row) => row.projectId === selectedGitProjectId)
        ? selectedGitProjectId
        : latestConnectedPush?.projectId || connectedProjectRows[0]?.projectId || "";

    if (nextSelectedId !== selectedGitProjectId) {
      setSelectedGitProjectId(nextSelectedId);
    }
  }, [connectedProjectRows, latestConnectedPush, selectedGitProjectId]);
  const todayKey = new Date().toDateString();
  const totals = projectRows.reduce(
    (summary, project) => {
      return {
        gitConnected: summary.gitConnected + (project.connected ? 1 : 0),
        pendingQa: summary.pendingQa + project.metrics.pendingQa,
        pushesToday:
          summary.pushesToday +
          (project.activity.pushedAt && new Date(project.activity.pushedAt).toDateString() === todayKey ? 1 : 0),
        recentActive: summary.recentActive + (hasRecordedPush(project.activity) ? 1 : 0),
        testing:
          summary.testing +
          (String(project.activity.qaStatus || "").toLowerCase().includes("test") ? 1 : 0),
      };
    },
    { gitConnected: 0, pendingQa: 0, pushesToday: 0, recentActive: 0, testing: 0 }
  );

  return (
    <Card className="rounded-[24px] border-white/70 bg-white/86 shadow-[0_20px_56px_-36px_rgba(15,23,42,0.38)]">
      <CardContent className="p-5">
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-2xl border border-blue-100/80 bg-blue-50/28 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-600">Git Activity</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">Recent code changes across connected projects.</h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {connectedProjectRows.length ? (
                  <select
                    aria-label="Select Git connected project"
                    className="h-9 max-w-[180px] rounded-xl border border-blue-100 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
                    value={selectedGitProjectId}
                    onChange={(event) => setSelectedGitProjectId(event.target.value)}
                  >
                    {connectedProjectRows.map((row) => (
                      <option key={row.projectId} value={row.projectId}>
                        {row.project.name || "Untitled project"}
                      </option>
                    ))}
                  </select>
                ) : null}
                <GitBranch className="h-5 w-5 text-blue-500" />
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <MetricPill label="Git Connected" value={totals.gitConnected} tone="blue" />
              <MetricPill label="Pushes Today" value={totals.pushesToday} tone="emerald" />
              <MetricPill label="Waiting for QA" value={totals.pendingQa} tone="amber" />
              <MetricPill label="Testing" value={totals.testing} tone="blue" />
            </div>

            {latestPush && hasRecordedPush(latestPush.activity) ? (
              <div className="mt-4 rounded-2xl border border-white/80 bg-white/88 p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Latest Push</p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-950">{latestPush.project.name}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-600">
                      {latestPush.activity.pushedByName} · {latestPush.activity.branch}
                    </p>
                  </div>
                  <Badge className={cn("shrink-0 rounded-full border px-2.5 py-1", getActivityStatusTone(latestPush.activity.qaStatus))} variant="outline">
                    {getActivityStatusLabel(latestPush.activity.qaStatus)}
                  </Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-800">
                  {latestPush.activity.commitMessage}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                    {getCommitShortSha(latestPush.activity.commitSha) || "No SHA"}
                  </span>
                  <span className="rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                    {getFilesChangedCount(latestPush.activity)} files changed
                  </span>
                  {(latestPush.modules.length ? latestPush.modules : ["No modules detected"]).slice(0, 3).map((module) => (
                    <span className="rounded-full bg-cyan-50 px-2 py-1 font-semibold text-cyan-700" key={module}>
                      {module}
                    </span>
                  ))}
                  <span className="rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                    {formatActivityTime(latestPush.activity.pushedAt)}
                  </span>
                </div>
                <AiCodeReviewPanel
                  activity={latestPush.activity}
                  className="mt-3"
                  project={latestPush.project}
                />
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-blue-200 bg-white/70 p-5 text-center">
                <GitBranch className="mx-auto h-7 w-7 text-blue-400" />
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {connectedProjectRows.length ? "No recent Git activity for this project" : "No Git connected projects"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {connectedProjectRows.length
                    ? "The selected project is connected, but no push has been recorded yet."
                    : "Connect a project repository to review its latest push here."}
                </p>
              </div>
            )}

            <Button className="mt-4 h-9 rounded-xl" type="button" variant="outline" onClick={() => onViewGitActivity?.(latestPush?.project)}>
              View Git Activity
            </Button>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">Bug Work Queue</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">Unassigned bugs by project.</h2>
              </div>
              <Layers3 className="h-5 w-5 text-violet-500" />
            </div>
            {workQueueProjectRows.length ? (
              <div className="mt-3">
                <div className="flex h-[320px] justify-center">
                  <div
                    aria-label={`${workQueueTotal} unassigned work queue bugs across ${workQueueProjectRows.length} projects`}
                    className="aspect-square w-full max-w-[320px] rounded-full border border-white shadow-inner"
                    role="img"
                    style={{ backgroundImage: `conic-gradient(${workQueuePieGradient})` }}
                    title={`${workQueueTotal} work queue bugs`}
                  />
                </div>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {workQueueProjectRows.map((row, index) => (
                    <li className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5" key={row.name}>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: WORK_QUEUE_CHART_COLORS[index % WORK_QUEUE_CHART_COLORS.length] }} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700" title={row.name}>{row.name}</span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-900">
                          {row.value} <span className="font-normal text-slate-500">({Math.round((row.value / workQueueTotal) * 100)}%)</span>
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(row.value / workQueueTotal) * 100}%`,
                            backgroundColor: WORK_QUEUE_CHART_COLORS[index % WORK_QUEUE_CHART_COLORS.length],
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-4 grid h-[260px] place-items-center rounded-xl border border-dashed border-slate-200 bg-white/70 p-5 text-center text-sm text-slate-500">
                No unassigned work queue bugs.
              </div>
            )}
          </section>
        </div>
      </CardContent>
    </Card>
  );
};
