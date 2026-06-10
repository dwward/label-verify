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
 * Extract label data from image using Claude vision
 */
export async function extractLabelData(
  imageFile: File
): Promise<{ extracted: ExtractedLabel; processingMs: number }> {
  const startTime = performance.now();

  try {
    const base64Image = await fileToBase64(imageFile);
    const mediaType = imageFile.type as
      | "image/jpeg"
      | "image/png"
      | "image/webp"
      | "image/gif";

    const message = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Image,
              },
            },
            {
              type: "text",
              text: `You are analyzing an alcohol beverage label for regulatory compliance. Extract the following information from this label image and return ONLY a JSON object (no markdown fences, no prose).

Required fields to extract:
1. brandName - The brand name as printed on the label (verbatim)
2. classType - The type/class of alcohol (e.g., "Kentucky Straight Bourbon Whiskey", "Vodka", "Wine")
3. alcoholContent - The alcohol content exactly as printed (e.g., "45% Alc./Vol.", "40% ABV")
4. netContents - The volume exactly as printed (e.g., "750 mL", "1 L")
5. governmentWarning - Object with:
   - present: boolean (is there a government warning?)
   - fullText: string or null (the complete warning text, character-for-character as printed)
   - headerAllCaps: boolean (is "GOVERNMENT WARNING:" in all capitals?)
   - headerAppearsBold: boolean (does the header appear bold?)
6. imageQuality - Object with:
   - readable: boolean (can you read the label clearly?)
   - issues: array of strings (e.g., ["glare on upper left", "slight angle"])
   - confidence: "high" | "medium" | "low"

Return ONLY this JSON structure:
{
  "brandName": "string or null",
  "classType": "string or null",
  "alcoholContent": "string or null",
  "netContents": "string or null",
  "governmentWarning": {
    "present": boolean,
    "fullText": "string or null",
    "headerAllCaps": boolean,
    "headerAppearsBold": boolean
  },
  "imageQuality": {
    "readable": boolean,
    "issues": ["array of strings"],
    "confidence": "high" | "medium" | "low"
  }
}

DO NOT include markdown code fences or any text outside the JSON object.`,
            },
          ],
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
        classType: null,
        alcoholContent: null,
        netContents: null,
        governmentWarning: {
          present: false,
          fullText: null,
          headerAllCaps: false,
          headerAppearsBold: false,
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
      classType: null,
      alcoholContent: null,
      netContents: null,
      governmentWarning: {
        present: false,
        fullText: null,
        headerAllCaps: false,
        headerAppearsBold: false,
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
