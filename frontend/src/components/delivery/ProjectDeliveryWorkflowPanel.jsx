import {
  CheckCircle2,
  GitBranch,
  GitCommit,
  Layers3,
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
