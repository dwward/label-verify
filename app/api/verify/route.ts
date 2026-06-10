import { NextRequest, NextResponse } from "next/server";
import { extractLabelData } from "@/lib/extraction";
import { verifyLabel, calculateOverallVerdict } from "@/lib/comparison";
import type { ApplicationData, VerificationResult } from "@/lib/types";
import { IMAGE_MAX_SIZE_MB } from "@/lib/config";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get("image") as File | null;
    const applicationJson = formData.get("application") as string | null;

    // Validate image
    if (!imageFile) {
      return NextResponse.json(
        { error: "Please upload a label image" },
        { status: 400 }
      );
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { error: "Please upload a JPEG, PNG, or WebP image" },
        { status: 400 }
      );
    }

    const maxSizeBytes = IMAGE_MAX_SIZE_MB * 1024 * 1024;
    if (imageFile.size > maxSizeBytes) {
      return NextResponse.json(
        {
          error: `Image is too large. Please upload an image smaller than ${IMAGE_MAX_SIZE_MB} MB`,
        },
        { status: 400 }
      );
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
    if (
      !applicationData.brandName?.trim() ||
      !applicationData.classType?.trim() ||
      !applicationData.alcoholContent?.trim() ||
      !applicationData.netContents?.trim()
    ) {
      return NextResponse.json(
        { error: "All required fields must be filled out" },
        { status: 400 }
      );
    }

    // Extract label data
    const { extracted, processingMs: extractionMs } = await extractLabelData(
      imageFile
    );

    // Compare and verify
    const verdicts = verifyLabel(applicationData, extracted);
    const overall = calculateOverallVerdict(verdicts);

    // Build image quality note
    let imageQualityNote: string | null = null;
    if (extracted.imageQuality.issues.length > 0) {
      imageQualityNote = `Image issues detected: ${extracted.imageQuality.issues.join(", ")}. Results may be less reliable.`;
    }

    const result: VerificationResult = {
      verdicts,
      overall,
      processingMs: extractionMs,
      imageQualityNote,
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
