import type {
  ApplicationData,
  ExtractedLabel,
  FieldVerdict,
  VerdictStatus,
} from "./types";

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
 * Compare brand name or class/type fields
 * M1: Simple exact match after normalization, otherwise NEEDS_REVIEW
 * (Levenshtein distance deferred to M2)
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

  // M1: Any difference → NEEDS_REVIEW (fuzzy matching in M2)
  return {
    field: fieldName,
    status: "NEEDS_REVIEW",
    applicationValue: appValue,
    labelValue,
    explanation: "Not an exact match — please verify visually",
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
 * Compare alcohol content
 * M1: Simple percentage parsing (proof conversion deferred to M2)
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

  const appPercent = parsePercentage(appValue);
  const labelPercent = parsePercentage(labelValue);

  if (appPercent === null) {
    return {
      field: "Alcohol Content",
      status: "NEEDS_REVIEW",
      applicationValue: appValue,
      labelValue,
      explanation: "Cannot parse percentage from application data",
    };
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
 * Basic government warning check
 * M1: Simple presence check only (exact-match logic deferred to M2)
 */
function checkGovernmentWarning(extracted: ExtractedLabel): FieldVerdict {
  if (!extracted.governmentWarning.present) {
    return {
      field: "Government Warning",
      status: "MISMATCH",
      applicationValue: "Required",
      labelValue: null,
      explanation: "Government warning missing from label",
    };
  }

  return {
    field: "Government Warning",
    status: "NEEDS_REVIEW",
    applicationValue: "Required",
    labelValue: "Present",
    explanation:
      "Warning present — full text verification deferred to detailed review",
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
