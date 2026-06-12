export const ANTHROPIC_MODEL = "claude-haiku-4-5" as const;
export const ANTHROPIC_MAX_TOKENS = 1500;
export const ANTHROPIC_TIMEOUT_MS = 15000;
export const IMAGE_MAX_DIMENSION = 2048;
export const IMAGE_QUALITY = 0.85;
export const IMAGE_MAX_SIZE_MB = 4.5;

// Confidence thresholds for batch triage workflow
export const CONFIDENCE_THRESHOLD = 0.85; // Auto-pass if >= this and MATCH
export const LOW_CONFIDENCE_THRESHOLD = 0.60; // Flag for careful review
