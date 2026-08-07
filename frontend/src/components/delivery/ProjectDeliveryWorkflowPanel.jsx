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
const getActivityStatusTone = (status = "") => {
  const normalized = String(status).toLowerCase();

  if (normalized.includes("ready") || normalized.includes("verified")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (normalized.includes("test")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (normalized.includes("request") || normalized.includes("fail") || normalized.includes("reject")) {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  return "border-blue-200 bg-blue-50 text-blue-700";
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
  const activityRows = projects.map((project) => {
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
  });
  const selectedId = getProjectId(selectedProject || activityRows[0]?.project || {});
  const selectedRow =
    activityRows.find((row) => row.id === selectedId) ||
    activityRows[0] ||
    null;
  const latestActivity = selectedRow?.activity || {};
  const latestRepository = selectedRow?.repository || {};
  const latestModules = selectedRow?.modules || [];
  const latestSha = getCommitShortSha(latestActivity.commitSha);
  const additions = Number(latestActivity.additions || latestActivity.linesAdded || 0);
  const deletions = Number(latestActivity.deletions || latestActivity.linesDeleted || 0);

  if (!activityRows.length) {
    return (
      <Card className="rounded-2xl border-dashed border-blue-200 bg-white/90">
        <CardContent className="p-6 text-center">
          <GitBranch className="mx-auto h-8 w-8 text-blue-400" />
          <p className="mt-3 text-sm font-semibold text-slate-900">No QA git activity yet</p>
          <p className="mt-1 text-xs text-slate-500">Assigned project pushes will appear here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.92fr)]">
      <Card className="rounded-2xl border-blue-100/80 bg-white/92 shadow-[0_18px_46px_-36px_rgba(37,99,235,0.45)]">
        <CardContent className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-blue-600">
                <GitBranch className="h-5 w-5" />
                QA Git Activity
              </p>
              <p className="mt-2 text-sm font-medium text-slate-600">
                Recent code updates requiring QA validation.
              </p>
            </div>
            <select
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
              value={selectedRow?.id || ""}
              onChange={(event) => onSelectProject?.(event.target.value)}
            >
              <option value="">All Projects</option>
              {activityRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.activity.projectName}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5 space-y-3">
            {activityRows.map((row) => {
              const isSelected = row.id === selectedRow?.id;
              const commitShortSha = getCommitShortSha(row.activity.commitSha);
              const moduleLabel = row.modules.length
                ? `Modules: ${row.modules.slice(0, 2).join(", ")}`
                : "No module changes detected";

              return (
                <button
                  className={cn(
                    "grid w-full gap-3 rounded-xl border bg-white px-4 py-4 text-left transition hover:border-blue-200 hover:bg-blue-50/30 md:grid-cols-[minmax(0,1.15fr)_150px_minmax(180px,0.9fr)_auto] md:items-center",
                    isSelected && "border-blue-400 bg-blue-50/30 shadow-[0_18px_40px_-34px_rgba(37,99,235,0.6)]"
                  )}
                  key={row.id}
                  onClick={() => onSelectProject?.(row.id)}
                  type="button"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <ActivityAvatar name={row.activity.pushedByName} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {row.activity.pushedByName}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {row.repository.url
                          ? row.repository.url.replace(/^https?:\/\/github\.com\//, "").split("/").slice(0, 2).join("/")
                          : row.repository.provider}
                      </p>
                    </div>
                  </div>
                  <div className="text-sm">
                    <p className="flex items-center gap-1.5 font-semibold text-blue-600">
                      <GitBranch className="h-4 w-4" />
                      {row.activity.branch}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <GitCommit className="h-3.5 w-3.5" />
                      {commitShortSha || "-"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {row.activity.commitMessage}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatActivityTime(row.activity.pushedAt)}
                    </p>
                    <p className="mt-3 text-sm text-slate-500">
                      {row.filesChanged} {row.filesChanged === 1 ? "file" : "files"} changed
                      <span className="px-3 text-slate-400">.</span>
                      {moduleLabel}
                    </p>
                  </div>
                  <Badge className={cn("justify-self-start rounded-full border px-3 py-1", getActivityStatusTone(row.activity.qaStatus))} variant="outline">
                    {row.activity.qaStatus}
                  </Badge>
                </button>
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
              {latestActivity.qaStatus}
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
                    <p className="truncate text-xs text-slate-500">{latestRepository.provider}</p>
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
                  <span className="text-emerald-600">+{additions}</span>
                  <span className="mx-5 text-slate-300"> </span>
                  <span className="text-rose-600">-{deletions}</span>
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

export const ProjectOverviewDashboardPanel = ({ issues = [], projects = [] }) => {
  const activeProjects = projects.filter((project) => project.status !== "Completed");
  const totals = projects.reduce(
    (summary, project) => {
      const metrics = getProjectDeliveryMetrics({ project, issues });

      return {
        openBugs: summary.openBugs + metrics.openBugs,
        criticalBugs: summary.criticalBugs + metrics.criticalBugs,
        completedTasks: summary.completedTasks + metrics.completedTasks,
        pendingQa: summary.pendingQa + metrics.pendingQa,
        failedQa: summary.failedQa + metrics.failedQa,
        readyForRelease: summary.readyForRelease + (metrics.readyForRelease ? 1 : 0),
      };
    },
    { openBugs: 0, criticalBugs: 0, completedTasks: 0, pendingQa: 0, failedQa: 0, readyForRelease: 0 }
  );

  return (
    <Card className="rounded-[24px] border-white/70 bg-white/86 shadow-[0_20px_56px_-36px_rgba(15,23,42,0.38)]">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">Project Overview</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">Delivery Health</h2>
          </div>
          <Layers3 className="h-5 w-5 text-violet-500" />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <MetricPill label="Active Projects" value={activeProjects.length} tone="blue" />
          <MetricPill label="Open Bugs" value={totals.openBugs} tone="amber" />
          <MetricPill label="Critical Bugs" value={totals.criticalBugs} tone="rose" />
          <MetricPill label="Completed Tasks" value={totals.completedTasks} tone="emerald" />
          <MetricPill label="Pending QA" value={totals.pendingQa} tone="blue" />
          <MetricPill label="Ready Release" value={totals.readyForRelease} tone="emerald" />
        </div>
        <div className="mt-4 space-y-2">
          {projects.slice(0, 4).map((project) => {
            const metrics = getProjectDeliveryMetrics({ project, issues });
            const activity = getLatestGitActivity(project);

            return (
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3" key={project._id || project.id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{project.name}</span>
                  <span className="text-xs font-bold text-slate-500">{activity.qaStatus}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-full bg-white px-2 py-1 text-slate-600">{metrics.pendingQa} pending QA</span>
                  <span className="rounded-full bg-white px-2 py-1 text-slate-600">{metrics.failedQa} failed QA</span>
                  <span className="rounded-full bg-white px-2 py-1 text-slate-600">{normalizeDeliveryModules(project).length} modules</span>
                </div>
              </div>
            );
          })}
          {!projects.length && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
              Project delivery data appears once projects are created.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
