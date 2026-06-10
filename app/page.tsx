"use client";

import { useState } from "react";
import ApplicationForm from "@/components/ApplicationForm";
import ImageUpload from "@/components/ImageUpload";
import ProcessingTimer from "@/components/ProcessingTimer";
import ResultsPanel from "@/components/ResultsPanel";
import type { ApplicationData, VerificationResult } from "@/lib/types";

export default function Home() {
  const [applicationData, setApplicationData] = useState<ApplicationData>({
    brandName: "",
    classType: "",
    alcoholContent: "",
    netContents: "",
  });
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isFormValid = () => {
    return (
      applicationData.brandName.trim() !== "" &&
      applicationData.classType.trim() !== "" &&
      applicationData.alcoholContent.trim() !== "" &&
      applicationData.netContents.trim() !== "" &&
      selectedImage !== null
    );
  };

  const handleVerify = async () => {
    if (!selectedImage) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("image", selectedImage);
      formData.append("application", JSON.stringify(applicationData));

      const response = await fetch("/api/verify", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Verification failed");
      }

      const verificationResult: VerificationResult = await response.json();
      setResult(verificationResult);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Two-column form layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left column: Application form */}
        <div className="bg-white rounded-lg shadow p-6">
          <ApplicationForm onDataChange={setApplicationData} />
        </div>

        {/* Right column: Image upload */}
        <div className="bg-white rounded-lg shadow p-6">
          <ImageUpload onImageSelect={setSelectedImage} />
        </div>
      </div>

      {/* Verify button */}
      <div className="flex justify-center">
        <button
          onClick={handleVerify}
          disabled={!isFormValid() || isProcessing}
          className={`
            px-12 py-4 text-xl font-semibold rounded-lg transition-colors
            ${
              isFormValid() && !isProcessing
                ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }
          `}
        >
          {isProcessing ? "Verifying..." : "Verify Label"}
        </button>
      </div>

      {/* Processing timer */}
      <ProcessingTimer isProcessing={isProcessing} />

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border-2 border-red-400 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="text-xl">✗</div>
            <div className="flex-1">
              <p className="text-red-900 font-medium">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="bg-white rounded-lg shadow p-6">
          <ResultsPanel result={result} />
        </div>
      )}
    </div>
  );
}
