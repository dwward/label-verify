"use client";

import { useState, useEffect } from "react";
import AppNavigation from "@/components/AppNavigation";
import { triageApplication, calculateBatchStatistics } from "@/lib/triage";
import { compressImage } from "@/lib/image-compression";
import { Semaphore } from "@/lib/semaphore";
import type { QueueItem, BatchStatistics, WorkflowState } from "@/lib/types";

const semaphore = new Semaphore(5); // Max 5 concurrent requests

export default function DashboardPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [statistics, setStatistics] = useState<BatchStatistics | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<"all" | WorkflowState>("all");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageZoom, setImageZoom] = useState<"fit" | 100 | 200>("fit");
  const [batchSummaryVisible, setBatchSummaryVisible] = useState(false);
  const [processingJustCompleted, setProcessingJustCompleted] = useState(false);

  // Load queue from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("label-verify-metadata");
    const pendingImages = (window as any).__pendingQueueImages;

    if (stored && pendingImages) {
      try {
        const metadata = JSON.parse(stored);

        // Combine metadata with images
        const queueItems: QueueItem[] = metadata.map((item: any, idx: number) => ({
          ...item,
          images: pendingImages[idx] || [],
          status: "pending" as const,
          workflowState: "pending" as const,
        }));

        setQueue(queueItems);

        // Clear session data
        sessionStorage.removeItem("label-verify-metadata");
        delete (window as any).__pendingQueueImages;

        // Auto-start processing
        startProcessing(queueItems);
      } catch (error) {
        console.error("Failed to load queue:", error);
      }
    } else {
      // Try loading from localStorage (for completed items after refresh)
      const storedResults = localStorage.getItem("label-verify-results");
      if (storedResults) {
        try {
          const parsed: QueueItem[] = JSON.parse(storedResults);
          setQueue(parsed);
        } catch (error) {
          console.error("Failed to load results:", error);
        }
      }
    }
  }, []);

  // Calculate statistics when queue changes
  useEffect(() => {
    if (queue.length > 0) {
      const stats = calculateBatchStatistics(queue);
      setStatistics(stats);
    }
  }, [queue]);

  // Don't save to localStorage - keep images in memory for current session only
  // (Images would exceed localStorage quota)

  const startProcessing = async (initialQueue: QueueItem[]) => {
    setIsProcessing(true);
    const pending = initialQueue.filter((item) => item.status === "pending");

    // Sort by application ID to process in order (top-down)
    const sortedPending = pending.sort((a, b) =>
      (a.ttbId || a.id).localeCompare(b.ttbId || b.id)
    );

    const processItem = async (item: QueueItem) => {
      await semaphore.acquire();
      const startTime = Date.now();

      try {
        // Update to processing with start time
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: "processing" as const, startedAt: startTime } : q
          )
        );

        // Compress images (they're already File objects from window global)
        const imageFiles: File[] = [];
        for (const img of item.images) {
          const compressed = await compressImage(img);
          imageFiles.push(compressed);
        }

        // Call API
        const formData = new FormData();
        formData.append("application", JSON.stringify(item.applicationData));
        imageFiles.forEach((img, idx) => {
          formData.append(idx === 0 ? "image" : `image${idx}`, img);
        });

        const response = await fetch("/api/verify", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();

        // Determine workflow state
        const workflowState = triageApplication(result);

        const endTime = Date.now();
        const totalProcessingMs = endTime - startTime;

        // Update queue with result (preserve images!)
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  images: item.images, // Preserve original images
                  status: "completed" as const,
                  workflowState,
                  result,
                  completedAt: endTime,
                  totalProcessingMs,
                }
              : q
          )
        );
      } catch (error) {
        console.error(`Error processing ${item.id}:`, error);
        const endTime = Date.now();
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  images: item.images, // Preserve original images
                  status: "error" as const,
                  workflowState: "error" as const,
                  error: error instanceof Error ? error.message : "Unknown error",
                  completedAt: endTime,
                  totalProcessingMs: endTime - startTime,
                }
              : q
          )
        );
      } finally {
        semaphore.release();
      }
    };

    // Process items in order (semaphore controls concurrency)
    await Promise.allSettled(sortedPending.map(processItem));
    setIsProcessing(false);
    setProcessingJustCompleted(true);
    setBatchSummaryVisible(true);

    // Auto-switch to appropriate filter after processing completes
    setTimeout(() => {
      const stats = calculateBatchStatistics(queue);
      if (stats.reviewQueueSize > 0) {
        setFilterState("needs_review");
      } else if ((stats.byWorkflowState.error || 0) > 0) {
        setFilterState("error");
      }
      // Otherwise stay on "all"
    }, 100);
  };

  const handleApprove = (itemId: string) => {
    setQueue((prev) =>
      prev.map((q) =>
        q.id === itemId
          ? {
              ...q,
              workflowState: "approved" as const,
              reviewedAt: Date.now(),
            }
          : q
      )
    );

    // Auto-advance to next needs_review item
    advanceToNextReview(itemId);
  };

  const handleReject = (itemId: string) => {
    setQueue((prev) =>
      prev.map((q) =>
        q.id === itemId
          ? {
              ...q,
              workflowState: "rejected" as const,
              reviewedAt: Date.now(),
            }
          : q
      )
    );

    // Auto-advance to next needs_review item
    advanceToNextReview(itemId);
  };

  const advanceToNextReview = (currentId: string) => {
    const needsReviewItems = queue.filter(
      (item) => item.workflowState === "needs_review" && item.id !== currentId
    );

    if (needsReviewItems.length > 0) {
      // Sort by confidence (lowest first)
      const sorted = needsReviewItems.sort((a, b) => {
        const aConf = a.result?.applicationConfidence?.overall || 0;
        const bConf = b.result?.applicationConfidence?.overall || 0;
        return aConf - bConf;
      });
      setSelectedItemId(sorted[0].id);
    } else {
      // No more items to review
      setSelectedItemId(null);
    }
  };

  const filteredQueue =
    filterState === "all"
      ? queue
      : filterState === "auto_passed"
      ? queue.filter((item) => item.workflowState === "auto_passed" || item.workflowState === "approved")
      : queue.filter((item) => item.workflowState === filterState);

  const selectedItem = queue.find((item) => item.id === selectedItemId);

  // Reset image viewer when item changes
  useEffect(() => {
    setActiveImageIndex(0);
    setImageZoom("fit");
  }, [selectedItemId]);

  const processingCount = queue.filter((q) => q.status === "processing").length;
  const completedCount = queue.filter((q) => q.status === "completed").length;

  return (
    <div className="flex h-screen bg-gray-50">
      <AppNavigation reviewQueueCount={statistics?.reviewQueueSize || 0} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-gray-900">
              Batch Dashboard
            </h1>
            <span className="text-xs text-gray-500">
              {queue.length} applications
            </span>
          </div>
        </div>

        {/* Processing Progress Bar (only during processing) */}
        {isProcessing && statistics && (
          <div className="bg-white border-b border-gray-200 px-6 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Processing:</span>
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{
                    width: `${(completedCount / queue.length) * 100}%`,
                  }}
                ></div>
              </div>
              <span className="text-xs font-medium text-gray-700">
                {completedCount} / {queue.length}
              </span>
            </div>
          </div>
        )}

        {/* Batch Summary Banner (dismissible, shown after import completes) */}
        {batchSummaryVisible && statistics && !isProcessing && (
          <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
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
              <div className="flex-1 text-sm text-blue-900">
                <span className="font-medium">Import complete:</span>{" "}
                {queue.length} applications —{" "}
                {(statistics.byWorkflowState.auto_passed || 0) + (statistics.byWorkflowState.approved || 0)} passed,{" "}
                {statistics.reviewQueueSize} need review,{" "}
                {statistics.byWorkflowState.error || 0} failed
              </div>
              <button
                onClick={() => setBatchSummaryVisible(false)}
                className="text-blue-600 hover:text-blue-800"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-2 flex items-center gap-3">
          <span className="text-xs font-medium text-gray-600">Show:</span>
          <button
            onClick={() => setFilterState("all")}
            disabled={isProcessing && filterState !== "all"}
            className={`px-2 py-1 text-xs font-medium rounded ${
              filterState === "all"
                ? "bg-blue-600 text-white"
                : "text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            Imported ({queue.length})
          </button>
          <button
            onClick={() => setFilterState("needs_review")}
            disabled={isProcessing}
            className={`px-2 py-1 text-xs font-medium rounded ${
              filterState === "needs_review"
                ? "bg-yellow-100 text-yellow-800 border border-yellow-300"
                : "text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            Needs Review ({statistics?.reviewQueueSize || 0})
          </button>
          <button
            onClick={() => setFilterState("auto_passed")}
            disabled={isProcessing}
            className={`px-2 py-1 text-xs font-medium rounded ${
              filterState === "auto_passed"
                ? "bg-green-100 text-green-800"
                : "text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            Passed ({(statistics?.byWorkflowState.auto_passed || 0) + (statistics?.byWorkflowState.approved || 0)})
          </button>
          <button
            onClick={() => setFilterState("rejected")}
            disabled={isProcessing}
            className={`px-2 py-1 text-xs font-medium rounded ${
              filterState === "rejected"
                ? "bg-red-100 text-red-800 border border-red-300"
                : "text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            Rejected ({statistics?.byWorkflowState.rejected || 0})
          </button>
          <button
            onClick={() => setFilterState("error")}
            disabled={isProcessing}
            className={`px-2 py-1 text-xs font-medium rounded ${
              filterState === "error"
                ? "bg-red-100 text-red-800"
                : "text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            Failed ({statistics?.byWorkflowState.error || 0})
          </button>

          {filterState === "needs_review" && statistics && (
            <span className="ml-auto text-xs text-gray-600 px-2 py-1 bg-blue-50 border border-blue-200 rounded">
              {(statistics.byWorkflowState.approved || 0) +
                (statistics.byWorkflowState.rejected || 0)}{" "}
              of {statistics.reviewQueueSize} reviewed
            </span>
          )}
        </div>

        {/* Split Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Results Table - Simplified (ID only) */}
          <div
            className={`${
              selectedItem ? "w-1/4" : "w-full"
            } flex flex-col border-r border-gray-200 bg-white transition-all`}
          >
            <div className="flex-1 overflow-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Application ID
                    </th>
                    {!selectedItem && (
                      <>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Conf.
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Time
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Issue
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredQueue.map((item) => {
                    const isSelected = item.id === selectedItemId;
                    const confidence = item.result?.applicationConfidence?.overall || 0;

                    // Determine row background color based on workflow state
                    let rowBgClass = "";
                    if (item.workflowState === "auto_passed" || item.workflowState === "approved") {
                      rowBgClass = "bg-green-50";
                    } else if (item.workflowState === "needs_review") {
                      rowBgClass = "bg-yellow-50";
                    } else if (item.workflowState === "rejected" || item.workflowState === "error") {
                      rowBgClass = "bg-red-50";
                    }

                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedItemId(isSelected ? null : item.id)}
                        className={`cursor-pointer ${
                          isSelected
                            ? "bg-blue-100 border-l-4 border-blue-600"
                            : `${rowBgClass} hover:bg-gray-100`
                        }`}
                      >
                        <td className="px-3 py-2">
                          <div
                            className={`text-sm ${
                              isSelected ? "font-semibold" : "font-medium"
                            } text-gray-900`}
                          >
                            {item.ttbId || item.id.slice(0, 10)}
                          </div>
                        </td>

                        {/* Show Confidence, Time, and Issue columns only when inspector is closed */}
                        {!selectedItem && (
                          <>
                            <td className="px-3 py-2">
                              {item.status === "completed" && confidence > 0 ? (
                                <div className="flex items-center gap-1">
                                  <div className="w-12 bg-gray-200 rounded-full h-1.5">
                                    <div
                                      className={`h-1.5 rounded-full ${
                                        confidence >= 0.85
                                          ? "bg-green-500"
                                          : confidence >= 0.6
                                          ? "bg-yellow-500"
                                          : "bg-red-500"
                                      }`}
                                      style={{ width: `${confidence * 100}%` }}
                                    ></div>
                                  </div>
                                  <span
                                    className={`text-xs font-bold ${
                                      confidence >= 0.85
                                        ? "text-green-600"
                                        : confidence >= 0.6
                                        ? "text-yellow-600"
                                        : "text-red-600"
                                    }`}
                                  >
                                    {Math.round(confidence * 100)}%
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-700">
                              {item.totalProcessingMs ? (
                                <span className="font-medium">
                                  {(item.totalProcessingMs / 1000).toFixed(1)}s
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-700">
                              {item.status === "processing" && "Processing..."}
                              {item.status === "pending" && "Pending"}
                              {item.status === "error" && (
                                <span className="text-red-600">
                                  {item.error || "Error"}
                                </span>
                              )}
                              {item.status === "completed" &&
                                item.result?.applicationConfidence?.reason}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Inspector Panel */}
          {selectedItem && selectedItem.result && (
            <div className="flex-1 bg-white flex flex-col">
              {/* Inspector Header */}
              <div className="bg-gray-900 text-white px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold">
                    {selectedItem.ttbId || selectedItem.id.slice(0, 10)}
                  </h2>
                  <span className="text-xs text-gray-400">
                    {selectedItem.applicationData.brandName} •{" "}
                    {selectedItem.applicationData.classType}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedItemId(null)}
                  className="p-1 hover:bg-gray-800 rounded"
                  title="Close Inspector"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Confidence Header */}
              <div className="bg-gray-50 border-b border-gray-200 px-3 py-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-700">
                    Overall Confidence
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          (selectedItem.result.applicationConfidence?.overall ||
                            0) >= 0.85
                            ? "bg-green-500"
                            : (selectedItem.result.applicationConfidence
                                ?.overall || 0) >= 0.6
                            ? "bg-yellow-500"
                            : "bg-red-500"
                        }`}
                        style={{
                          width: `${
                            (selectedItem.result.applicationConfidence
                              ?.overall || 0) * 100
                          }%`,
                        }}
                      ></div>
                    </div>
                    <span
                      className={`text-sm font-bold ${
                        (selectedItem.result.applicationConfidence?.overall ||
                          0) >= 0.85
                          ? "text-green-600"
                          : (selectedItem.result.applicationConfidence
                              ?.overall || 0) >= 0.6
                          ? "text-yellow-600"
                          : "text-red-600"
                      }`}
                    >
                      {Math.round(
                        (selectedItem.result.applicationConfidence?.overall ||
                          0) * 100
                      )}
                      %
                    </span>
                  </div>
                </div>
                {selectedItem.result.applicationConfidence?.reason && (
                  <div className="bg-yellow-50 border-l-4 border-yellow-500 p-2 text-xs">
                    <div className="font-medium text-yellow-800 mb-0.5">
                      Needs review because:
                    </div>
                    <div className="text-yellow-700">
                      • {selectedItem.result.applicationConfidence.reason}
                    </div>
                  </div>
                )}
              </div>

              {/* Image Viewer */}
              {selectedItem.images && selectedItem.images.length > 0 && (
                <div className="border-b border-gray-200 bg-gray-900 flex flex-col" style={{ height: "550px" }}>
                  {/* Image Tabs */}
                  <div className="flex items-center gap-2 bg-gray-800 px-3 py-2 border-b border-gray-700">
                    {selectedItem.images.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setActiveImageIndex(idx);
                          setImageZoom("fit");
                        }}
                        className={`px-3 py-1 text-xs font-medium rounded ${
                          activeImageIndex === idx
                            ? "bg-blue-600 text-white"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        Image {idx + 1}
                      </button>
                    ))}

                    {/* Zoom Controls */}
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => setImageZoom("fit")}
                        className={`p-1 rounded ${imageZoom === "fit" ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-700"}`}
                        title="Fit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setImageZoom(100)}
                        className={`px-2 py-1 text-xs rounded ${imageZoom === 100 ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-700"}`}
                      >
                        100%
                      </button>
                      <button
                        onClick={() => setImageZoom(200)}
                        className={`px-2 py-1 text-xs rounded ${imageZoom === 200 ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-700"}`}
                      >
                        200%
                      </button>
                    </div>
                  </div>

                  {/* Image Display */}
                  <div className="flex-1 overflow-auto bg-gray-900 flex items-center justify-center">
                    {(() => {
                      const img = selectedItem.images[activeImageIndex];
                      const imageUrl = img instanceof File ? URL.createObjectURL(img) : img;
                      return (
                        <img
                          key={activeImageIndex}
                          src={imageUrl}
                          alt={`Label Image ${activeImageIndex + 1}`}
                          className={imageZoom === "fit" ? "max-w-full max-h-full object-contain" : ""}
                          style={imageZoom !== "fit" ? { width: `${imageZoom}%` } : {}}
                          onLoad={() => {
                            if (img instanceof File) {
                              URL.revokeObjectURL(imageUrl);
                            }
                          }}
                        />
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Field Comparison Table */}
              <div className="flex-1 overflow-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-600 uppercase w-24">
                        Field
                      </th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-600 uppercase">
                        Application
                      </th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-600 uppercase">
                        Label
                      </th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-600 uppercase w-20">
                        Conf.
                      </th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-600 uppercase w-20">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {selectedItem.result.verdicts.map((verdict, idx) => {
                      const bgColor =
                        verdict.status === "MATCH"
                          ? "bg-green-50"
                          : verdict.status === "MISMATCH"
                          ? "bg-red-50"
                          : "bg-yellow-50";
                      const badgeColor =
                        verdict.status === "MATCH"
                          ? "bg-green-100 text-green-800"
                          : verdict.status === "MISMATCH"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800";

                      return (
                        <tr key={idx} className={bgColor}>
                          <td className="px-2 py-1.5 font-medium text-gray-900">
                            {verdict.field}
                          </td>
                          <td className="px-2 py-1.5 text-gray-900">
                            {verdict.applicationValue}
                          </td>
                          <td className="px-2 py-1.5 text-gray-900">
                            {verdict.labelValue || (
                              <span className="text-gray-400">Not found</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            {verdict.confidence && (
                              <div className="flex items-center gap-1">
                                <div className="w-10 bg-gray-200 rounded-full h-1">
                                  <div
                                    className={`h-1 rounded-full ${
                                      verdict.confidence.score >= 0.85
                                        ? "bg-green-500"
                                        : verdict.confidence.score >= 0.6
                                        ? "bg-yellow-500"
                                        : "bg-red-500"
                                    }`}
                                    style={{
                                      width: `${verdict.confidence.score * 100}%`,
                                    }}
                                  ></div>
                                </div>
                                <span className="text-xs font-medium">
                                  {Math.round(verdict.confidence.score * 100)}%
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${badgeColor}`}
                            >
                              {verdict.status === "MATCH"
                                ? "Match"
                                : verdict.status === "MISMATCH"
                                ? "Mismatch"
                                : "Review"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Action Bar */}
              {selectedItem.workflowState === "needs_review" && (
                <div className="bg-white border-t border-gray-200 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(selectedItem.id)}
                      className="flex-1 px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700"
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => handleReject(selectedItem.id)}
                      className="flex-1 px-3 py-1.5 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700"
                    >
                      ✗ Reject
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 text-center">
                    Approve if matches, Reject if needs correction
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
