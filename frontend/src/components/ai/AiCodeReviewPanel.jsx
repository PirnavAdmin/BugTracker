import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
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
            <Badge className={cn("rounded-full border px-2.5 py-1", severityTone[finding.severity] || severityTone.SUGGESTION)} variant="outline">
              {finding.severity || "SUGGESTION"}
            </Badge>
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
  const counts = getAiFindingCounts(review.findings);
  const findingTotal = Array.isArray(review.findings) ? review.findings.length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:p-0">
        <div className="border-b border-slate-200 px-6 py-5 sm:px-8">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-600" />
              AI Code Review
            </DialogTitle>
            <DialogDescription>
              {activity.branch || "Branch"} - {String(activity.commitSha || "").slice(0, 7) || "No SHA"}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[calc(88vh-96px)] overflow-y-auto px-6 py-5 sm:px-8">
          <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <ReviewScore review={review} />
            <div className="min-w-0">
              <Badge className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">{review.rating || AI_REVIEW_STATUS_LABEL[review.status] || "Review"}</Badge>
              <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-950">
                {activity.commitMessage || "Commit review"}
              </p>
              {review.reviewedAt ? (
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Reviewed {formatDateTime(review.reviewedAt)}
                </p>
              ) : null}
            </div>
            <Button className="h-9 rounded-xl" disabled={running || !activity.commitSha} onClick={onRunAgain} type="button" variant="outline">
              {running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Run Again
            </Button>
          </div>

          {review.summary ? (
            <p className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm leading-6 text-slate-700">
              {review.summary}
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
            <FindingList findings={review.findings} />
          </div>

          {review.testingRecommendations?.length ? (
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Testing</p>
              <ul className="mt-3 space-y-2">
                {review.testingRecommendations.map((item, index) => (
                  <li className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" key={`${item}-${index}`}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {review.positiveObservations?.length ? (
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Good Signals</p>
              <ul className="mt-3 space-y-2">
                {review.positiveObservations.map((item, index) => (
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

export const AiCodeReviewPanel = ({ activity = {}, className, project }) => {
  const [review, setReview] = useState(activity.aiReview || defaultAiReview);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const projectId = getProjectId(project);
  const commitSha = activity.commitSha || "";
  const canRun = Boolean(projectId && commitSha);
  const viewState = useMemo(
    () => getAiReviewViewState({ review, running }),
    [review, running]
  );
  const status = viewState.status;

  useEffect(() => {
    setReview(activity.aiReview || defaultAiReview);
    setError("");
  }, [activity.aiReview, commitSha]);

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
    <div className={cn("rounded-2xl border border-blue-100 bg-blue-50/40 px-3 py-3", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">
            <Sparkles className="h-3.5 w-3.5" />
            AI Code Review
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-white px-2.5 py-1 text-slate-700" variant="outline">
              {viewState.statusLabel}
            </Badge>
            {review.status === "COMPLETED" ? (
              <>
                <span className="text-sm font-semibold text-slate-950">{viewState.scoreLabel || `${review.score ?? "-"} score`}</span>
                <span className="text-xs font-semibold text-slate-500">{viewState.highRiskCount} high risk</span>
              </>
            ) : null}
            {review.status === "FAILED" ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                {review.error || error || "Unable to complete review."}
              </span>
            ) : null}
            {status === "REVIEWING" ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                Analyzing changes
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {review.status === "COMPLETED" ? (
            <Button className="h-9 rounded-xl" onClick={() => setOpen(true)} type="button" variant="outline">
              <ShieldAlert className="h-4 w-4" />
              View AI Review
            </Button>
          ) : null}
          <Button className="h-9 rounded-xl bg-blue-600 text-white hover:bg-blue-700" disabled={!canRun || running} onClick={() => handleRunReview({ forceRefresh: false })} type="button">
            {running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : review.status === "COMPLETED" ? <RefreshCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {viewState.buttonLabel}
          </Button>
        </div>
      </div>

      {error && review.status !== "FAILED" ? (
        <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p>
      ) : null}

      <ReviewDetailDialog
        activity={activity}
        onOpenChange={setOpen}
        onRunAgain={() => handleRunReview({ forceRefresh: true })}
        open={open}
        review={review}
        running={running}
      />
    </div>
  );
};

export default AiCodeReviewPanel;
