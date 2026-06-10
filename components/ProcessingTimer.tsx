"use client";

import { useEffect, useState } from "react";

interface ProcessingTimerProps {
  isProcessing: boolean;
}

export default function ProcessingTimer({
  isProcessing,
}: ProcessingTimerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isProcessing) {
      setElapsedSeconds(0);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      setElapsedSeconds(elapsed);
    }, 100);

    return () => clearInterval(interval);
  }, [isProcessing]);

  if (!isProcessing) return null;

  return (
    <div className="text-center py-4">
      <div className="inline-flex items-center gap-2 text-lg">
        <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
        <span>Checking… {elapsedSeconds.toFixed(1)}s</span>
      </div>
    </div>
  );
}
