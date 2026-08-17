import { Component, useEffect, useMemo, useState } from "react";
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
  getAiReviewViewState,
} from "@/lib/ai-code-review";
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
const normalizeReview = (review = {}) => ({
  ...defaultAiReview,
  ...(review && typeof review === "object" ? review : {}),
  findings: Array.isArray(review?.findings) ? review.findings : [],
  testingRecommendations: Array.isArray(review?.testingRecommendations)
    ? review.testingRecommendations
    : [],
  positiveObservations: Array.isArray(review?.positiveObservations)
    ? review.positiveObservations
    : [],
});
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
    finding.recommendation ? `Recommendation: ${finding.recommendation}` : "",
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

const FindingList = ({ findings = [] }) => {
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
              <p className="mt-1 break-all text-xs font-semibold text-slate-500">
                {finding.file || "Unknown file"}
                {finding.line ? `:${finding.line}` : ""}
              </p>
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
          {finding.recommendation ? (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              <span className="font-semibold text-slate-900">Recommendation:</span> {finding.recommendation}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
};

const ReviewDetailDialog = ({ activity, onOpenChange, onRunAgain, open, review, running }) => {
  const safeActivity = normalizeActivity(activity);
  const safeReview = useMemo(() => normalizeReview(review), [review]);
  const counts = getAiFindingCounts(safeReview.findings);
  const findingTotal = safeReview.findings.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:p-0">
        <div className="border-b border-slate-200 px-6 py-5 sm:px-8">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-600" aria-hidden="true" />
              AI Code Review
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

          <div className="mt-4 grid gap-2 sm:grid-cols-5">
            {["CRITICAL", "HIGH", "MEDIUM", "LOW", "SUGGESTION"].map((severity) => (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center" key={severity}>
                <p className="text-lg font-semibold text-slate-950">{counts[severity] || 0}</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{severity}</p>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Findings</p>
              <span className="text-xs font-semibold text-slate-500">{findingTotal} total</span>
            </div>
            <FindingList findings={safeReview.findings} />
          </div>

          {safeReview.testingRecommendations.length ? (
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Testing</p>
              <ul className="mt-3 space-y-2">
                {safeReview.testingRecommendations.map((item, index) => (
                  <li className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" key={`${item}-${index}`}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

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
  project,
  showTitle = true,
  surface = true,
}) => {
  const safeActivity = normalizeActivity(activity);
  const [review, setReview] = useState(normalizeReview(safeActivity.aiReview));
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const projectId = getProjectId(project);
  const commitSha = safeActivity.commitSha || "";
  const canRun = Boolean(projectId && commitSha);
  const safeReview = normalizeReview(review);
  const viewState = useMemo(
    () => getAiReviewViewState({ review: safeReview, running }),
    [safeReview, running]
  );
  const status = viewState.status;

  useEffect(() => {
    setReview(normalizeReview(safeActivity.aiReview));
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
          <Button className="h-9 rounded-xl bg-blue-600 text-white hover:bg-blue-700" disabled={!canRun || running} onClick={() => handleRunReview({ forceRefresh: false })} type="button">
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
