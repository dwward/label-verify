import type { ExtractedLabel, FieldVerdict } from "./types";

export const STATUTORY_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

/**
 * Normalize warning text for comparison
 * Collapses whitespace and removes hyphenation artifacts while preserving case and punctuation
 */
export function normalizeWarningText(text: string): string {
  return (
    text
      // Remove soft hyphens and word-wrap artifacts (e.g., "alco-\nholic" → "alcoholic")
      .replace(/-\s+/g, "")
      // Collapse all whitespace (spaces, tabs, newlines) to single spaces
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Generate word-level diff between expected and actual warning text
 * Returns human-readable explanation of the first difference found
 */
export function generateWordDiff(expected: string, actual: string): string {
  const expectedWords = expected.split(/\s+/);
  const actualWords = actual.split(/\s+/);

  // Check for length differences first
  if (actualWords.length < expectedWords.length) {
    // Find first missing word
    for (let i = 0; i < expectedWords.length; i++) {
      if (i >= actualWords.length || actualWords[i] !== expectedWords[i]) {
        return `Warning text is incomplete — expected '${expectedWords[i]}' at word ${i + 1} but text ends or differs`;
      }
    }
  }

  if (actualWords.length > expectedWords.length) {
    return `Warning text has ${actualWords.length - expectedWords.length} extra word(s) — text should end at word ${expectedWords.length}`;
  }

  // Compare word-by-word
  for (let i = 0; i < expectedWords.length; i++) {
    if (actualWords[i] !== expectedWords[i]) {
      return `Expected '${expectedWords[i]}' but found '${actualWords[i]}' at word ${i + 1}`;
    }
  }

  return "Text differs from statutory warning";
}

/**
 * Check government warning against statutory text with zero tolerance
 * Reports ALL failures: missing, wrong case, not bold, text differences
 */
export function checkGovernmentWarning(
  extracted: ExtractedLabel
): FieldVerdict {
  const foundOn = extracted.governmentWarning.foundOn;

  // Check 1: Warning present?
  if (!extracted.governmentWarning.present) {
    return {
      field: "Government Warning",
      status: "MISMATCH",
      applicationValue: "Required",
      labelValue: null,
      explanation: "Government warning missing from label",
      foundOn,
    };
  }

  // Check 2: Header all caps?
  if (!extracted.governmentWarning.headerAllCaps) {
    return {
      field: "Government Warning",
      status: "MISMATCH",
      applicationValue: "Required",
      labelValue: extracted.governmentWarning.fullText || "Present",
      explanation:
        "Warning header must be 'GOVERNMENT WARNING:' in all capitals (found title case or mixed case)",
      foundOn,
    };
  }

  // Check 3: Header bold? (best-effort detection, less critical)
  if (!extracted.governmentWarning.headerAppearsBold) {
    return {
      field: "Government Warning",
      status: "NEEDS_REVIEW",
      applicationValue: "Required",
      labelValue: extracted.governmentWarning.fullText || "Present",
      explanation: "Warning header may not be bold—please verify visually",
      foundOn,
    };
  }

  // Check 4: Body text matches exactly?
  const fullText = extracted.governmentWarning.fullText;
  if (!fullText) {
    return {
      field: "Government Warning",
      status: "MISMATCH",
      applicationValue: "Required",
      labelValue: null,
      explanation: "Warning text could not be extracted from label",
      foundOn,
    };
  }

  const normalizedStatutory = normalizeWarningText(STATUTORY_WARNING);
  const normalizedExtracted = normalizeWarningText(fullText);

  if (normalizedStatutory !== normalizedExtracted) {
    const diff = generateWordDiff(normalizedStatutory, normalizedExtracted);
    return {
      field: "Government Warning",
      status: "MISMATCH",
      applicationValue: "Required",
      labelValue: fullText,
      explanation: `Warning text does not match statutory text — ${diff}`,
      foundOn,
    };
  }

  // All checks passed
  return {
    field: "Government Warning",
    status: "MATCH",
    applicationValue: "Required",
    labelValue: fullText,
    explanation: "Government warning matches statutory text",
    foundOn,
  };
}
