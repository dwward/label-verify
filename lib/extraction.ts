import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedLabel } from "./types";
import { ANTHROPIC_MODEL, ANTHROPIC_MAX_TOKENS } from "./config";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Convert File to base64 string for Anthropic API
 */
async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString("base64");
}

/**
 * Extract label data from one or more images using Claude vision
 * Sends all images in ONE API call and merges findings
 */
export async function extractLabelData(
  imageFiles: File[]
): Promise<{ extracted: ExtractedLabel; processingMs: number }> {
  const startTime = performance.now();

  try {
    // Build content array with all images
    const contentBlocks: Array<
      | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string } }
      | { type: "text"; text: string }
    > = [];

    // Add all images first
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const base64Image = await fileToBase64(file);
      const mediaType = file.type as
        | "image/jpeg"
        | "image/png"
        | "image/webp"
        | "image/gif";

      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: base64Image,
        },
      });
    }

    // Determine panel names based on count
    const panelNames =
      imageFiles.length === 1
        ? ["front"]
        : imageFiles.length === 2
        ? ["front", "back"]
        : imageFiles.length === 3
        ? ["front", "back", "neck"]
        : ["front", "back", "neck", "side"];

    // Add instruction text
    const instructionText =
      imageFiles.length === 1
        ? `You are analyzing an alcohol beverage label for regulatory compliance. Extract the following information from this label image and return ONLY a JSON object (no markdown fences, no prose).`
        : `You are analyzing an alcohol beverage label for regulatory compliance. I've provided ${imageFiles.length} images showing different panels of the same label (${panelNames.join(", ")}). MERGE your findings across all panels into ONE JSON object. For each field you extract, note which panel it came from using the foundOn field. Return ONLY a JSON object (no markdown fences, no prose).`;

    contentBlocks.push({
      type: "text",
      text: `${instructionText}

Required fields to extract:
1. brandName - The brand name as printed on the label (verbatim)
   - brandNameFoundOn - Which panel: "${panelNames.join('" | "')}" (use "unknown" if uncertain)
2. classType - The type/class of alcohol (e.g., "Kentucky Straight Bourbon Whiskey", "Vodka", "Wine")
   - classTypeFoundOn - Which panel: "${panelNames.join('" | "')}" (use "unknown" if uncertain)
3. alcoholContent - The alcohol content exactly as printed (e.g., "45% Alc./Vol.", "40% ABV")
   - alcoholContentFoundOn - Which panel: "${panelNames.join('" | "')}" (use "unknown" if uncertain)
4. netContents - The volume exactly as printed (e.g., "750 mL", "1 L")
   - netContentsFoundOn - Which panel: "${panelNames.join('" | "')}" (use "unknown" if uncertain)
5. governmentWarning - Object with:
   - present: boolean (is there a government warning on ANY panel?)
   - fullText: string or null (the complete warning text, character-for-character as printed)
   - headerAllCaps: boolean (is "GOVERNMENT WARNING:" in all capitals?)
   - headerAppearsBold: boolean (does the header appear bold?)
   - foundOn: "${panelNames.join('" | "')}" | "unknown" (which panel has the warning?)
6. imageQuality - Object with:
   - readable: boolean (can you read the labels clearly?)
   - issues: array of strings (e.g., ["glare on upper left", "slight angle"])
   - confidence: "high" | "medium" | "low"

Return ONLY this JSON structure:
{
  "brandName": "string or null",
  "brandNameFoundOn": "${panelNames.join('" | "')}",
  "classType": "string or null",
  "classTypeFoundOn": "${panelNames.join('" | "')}",
  "alcoholContent": "string or null",
  "alcoholContentFoundOn": "${panelNames.join('" | "')}",
  "netContents": "string or null",
  "netContentsFoundOn": "${panelNames.join('" | "')}",
  "governmentWarning": {
    "present": boolean,
    "fullText": "string or null",
    "headerAllCaps": boolean,
    "headerAppearsBold": boolean,
    "foundOn": "${panelNames.join('" | "')}"
  },
  "imageQuality": {
    "readable": boolean,
    "issues": ["array of strings"],
    "confidence": "high" | "medium" | "low"
  }
}

DO NOT include markdown code fences or any text outside the JSON object.`,
      },
    );

    const message = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: contentBlocks,
        },
      ],
    });

    const endTime = performance.now();
    const processingMs = Math.round(endTime - startTime);

    // Extract text content from response
    const content = message.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Anthropic API");
    }

    // Parse response with defensive handling
    let extracted: ExtractedLabel;
    try {
      // Strip any accidental markdown fences
      let jsonText = content.text.trim();
      jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");

      extracted = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("Failed to parse extraction response:", parseError);
      // Return low-confidence result on parse failure
      extracted = {
        brandName: null,
        brandNameFoundOn: "unknown",
        classType: null,
        classTypeFoundOn: "unknown",
        alcoholContent: null,
        alcoholContentFoundOn: "unknown",
        netContents: null,
        netContentsFoundOn: "unknown",
        governmentWarning: {
          present: false,
          fullText: null,
          headerAllCaps: false,
          headerAppearsBold: false,
          foundOn: "unknown",
        },
        imageQuality: {
          readable: false,
          issues: ["Failed to parse API response"],
          confidence: "low",
        },
      };
    }

    return { extracted, processingMs };
  } catch (error) {
    const endTime = performance.now();
    const processingMs = Math.round(endTime - startTime);

    console.error("Error extracting label data:", error);

    // Return low-confidence result on error
    const extracted: ExtractedLabel = {
      brandName: null,
      brandNameFoundOn: "unknown",
      classType: null,
      classTypeFoundOn: "unknown",
      alcoholContent: null,
      alcoholContentFoundOn: "unknown",
      netContents: null,
      netContentsFoundOn: "unknown",
      governmentWarning: {
        present: false,
        fullText: null,
        headerAllCaps: false,
        headerAppearsBold: false,
        foundOn: "unknown",
      },
      imageQuality: {
        readable: false,
        issues: [
          error instanceof Error ? error.message : "Unknown extraction error",
        ],
        confidence: "low",
      },
    };

    return { extracted, processingMs };
  }
}
