import { NextRequest, NextResponse } from "next/server";
import { extractLabelData } from "@/lib/extraction";
import { verifyLabel, calculateOverallVerdict } from "@/lib/comparison";
import {
  calculateFieldConfidence,
  calculateWarningConfidence,
  calculateApplicationConfidence,
} from "@/lib/confidence";
import type {
  ApplicationData,
  VerificationResult,
  FieldVerdict,
  FieldConfidence,
} from "@/lib/types";
import { IMAGE_MAX_SIZE_MB } from "@/lib/config";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const applicationJson = formData.get("application") as string | null;

    // Collect all images (1-4 supported)
    const imageFiles: File[] = [];
    for (let i = 0; i < 4; i++) {
      const key = i === 0 ? "image" : `image${i}`;
      const file = formData.get(key) as File | null;
      if (file) {
        imageFiles.push(file);
      }
    }

    // Validate at least one image present
    if (imageFiles.length === 0) {
      return NextResponse.json(
        { error: "Please upload at least one label image" },
        { status: 400 }
      );
    }

    // Validate each image
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    const maxSizeBytes = IMAGE_MAX_SIZE_MB * 1024 * 1024;

    for (const imageFile of imageFiles) {
      if (!allowedTypes.includes(imageFile.type)) {
        return NextResponse.json(
          { error: "Please upload only JPEG, PNG, or WebP images" },
          { status: 400 }
        );
      }

      if (imageFile.size > maxSizeBytes) {
        return NextResponse.json(
          {
            error: `One or more images are too large. Please upload images smaller than ${IMAGE_MAX_SIZE_MB} MB`,
          },
          { status: 400 }
        );
      }
    }

    // Validate application data
    if (!applicationJson) {
      return NextResponse.json(
        { error: "Application data is required" },
        { status: 400 }
      );
    }

    let applicationData: ApplicationData;
    try {
      applicationData = JSON.parse(applicationJson);
    } catch {
      return NextResponse.json(
        { error: "Invalid application data format" },
        { status: 400 }
      );
    }

    // Validate required fields
    const missingFields = [];
    if (!applicationData.brandName?.trim()) missingFields.push("brandName");
    if (!applicationData.classType?.trim()) missingFields.push("classType");
    if (!applicationData.alcoholContent?.trim()) missingFields.push("alcoholContent");
    if (!applicationData.netContents?.trim()) missingFields.push("netContents");

    if (missingFields.length > 0) {
      console.error("Missing required fields:", missingFields, "Data:", applicationData);
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(", ")}` },
        { status: 400 }
      );
    }

    // Extract label data from all images
    const { extracted, processingMs: extractionMs } = await extractLabelData(
      imageFiles
    );

    // Compare and verify
    const verdicts = verifyLabel(applicationData, extracted);
    const overall = calculateOverallVerdict(verdicts);

    // Calculate confidence for each field
    const imageQuality = extracted.imageQuality.confidence;
    const verdictsWithConfidence = verdicts.map((verdict) => {
      let confidence: FieldConfidence;

      // Special handling for government warning (binary check)
      if (verdict.field === "Government Warning") {
        confidence = calculateWarningConfidence(verdict, imageQuality);
      } else {
        // For other fields, calculate confidence based on verdict and image quality
        // Note: similarity score would come from comparison.ts in future enhancement
        confidence = calculateFieldConfidence(verdict, imageQuality);
      }

      return {
        ...verdict,
        confidence,
      };
    });

    // Calculate application-level confidence
    const applicationConfidence = calculateApplicationConfidence(
      verdictsWithConfidence
    );

    // Build image quality note
    let imageQualityNote: string | null = null;
    if (extracted.imageQuality.issues.length > 0) {
      imageQualityNote = `Image issues detected: ${extracted.imageQuality.issues.join(", ")}. Results may be less reliable.`;
    }

    const result: VerificationResult = {
      verdicts: verdictsWithConfidence,
      overall,
      processingMs: extractionMs,
      imageQualityNote,
      applicationConfidence,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Verification error:", error);

    if (error instanceof Error && error.message.includes("timeout")) {
      return NextResponse.json(
        {
          error:
            "Verification took too long. Please try again with a clearer image.",
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error:
          "We couldn't process this image. Please try again or use a different photo.",
      },
      { status: 500 }
    );
  }
}
