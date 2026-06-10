import type { VerificationResult } from "@/lib/types";
import VerdictCard from "./VerdictCard";

interface ResultsPanelProps {
  result: VerificationResult;
}

export default function ResultsPanel({ result }: ResultsPanelProps) {
  const { verdicts, overall, processingMs, imageQualityNote } = result;

  const overallConfig = {
    MATCH: {
      bgColor: "bg-green-600",
      textColor: "text-white",
      message: "All fields verified successfully",
    },
    MISMATCH: {
      bgColor: "bg-red-600",
      textColor: "text-white",
      message: "One or more fields do not match",
    },
    NEEDS_REVIEW: {
      bgColor: "bg-yellow-500",
      textColor: "text-gray-900",
      message: "Manual review needed for some fields",
    },
  };

  const config = overallConfig[overall];

  return (
    <div className="space-y-4">
      {/* Overall verdict banner */}
      <div className={`${config.bgColor} ${config.textColor} rounded-lg p-6`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold mb-1">
              Overall: {overall.replace("_", " ")}
            </h2>
            <p className="text-lg">{config.message}</p>
          </div>
          <div className="text-right">
            <div className="text-sm opacity-90">Processing Time</div>
            <div className="text-2xl font-bold">
              {(processingMs / 1000).toFixed(2)}s
            </div>
          </div>
        </div>
      </div>

      {/* Image quality warning */}
      {imageQualityNote && (
        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="text-xl">⚠</div>
            <div className="flex-1">
              <p className="text-yellow-900 font-medium">{imageQualityNote}</p>
            </div>
          </div>
        </div>
      )}

      {/* Individual field verdicts */}
      <div className="space-y-3">
        {verdicts.map((verdict, index) => (
          <VerdictCard key={`${verdict.field}-${index}`} verdict={verdict} />
        ))}
      </div>
    </div>
  );
}
