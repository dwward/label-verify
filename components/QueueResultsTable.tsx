"use client";

import React, { useState, useEffect } from "react";
import type { QueueItem } from "@/lib/types";
import VerdictCard from "./VerdictCard";

interface Props {
  queue: QueueItem[];
}

export function QueueResultsTable({ queue }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Auto-expand when queue has exactly one item
  useEffect(() => {
    if (queue.length === 1 && queue[0].status === "completed") {
      setExpandedId(queue[0].id);
    }
  }, [queue]);

  // Triage sort: MISMATCH first, then NEEDS_REVIEW, then MATCH, then pending/error
  const sortedQueue = [...queue].sort((a, b) => {
    const statusOrder = { error: 0, processing: 1, pending: 2 };

    if (a.status !== "completed" || b.status !== "completed") {
      return (
        (statusOrder[a.status as keyof typeof statusOrder] ?? 99) -
        (statusOrder[b.status as keyof typeof statusOrder] ?? 99)
      );
    }

    const verdictOrder = { MISMATCH: 0, NEEDS_REVIEW: 1, MATCH: 2 };
    const aOrder =
      verdictOrder[a.result?.overall as keyof typeof verdictOrder] ?? 99;
    const bOrder =
      verdictOrder[b.result?.overall as keyof typeof verdictOrder] ?? 99;

    return aOrder - bOrder;
  });

  const toggleRow = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const getStatusBadge = (item: QueueItem) => {
    if (item.status === "pending") {
      return (
        <span className="px-2 py-1 rounded text-xs bg-gray-200 text-gray-700">
          Pending
        </span>
      );
    }
    if (item.status === "processing") {
      return (
        <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700">
          Processing...
        </span>
      );
    }
    if (item.status === "error") {
      return (
        <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-700">
          Error
        </span>
      );
    }

    const overall = item.result?.overall;
    if (overall === "MATCH") {
      return (
        <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800">
          ✓ Match
        </span>
      );
    }
    if (overall === "MISMATCH") {
      return (
        <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-800">
          ✗ Mismatch
        </span>
      );
    }
    return (
      <span className="px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800">
        ⚠ Needs Review
      </span>
    );
  };

  if (queue.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No applications in queue. Add an application above to begin verification.
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Application</th>
            <th className="px-4 py-3 text-left font-semibold">Status</th>
            <th className="px-4 py-3 text-left font-semibold">Summary</th>
            <th className="px-4 py-3 text-right font-semibold">Time</th>
          </tr>
        </thead>
        <tbody>
          {sortedQueue.map((item) => (
            <React.Fragment key={item.id}>
              <tr
                onClick={() => item.status === "completed" && toggleRow(item.id)}
                className={`border-t ${
                  item.status === "completed"
                    ? "cursor-pointer hover:bg-gray-50"
                    : ""
                }`}
              >
                <td className="px-4 py-3">
                  <div className="font-medium">
                    {item.applicationData.brandName}
                  </div>
                  <div className="text-sm text-gray-600">
                    {item.applicationData.classType}
                  </div>
                  {item.ttbId && (
                    <div className="text-xs text-gray-500">
                      TTB ID: {item.ttbId}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">{getStatusBadge(item)}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {item.error ||
                    (item.result
                      ? `${
                          item.result.verdicts.filter((v) => v.status === "MATCH")
                            .length
                        }/${item.result.verdicts.length} fields match`
                      : item.status === "processing"
                      ? "Verifying..."
                      : "Waiting")}
                </td>
                <td className="px-4 py-3 text-right text-sm">
                  {item.result?.processingMs
                    ? `${item.result.processingMs}ms`
                    : "-"}
                </td>
              </tr>
              {expandedId === item.id && item.result && (
                <tr>
                  <td colSpan={4} className="px-4 py-4 bg-gray-50 border-t">
                    <div className="space-y-2">
                      {item.result.verdicts.map((verdict, idx) => (
                        <VerdictCard key={idx} verdict={verdict} />
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
