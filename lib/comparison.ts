import type {
  ApplicationData,
  ExtractedLabel,
  FieldVerdict,
  VerdictStatus,
} from "./types";
import { checkGovernmentWarning } from "./warning-text";

/**
 * Normalize text for comparison: lowercase, trim, collapse whitespace,
 * strip quotes, normalize typographic apostrophes
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ") // collapse whitespace
    .replace(/^["']|["']$/g, "") // strip surrounding quotes
    .replace(/['']/g, "'"); // normalize apostrophes
}

/**
 * Calculate Levenshtein distance between two strings
 * Standard dynamic programming implementation
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize first column (distance from empty string)
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row (distance from empty string)
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Calculate string similarity ratio (0 to 1)
 * 1 = identical, 0 = completely different
 */
function stringSimilarity(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1; // both strings empty
  return 1 - distance / maxLength;
}

/**
 * Compare brand name or class/type fields
 * M2: Exact match after normalization, fuzzy matching with Levenshtein distance
 */
export function compareBrandOrClass(
  fieldName: string,
  appValue: string,
  labelValue: string | null
): FieldVerdict {
  if (!labelValue) {
    return {
      field: fieldName,
      status: "MISMATCH",
      applicationValue: appValue,
      labelValue: null,
      explanation: "Not found on label",
    };
  }

  const normalizedApp = normalize(appValue);
  const normalizedLabel = normalize(labelValue);

  if (normalizedApp === normalizedLabel) {
    const explanation =
      appValue !== labelValue
        ? "Differs only in capitalization/spacing"
        : "Exact match";
    return {
      field: fieldName,
      status: "MATCH",
      applicationValue: appValue,
      labelValue,
      explanation,
    };
  }

  // M2: Check similarity using Levenshtein distance
  const similarity = stringSimilarity(normalizedApp, normalizedLabel);

  if (similarity >= 0.9) {
    return {
      field: fieldName,
      status: "NEEDS_REVIEW",
      applicationValue: appValue,
      labelValue,
      explanation:
        "Very similar but not identical—possible typo or OCR artifact",
    };
  }

  return {
    field: fieldName,
    status: "MISMATCH",
    applicationValue: appValue,
    labelValue,
    explanation: `${fieldName} does not match`,
  };
}

/**
 * Parse percentage from alcohol content string
 * Handles formats like "45% Alc./Vol.", "45 % ALC/VOL", "Alc. 45% by Vol."
 */
function parsePercentage(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Parse proof from alcohol content string and convert to ABV
 * Proof ÷ 2 = ABV (e.g., "90 Proof" = 45% ABV)
 */
function parseProof(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*proof/i);
  return match ? parseFloat(match[1]) / 2 : null;
}

/**
 * Compare alcohol content
 * M2: Handles both percentage and proof notation with internal consistency check
 */
export function compareAlcoholContent(
  appValue: string,
  labelValue: string | null
): FieldVerdict {
  if (!labelValue) {
    return {
      field: "Alcohol Content",
      status: "MISMATCH",
      applicationValue: appValue,
      labelValue: null,
      explanation: "Not found on label",
    };
  }

  // Parse application value (try percentage first, then proof)
  let appPercent = parsePercentage(appValue);
  if (appPercent === null) {
    appPercent = parseProof(appValue);
  }

  if (appPercent === null) {
    return {
      field: "Alcohol Content",
      status: "NEEDS_REVIEW",
      applicationValue: appValue,
      labelValue,
      explanation: "Cannot parse percentage from application data",
    };
  }

  // Parse label value (try percentage first, then proof)
  let labelPercent = parsePercentage(labelValue);
  const labelProof = parseProof(labelValue);

  // Check for internal consistency if both percentage and proof are present
  if (labelPercent !== null && labelProof !== null) {
    if (Math.abs(labelPercent - labelProof) >= 0.01) {
      return {
        field: "Alcohol Content",
        status: "NEEDS_REVIEW",
        applicationValue: appValue,
        labelValue,
        explanation:
          "Label shows inconsistent ABV and proof values—verify with applicant",
      };
    }
  }

  // Use proof conversion if percentage not found
  if (labelPercent === null) {
    labelPercent = labelProof;
  }

  if (labelPercent === null) {
    return {
      field: "Alcohol Content",
      status: "NEEDS_REVIEW",
      applicationValue: appValue,
      labelValue,
      explanation: "Cannot parse percentage from label",
    };
  }

  // Allow 0.01 tolerance for floating point comparison
  if (Math.abs(appPercent - labelPercent) < 0.01) {
    return {
      field: "Alcohol Content",
      status: "MATCH",
      applicationValue: appValue,
      labelValue,
      explanation: "Alcohol content matches",
    };
  }

  return {
    field: "Alcohol Content",
    status: "MISMATCH",
    applicationValue: appValue,
    labelValue,
    explanation: `Label shows ${labelPercent}% but application states ${appPercent}%`,
  };
}

