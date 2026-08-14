import {
  CheckCircle2,
  Copy,
  FileText,
  GitBranch,
  GitCommit,
  Layers3,
  Package,
  Play,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import {
  getLatestGitActivity,
  getProjectDeliveryMetrics,
  getRepositorySummary,
  normalizeDeliveryModules,
} from "@/lib/delivery-workflow";
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

const ActivityAvatar = ({ name }) => (
  <div className="relative h-11 w-11 shrink-0">
    <div className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-slate-100 text-sm font-bold text-slate-700">
      {getPersonInitials(name)}
    </div>
    <span className="absolute -bottom-0.5 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-slate-950 text-white">
      <GitCommit className="h-3 w-3" />
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
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
      <Card className="rounded-2xl border-blue-100/80 bg-white/92 shadow-[0_18px_46px_-36px_rgba(37,99,235,0.45)]">
        <CardContent className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-blue-600">
                <GitBranch className="h-5 w-5" />
                QA Git Activity
              </p>
              <p className="mt-2 text-sm font-medium text-slate-600">
                Testing Queue · {visibleActivityRows.length} {visibleActivityRows.length === 1 ? "build" : "builds"} waiting for QA.
              </p>
            </div>
            <select
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
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

          <div className="mt-5 space-y-3">
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
                    <p className="px-1 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      {groupLabel}
                    </p>
                  )}
                  <button
                    className={cn(
                      "grid w-full gap-3 rounded-xl border bg-white px-4 py-4 text-left transition hover:border-blue-200 hover:bg-blue-50/30 md:grid-cols-[minmax(0,1.05fr)_minmax(170px,0.95fr)_auto] md:items-center",
                      isSelected && "border-blue-400 bg-blue-50/30 shadow-[0_18px_40px_-34px_rgba(37,99,235,0.6)]"
                    )}
                    onClick={() => onSelectProject?.(row.id)}
                    type="button"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ActivityAvatar name={row.activity.pushedByName} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {formatRepositoryName(row.repository)}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-blue-600">
                          <GitBranch className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate">{row.activity.branch}</span>
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {row.activity.pushedByName}
                        </p>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        pushed {commitShortSha || "-"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {row.activity.branch} · {row.filesChanged} {row.filesChanged === 1 ? "file" : "files"} · {moduleLabel}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {formatActivityClock(row.activity.pushedAt)}
                      </p>
                    </div>
                    <Badge className={cn("justify-self-start rounded-full border px-3 py-1", getActivityStatusTone(row.activity.qaStatus))} variant="outline">
                      {getActivityStatusLabel(row.activity.qaStatus)}
                    </Badge>
                  </button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-blue-100/80 bg-white/92 shadow-[0_18px_46px_-36px_rgba(37,99,235,0.45)]">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-blue-600">
                <Rocket className="h-5 w-5" />
                Latest Push
              </p>
              <div className="mt-5 flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-600">
                  <Package className="h-5 w-5" />
                </span>
                <h3 className="text-base font-semibold text-slate-950">
                  {latestActivity.projectName}
                </h3>
              </div>
            </div>
            <Badge className={cn("rounded-full border px-4 py-2", getActivityStatusTone(latestActivity.qaStatus))} variant="outline">
              {getActivityStatusLabel(latestActivity.qaStatus)}
            </Badge>
          </div>

          <div className="mt-5 border-t border-slate-200 pt-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Pushed By</p>
                <div className="mt-4 flex items-center gap-3">
                  <ActivityAvatar name={latestActivity.pushedByName} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{latestActivity.pushedByName}</p>
                    <p className="truncate text-xs text-slate-500">{formatRepositoryName(latestRepository)}</p>
                  </div>
                </div>
              </div>
              <div className="border-slate-200 sm:border-l sm:pl-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Branch</p>
                <p className="mt-4 flex items-center gap-2 text-base font-semibold text-slate-950">
                  <GitBranch className="h-5 w-5 text-blue-600" />
                  {latestActivity.branch}
                </p>
              </div>
              <div className="border-slate-200 sm:border-l sm:pl-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Push Time</p>
                <p className="mt-4 text-base font-semibold text-slate-950">
                  {formatActivityTime(latestActivity.pushedAt)}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Commit</p>
                <p className="mt-4 flex items-center gap-2 text-base font-semibold text-slate-950">
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
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Commit Message</p>
                <p className="mt-4 text-base font-semibold text-slate-950">{latestActivity.commitMessage}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MetricPill label="Files Changed" value={selectedRow?.filesChanged || 0} tone="blue" />
              <MetricPill label="Modules Affected" value={latestModules.length} tone="blue" />
              <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Additions / Deletions</p>
                <p className="mt-4 text-lg font-semibold">
                  <span className="text-emerald-600">+{changeTotals.additions || 0}</span>
                  <span className="mx-5 text-slate-300"> </span>
                  <span className="text-rose-600">-{changeTotals.deletions || 0}</span>
                </p>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Changed Modules</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(latestModules.length ? latestModules : ["No module changes detected"]).map((module) => (
                  <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700" key={module}>
                    {module}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 border-t border-slate-200 pt-5">
              <Button className="h-11 w-full rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={() => onStartTesting?.(selectedRow?.project)} type="button">
                <Play className="h-4 w-4" />
                Start Testing / Create Test Flow
              </Button>
              <Button className="mt-3 h-11 w-full rounded-xl border-blue-200 text-blue-700" onClick={() => onSelectProject?.(selectedRow?.id)} type="button" variant="outline">
                <FileText className="h-4 w-4" />
                View Full Activity
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
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

const getProjectQaStatus = ({ metrics, project }) => {
  const activity = getLatestGitActivity(project);

  if (!isGitConnected(project)) {
    return "Git not connected";
  }

  if (metrics.criticalBugs > 0) {
    return "Critical attention";
  }

  if (metrics.failedQa > 0) {
    return "QA rework";
  }

  if (metrics.pendingQa > 0) {
    return "Waiting for QA";
  }

  if (String(activity.qaStatus || "").toLowerCase().includes("test")) {
    return "Testing";
  }

  if (hasRecordedPush(activity)) {
    return "Active";
  }

  return "No recent activity";
};

const getProjectStatusTone = (status = "") => {
  const normalized = String(status).toLowerCase();

  if (normalized.includes("critical") || normalized.includes("rework") || normalized.includes("fail")) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (normalized.includes("waiting")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (normalized.includes("testing") || normalized.includes("active")) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (normalized.includes("not connected")) {
    return "border-slate-200 bg-slate-100 text-slate-600";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
};

export const ProjectOverviewDashboardPanel = ({ issues = [], onViewGitActivity, projects = [] }) => {
  const activeProjects = projects.filter((project) => project.status !== "Completed");
  const projectRows = activeProjects
    .map((project) => {
      const metrics = getProjectDeliveryMetrics({ project, issues });
      const activity = getLatestGitActivity(project);
      const repository = getRepositorySummary(project);
      const modules = activity.modulesChanged.length
        ? activity.modulesChanged
        : normalizeDeliveryModules(project);
      const connected = isGitConnected(project);
      const status = getProjectQaStatus({ metrics, project });

      return {
        activity,
        connected,
        metrics,
        modules,
        project,
        repository,
        status,
      };
    })
    .sort(
      (left, right) =>
        new Date(right.activity.pushedAt || right.project.updatedAt || 0).getTime() -
        new Date(left.activity.pushedAt || left.project.updatedAt || 0).getTime()
    );
  const latestPush = projectRows.find((row) => hasRecordedPush(row.activity)) || null;
  const todayKey = new Date().toDateString();
  const totals = projectRows.reduce(
    (summary, project) => {
      return {
        criticalBugs: summary.criticalBugs + project.metrics.criticalBugs,
        failedQa: summary.failedQa + project.metrics.failedQa,
        gitConnected: summary.gitConnected + (project.connected ? 1 : 0),
        openBugs: summary.openBugs + project.metrics.openBugs,
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
    { criticalBugs: 0, failedQa: 0, gitConnected: 0, openBugs: 0, pendingQa: 0, pushesToday: 0, recentActive: 0, testing: 0 }
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
              <GitBranch className="h-5 w-5 text-blue-500" />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <MetricPill label="Git Connected" value={totals.gitConnected} tone="blue" />
              <MetricPill label="Pushes Today" value={totals.pushesToday} tone="emerald" />
              <MetricPill label="Waiting for QA" value={totals.pendingQa} tone="amber" />
              <MetricPill label="Testing" value={totals.testing} tone="blue" />
            </div>

            {latestPush ? (
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
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-blue-200 bg-white/70 p-5 text-center">
                <GitBranch className="mx-auto h-7 w-7 text-blue-400" />
                <p className="mt-2 text-sm font-semibold text-slate-900">No recent Git activity</p>
                <p className="mt-1 text-xs text-slate-500">Git pushes will appear here when connected projects receive code changes.</p>
              </div>
            )}

            <Button className="mt-4 h-9 rounded-xl" type="button" variant="outline" onClick={() => onViewGitActivity?.(latestPush?.project)}>
              View Git Activity
            </Button>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">Project Health</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">Current health of active projects.</h2>
              </div>
              <Layers3 className="h-5 w-5 text-violet-500" />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <MetricPill label="Active Projects" value={activeProjects.length} tone="blue" />
              <MetricPill label="Waiting for QA" value={totals.pendingQa} tone="amber" />
              <MetricPill label="Critical Bugs" value={totals.criticalBugs} tone="rose" />
              <MetricPill label="QA Rework" value={totals.failedQa} tone="rose" />
            </div>

            <div className="mt-4 space-y-2">
              {projectRows.slice(0, 5).map((row) => (
                <div className="rounded-2xl border border-white/80 bg-white/86 px-3 py-2.5 shadow-sm" key={row.project._id || row.project.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{row.project.name}</p>
                      <p className={cn("mt-1 text-xs font-semibold", row.connected ? "text-emerald-700" : "text-slate-500")}>
                        {row.connected ? "Git Connected" : "Git not connected"}
                      </p>
                    </div>
                    <Badge className={cn("shrink-0 rounded-full border px-2.5 py-1", getProjectStatusTone(row.status))} variant="outline">
                      {row.status}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {row.metrics.pendingQa ? (
                      <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700">
                        {row.metrics.pendingQa} pending QA
                      </span>
                    ) : null}
                    {row.metrics.criticalBugs ? (
                      <span className="rounded-full bg-rose-50 px-2 py-1 font-semibold text-rose-700">
                        {row.metrics.criticalBugs} critical
                      </span>
                    ) : null}
                    {hasRecordedPush(row.activity) ? (
                      <span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700">
                        Recent push {formatActivityClock(row.activity.pushedAt)}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
              {!projectRows.length && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-5 text-center text-sm text-slate-500">
                  Project health appears once active projects are created.
                </div>
              )}
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  );
};
