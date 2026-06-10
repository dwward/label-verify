import {
  STATUTORY_WARNING,
  normalizeWarningText,
  generateWordDiff,
  checkGovernmentWarning,
} from "../warning-text";
import type { ExtractedLabel } from "../types";

describe("normalizeWarningText", () => {
  it("collapses multiple spaces", () => {
    const text = "GOVERNMENT WARNING:  (1)  According to";
    expect(normalizeWarningText(text)).toBe("GOVERNMENT WARNING: (1) According to");
  });

  it("collapses newlines to spaces", () => {
    const text = "GOVERNMENT WARNING:\n(1) According to\nthe Surgeon General";
    expect(normalizeWarningText(text)).toBe(
      "GOVERNMENT WARNING: (1) According to the Surgeon General"
    );
  });

  it("removes hyphenation artifacts", () => {
    const text = "women should not drink alco-\nholic beverages";
    expect(normalizeWarningText(text)).toBe("women should not drink alcoholic beverages");
  });

  it("removes soft hyphens", () => {
    const text = "alco-\n holic";
    expect(normalizeWarningText(text)).toBe("alcoholic");
  });

  it("preserves case", () => {
    const text = "GOVERNMENT WARNING: According to the Surgeon General";
    expect(normalizeWarningText(text)).toBe("GOVERNMENT WARNING: According to the Surgeon General");
  });

  it("preserves punctuation", () => {
    const text = "WARNING: (1) test, (2) test.";
    expect(normalizeWarningText(text)).toBe("WARNING: (1) test, (2) test.");
  });

  it("trims leading and trailing whitespace", () => {
    const text = "  GOVERNMENT WARNING: test  ";
    expect(normalizeWarningText(text)).toBe("GOVERNMENT WARNING: test");
  });
});

describe("generateWordDiff", () => {
  it("detects word substitution", () => {
    const expected = "women should not drink alcoholic beverages";
    const actual = "women should not drink alcoholic drinks";
    const diff = generateWordDiff(expected, actual);
    expect(diff).toContain("Expected 'beverages' but found 'drinks'");
    expect(diff).toContain("word 6");
  });

  it("detects missing words", () => {
    const expected = "one two three four five";
    const actual = "one two three";
    const diff = generateWordDiff(expected, actual);
    expect(diff).toContain("incomplete");
    expect(diff).toContain("'four'");
  });

  it("detects extra words", () => {
    const expected = "one two three";
    const actual = "one two three four five";
    const diff = generateWordDiff(expected, actual);
    expect(diff).toContain("extra word");
  });

  it("detects first difference", () => {
    const expected = "the quick brown fox";
    const actual = "the slow brown fox";
    const diff = generateWordDiff(expected, actual);
    expect(diff).toContain("Expected 'quick' but found 'slow'");
    expect(diff).toContain("word 2");
  });
});

function mockExtracted(overrides?: Partial<ExtractedLabel["governmentWarning"]>): ExtractedLabel {
  return {
    brandName: "Test Brand",
    classType: "Bourbon Whiskey",
    alcoholContent: "45%",
    netContents: "750 mL",
    governmentWarning: {
      present: true,
      fullText: STATUTORY_WARNING,
      headerAllCaps: true,
      headerAppearsBold: true,
      ...overrides,
    },
    imageQuality: { readable: true, issues: [], confidence: "high" },
  };
}

describe("checkGovernmentWarning", () => {
  it("returns MATCH for correct warning text", () => {
    const extracted = mockExtracted();
    const result = checkGovernmentWarning(extracted);
    expect(result.status).toBe("MATCH");
    expect(result.explanation).toBe("Government warning matches statutory text");
  });

  it("returns MISMATCH when warning is missing", () => {
    const extracted = mockExtracted({ present: false });
    const result = checkGovernmentWarning(extracted);
    expect(result.status).toBe("MISMATCH");
    expect(result.explanation).toBe("Government warning missing from label");
  });

  it("returns MISMATCH for title case header", () => {
    const extracted = mockExtracted({ headerAllCaps: false });
    const result = checkGovernmentWarning(extracted);
    expect(result.status).toBe("MISMATCH");
    expect(result.explanation).toContain("must be 'GOVERNMENT WARNING:' in all capitals");
  });

  it("returns NEEDS_REVIEW when header not bold", () => {
    const extracted = mockExtracted({ headerAppearsBold: false });
    const result = checkGovernmentWarning(extracted);
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.explanation).toContain("may not be bold");
  });

  it("returns MISMATCH for one word substitution", () => {
    const modifiedText = STATUTORY_WARNING.replace("beverages", "drinks");
    const extracted = mockExtracted({ fullText: modifiedText });
    const result = checkGovernmentWarning(extracted);
    expect(result.status).toBe("MISMATCH");
    expect(result.explanation).toContain("Expected 'beverages' but found 'drinks'");
  });

  it("returns MISMATCH for missing sentence (2)", () => {
    const truncatedText =
      "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects.";
    const extracted = mockExtracted({ fullText: truncatedText });
    const result = checkGovernmentWarning(extracted);
    expect(result.status).toBe("MISMATCH");
    expect(result.explanation).toContain("incomplete");
  });

  it("returns MISMATCH for extra marketing text", () => {
    const extraText = STATUTORY_WARNING + " Enjoy responsibly!";
    const extracted = mockExtracted({ fullText: extraText });
    const result = checkGovernmentWarning(extracted);
    expect(result.status).toBe("MISMATCH");
    expect(result.explanation).toContain("extra word");
  });

  it("returns MATCH for line-wrap hyphenation", () => {
    const hyphenatedText = STATUTORY_WARNING.replace("alcoholic", "alco-\nholic");
    const extracted = mockExtracted({ fullText: hyphenatedText });
    const result = checkGovernmentWarning(extracted);
    expect(result.status).toBe("MATCH");
  });

  it("returns MISMATCH for punctuation change", () => {
    const modifiedText = STATUTORY_WARNING.replace("women should not drink", "women should not drink,");
    const extracted = mockExtracted({ fullText: modifiedText });
    const result = checkGovernmentWarning(extracted);
    expect(result.status).toBe("MISMATCH");
  });

  it("returns MISMATCH for case change in body", () => {
    const modifiedText = STATUTORY_WARNING.replace("Surgeon General", "surgeon general");
    const extracted = mockExtracted({ fullText: modifiedText });
    const result = checkGovernmentWarning(extracted);
    expect(result.status).toBe("MISMATCH");
  });

  it("returns MISMATCH when fullText is null but warning marked present", () => {
    const extracted = mockExtracted({ present: true, fullText: null });
    const result = checkGovernmentWarning(extracted);
    expect(result.status).toBe("MISMATCH");
    expect(result.explanation).toContain("could not be extracted");
  });

  it("handles multiple whitespace normalization", () => {
    const spacedText = STATUTORY_WARNING.replace(/\s+/g, "  ");
    const extracted = mockExtracted({ fullText: spacedText });
    const result = checkGovernmentWarning(extracted);
    expect(result.status).toBe("MATCH");
  });
});
