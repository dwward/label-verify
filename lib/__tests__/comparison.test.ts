import {
  normalize,
  compareBrandOrClass,
  compareAlcoholContent,
  compareNetContents,
  calculateOverallVerdict,
  verifyLabel,
} from "../comparison";
import type { ExtractedLabel, ApplicationData, FieldVerdict } from "../types";

describe("normalize", () => {
  it("converts to lowercase", () => {
    expect(normalize("MAKER'S MARK")).toBe("maker's mark");
  });

  it("trims whitespace", () => {
    expect(normalize("  Bourbon Whiskey  ")).toBe("bourbon whiskey");
  });

  it("collapses multiple spaces", () => {
    expect(normalize("Stone's   Throw")).toBe("stone's throw");
  });

  it("collapses tabs and newlines", () => {
    expect(normalize("Kentucky\t\nBourbon")).toBe("kentucky bourbon");
  });

  it("strips surrounding quotes", () => {
    expect(normalize('"Stone\'s Throw"')).toBe("stone's throw");
    expect(normalize("'Buffalo Trace'")).toBe("buffalo trace");
  });

  it("normalizes typographic apostrophes", () => {
    expect(normalize("Stone's Throw")).toBe("stone's throw");
    expect(normalize("Maker's Mark")).toBe("maker's mark");
  });

  it("handles empty string", () => {
    expect(normalize("")).toBe("");
  });
});

describe("compareBrandOrClass", () => {
  it("matches exact strings", () => {
    const result = compareBrandOrClass("Brand Name", "Maker's Mark", "Maker's Mark");
    expect(result.status).toBe("MATCH");
    expect(result.explanation).toBe("Exact match");
  });

  it("matches case-insensitive", () => {
    const result = compareBrandOrClass("Brand Name", "Maker's Mark", "MAKER'S MARK");
    expect(result.status).toBe("MATCH");
    expect(result.explanation).toBe("Differs only in capitalization/spacing");
  });

  it("matches with spacing differences", () => {
    const result = compareBrandOrClass("Brand Name", "Stone's  Throw", "Stone's Throw");
    expect(result.status).toBe("MATCH");
  });

  it("returns MISMATCH when label value is missing", () => {
    const result = compareBrandOrClass("Brand Name", "Maker's Mark", null);
    expect(result.status).toBe("MISMATCH");
    expect(result.explanation).toBe("Not found on label");
  });

  it("returns NEEDS_REVIEW for high similarity (≥0.9)", () => {
    const result = compareBrandOrClass("Brand Name", "Stone's Throw", "Stones Throw");
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.explanation).toContain("Very similar but not identical");
  });

  it("returns MISMATCH for low similarity (<0.9)", () => {
    const result = compareBrandOrClass("Brand Name", "Maker's Mark", "Buffalo Trace");
    expect(result.status).toBe("MISMATCH");
    expect(result.explanation).toContain("does not match");
  });
});

describe("compareAlcoholContent", () => {
  it("matches percentage values", () => {
    const result = compareAlcoholContent("45% Alc./Vol.", "45% Alc./Vol.");
    expect(result.status).toBe("MATCH");
  });

  it("handles tolerance for floating point", () => {
    const result = compareAlcoholContent("44.99%", "45.00%");
    expect(result.status).toBe("MATCH");
  });

  it("converts proof to ABV (90 Proof = 45% ABV)", () => {
    const result = compareAlcoholContent("45%", "90 Proof");
    expect(result.status).toBe("MATCH");
  });

  it("detects mismatch in percentages", () => {
    const result = compareAlcoholContent("40%", "45%");
    expect(result.status).toBe("MISMATCH");
    expect(result.explanation).toContain("Label shows 45% but application states 40%");
  });

  it("returns NEEDS_REVIEW for unparseable application value", () => {
    const result = compareAlcoholContent("high alcohol", "45%");
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.explanation).toContain("Cannot parse percentage from application data");
  });

  it("returns NEEDS_REVIEW for unparseable label value", () => {
    const result = compareAlcoholContent("45%", "strong");
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.explanation).toContain("Cannot parse percentage from label");
  });

  it("returns MISMATCH when label value is missing", () => {
    const result = compareAlcoholContent("45%", null);
    expect(result.status).toBe("MISMATCH");
    expect(result.explanation).toBe("Not found on label");
  });

  it("detects internal inconsistency (proof and percentage both present but different)", () => {
    const result = compareAlcoholContent("45%", "45% Alc./Vol. (80 Proof)");
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.explanation).toContain("inconsistent ABV and proof values");
  });

  it("allows consistent proof and percentage on same label", () => {
    const result = compareAlcoholContent("45%", "45% Alc./Vol. (90 Proof)");
    expect(result.status).toBe("MATCH");
  });
});

