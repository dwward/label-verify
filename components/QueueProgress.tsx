"use client";

import type { QueueProgress } from "@/lib/types";

interface Props {
  progress: QueueProgress;
}

export function QueueProgress({ progress }: Props) {
  const percentComplete =
    progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

  return (
    <div className="border rounded-lg p-4 bg-gray-50">
      <div className="flex justify-between text-sm mb-2">
        <span>
          <strong>{progress.completed}</strong> of <strong>{progress.total}</strong>{" "}
          completed
        </span>
        <span className="text-gray-600">
          {progress.processing > 0 && `${progress.processing} processing`}
          {progress.pending > 0 && ` · ${progress.pending} waiting`}
          {progress.failed > 0 && ` · ${progress.failed} failed`}
        </span>
      </div>
      <div className="w-full bg-gray-300 rounded-full h-3">
        <div
          className="bg-blue-600 h-3 rounded-full transition-all duration-300"
          style={{ width: `${percentComplete}%` }}
        />
      </div>
    </div>
  );
}
