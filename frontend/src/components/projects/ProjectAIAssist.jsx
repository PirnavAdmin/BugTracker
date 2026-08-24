import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  Bug,
  CheckCircle2,
  ListTodo,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Users2,
} from "lucide-react";
import { fetchLatestProjectAIInsights, generateProjectAIInsights } from "@/lib/api";
import { Button } from "@/components/ui/button";

const Metric = ({ label, value, helper }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
    {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
  </div>
);

const Section = ({ icon: Icon, title, subtitle, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h3 className="font-semibold text-slate-950">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
    </div>
    <div className="mt-4">{children}</div>
  </section>
);

const LoadingState = () => (
  <div className="grid gap-4 lg:grid-cols-2" aria-label="Analyzing project">
    {[1, 2, 3, 4].map((item) => (
      <div className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" key={item} />
    ))}
  </div>
);

const ProjectAIAssist = ({ project }) => {
  const queryClient = useQueryClient();
  const reportQueryKey = ["project-ai-insights", project._id];
  const { data: savedReport, isLoading: isSavedReportLoading } = useQuery({
    queryKey: reportQueryKey,
    queryFn: () => fetchLatestProjectAIInsights(project._id),
    enabled: Boolean(project._id),
  });
  const mutation = useMutation({
    mutationFn: () => generateProjectAIInsights(project._id),
    onSuccess: (report) => {
      queryClient.setQueryData(reportQueryKey, { success: true, report });
    },
  });
  const result = savedReport?.report;
  const health = result?.metrics?.projectHealth;

  if ((isSavedReportLoading || mutation.isPending) && !result) return <LoadingState />;

  if (!result) {
    return (
      <section className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/60 px-6 py-12 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
          <Sparkles className="h-6 w-6" />
        </span>
        <h3 className="mt-4 text-lg font-semibold text-slate-950">Analyze {project.name}</h3>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
          Generate a project-scoped health summary, delivery risks, sprint insights, and team observations. Analysis is created only when you request it.
        </p>
        {mutation.isError ? (
          <p className="mt-3 text-sm font-medium text-rose-600">
            {mutation.error?.response?.data?.message || "Unable to analyze this project."}
          </p>
        ) : null}
        <Button className="mt-5 rounded-xl" onClick={() => mutation.mutate()} type="button">
          <Bot className="h-4 w-4" /> Generate AI Analysis
        </Button>
      </section>
    );
  }

  const observationsById = (items = []) => new Map(items.map((item) => [item.userId, item.observation]));
  const developerNotes = observationsById(result.analysis?.developerObservations);
  const testerNotes = observationsById(result.analysis?.testerObservations);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Project AI Assist</p>
          <p className="mt-1 text-xs text-slate-500">
            Last analyzed {new Date(result.analysisInfo.analyzedAt).toLocaleString()} by {result.analysisInfo.requestedBy.name}
          </p>
        </div>
        <Button className="rounded-xl" disabled={mutation.isPending} onClick={() => mutation.mutate()} type="button" variant="outline">
          <RefreshCw className={`h-4 w-4 ${mutation.isPending ? "animate-spin" : ""}`} />
          {mutation.isPending ? "Generating..." : "Generate New Report"}
        </Button>
      </div>
      {mutation.isError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {mutation.error?.response?.data?.message || "The new report could not be generated. The previous report is still displayed."}
        </p>
      ) : null}

      <Section icon={CheckCircle2} title="Project Health" subtitle={result.analysis?.healthSummary}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Overall completion" value={`${health.completionRate}%`} helper={`${health.totalWorkItems} current work items`} />
          <Metric label="Stories" value={`${health.stories.completed}/${health.stories.total}`} helper={`${health.stories.completedStoryPoints}/${health.stories.storyPoints} points`} />
          <Metric label="Sprint completion" value={`${health.sprints.completionRate}%`} helper={`${health.sprints.completed}/${health.sprints.total} completed`} />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-3">
            <div className="mb-3 flex items-center gap-2 text-blue-800">
              <ListTodo className="h-4 w-4" />
              <h4 className="text-sm font-bold">Task Health</h4>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Metric label="Completed tasks" value={`${health.tasks.completed}/${health.tasks.total}`} />
              <Metric label="In progress tasks" value={health.tasks.inProgress} />
              <Metric label="Pending tasks" value={health.tasks.pending} />
              <Metric label="Overdue tasks" value={health.tasks.overdue} />
              <Metric label="Blocked tasks" value={health.tasks.blocked} />
              <Metric label="Unassigned tasks" value={health.tasks.unassigned} />
            </div>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-3">
            <div className="mb-3 flex items-center gap-2 text-rose-800">
              <Bug className="h-4 w-4" />
              <h4 className="text-sm font-bold">Bug Health</h4>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Metric label="Closed bugs" value={`${health.bugs.resolved}/${health.bugs.total}`} />
              <Metric label="Open bugs" value={health.bugs.open} />
              <Metric label="In progress bugs" value={health.bugs.inProgress} />
              <Metric label="Ready for QA" value={health.bugs.readyForQa} />
              <Metric label="Reopened bugs" value={health.bugs.reopened} />
              <Metric label="Critical open bugs" value={health.bugs.criticalOpen} />
            </div>
          </div>
        </div>
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section icon={Users2} title="Developer Performance">
          <div className="space-y-2">
            {result.developers.length ? result.developers.map((row) => (
              <div className="rounded-xl border border-slate-200 p-3" key={row.userId}>
                <div className="flex justify-between gap-3"><p className="font-semibold text-slate-950">{row.name}</p><span className="text-sm font-semibold text-indigo-600">{row.taskCompletionRate}% tasks</span></div>
                <p className="mt-1 text-xs text-slate-500">Tasks: {row.completedTasks}/{row.assignedTasks} completed / Bugs: {row.bugsFixed} fixed</p>
                {developerNotes.get(row.userId) ? <p className="mt-2 text-sm text-slate-600">{developerNotes.get(row.userId)}</p> : null}
              </div>
            )) : <p className="text-sm text-slate-500">No developer assignments were found.</p>}
          </div>
        </Section>
        <Section icon={Users2} title="Tester / QA Performance">
          <div className="space-y-2">
            {result.testers.length ? result.testers.map((row) => (
              <div className="rounded-xl border border-slate-200 p-3" key={row.userId}>
                <div className="flex justify-between gap-3"><p className="font-semibold text-slate-950">{row.name}</p><span className="text-sm font-semibold text-indigo-600">{row.completionRate}%</span></div>
                <p className="mt-1 text-xs text-slate-500">Bugs: {row.bugsVerified} verified / {row.reopenedBugs} reopened / {row.active} active</p>
                {testerNotes.get(row.userId) ? <p className="mt-2 text-sm text-slate-600">{testerNotes.get(row.userId)}</p> : null}
              </div>
            )) : <p className="text-sm text-slate-500">No tester ownership was found.</p>}
          </div>
        </Section>
      </div>

      <Section icon={Sparkles} title="Sprint Insights" subtitle={result.analysis?.sprintSummary}>
        {result.sprintInsight ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            <strong className="text-slate-950">{result.sprintInsight.name}</strong>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${result.sprintInsight.status === "On Track" ? "bg-emerald-100 text-emerald-700" : result.sprintInsight.status === "At Risk" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>{result.sprintInsight.status}</span>
            <span>{result.sprintInsight.completionRate}% complete</span><span>{result.sprintInsight.blockedItems} blocked</span><span>{result.sprintInsight.carryOverItems} carried over</span>
          </div>
        ) : <p className="text-sm text-slate-500">No active or completed sprint was found.</p>}
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section icon={ShieldAlert} title="Delivery Risks">
          <div className="space-y-2">
            {result.analysis?.deliveryRisks?.length ? result.analysis.deliveryRisks.map((risk, index) => (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3" key={`${risk.risk}-${index}`}>
                <p className="text-sm font-semibold text-slate-950">{risk.severity}: {risk.risk}</p>
                <p className="mt-1 text-xs text-slate-600">Evidence: {risk.evidence}</p>
                <p className="mt-1 text-xs font-medium text-slate-700">Action: {risk.recommendedAction}</p>
              </div>
            )) : <p className="text-sm text-slate-500">No delivery risks were identified from the available data.</p>}
          </div>
        </Section>
        <Section icon={AlertTriangle} title="Recommendations">
          <ol className="space-y-2">
            {(result.analysis?.recommendations || []).map((item, index) => <li className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700" key={`${item}-${index}`}>{index + 1}. {item}</li>)}
          </ol>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">{result.analysisInfo.feature} / {result.analysisInfo.modelId} / {result.analysisInfo.totalTokens ?? 0} tokens / ${Number(result.analysisInfo.estimatedCost || 0).toFixed(6)}</p>
        </Section>
      </div>
    </div>
  );
};

export default ProjectAIAssist;
