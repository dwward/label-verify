export interface ApplicationData {
  brandName: string;
  classType: string; // e.g. "Kentucky Straight Bourbon Whiskey"
  alcoholContent: string; // e.g. "45% Alc./Vol." or "45"
  netContents: string; // e.g. "750 mL"
  bottlerName?: string; // optional for prototype
  countryOfOrigin?: string; // optional, imports only
}

export type VerdictStatus = "MATCH" | "MISMATCH" | "NEEDS_REVIEW";

export interface FieldVerdict {
  field: string; // human-readable field name
  status: VerdictStatus;
  applicationValue: string;
  labelValue: string | null; // null = not found on label
  explanation: string; // one plain-English sentence
}

export interface ExtractedLabel {
  brandName: string | null;
  classType: string | null;
  alcoholContent: string | null; // raw text as printed
  netContents: string | null;
  governmentWarning: {
    present: boolean;
    fullText: string | null; // verbatim transcription
    headerAllCaps: boolean; // was "GOVERNMENT WARNING:" in all caps?
    headerAppearsBold: boolean; // best-effort visual judgment
  };
  imageQuality: {
    readable: boolean;
    issues: string[]; // e.g. ["glare on upper left", "slight angle"]
    confidence: "high" | "medium" | "low";
  };
}

export interface VerificationResult {
  verdicts: FieldVerdict[];
  overall: VerdictStatus; // worst status wins: MISMATCH > NEEDS_REVIEW > MATCH
  processingMs: number;
  imageQualityNote: string | null;
}