describe("compareNetContents", () => {
  it("matches volumes with same unit", () => {
    const result = compareNetContents("750 mL", "750 mL");
    expect(result.status).toBe("MATCH");
  });

  it("normalizes units (L to mL)", () => {
    const result = compareNetContents("750 mL", "0.75 L");
    expect(result.status).toBe("MATCH");
  });

  it("is case insensitive for units", () => {
    const result = compareNetContents("750 ml", "750 ML");
    expect(result.status).toBe("MATCH");
  });

  it("detects volume mismatch", () => {
    const result = compareNetContents("750 mL", "1000 mL");
    expect(result.status).toBe("MISMATCH");
    expect(result.explanation).toContain("Label shows 1000 mL but application states 750 mL");
  });

  it("returns NEEDS_REVIEW for unparseable application value", () => {
    const result = compareNetContents("one bottle", "750 mL");
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.explanation).toContain("Cannot parse volume from application data");
  });

  it("returns NEEDS_REVIEW for unparseable label value", () => {
    const result = compareNetContents("750 mL", "large bottle");
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.explanation).toContain("Cannot parse volume from label");
  });

  it("returns MISMATCH when label value is missing", () => {
    const result = compareNetContents("750 mL", null);
    expect(result.status).toBe("MISMATCH");
    expect(result.explanation).toBe("Not found on label");
  });
});

describe("calculateOverallVerdict", () => {
  const mockVerdict = (status: "MATCH" | "MISMATCH" | "NEEDS_REVIEW"): FieldVerdict => ({
    field: "Test",
    status,
    applicationValue: "test",
    labelValue: "test",
    explanation: "test",
  });

  it("returns MATCH when all verdicts are MATCH", () => {
    const verdicts = [mockVerdict("MATCH"), mockVerdict("MATCH")];
    expect(calculateOverallVerdict(verdicts)).toBe("MATCH");
  });

  it("returns NEEDS_REVIEW when at least one is NEEDS_REVIEW", () => {
    const verdicts = [mockVerdict("MATCH"), mockVerdict("NEEDS_REVIEW")];
    expect(calculateOverallVerdict(verdicts)).toBe("NEEDS_REVIEW");
  });

  it("returns MISMATCH when at least one is MISMATCH", () => {
    const verdicts = [mockVerdict("MATCH"), mockVerdict("MISMATCH")];
    expect(calculateOverallVerdict(verdicts)).toBe("MISMATCH");
  });

  it("prioritizes MISMATCH over NEEDS_REVIEW", () => {
    const verdicts = [
      mockVerdict("MATCH"),
      mockVerdict("NEEDS_REVIEW"),
      mockVerdict("MISMATCH"),
    ];
    expect(calculateOverallVerdict(verdicts)).toBe("MISMATCH");
  });
});

describe("verifyLabel", () => {
  const mockAppData: ApplicationData = {
    brandName: "Maker's Mark",
    classType: "Kentucky Bourbon Whiskey",
    alcoholContent: "45%",
    netContents: "750 mL",
  };

  const mockExtracted = (overrides?: Partial<ExtractedLabel>): ExtractedLabel => ({
    brandName: "Maker's Mark",
    classType: "Kentucky Bourbon Whiskey",
    alcoholContent: "45%",
    netContents: "750 mL",
    governmentWarning: {
      present: true,
      fullText:
        "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.",
      headerAllCaps: true,
      headerAppearsBold: true,
    },
    imageQuality: {
      readable: true,
      issues: [],
      confidence: "high",
    },
    ...overrides,
  });

  it("returns NEEDS_REVIEW for low quality images", () => {
    const extracted = mockExtracted({
      imageQuality: { readable: false, issues: ["blurry"], confidence: "low" },
    });
    const verdicts = verifyLabel(mockAppData, extracted);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].status).toBe("NEEDS_REVIEW");
    expect(verdicts[0].explanation).toContain("Image quality too low");
  });

  it("returns verdicts for all fields when image quality is acceptable", () => {
    const extracted = mockExtracted();
    const verdicts = verifyLabel(mockAppData, extracted);
    expect(verdicts.length).toBeGreaterThanOrEqual(5); // Brand, Class, Alcohol, Net Contents, Warning
  });

  it("verifies brand name", () => {
    const extracted = mockExtracted();
    const verdicts = verifyLabel(mockAppData, extracted);
    const brandVerdict = verdicts.find((v) => v.field === "Brand Name");
    expect(brandVerdict).toBeDefined();
    expect(brandVerdict?.status).toBe("MATCH");
  });

  it("verifies class/type", () => {
    const extracted = mockExtracted();
    const verdicts = verifyLabel(mockAppData, extracted);
    const classVerdict = verdicts.find((v) => v.field === "Class/Type");
    expect(classVerdict).toBeDefined();
    expect(classVerdict?.status).toBe("MATCH");
  });

  it("verifies alcohol content", () => {
    const extracted = mockExtracted();
    const verdicts = verifyLabel(mockAppData, extracted);
    const alcoholVerdict = verdicts.find((v) => v.field === "Alcohol Content");
    expect(alcoholVerdict).toBeDefined();
    expect(alcoholVerdict?.status).toBe("MATCH");
  });

  it("verifies net contents", () => {
    const extracted = mockExtracted();
    const verdicts = verifyLabel(mockAppData, extracted);
    const netContentsVerdict = verdicts.find((v) => v.field === "Net Contents");
    expect(netContentsVerdict).toBeDefined();
    expect(netContentsVerdict?.status).toBe("MATCH");
  });

  it("verifies government warning", () => {
    const extracted = mockExtracted();
    const verdicts = verifyLabel(mockAppData, extracted);
    const warningVerdict = verdicts.find((v) => v.field === "Government Warning");
    expect(warningVerdict).toBeDefined();
    expect(warningVerdict?.status).toBe("MATCH");
  });
});
