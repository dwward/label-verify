import { verifyLabel } from "../comparison";
import { STATUTORY_WARNING_TEXT } from "../warning-text";
import type { ExtractedLabel, ApplicationData } from "../types";

describe("Multi-image foundOn tracking", () => {
  const mockApplicationData: ApplicationData = {
    brandName: "Stone's Throw",
    classType: "Kentucky Bourbon Whiskey",
    alcoholContent: "45% ABV",
    netContents: "750 mL",
  };

  it("should populate foundOn for all fields when model returns panel locations", () => {
    const extracted: ExtractedLabel = {
      brandName: "Stone's Throw",
      brandNameFoundOn: "front",
      classType: "Kentucky Bourbon Whiskey",
      classTypeFoundOn: "front",
      alcoholContent: "45% ABV",
      alcoholContentFoundOn: "back",
      netContents: "750 mL",
      netContentsFoundOn: "back",
      governmentWarning: {
        present: true,
        fullText: STATUTORY_WARNING_TEXT,
        headerAllCaps: true,
        headerAppearsBold: true,
        foundOn: "back",
      },
      imageQuality: { readable: true, issues: [], confidence: "high" },
    };

    const verdicts = verifyLabel(mockApplicationData, extracted);

    // Check that foundOn is preserved in verdicts
    const brandVerdict = verdicts.find((v) => v.field === "Brand Name");
    expect(brandVerdict?.foundOn).toBe("front");

    const classVerdict = verdicts.find((v) => v.field === "Class/Type");
    expect(classVerdict?.foundOn).toBe("front");

    const alcoholVerdict = verdicts.find((v) => v.field === "Alcohol Content");
    expect(alcoholVerdict?.foundOn).toBe("back");

    const netVerdict = verdicts.find((v) => v.field === "Net Contents");
    expect(netVerdict?.foundOn).toBe("back");

    const warningVerdict = verdicts.find((v) => v.field === "Government Warning");
    expect(warningVerdict?.foundOn).toBe("back");
  });

  it("should handle unknown foundOn gracefully", () => {
    const extracted: ExtractedLabel = {
      brandName: "Stone's Throw",
      brandNameFoundOn: "unknown",
      classType: "Kentucky Bourbon Whiskey",
      classTypeFoundOn: "unknown",
      alcoholContent: "45% ABV",
      alcoholContentFoundOn: "unknown",
      netContents: "750 mL",
      netContentsFoundOn: "unknown",
      governmentWarning: {
        present: true,
        fullText: STATUTORY_WARNING_TEXT,
        headerAllCaps: true,
        headerAppearsBold: true,
        foundOn: "unknown",
      },
      imageQuality: { readable: true, issues: [], confidence: "high" },
    };

    const verdicts = verifyLabel(mockApplicationData, extracted);

    // Should not crash, foundOn should be "unknown"
    verdicts.forEach((verdict) => {
      expect(verdict.foundOn).toBe("unknown");
    });
  });

  it("should handle missing foundOn (single-image mode)", () => {
    const extracted: ExtractedLabel = {
      brandName: "Stone's Throw",
      // brandNameFoundOn is undefined
      classType: "Kentucky Bourbon Whiskey",
      // classTypeFoundOn is undefined
      alcoholContent: "45% ABV",
      // alcoholContentFoundOn is undefined
      netContents: "750 mL",
      // netContentsFoundOn is undefined
      governmentWarning: {
        present: true,
        fullText: STATUTORY_WARNING_TEXT,
        headerAllCaps: true,
        headerAppearsBold: true,
        // foundOn is undefined
      },
      imageQuality: { readable: true, issues: [], confidence: "high" },
    };

    const verdicts = verifyLabel(mockApplicationData, extracted);

    // Should not crash, foundOn should be undefined
    verdicts.forEach((verdict) => {
      expect(verdict.foundOn).toBeUndefined();
    });
  });

  it("should preserve foundOn with different panels (neck, side)", () => {
    const extracted: ExtractedLabel = {
      brandName: "Stone's Throw",
      brandNameFoundOn: "neck",
      classType: "Kentucky Bourbon Whiskey",
      classTypeFoundOn: "side",
      alcoholContent: "45% ABV",
      alcoholContentFoundOn: "front",
      netContents: "750 mL",
      netContentsFoundOn: "back",
      governmentWarning: {
        present: true,
        fullText: STATUTORY_WARNING_TEXT,
        headerAllCaps: true,
        headerAppearsBold: true,
        foundOn: "back",
      },
      imageQuality: { readable: true, issues: [], confidence: "high" },
    };

    const verdicts = verifyLabel(mockApplicationData, extracted);

    expect(verdicts.find((v) => v.field === "Brand Name")?.foundOn).toBe("neck");
    expect(verdicts.find((v) => v.field === "Class/Type")?.foundOn).toBe("side");
    expect(verdicts.find((v) => v.field === "Alcohol Content")?.foundOn).toBe("front");
    expect(verdicts.find((v) => v.field === "Net Contents")?.foundOn).toBe("back");
    expect(verdicts.find((v) => v.field === "Government Warning")?.foundOn).toBe("back");
  });

  it("should handle mixed foundOn (some defined, some undefined)", () => {
    const extracted: ExtractedLabel = {
      brandName: "Stone's Throw",
      brandNameFoundOn: "front",
      classType: "Kentucky Bourbon Whiskey",
      // classTypeFoundOn undefined
      alcoholContent: "45% ABV",
      alcoholContentFoundOn: "back",
      netContents: "750 mL",
      // netContentsFoundOn undefined
      governmentWarning: {
        present: true,
        fullText: STATUTORY_WARNING_TEXT,
        headerAllCaps: true,
        headerAppearsBold: true,
        foundOn: "back",
      },
      imageQuality: { readable: true, issues: [], confidence: "high" },
    };

    const verdicts = verifyLabel(mockApplicationData, extracted);

    expect(verdicts.find((v) => v.field === "Brand Name")?.foundOn).toBe("front");
    expect(verdicts.find((v) => v.field === "Class/Type")?.foundOn).toBeUndefined();
    expect(verdicts.find((v) => v.field === "Alcohol Content")?.foundOn).toBe("back");
    expect(verdicts.find((v) => v.field === "Net Contents")?.foundOn).toBeUndefined();
    expect(verdicts.find((v) => v.field === "Government Warning")?.foundOn).toBe("back");
  });
});
