export interface ApplicationData {
  brandName: string;
  classType: string; // e.g. "Kentucky Straight Bourbon Whiskey"
  alcoholContent: string; // e.g. "45% Alc./Vol." or "45"
  netContents: string; // e.g. "750 mL"
  bottlerName?: string; // optional for prototype
  countryOfOrigin?: string; // optional, imports only
}

export type VerdictStatus = "MATCH" | "MISMATCH" | "NEEDS_REVIEW";

export interface FieldConfidence {
  score: number; // 0.0 to 1.0
  reason: string; // e.g., "Exact match with high image quality"
}

export interface FieldVerdict {
  field: string; // human-readable field name
  status: VerdictStatus;
  applicationValue: string;
  labelValue: string | null; // null = not found on label
  explanation: string; // one plain-English sentence
  foundOn?: PanelLocation; // which panel this field was found on (G3)
  confidence?: FieldConfidence; // Added for batch triage workflow
}

export type PanelLocation = "front" | "back" | "neck" | "unknown";

export interface ExtractedLabel {
  brandName: string | null;
  brandNameFoundOn?: PanelLocation;
  classType: string | null;
  classTypeFoundOn?: PanelLocation;
  alcoholContent: string | null; // raw text as printed
  alcoholContentFoundOn?: PanelLocation;
  netContents: string | null;
  netContentsFoundOn?: PanelLocation;
  governmentWarning: {
    present: boolean;
    fullText: string | null; // verbatim transcription
    headerAllCaps: boolean; // was "GOVERNMENT WARNING:" in all caps?
    headerAppearsBold: boolean; // best-effort visual judgment
    foundOn?: PanelLocation;
  };
  imageQuality: {
    readable: boolean;
    issues: string[]; // e.g. ["glare on upper left", "slight angle"]
    confidence: "high" | "medium" | "low" | "error"; // "error" = API/network failure
  };
}

export interface ApplicationConfidence {
  overall: number; // Minimum field confidence (weakest link)
  fieldBreakdown: { field: string; confidence: number }[];
  needsReview: boolean; // True if any field < CONFIDENCE_THRESHOLD
  reason: string; // e.g., "Government Warning has low confidence (0.61)"
}

export interface VerificationResult {
  verdicts: FieldVerdict[];
  overall: VerdictStatus; // worst status wins: MISMATCH > NEEDS_REVIEW > MATCH
  processingMs: number;
  imageQualityNote: string | null;
  applicationConfidence?: ApplicationConfidence; // Added for batch triage workflow
}

// CAP format (COLA Application Package) - Part C from M3-AMENDMENT
export interface CAPApplication {
  schemaVersion: string;
  ttbId?: string;
  serialNumber?: string;
  productType?: string; // "DISTILLED_SPIRITS" | "WINE" | "MALT_BEVERAGES"
  source?: string; // "DOMESTIC" | "IMPORTED"
  applicant?: {
    name?: string;
    permitNumber?: string;
    address?: string;
  };
  label: {
    brandName: string;
    fancifulName?: string | null;
    classType: string;
    alcoholContent: string;
    netContents: string;
    bottlerNameAddress?: string | null;
    countryOfOrigin?: string | null;
  };
  images?: Array<{ file: string; panel: string }>;
}

// Workflow states for batch triage
export type WorkflowState =
  | "pending" // Not yet processed
  | "processing" // Currently being verified
  | "auto_passed" // High confidence MATCH, no review needed
  | "needs_review" // Low confidence or has MISMATCH/NEEDS_REVIEW fields
  | "approved" // Human approved
  | "rejected" // Human rejected
  | "error"; // Processing error

// Queue item representing one application to be verified
export interface QueueItem {
  id: string; // Unique identifier
  ttbId?: string; // Optional TTB ID from CAP
  serialNumber?: string; // Optional serial number from CAP
  applicationData: ApplicationData; // The verifiable fields (label.*)
  adminData?: Partial<CAPApplication>; // Administrative context (not verified)
  images: File[]; // 1-4 images (G3 will extend to multi-image)
  status: "pending" | "processing" | "completed" | "error";
  workflowState?: WorkflowState; // Added for batch triage workflow
  result?: VerificationResult;
  error?: string;
  addedAt: number;
  startedAt?: number; // When processing started
  completedAt?: number;
  totalProcessingMs?: number; // Total time from start to completion
  reviewedAt?: number; // When human reviewed it
  reviewNotes?: string; // Human reviewer notes
}

export interface QueueProgress {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface BatchStatistics {
  total: number;
  byWorkflowState: Partial<Record<WorkflowState, number>>;
  byVerdict: { match: number; mismatch: number; needsReview: number };
  averageConfidence: number;
  processingTimeMs: { min: number; max: number; avg: number };
  autoPassRate: number; // Percentage auto-passed
  reviewQueueSize: number; // Items with needs_review state
}

// Package layout types (M3-AMENDMENT §C)
export type PackageLayout =
  | "package-zip" // Single application.json + images in one archive
  | "batch-zip" // Multiple subfolders, each a package
  | "manifest-mode" // Root applications.json (array) + images
  | "loose-drop"; // application.json + images dropped as separate files

// Result of loading a package (or batch of packages)
export interface LoadResult {
  applications: Array<{
    cap: CAPApplication;
    images: File[]; // Actual File objects ready for upload
    source: string; // Identifier (filename, subfolder path, etc.)
  }>;
  errors: Array<{
    source: string; // Which package/file had the error
    message: string; // Plain-English error message
  }>;
  layout: PackageLayout;
}

// Validation error from JSON Schema
export interface ValidationError {
  field: string; // JSON path to the invalid field
  message: string; // Human-readable error message
  value?: any; // The invalid value (if relevant)
}