/**
 * Parse volume from net contents string
 * Returns value in mL
 */
function parseVolume(text: string): { value: number; unit: string } | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(ml|mL|ML|l|L)\b/i);
  if (!match) return null;

  let value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  // Normalize to mL
  if (unit === "l") {
    value *= 1000;
  }

  return { value, unit: "mL" };
}

/**
 * Compare net contents
 */
export function compareNetContents(
  appValue: string,
  labelValue: string | null
): FieldVerdict {
  if (!labelValue) {
    return {
      field: "Net Contents",
      status: "MISMATCH",
      applicationValue: appValue,
      labelValue: null,
      explanation: "Not found on label",
    };
  }

  const appVolume = parseVolume(appValue);
  const labelVolume = parseVolume(labelValue);

  if (!appVolume) {
    return {
      field: "Net Contents",
      status: "NEEDS_REVIEW",
      applicationValue: appValue,
      labelValue,
      explanation: "Cannot parse volume from application data",
    };
  }

  if (!labelVolume) {
    return {
      field: "Net Contents",
      status: "NEEDS_REVIEW",
      applicationValue: appValue,
      labelValue,
      explanation: "Cannot parse volume from label",
    };
  }

  if (Math.abs(appVolume.value - labelVolume.value) < 0.01) {
    return {
      field: "Net Contents",
      status: "MATCH",
      applicationValue: appValue,
      labelValue,
      explanation: "Net contents matches",
    };
  }

  return {
    field: "Net Contents",
    status: "MISMATCH",
    applicationValue: appValue,
    labelValue,
    explanation: `Label shows ${labelVolume.value} mL but application states ${appVolume.value} mL`,
  };
}


/**
 * Calculate overall verdict from individual field verdicts
 * MISMATCH > NEEDS_REVIEW > MATCH
 */
export function calculateOverallVerdict(
  verdicts: FieldVerdict[]
): VerdictStatus {
  if (verdicts.some((v) => v.status === "MISMATCH")) return "MISMATCH";
  if (verdicts.some((v) => v.status === "NEEDS_REVIEW")) return "NEEDS_REVIEW";
  return "MATCH";
}

/**
 * Main verification function
 * Compares application data against extracted label data
 */
export function verifyLabel(
  appData: ApplicationData,
  extracted: ExtractedLabel
): FieldVerdict[] {
  const verdicts: FieldVerdict[] = [];

  // If image quality is low, cap all verdicts to NEEDS_REVIEW
  if (
    extracted.imageQuality.confidence === "low" ||
    !extracted.imageQuality.readable
  ) {
    return [
      {
        field: "Overall",
        status: "NEEDS_REVIEW",
        applicationValue: "All fields",
        labelValue: null,
        explanation:
          "Image quality too low for confident verification — request a clearer image",
      },
    ];
  }

  // Brand name
  verdicts.push(
    compareBrandOrClass("Brand Name", appData.brandName, extracted.brandName)
  );

  // Class/Type
  verdicts.push(
    compareBrandOrClass("Class/Type", appData.classType, extracted.classType)
  );

  // Alcohol content
  verdicts.push(
    compareAlcoholContent(appData.alcoholContent, extracted.alcoholContent)
  );

  // Net contents
  verdicts.push(
    compareNetContents(appData.netContents, extracted.netContents)
  );

  // Government warning (basic check for M1)
  verdicts.push(checkGovernmentWarning(extracted));

  return verdicts;
}
