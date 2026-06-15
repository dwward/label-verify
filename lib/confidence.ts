import type {
  FieldVerdict,
  FieldConfidence,
  ApplicationConfidence,
  ExtractedLabel,
  VerdictStatus,
} from "./types";
import { CONFIDENCE_THRESHOLD } from "./config";

/**
 * Calculate confidence score for a field verdict based on:
 * - Image quality (high/medium/low → 1.0/0.75/0.5 multiplier)
 * - Field extraction success (found = 1.0, not found = 0.5 max)
 * - Comparison strength (exact match, fuzzy match, numeric match, etc.)
 */
export function calculateFieldConfidence(
  verdict: FieldVerdict,
  imageQuality: "high" | "medium" | "low" | "error",
  similarityScore?: number // For fuzzy matches (0-1)
): FieldConfidence {
  const { status, labelValue } = verdict;

  // Handle API/network errors
  if (imageQuality === "error") {
    return {
      score: 0.0,
      reason: "API or network error - verification failed",
    };
  }

  // Base multiplier from image quality
  const qualityMultiplier = imageQuality === "high" ? 1.0 : imageQuality === "medium" ? 0.75 : 0.5;

  let baseScore = 1.0;
  let reason = "";

  // Field not found on label
  if (labelValue === null) {
    baseScore = 0.5; // Max 50% confidence if field not found
    reason = "Field not found on label";
  }
  // MATCH status
  else if (status === "MATCH") {
    if (similarityScore !== undefined) {
      // Fuzzy match - use similarity score (0.9-1.0 range)
      baseScore = similarityScore;
      reason =
        similarityScore >= 0.98
          ? "Exact match"
          : `Very similar (${Math.round(similarityScore * 100)}% match)`;
    } else {
      // Exact match
      baseScore = 1.0;
      reason = "Exact match";
    }
  }
  // NEEDS_REVIEW status
  else if (status === "NEEDS_REVIEW") {
    if (similarityScore !== undefined && similarityScore >= 0.9) {
      // Near match (fuzzy similarity 0.9-0.95)
      baseScore = 0.85;
      reason = `Possible typo or OCR artifact (${Math.round(similarityScore * 100)}% similar)`;
    } else {
      // Unparseable or low confidence extraction
      baseScore = 0.6;
      reason = "Low confidence extraction or unparseable value";
    }
  }
  // MISMATCH status
  else {
    // Mismatch - high confidence in the detection of mismatch
    baseScore = 0.9;
    reason = "Clear mismatch detected";
  }

  // Apply quality multiplier
  const finalScore = baseScore * qualityMultiplier;

  // Add quality context to reason
  if (imageQuality !== "high") {
    reason += ` (${imageQuality} image quality)`;
  }

  return {
    score: Math.round(finalScore * 100) / 100, // Round to 2 decimals
    reason,
  };
}

/**
 * Calculate confidence for government warning field
 * Binary: all checks pass = 1.0, any fail = 0.0
 */
export function calculateWarningConfidence(
  verdict: FieldVerdict,
  imageQuality: "high" | "medium" | "low" | "error"
): FieldConfidence {
  const { status } = verdict;

  // Handle API/network errors
  if (imageQuality === "error") {
    return {
      score: 0.0,
      reason: "API or network error - verification failed",
    };
  }

  // Apply quality multiplier
  const qualityMultiplier = imageQuality === "high" ? 1.0 : imageQuality === "medium" ? 0.75 : 0.5;

  if (status === "MATCH") {
    return {
      score: qualityMultiplier,
      reason:
        qualityMultiplier === 1.0
          ? "All warning checks passed"
          : `All warning checks passed (${imageQuality} image quality)`,
    };
  } else {
    // Any failure = 0 confidence (critical regulatory field)
    return {
      score: 0.0,
      reason: "Warning text check failed",
    };
  }
}

/**
 * Calculate application-level confidence from field verdicts
 * Uses minimum (weakest link) approach for regulatory compliance
 */
export function calculateApplicationConfidence(
  verdicts: (FieldVerdict & { confidence: FieldConfidence })[]
): ApplicationConfidence {
  if (verdicts.length === 0) {
    return {
      overall: 0.0,
      fieldBreakdown: [],
      needsReview: true,
      reason: "No fields verified",
    };
  }

  // Extract confidence scores
  const fieldBreakdown = verdicts.map((v) => ({
    field: v.field,
    confidence: v.confidence.score,
  }));

  // Overall = minimum confidence (weakest link principle)
  const overall = Math.min(...fieldBreakdown.map((f) => f.confidence));

  // Needs review if overall confidence below threshold OR any field has MISMATCH/NEEDS_REVIEW
  const hasIssues = verdicts.some(
    (v) => v.status === "MISMATCH" || v.status === "NEEDS_REVIEW"
  );
  const needsReview = overall < CONFIDENCE_THRESHOLD || hasIssues;

  // Determine reason (only for items that need review)
  let reason = "";
  if (hasIssues) {
    const issueFields = verdicts
      .filter((v) => v.status === "MISMATCH" || v.status === "NEEDS_REVIEW")
      .map((v) => v.field);
    reason = `Issues detected in: ${issueFields.join(", ")}`;
  } else if (overall < CONFIDENCE_THRESHOLD) {
    const weakestField = fieldBreakdown.sort((a, b) => a.confidence - b.confidence)[0];
    reason = `${weakestField.field} has low confidence (${Math.round(weakestField.confidence * 100)}%)`;
  }
  // No reason needed for passed items (don't set "All fields have high confidence")

  return {
    overall: Math.round(overall * 100) / 100, // Round to 2 decimals
    fieldBreakdown,
    needsReview,
    reason,
  };
}
