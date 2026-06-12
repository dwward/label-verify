import { CONFIDENCE_THRESHOLD } from "./config";
import type {
  VerificationResult,
  WorkflowState,
  QueueItem,
  BatchStatistics,
} from "./types";

/**
 * Determine workflow state based on verification result
 * Routes to auto_passed or needs_review based on confidence and verdict
 */
export function triageApplication(
  result: VerificationResult | undefined
): WorkflowState {
  if (!result || !result.verdicts || result.verdicts.length === 0) {
    return "error";
  }

  const { overall, applicationConfidence } = result;

  // Auto-pass conditions:
  // 1. Overall verdict is MATCH
  // 2. Application confidence >= threshold (0.85)
  // 3. No fields flagged for review
  if (
    overall === "MATCH" &&
    applicationConfidence &&
    applicationConfidence.overall >= CONFIDENCE_THRESHOLD &&
    !applicationConfidence.needsReview
  ) {
    return "auto_passed";
  }

  // Everything else needs review
  return "needs_review";
}

/**
 * Calculate batch statistics from queue items
 */
export function calculateBatchStatistics(
  queue: QueueItem[]
): BatchStatistics {
  const completed = queue.filter(
    (item) => item.status === "completed" && item.result
  );

  // Count by workflow state
  const byWorkflowState: Partial<Record<WorkflowState, number>> = {};
  completed.forEach((item) => {
    const state = item.workflowState || "needs_review";
    byWorkflowState[state] = (byWorkflowState[state] || 0) + 1;
  });

  // Count by verdict
  const byVerdict = {
    match: completed.filter((item) => item.result?.overall === "MATCH").length,
    mismatch: completed.filter((item) => item.result?.overall === "MISMATCH")
      .length,
    needsReview: completed.filter(
      (item) => item.result?.overall === "NEEDS_REVIEW"
    ).length,
  };

  // Calculate average confidence
  const confidences = completed
    .map((item) => item.result?.applicationConfidence?.overall || 0)
    .filter((c) => c > 0);
  const averageConfidence =
    confidences.length > 0
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : 0;

  // Calculate processing time stats
  const times = completed
    .map((item) => item.result?.processingMs || 0)
    .filter((t) => t > 0);
  const processingTimeMs =
    times.length > 0
      ? {
          min: Math.min(...times),
          max: Math.max(...times),
          avg: times.reduce((sum, t) => sum + t, 0) / times.length,
        }
      : { min: 0, max: 0, avg: 0 };

  // Calculate auto-pass rate
  const autoPassCount = byWorkflowState.auto_passed || 0;
  const autoPassRate =
    completed.length > 0 ? autoPassCount / completed.length : 0;

  // Review queue size
  const reviewQueueSize = byWorkflowState.needs_review || 0;

  return {
    total: queue.length,
    byWorkflowState,
    byVerdict,
    averageConfidence: Math.round(averageConfidence * 100) / 100,
    processingTimeMs: {
      min: Math.round(processingTimeMs.min),
      max: Math.round(processingTimeMs.max),
      avg: Math.round(processingTimeMs.avg),
    },
    autoPassRate: Math.round(autoPassRate * 100) / 100,
    reviewQueueSize,
  };
}
