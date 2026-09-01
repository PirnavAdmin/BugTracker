import { Component, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Copy,
  LoaderCircle,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { runAiCodeReview } from "@/lib/api";
import {
  AI_REVIEW_STATUS_LABEL,
  defaultAiReview,
  getAiFindingCounts,
  getAiReviewPerspective,
  getAiReviewViewState,
  getRoleReviewTitle,
  normalizeAiReview,
} from "@/lib/ai-code-review";
import { useAuth } from "@/hooks/use-auth";
import { cn, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const severityTone = {
  CRITICAL: "border-red-200 bg-red-50 text-red-700",
  HIGH: "border-orange-200 bg-orange-50 text-orange-700",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-700",
  LOW: "border-blue-200 bg-blue-50 text-blue-700",
  SUGGESTION: "border-slate-200 bg-slate-50 text-slate-700",
};

const getProjectId = (project = {}) => String(project._id || project.id || project.raw?._id || "");
const normalizeActivity = (activity = {}) =>
  activity && typeof activity === "object" ? activity : {};
const formatFindingForCopy = (finding = {}) =>
  [
    `Severity: ${finding.severity || "SUGGESTION"}`,
    `Title: ${finding.title || "Review finding"}`,
    `File: ${finding.file || "Unknown file"}${finding.line ? `:${finding.line}` : ""}`,
    finding.confidence !== null && finding.confidence !== undefined
      ? `Confidence: ${finding.confidence}%`
      : "",
    finding.description ? `Description: ${finding.description}` : "",
    finding.whyItMatters ? `Why it matters: ${finding.whyItMatters}` : "",
    finding.recommendation ? `Recommendation: ${finding.recommendation}` : "",
    finding.regressionImpact ? `Regression impact: ${finding.regressionImpact}` : "",
  ]
    .filter(Boolean)
    .join("\n");

class AiCodeReviewErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("[ai-review] render failed", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={cn("rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm text-rose-700", this.props.className)}>
          <p className="font-semibold">AI review could not be displayed.</p>
          <p className="mt-1 text-xs">Refresh the dashboard or run the review again.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

const ReviewScore = ({ review }) => {
  if (review.status !== "COMPLETED") {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-2xl font-semibold text-slate-950">{review.score ?? "-"}</span>
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Score</span>
    </div>
  );
};

const FindingList = ({ findings = [], showCodeDetails = true }) => {
  const [copiedIndex, setCopiedIndex] = useState(null);

  if (!findings.length) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm font-medium text-emerald-800">
        No blocking findings were reported for this commit.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {findings.map((finding, index) => (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm" key={`${finding.file}-${finding.title}-${index}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-950">{finding.title || "Review finding"}</p>
              {showCodeDetails ? (
                <p className="mt-1 break-all text-xs font-semibold text-slate-500">
                  {finding.file || "Unknown file"}
                  {finding.line ? `:${finding.line}` : ""}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Badge className={cn("rounded-full border px-2.5 py-1", severityTone[finding.severity] || severityTone.SUGGESTION)} variant="outline">
                {finding.severity || "SUGGESTION"}
              </Badge>
              <Button
                aria-label={`Copy finding ${index + 1}`}
                className="h-8 rounded-xl px-2.5 text-xs"
                onClick={async () => {
                  try {
                    await navigator.clipboard?.writeText(formatFindingForCopy(finding));
                    setCopiedIndex(index);
                    window.setTimeout(() => setCopiedIndex(null), 1400);
                  } catch {
                    setCopiedIndex(null);
                  }
                }}
                type="button"
                variant="outline"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {copiedIndex === index ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
          {finding.description ? (
            <p className="mt-3 text-sm leading-6 text-slate-700">{finding.description}</p>
          ) : null}
          {finding.whyItMatters ? (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              <span className="font-semibold text-slate-900">Why it matters:</span> {finding.whyItMatters}
            </p>
          ) : null}
          {finding.recommendation ? (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              <span className="font-semibold text-slate-900">Recommendation:</span> {finding.recommendation}
            </p>
          ) : null}
          {finding.regressionImpact ? (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              <span className="font-semibold text-slate-900">Regression impact:</span> {finding.regressionImpact}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
};

const RiskBadge = ({ value = "low" }) => (
  <Badge className="rounded-full bg-slate-50 px-3 py-1 text-slate-700" variant="outline">
    {String(value || "low").replace(/_/g, " ").toUpperCase()}
  </Badge>
);

const SimpleList = ({ emptyText, items = [] }) => {
  if (!items.length) {
    return <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">{emptyText}</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" key={`${item}-${index}`}>
          {item}
        </li>
      ))}
    </ul>
  );
};

const ReviewSection = ({ children, title }) => (
  <div className="mt-5">
    <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{title}</p>
    {children}
  </div>
);

const DeveloperReview = ({ counts, review }) => {
  const technicalFindings = [
    ...review.findings,
    ...review.security,
    ...review.performance,
    ...review.codeQuality,
  ];

  return (
    <>
      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        {["CRITICAL", "HIGH", "MEDIUM", "LOW", "SUGGESTION"].map((severity) => (
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center" key={severity}>
            <p className="text-lg font-semibold text-slate-950">{counts[severity] || 0}</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{severity}</p>
          </div>
        ))}
      </div>

      <ReviewSection title="Security">
        <FindingList findings={review.security} />
      </ReviewSection>

      <ReviewSection title="Performance">
        <FindingList findings={review.performance} />
      </ReviewSection>

      <ReviewSection title="Code Quality">
        <FindingList findings={review.codeQuality.length ? review.codeQuality : review.findings} />
      </ReviewSection>

      <ReviewSection title="Regression Risk">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <RiskBadge value={review.regressionRisk.level} />
          {review.regressionRisk.reason ? (
            <p className="mt-3 text-sm leading-6 text-slate-700">{review.regressionRisk.reason}</p>
          ) : null}
          <div className="mt-3">
            <SimpleList emptyText="No affected areas identified." items={review.regressionRisk.areas} />
          </div>
        </div>
      </ReviewSection>

      <ReviewSection title="Findings">
        <FindingList findings={technicalFindings} />
      </ReviewSection>

      <ReviewSection title="Testing Recommendations">
        <SimpleList emptyText="No additional developer test recommendations." items={review.testing.recommendedTests} />
      </ReviewSection>
    </>
  );
};

const TesterReview = ({ review }) => (
  <>
    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">QA Risk</p>
        <p className="mt-2 text-lg font-semibold text-slate-950">{review.testing.risk.toUpperCase()}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Regression</p>
        <p className="mt-2 text-lg font-semibold text-slate-950">{review.regressionRisk.level.toUpperCase()}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Tests</p>
        <p className="mt-2 text-lg font-semibold text-slate-950">{review.testing.recommendedTests.length}</p>
      </div>
    </div>

    <ReviewSection title="Affected Modules">
      <SimpleList emptyText="No affected modules identified." items={review.testing.affectedModules} />
    </ReviewSection>

    <ReviewSection title="Recommended Tests">
      <SimpleList emptyText="No AI-recommended QA scenarios." items={review.testing.recommendedTests} />
    </ReviewSection>

    <ReviewSection title="Edge Cases">
      <SimpleList emptyText="No edge cases identified." items={review.testing.edgeCases} />
    </ReviewSection>

    <ReviewSection title="Regression Areas">
      <SimpleList emptyText="No regression areas identified." items={review.regressionRisk.areas} />
    </ReviewSection>
  </>
);

const ManagerReview = ({ counts, review }) => {
  const highRiskCount = (counts.CRITICAL || 0) + (counts.HIGH || 0);
  const qualityRisk = review.codeQuality.length || counts.MEDIUM || counts.LOW ? "medium" : "low";
  const securityRisk = review.security.some((finding) => ["CRITICAL", "HIGH"].includes(finding.severity))
    ? "high"
    : review.security.length
      ? "medium"
      : "low";
  const topRisks = [
    ...review.release.risks,
    ...(review.regressionRisk.reason ? [review.regressionRisk.reason] : []),
    ...review.findings.slice(0, 2).map((finding) => finding.title).filter(Boolean),
  ].slice(0, 5);

  return (
    <>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Release", review.release.readiness],
          ["Security", securityRisk],
          ["Quality", qualityRisk],
          ["Regression", review.regressionRisk.level],
        ].map(([label, value]) => (
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2" key={label}>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
            <p className="mt-2 text-base font-semibold capitalize text-slate-950">{String(value).replace(/_/g, " ")}</p>
          </div>
        ))}
      </div>

      <ReviewSection title="Top Risks">
        <SimpleList emptyText="No major release risks identified." items={topRisks} />
      </ReviewSection>

      <ReviewSection title="QA Readiness">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <RiskBadge value={review.testing.risk} />
          <p className="mt-3 text-sm text-slate-700">
            {review.testing.recommendedTests.length
              ? `${review.testing.recommendedTests.length} AI-recommended QA checks should be executed.`
              : "No extra AI-recommended QA checks."}
          </p>
        </div>
      </ReviewSection>

      <ReviewSection title="Team Action">
        <SimpleList
          emptyText="No team action recommended."
          items={[
            highRiskCount ? `Developer: Review ${highRiskCount} critical/high finding${highRiskCount === 1 ? "" : "s"}.` : "Developer: No critical/high findings.",
            review.testing.recommendedTests.length ? `QA: Execute ${review.testing.recommendedTests.length} recommended tests.` : "QA: Continue normal test flow.",
            ...review.release.recommendations.map((item) => `Manager: ${item}`),
          ]}
        />
      </ReviewSection>
    </>
  );
};

const ReviewDetailDialog = ({ activity, onOpenChange, onRunAgain, open, review, role, running }) => {
  const safeActivity = normalizeActivity(activity);
  const safeReview = useMemo(() => normalizeAiReview(review), [review]);
  const allFindings = useMemo(
    () => [
      ...safeReview.findings,
      ...safeReview.security,
      ...safeReview.performance,
      ...safeReview.codeQuality,
    ],
    [safeReview]
  );
  const counts = getAiFindingCounts(allFindings);
  const perspective = getAiReviewPerspective(role);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:p-0">
        <div className="border-b border-slate-200 px-6 py-5 sm:px-8">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-600" aria-hidden="true" />
              {getRoleReviewTitle(role)}
            </DialogTitle>
            <DialogDescription>
              {safeActivity.branch || "Branch"} - {String(safeActivity.commitSha || "").slice(0, 7) || "No SHA"}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[calc(88vh-96px)] overflow-y-auto px-6 py-5 sm:px-8">
          <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <ReviewScore review={safeReview} />
            <div className="min-w-0">
              <Badge className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">{safeReview.rating || AI_REVIEW_STATUS_LABEL[safeReview.status] || "Review"}</Badge>
              <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-950">
                {safeActivity.commitMessage || "Commit review"}
              </p>
              {safeReview.reviewedAt ? (
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Reviewed {formatDateTime(safeReview.reviewedAt)}
                </p>
              ) : null}
            </div>
            <Button className="h-9 rounded-xl" disabled={running || !safeActivity.commitSha} onClick={onRunAgain} type="button" variant="outline">
              {running ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCcw className="h-4 w-4" aria-hidden="true" />}
              Run Again
            </Button>
          </div>

          {safeReview.summary ? (
            <p className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm leading-6 text-slate-700">
              {safeReview.summary}
            </p>
          ) : null}

          {perspective === "tester" ? (
            <TesterReview review={safeReview} />
          ) : perspective === "manager" ? (
            <ManagerReview counts={counts} review={safeReview} />
          ) : (
            <DeveloperReview counts={counts} review={safeReview} />
          )}

          {safeReview.positiveObservations.length ? (
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Good Signals</p>
              <ul className="mt-3 space-y-2">
                {safeReview.positiveObservations.map((item, index) => (
                  <li className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" key={`${item}-${index}`}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AiCodeReviewPanelContent = ({
  activity = {},
  className,
  dashboard = false,
  project,
  showTitle = true,
  surface = true,
}) => {
  const safeActivity = normalizeActivity(activity);
  const { user } = useAuth();
  const userRole = user?.role || "";
  const [review, setReview] = useState(normalizeAiReview(safeActivity.aiReview));
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const projectId = getProjectId(project);
  const commitSha = safeActivity.commitSha || "";
  const canRun = Boolean(projectId && commitSha);
  const safeReview = useMemo(() => normalizeAiReview(review), [review]);
  const viewState = useMemo(
    () => getAiReviewViewState({ review: safeReview, running }),
    [safeReview, running]
  );
  const status = viewState.status;

  useEffect(() => {
    setReview(normalizeAiReview(safeActivity.aiReview));
    setError("");
  }, [safeActivity.aiReview, commitSha]);

  const handleRunReview = async ({ forceRefresh = false } = {}) => {
    if (!canRun) {
      return;
    }

    setRunning(true);
    setError("");
    setReview((current) => ({ ...defaultAiReview, ...current, status: "REVIEWING", error: "" }));

    try {
      const response = await runAiCodeReview({
        projectId,
        commitSha,
        forceRefresh,
      });
      setReview(response.review || defaultAiReview);
      setOpen(true);
    } catch (requestError) {
      const nextReview = requestError?.response?.data?.review || {
        status: "FAILED",
        error: requestError?.response?.data?.message || "Unable to complete review.",
      };

      setReview(nextReview);
      setError(nextReview.error || requestError?.response?.data?.message || "Unable to complete review.");
    } finally {
      setRunning(false);
    }
  };

  if (dashboard) {
    const score = safeReview.status === "COMPLETED" ? safeReview.score ?? "-" : "--";
    const ringTone =
      safeReview.status === "COMPLETED"
        ? safeReview.score >= 85
          ? "from-emerald-400 via-cyan-400 to-blue-500"
          : safeReview.score >= 65
            ? "from-amber-300 via-orange-400 to-blue-500"
            : "from-rose-400 via-orange-400 to-blue-500"
        : status === "REVIEWING"
          ? "from-blue-400 via-cyan-300 to-emerald-300"
          : "from-slate-300 via-blue-200 to-cyan-300";

    return (
      <div
        className={cn(
          "relative flex min-h-[224px] flex-1 flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]",
          className
        )}
      >
        <motion.div
          aria-hidden="true"
          animate={{ rotate: 360 }}
          className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-[conic-gradient(from_90deg,#22d3ee,#4f46e5,#10b981,#22d3ee)] opacity-15 blur-xl"
          transition={{ duration: 18, ease: "linear", repeat: Infinity }}
        />
        <motion.div
          aria-hidden="true"
          animate={{ opacity: [0.35, 0.65, 0.35], scale: [1, 1.06, 1] }}
          className="pointer-events-none absolute inset-x-10 bottom-20 h-px bg-gradient-to-r from-transparent via-blue-300 to-transparent"
          transition={{ duration: 2.8, ease: "easeInOut", repeat: Infinity }}
        />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            {showTitle ? (
              <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                AI Code Review
              </p>
            ) : null}
            <div className={cn("flex flex-wrap items-center gap-2", showTitle && "mt-2")}>
              <Badge className="rounded-full border-white/80 bg-white/80 px-2.5 py-1 text-slate-700 shadow-sm" variant="outline">
                {viewState.statusLabel}
              </Badge>
              {safeReview.status === "FAILED" ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  {safeReview.error || error || "Unable to complete review."}
                </span>
              ) : null}
              {status === "REVIEWING" ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Analyzing changes
                </span>
              ) : null}
            </div>
          </div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/80 bg-white/85 text-blue-600 shadow-sm">
            <Bot className="h-5 w-5" aria-hidden="true" />
          </span>
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center py-4 text-center">
          <motion.div
            animate={status === "REVIEWING" ? { scale: [1, 1.035, 1] } : { scale: 1 }}
            className={cn("rounded-full bg-gradient-to-br p-[3px] shadow-[0_20px_54px_-30px_rgba(37,99,235,0.75)]", ringTone)}
            transition={{ duration: 1.6, ease: "easeInOut", repeat: status === "REVIEWING" ? Infinity : 0 }}
          >
            <div className="grid h-28 w-28 place-items-center rounded-full bg-white">
              <div>
                <p className="text-4xl font-bold tracking-normal text-slate-950">{score}</p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Score
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="relative mt-auto grid gap-2 sm:grid-cols-2">
          {safeReview.status === "COMPLETED" ? (
            <Button className="h-10 rounded-xl border-white/80 bg-white/90 shadow-sm" onClick={() => setOpen(true)} type="button" variant="outline">
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              View Report
            </Button>
          ) : null}
          <Button
            className={cn(
              "h-10 rounded-xl bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 text-slate-950 shadow-[0_14px_34px_-22px_rgba(245,158,11,0.85)] hover:from-amber-400 hover:via-yellow-500 hover:to-amber-600",
              safeReview.status !== "COMPLETED" && "sm:col-span-2"
            )}
            disabled={!canRun || running}
            onClick={() => handleRunReview({ forceRefresh: false })}
            type="button"
          >
            {running ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : safeReview.status === "COMPLETED" ? <RefreshCcw className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            {safeReview.status === "COMPLETED" ? "Regenerate" : viewState.buttonLabel}
          </Button>
        </div>

        {error && safeReview.status !== "FAILED" ? (
          <p className="relative mt-2 text-xs font-semibold text-rose-700">{error}</p>
        ) : null}

        <ReviewDetailDialog
          activity={safeActivity}
          onOpenChange={setOpen}
          onRunAgain={() => handleRunReview({ forceRefresh: true })}
          open={open}
          role={userRole}
          review={safeReview}
          running={running}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        surface && "rounded-2xl border border-blue-100 bg-blue-50/40 px-3 py-3",
        !surface && "px-0 py-0",
        className
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          {showTitle ? (
            <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              AI Code Review
            </p>
          ) : null}
          <div className={cn("flex flex-wrap items-center gap-2", showTitle && "mt-2")}>
            <Badge className="rounded-full bg-white px-2.5 py-1 text-slate-700" variant="outline">
              {viewState.statusLabel}
            </Badge>
            {safeReview.status === "COMPLETED" ? (
              <>
                <span className="text-sm font-semibold text-slate-950">{viewState.scoreLabel || `${safeReview.score ?? "-"} score`}</span>
                <span className="text-xs font-semibold text-slate-500">{viewState.highRiskCount} high risk</span>
              </>
            ) : null}
            {safeReview.status === "FAILED" ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {safeReview.error || error || "Unable to complete review."}
              </span>
            ) : null}
            {status === "REVIEWING" ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Analyzing changes
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {safeReview.status === "COMPLETED" ? (
            <Button className="h-9 rounded-xl" onClick={() => setOpen(true)} type="button" variant="outline">
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              View AI Review
            </Button>
          ) : null}
          <Button className="h-9 rounded-xl bg-yellow-400 text-slate-950 hover:bg-yellow-500" disabled={!canRun || running} onClick={() => handleRunReview({ forceRefresh: false })} type="button">
            {running ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : safeReview.status === "COMPLETED" ? <RefreshCcw className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            {viewState.buttonLabel}
          </Button>
        </div>
      </div>

      {error && safeReview.status !== "FAILED" ? (
        <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p>
      ) : null}

      <ReviewDetailDialog
        activity={safeActivity}
        onOpenChange={setOpen}
        onRunAgain={() => handleRunReview({ forceRefresh: true })}
        open={open}
        role={userRole}
        review={safeReview}
        running={running}
      />
    </div>
  );
};

export const AiCodeReviewPanel = (props) => (
  <AiCodeReviewErrorBoundary className={props.className}>
    <AiCodeReviewPanelContent {...props} />
  </AiCodeReviewErrorBoundary>
);

export default AiCodeReviewPanel;
