"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loadCAPPackages } from "@/lib/cap-loader";
import AppNavigation from "@/components/AppNavigation";
import type { LoadResult, QueueItem } from "@/lib/types";

export default function UploadBatchPage() {
  const router = useRouter();
  const [loadResult, setLoadResult] = useState<LoadResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Convert FileList to File array
      const files = Array.from(e.dataTransfer.files);
      const result = await loadCAPPackages(files);
      setLoadResult(result);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Error loading files. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };


  const handleStartVerification = () => {
    if (!loadResult) return;

    // Store queue data in sessionStorage (survives page navigation, not refresh)
    const queueData = {
      applications: loadResult.applications.map((app, idx) => ({
        id: `${Date.now()}-${idx}`,
        ttbId: app.cap.ttbId,
        serialNumber: app.cap.serialNumber,
        applicationData: {
          brandName: app.cap.label.brandName,
          classType: app.cap.label.classType,
          alcoholContent: app.cap.label.alcoholContent,
          netContents: app.cap.label.netContents,
          bottlerName: app.cap.label.bottlerNameAddress || undefined,
          countryOfOrigin: app.cap.label.countryOfOrigin || undefined,
        },
        adminData: app.cap,
        // Images are kept as File objects in memory, not serialized
      })),
      // Store images separately in a global variable
      images: loadResult.applications.map(app => app.images),
    };

    // Store metadata (without images) in sessionStorage
    sessionStorage.setItem("label-verify-metadata", JSON.stringify(queueData.applications));

    // Store images in window global (will be picked up by dashboard)
    (window as any).__pendingQueueImages = queueData.images;

    router.push("/dashboard");
  };

  const validCount =
    loadResult?.applications.filter((app) => app.images.length > 0).length || 0;
  const errorCount = loadResult?.errors.length || 0;
  const missingImagesCount =
    loadResult?.applications.filter((app) => app.images.length === 0).length ||
    0;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AppNavigation />
      <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto py-8 px-4">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Upload Batch</h1>
            <p className="text-sm text-gray-600 mt-1">
              Upload CAP packages (.zip files) or folders containing applications
              and label images
            </p>
          </div>
          <button
            onClick={() => {
              localStorage.clear();
              sessionStorage.clear();
              delete (window as any).__pendingQueueImages;
              setLoadResult(null);
              window.location.reload();
            }}
            className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-300 rounded hover:bg-red-50"
          >
            Clear All Data
          </button>
        </div>

        {/* Upload Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={`border-4 border-dashed rounded-lg p-12 text-center mb-6 transition-colors ${
            isLoading
              ? "border-blue-400 bg-blue-50"
              : "border-gray-300 hover:border-blue-400 cursor-pointer"
          }`}
        >
          <svg
            className="mx-auto h-16 w-16 text-gray-400 mb-4"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-lg font-medium text-gray-900 mb-2">
            {isLoading ? "Loading files..." : "Drag and drop files or folders here"}
          </p>
          <p className="text-sm text-gray-500 mb-4">or click to browse</p>
          <p className="text-xs text-gray-500">
            Supported formats:<br />
            • .zip packages (single or batch)<br />
            • Folders containing application.json + images<br />
            • Loose files (application.json + 1-4 label images)
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="text-sm">
              <div className="font-medium text-blue-900 mb-1">
                Expected Package Format
              </div>
              <ul className="text-blue-800 space-y-1">
                <li>
                  • Each application needs an{" "}
                  <code className="bg-blue-100 px-1 rounded">
                    application.json
                  </code>{" "}
                  file
                </li>
                <li>
                  • Include 1-4 label images per application (JPEG, PNG, WebP)
                </li>
                <li>
                  • Images should show different label panels (front, back,
                  neck, side)
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Sample Data */}
        <div className="bg-gray-50 border border-gray-300 rounded-lg p-4 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">
                Sample Data
              </h3>
              <p className="text-xs text-gray-600">
                Download sample files to test the interface
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href="https://label-verify-samples.s3.amazonaws.com/sample-1.zip"
                download
                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Load Sample (1)
              </a>
              <a
                href="https://label-verify-samples.s3.amazonaws.com/sample-10.zip"
                download
                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Small Batch (10)
              </a>
              <a
                href="https://label-verify-samples.s3.amazonaws.com/sample-100.zip"
                download
                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Large Batch (100)
              </a>
            </div>
          </div>
        </div>

        {/* Loaded Files Summary */}
        {loadResult && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Files Loaded
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {loadResult.applications.length} applications ready to verify
                  {errorCount > 0 && ` (${errorCount} errors)`}
                  {missingImagesCount > 0 && ` (${missingImagesCount} missing images)`}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setLoadResult(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Clear
                </button>
                <button
                  onClick={handleStartVerification}
                  disabled={validCount === 0}
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Start Batch Review →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
