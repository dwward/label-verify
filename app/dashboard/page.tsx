"use client";

import { useState, useEffect } from "react";
import AppNavigation from "@/components/AppNavigation";
import { triageApplication, calculateBatchStatistics } from "@/lib/triage";
import { compressImage } from "@/lib/image-compression";
import { Semaphore } from "@/lib/semaphore";
import { loadCAPPackages } from "@/lib/cap-loader";
import type { QueueItem, BatchStatistics, WorkflowState } from "@/lib/types";

const semaphore = new Semaphore(5); // Max 5 concurrent requests

export default function DashboardPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [statistics, setStatistics] = useState<BatchStatistics | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<"all" | WorkflowState>("all");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageZoom, setImageZoom] = useState(1); // 1 = 100%, 2 = 200%
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState(false);
  const [batchSummaryVisible, setBatchSummaryVisible] = useState(false);
  const [processingJustCompleted, setProcessingJustCompleted] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [autoOpenedItemId, setAutoOpenedItemId] = useState<string | null>(null);

  // Load queue from sessionStorage on mount
  useEffect(() => {
    // Priority 1: Check for preserved dashboard queue with images (same-session navigation)
    const dashboardQueue = (window as any).__dashboardQueue;
    if (dashboardQueue && Array.isArray(dashboardQueue) && dashboardQueue.length > 0) {
      // Verify that at least some items have actual images (File objects)
      const hasValidImages = dashboardQueue.some(
        (item: any) => item.images && Array.isArray(item.images) && item.images.length > 0 &&
        item.images.some((img: any) => img instanceof File)
      );

      if (hasValidImages) {
        setQueue(dashboardQueue);
        // Don't delete - keep for subsequent navigations within same session
        return;
      }
      // If no valid images found, fall through to other loading methods
    }

    // Priority 2: Fresh import from upload page
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
      // Priority 3: Load from localStorage (browser refresh - no images available)
      const storedQueue = localStorage.getItem("label-verify-queue");
      if (storedQueue) {
        try {
          const parsed: QueueItem[] = JSON.parse(storedQueue);
          // Don't filter out items - keep all completed work visible
          if (parsed.length > 0) {
            // Set empty images array for items loaded from localStorage
            const itemsWithEmptyImages = parsed.map(item => ({
              ...item,
              images: item.images || [], // Empty array instead of null
            }));
            setQueue(itemsWithEmptyImages);
          }
        } catch (error) {
          console.error("Failed to load queue:", error);
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

  // Save queue to both localStorage (no images) and window global (with images)
  useEffect(() => {
    if (queue.length > 0) {
      // Save metadata without File objects for localStorage
      const metadata = queue.map(item => ({
        ...item,
        images: [], // Empty array - images can't be serialized
      }));
      localStorage.setItem("label-verify-queue", JSON.stringify(metadata));

      // Store the full queue with images in window global for same-session navigation
      // Use a ref-like pattern to always have latest queue
      (window as any).__dashboardQueue = queue;
    } else {
      // Queue is empty - clear everything
      localStorage.removeItem("label-verify-queue");
      delete (window as any).__dashboardQueue;
    }
  }, [queue]);

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
      setQueue((currentQueue) => {
        const stats = calculateBatchStatistics(currentQueue);
        if (stats.reviewQueueSize > 0) {
          setFilterState("needs_review");

          // Auto-select the first needs_review item (lowest confidence)
          const needsReviewItems = currentQueue.filter(
            (item) => item.workflowState === "needs_review"
          );
          if (needsReviewItems.length > 0) {
            const sorted = needsReviewItems.sort((a, b) => {
              const aConf = a.result?.applicationConfidence?.overall || 0;
              const bConf = b.result?.applicationConfidence?.overall || 0;
              return aConf - bConf;
            });
            setSelectedItemId(sorted[0].id);
            setAutoOpenedItemId(sorted[0].id); // Track auto-opened item
          }
        } else if ((stats.byWorkflowState.error || 0) > 0) {
          setFilterState("error");
        }
        // Otherwise stay on "all"
        return currentQueue;
      });
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

  const handleClearAll = () => {
    if (confirm(`Clear all ${queue.length} applications from dashboard? This cannot be undone.`)) {
      setQueue([]);
      setStatistics(null);
      setSelectedItemId(null);
      setFilterState("all");
      localStorage.removeItem("label-verify-queue");
      sessionStorage.removeItem("label-verify-metadata");
      delete (window as any).__pendingQueueImages;
      delete (window as any).__dashboardQueue; // Also clear the preserved queue
    }
  };

  const handleExportDispositions = () => {
    // Helper to safely convert timestamp to ISO string
    const toISOSafe = (timestamp: number | undefined | null): string | null => {
      if (!timestamp) return null;
      try {
        return new Date(timestamp).toISOString();
      } catch {
        return null;
      }
    };

    // Export all items (ignore filter) as JSON
    const exportData = queue.map((item) => ({
      id: item.ttbId || item.id,
      brandName: item.applicationData.brandName,
      classType: item.applicationData.classType,
      alcoholContent: item.applicationData.alcoholContent,
      netContents: item.applicationData.netContents,
      status: item.workflowState || item.status,
      overallVerdict: item.result?.overall || null,
      confidence: item.result?.applicationConfidence?.overall || null,
      processingTimeMs: item.totalProcessingMs || null,
      addedAt: toISOSafe(item.addedAt),
      completedAt: toISOSafe(item.completedAt),
      reviewedAt: toISOSafe(item.reviewedAt),
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `label-verify-dispositions-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSidebarDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);

    try {
      const files = Array.from(e.dataTransfer.files);
      const result = await loadCAPPackages(files);

      if (result.errors.length > 0) {
        alert(`Import errors:\n${result.errors.map(e => e.message).join('\n')}`);
      }

      if (result.applications.length === 0) {
        return;
      }

      // APPEND to existing queue instead of replacing
      const newItems: QueueItem[] = result.applications.map((app, idx) => ({
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
        images: app.images,
        status: "pending" as const,
        workflowState: "pending" as const,
        addedAt: Date.now(),
      }));

      setQueue(prev => [...prev, ...newItems]);

      // Start processing new items only
      startProcessing(newItems);
    } catch (error) {
      console.error("Sidebar drop error:", error);
      alert("Error loading files. Please try again.");
    }
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
      // No more items to review - switch to Passed filter
      setSelectedItemId(null);
      setFilterState("auto_passed");
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
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
  }, [selectedItemId]);

  const processingCount = queue.filter((q) => q.status === "processing").length;
  const completedCount = queue.filter((q) => q.status === "completed").length;

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-50">
      <AppNavigation reviewQueueCount={statistics?.reviewQueueSize || 0} />

      <div className="flex-1 flex flex-col overflow-hidden pt-16 md:pt-0">
        {/* Top Bar */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-4">
              <h1 className="text-lg md:text-xl font-semibold text-gray-900">
                Batch Dashboard
              </h1>
              <span className="text-sm text-gray-500">
                {queue.length} applications
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {queue.length > 0 && (
                <>
                  <button
                    onClick={handleExportDispositions}
                    className="px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium text-blue-600 border border-blue-300 rounded hover:bg-blue-50 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="hidden sm:inline">Export Dispositions</span>
                    <span className="sm:hidden">Export</span>
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium text-red-600 border border-red-300 rounded hover:bg-red-50 whitespace-nowrap"
                  >
                    Clear All
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Processing Progress Bar (only during processing) */}
        {isProcessing && statistics && (
          <div className="bg-white border-b border-gray-200 px-6 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Processing:</span>
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{
                    width: `${(completedCount / queue.length) * 100}%`,
                  }}
                ></div>
              </div>
              <span className="text-sm font-medium text-gray-700">
                {completedCount} / {queue.length}
              </span>
            </div>
          </div>
        )}

        {/* Batch Summary Banner (dismissible, shown after import completes) */}
        {batchSummaryVisible && statistics && !isProcessing && (() => {
          // Calculate average processing time
          const completedItems = queue.filter(item => item.totalProcessingMs);
          const avgTime = completedItems.length > 0
            ? completedItems.reduce((sum, item) => sum + (item.totalProcessingMs || 0), 0) / completedItems.length
            : 0;

          return (
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
                  {statistics.byWorkflowState.rejected || 0} rejected,{" "}
                  {statistics.byWorkflowState.error || 0} failed
                  {avgTime > 0 && (
                    <span className="ml-2 text-blue-700">
                      • Avg time: {(avgTime / 1000).toFixed(1)}s
                    </span>
                  )}
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
          );
        })()}

        {/* Filter Bar */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-2 flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-3">
          <span className="text-sm font-medium text-gray-600 w-full md:w-auto">Show:</span>
          <button
            onClick={() => {
              // Close inspector unless it's the auto-opened item
              if (selectedItemId && selectedItemId !== autoOpenedItemId) {
                setSelectedItemId(null);
              }
              setFilterState("all");
            }}
            disabled={isProcessing && filterState !== "all"}
            className={`flex-1 md:flex-initial px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium rounded ${
              filterState === "all"
                ? "bg-blue-600 text-white"
                : "text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            Imported ({queue.length})
          </button>
          <button
            onClick={() => {
              // Close inspector unless it's the auto-opened item
              if (selectedItemId && selectedItemId !== autoOpenedItemId) {
                setSelectedItemId(null);
              }
              setFilterState("needs_review");
            }}
            disabled={isProcessing}
            className={`flex-1 md:flex-initial px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium rounded ${
              filterState === "needs_review"
                ? "bg-yellow-100 text-yellow-800 border border-yellow-300"
                : "text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            Needs Review ({statistics?.reviewQueueSize || 0})
          </button>
          <button
            onClick={() => {
              // Close inspector unless it's the auto-opened item
              if (selectedItemId && selectedItemId !== autoOpenedItemId) {
                setSelectedItemId(null);
              }
              setFilterState("auto_passed");
            }}
            disabled={isProcessing}
            className={`flex-1 md:flex-initial px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium rounded ${
              filterState === "auto_passed"
                ? "bg-green-100 text-green-800"
                : "text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            Passed ({(statistics?.byWorkflowState.auto_passed || 0) + (statistics?.byWorkflowState.approved || 0)})
          </button>
          <button
            onClick={() => {
              // Close inspector unless it's the auto-opened item
              if (selectedItemId && selectedItemId !== autoOpenedItemId) {
                setSelectedItemId(null);
              }
              setFilterState("rejected");
            }}
            disabled={isProcessing}
            className={`flex-1 md:flex-initial px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium rounded ${
              filterState === "rejected"
                ? "bg-red-100 text-red-800 border border-red-300"
                : "text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            Rejected ({statistics?.byWorkflowState.rejected || 0})
          </button>
          <button
            onClick={() => {
              // Close inspector unless it's the auto-opened item
              if (selectedItemId && selectedItemId !== autoOpenedItemId) {
                setSelectedItemId(null);
              }
              setFilterState("error");
            }}
            disabled={isProcessing}
            className={`flex-1 md:flex-initial px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium rounded ${
              filterState === "error"
                ? "bg-red-100 text-red-800"
                : "text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            Failed Import ({statistics?.byWorkflowState.error || 0})
          </button>

          {filterState === "needs_review" && statistics && (
            <span className="ml-auto text-sm text-gray-600 px-2 py-1 bg-blue-50 border border-blue-200 rounded">
              {(statistics.byWorkflowState.approved || 0) +
                (statistics.byWorkflowState.rejected || 0)}{" "}
              of {statistics.reviewQueueSize} reviewed
            </span>
          )}
        </div>

        {/* Split Content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Results Table - Simplified (ID only) */}
          <div
            className={`${
              selectedItem ? "hidden md:w-36" : "w-full"
            } flex flex-col border-r border-gray-200 bg-white transition-all`}
          >
            <div className="flex-1 overflow-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 uppercase">
                      Application ID
                    </th>
                    {!selectedItem && (
                      <>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 uppercase">
                          Conf.
                        </th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 uppercase">
                          Time
                        </th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 uppercase">
                          Issue
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {queue.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <h3 className="text-lg font-medium text-gray-900 mb-2">No Applications Imported</h3>
                          <p className="text-sm text-gray-600 mb-4">
                            Import CAP packages to start batch verification
                          </p>
                          <a
                            href="/upload"
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            Go to Upload Applications
                          </a>
                        </div>
                      </td>
                    </tr>
                  ) : filteredQueue.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <svg className="w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                          </svg>
                          <p className="text-sm text-gray-600">
                            No applications match the current filter
                          </p>
                          <button
                            onClick={() => {
                              if (selectedItemId && selectedItemId !== autoOpenedItemId) {
                                setSelectedItemId(null);
                              }
                              setFilterState("all");
                            }}
                            className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
                          >
                            Clear filter
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredQueue.map((item) => {
                      const isSelected = item.id === selectedItemId;
                    const confidence = item.result?.applicationConfidence?.overall || 0;
                    const isManuallyReviewed = item.workflowState === "approved" || item.workflowState === "rejected";

                    // Determine row background color based on workflow state
                    let rowBgClass = "";
                    if (item.workflowState === "auto_passed") {
                      rowBgClass = "bg-green-50";
                    } else if (item.workflowState === "approved" || item.workflowState === "rejected") {
                      // Manually reviewed items get light yellow background
                      rowBgClass = "bg-amber-50";
                    } else if (item.workflowState === "needs_review") {
                      rowBgClass = "bg-yellow-50";
                    } else if (item.workflowState === "error") {
                      rowBgClass = "bg-red-50";
                    }

                    return (
                      <tr
                        key={item.id}
                        onClick={() => {
                          if (!isProcessing) {
                            setSelectedItemId(isSelected ? null : item.id);
                            // Clear auto-opened tracking when user manually selects
                            if (!isSelected) {
                              setAutoOpenedItemId(null);
                            }
                          }
                        }}
                        className={`${isProcessing ? 'cursor-wait' : 'cursor-pointer'} ${
                          isSelected
                            ? "bg-blue-100 border-l-4 border-blue-600"
                            : `${rowBgClass} ${!isProcessing && 'hover:bg-gray-100'}`
                        }`}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div
                              className={`text-sm ${
                                isSelected ? "font-semibold" : "font-medium"
                              } text-gray-900`}
                            >
                              {item.ttbId || item.id.slice(0, 10)}
                            </div>
                            {/* Loading spinner for processing items */}
                            {item.status === "processing" && (
                              <svg
                                className="animate-spin h-4 w-4 text-blue-600"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                ></circle>
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                              </svg>
                            )}
                          </div>
                        </td>

                        {/* Show Confidence, Time, and Issue columns only when inspector is closed */}
                        {!selectedItem && (
                          <>
                            <td className="px-3 py-2">
                              {isManuallyReviewed ? (
                                <span className="text-sm italic text-amber-700">
                                  Manually reviewed
                                </span>
                              ) : item.status === "completed" && confidence > 0 ? (
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
                                    className={`text-sm font-bold ${
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
                                <span className="text-sm text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-700">
                              {item.totalProcessingMs ? (
                                <span className="font-medium">
                                  {(item.totalProcessingMs / 1000).toFixed(1)}s
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-700">
                              {item.status === "processing" && "Processing..."}
                              {item.status === "pending" && "Pending"}
                              {item.status === "error" && (
                                <div className="text-red-600">
                                  <div className="font-medium flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                    Failed
                                  </div>
                                  <div className="text-sm mt-1">
                                    {item.error || "Verification failed"}
                                  </div>
                                </div>
                              )}
                              {item.status === "completed" &&
                                item.result?.applicationConfidence?.reason}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Inspector Panel */}
          {selectedItem && selectedItem.result && (
            <div className="flex-1 bg-white flex flex-col md:ml-4 md:min-w-[600px] overflow-auto">
              {/* Inspector Header */}
              <div className="bg-gray-900 text-white px-2 md:px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                  <h2 className="text-sm md:text-base font-semibold truncate">
                    {selectedItem.ttbId || selectedItem.id.slice(0, 10)}
                  </h2>
                  <span className="text-xs md:text-sm text-gray-400 truncate">
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
                  <div className="flex items-center gap-2">
                    {selectedItem.workflowState === "auto_passed" && (
                      <span className="text-sm font-semibold text-green-700 bg-green-100 px-2 py-1 rounded">
                        ✓ Auto Accepted
                      </span>
                    )}
                    {selectedItem.workflowState === "approved" && (
                      <span className="text-sm font-semibold text-blue-700 bg-blue-100 px-2 py-1 rounded">
                        ✓ Manually Approved
                      </span>
                    )}
                    {selectedItem.workflowState === "rejected" && (
                      <span className="text-sm font-semibold text-red-700 bg-red-100 px-2 py-1 rounded">
                        ✗ Manually Rejected
                      </span>
                    )}
                    {selectedItem.workflowState === "needs_review" && (
                      <span className="text-sm font-medium text-gray-700">
                        Overall Confidence
                      </span>
                    )}
                  </div>
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
                  <div className="bg-yellow-50 border-l-4 border-yellow-500 p-2 text-sm">
                    <div className="font-medium text-yellow-800 mb-0.5">
                      Needs review because:
                    </div>
                    <div className="text-yellow-700">
                      • {selectedItem.result.applicationConfidence.reason}
                    </div>
                  </div>
                )}
              </div>

              {/* Horizontal Split: Image Carousel (Left) | Field Table (Right) */}
              <div className="flex flex-col md:flex-row flex-1 overflow-auto border-b border-gray-200">
                {/* Image Viewer - Left Side */}
                {selectedItem.images && selectedItem.images.length > 0 ? (
                  <div className="w-full md:w-1/2 bg-gray-900 flex flex-col border-b md:border-b-0 md:border-r border-gray-700 h-48 md:h-auto flex-shrink-0">
                    {/* Image Tabs */}
                    <div className="flex items-center gap-2 bg-gray-800 px-3 py-2 border-b border-gray-700 overflow-x-auto">
                      {selectedItem.images.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setActiveImageIndex(idx);
                            setImageZoom(1);
                            setImagePan({ x: 0, y: 0 });
                          }}
                          className={`px-3 md:px-4 py-1.5 text-xs md:text-sm font-medium rounded whitespace-nowrap flex-shrink-0 ${
                            activeImageIndex === idx
                              ? "bg-blue-600 text-white"
                              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                          }`}
                        >
                          Image {idx + 1}
                        </button>
                      ))}

                      <div className="ml-auto hidden md:flex items-center gap-2">
                        <span className="text-sm text-gray-500">Zoom:</span>
                        <button
                          onClick={() => {
                            setImageZoom(1);
                            setImagePan({ x: 0, y: 0 });
                          }}
                          className={`px-3 py-1.5 text-sm rounded ${
                            imageZoom === 1
                              ? "bg-blue-600 text-white"
                              : "text-gray-400 hover:bg-gray-700"
                          }`}
                        >
                          100%
                        </button>
                        <button
                          onClick={() => {
                            setImageZoom(2);
                            setImagePan({ x: 0, y: 0 });
                          }}
                          className={`px-3 py-1.5 text-sm rounded ${
                            imageZoom === 2
                              ? "bg-blue-600 text-white"
                              : "text-gray-400 hover:bg-gray-700"
                          }`}
                        >
                          200%
                        </button>
                        <button
                          onClick={() => {
                            setImageZoom(3);
                            setImagePan({ x: 0, y: 0 });
                          }}
                          className={`px-3 py-1.5 text-sm rounded ${
                            imageZoom === 3
                              ? "bg-blue-600 text-white"
                              : "text-gray-400 hover:bg-gray-700"
                          }`}
                        >
                          300%
                        </button>
                        <button
                          onClick={() => setImagePan({ x: 0, y: 0 })}
                          className="p-1 text-gray-400 hover:bg-gray-700 rounded"
                          title="Recenter"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Image Display */}
                    <div
                      className="flex-1 bg-gray-900 flex items-center justify-center p-2 md:p-4 overflow-hidden relative touch-none"
                      style={{ cursor: isDragging ? 'grabbing' : (imageZoom > 1 ? 'grab' : 'zoom-in') }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setHasDragged(false);
                        setIsDragging(true);
                        setDragStart({ x: e.clientX, y: e.clientY });
                      }}
                      onMouseMove={(e) => {
                        if (isDragging && imageZoom > 1) {
                          const deltaX = e.clientX - dragStart.x;
                          const deltaY = e.clientY - dragStart.y;

                          // If moved more than 3 pixels, it's a drag not a click
                          if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
                            setHasDragged(true);
                          }

                          setImagePan({
                            x: imagePan.x + deltaX,
                            y: imagePan.y + deltaY,
                          });
                          setDragStart({ x: e.clientX, y: e.clientY });
                        }
                      }}
                      onMouseUp={() => {
                        setIsDragging(false);
                      }}
                      onMouseLeave={() => {
                        setIsDragging(false);
                      }}
                      onTouchStart={(e) => {
                        if (e.touches.length === 1 && imageZoom > 1) {
                          e.preventDefault();
                          setHasDragged(false);
                          setIsDragging(true);
                          setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
                        }
                      }}
                      onTouchMove={(e) => {
                        if (isDragging && e.touches.length === 1 && imageZoom > 1) {
                          const deltaX = e.touches[0].clientX - dragStart.x;
                          const deltaY = e.touches[0].clientY - dragStart.y;

                          if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
                            setHasDragged(true);
                          }

                          setImagePan({
                            x: imagePan.x + deltaX,
                            y: imagePan.y + deltaY,
                          });
                          setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
                        }
                      }}
                      onTouchEnd={() => {
                        setIsDragging(false);
                      }}
                      onClick={(e) => {
                        if (!hasDragged) {
                          // Cycle through zoom levels: 1 → 2 → 3 → 1
                          const nextZoom = imageZoom === 1 ? 2 : imageZoom === 2 ? 3 : 1;
                          setImageZoom(nextZoom);
                          setImagePan({ x: 0, y: 0 });
                        }
                      }}
                    >
                      {selectedItem.images[activeImageIndex] && (() => {
                        const img = selectedItem.images[activeImageIndex];
                        const imageUrl = img instanceof File ? URL.createObjectURL(img) : img;
                        return (
                          <img
                            src={imageUrl}
                            alt={`Label Image ${activeImageIndex + 1}`}
                            className="max-w-full max-h-full object-contain select-none pointer-events-none"
                            style={{
                              transform: `scale(${imageZoom}) translate(${imagePan.x / imageZoom}px, ${imagePan.y / imageZoom}px)`,
                              transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                            }}
                            draggable={false}
                          />
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="w-full md:w-1/2 bg-gray-100 flex items-center justify-center border-b md:border-b-0 md:border-r border-gray-300 h-48 md:h-auto flex-shrink-0">
                    <div className="text-center text-gray-500 p-6">
                      <svg className="mx-auto h-12 w-12 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-base font-medium">Images Not Available</p>
                      <p className="text-sm mt-1">
                        Images are only available during the current session.<br />
                        Verification results are preserved.
                      </p>
                    </div>
                  </div>
                )}

                {/* Field Comparison Table - Right Side */}
                <div className="w-full md:w-1/2 overflow-auto bg-white">
                  <table className="min-w-full text-xs md:text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="px-1 md:px-2 py-1.5 text-left text-xs font-medium text-gray-600 uppercase w-24">
                          Field
                        </th>
                        <th className="px-1 md:px-2 py-1.5 text-left text-xs font-medium text-gray-600 uppercase">
                          Application
                        </th>
                        <th className="px-1 md:px-2 py-1.5 text-left text-xs font-medium text-gray-600 uppercase">
                          Label
                        </th>
                        <th className="px-1 md:px-2 py-1.5 text-left text-xs font-medium text-gray-600 uppercase w-20 hidden sm:table-cell">
                          Conf.
                        </th>
                        <th className="px-1 md:px-2 py-1.5 text-left text-xs font-medium text-gray-600 uppercase w-20">
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
                            <td className="px-1 md:px-2 py-1 md:py-1.5 font-medium text-gray-900">
                              {verdict.field}
                            </td>
                            <td className="px-1 md:px-2 py-1 md:py-1.5 text-gray-900">
                              {verdict.applicationValue}
                            </td>
                            <td className="px-1 md:px-2 py-1 md:py-1.5 text-gray-900">
                              {verdict.labelValue || (
                                <span className="text-gray-400">Not found</span>
                              )}
                            </td>
                            <td className="px-1 md:px-2 py-1 md:py-1.5 hidden sm:table-cell">
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
                                  <span className="text-sm font-medium">
                                    {Math.round(verdict.confidence.score * 100)}%
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-1 md:px-2 py-1 md:py-1.5">
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded text-xs md:text-sm font-medium ${badgeColor}`}
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
              </div>

              {/* Action Bar */}
              {selectedItem.workflowState === "needs_review" && (
                <div className="bg-white border-t border-gray-200 px-2 md:px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(selectedItem.id)}
                      className="flex-1 px-3 md:px-4 py-2 md:py-2.5 bg-green-600 text-white rounded text-sm md:text-base font-medium hover:bg-green-700"
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => handleReject(selectedItem.id)}
                      className="flex-1 px-3 md:px-4 py-2 md:py-2.5 bg-red-600 text-white rounded text-sm md:text-base font-medium hover:bg-red-700"
                    >
                      ✗ Reject
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 mt-1.5 text-center">
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
