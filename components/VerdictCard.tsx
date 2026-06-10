import type { FieldVerdict } from "@/lib/types";

interface VerdictCardProps {
  verdict: FieldVerdict;
}

export default function VerdictCard({ verdict }: VerdictCardProps) {
  const { field, status, applicationValue, labelValue, explanation } = verdict;

  // Icon and color based on status
  const statusConfig = {
    MATCH: {
      icon: "✓",
      bgColor: "bg-green-100",
      textColor: "text-green-900",
      borderColor: "border-green-600",
      label: "Match",
    },
    MISMATCH: {
      icon: "✗",
      bgColor: "bg-red-100",
      textColor: "text-red-900",
      borderColor: "border-red-600",
      label: "Mismatch",
    },
    NEEDS_REVIEW: {
      icon: "⚠",
      bgColor: "bg-yellow-100",
      textColor: "text-yellow-900",
      borderColor: "border-yellow-600",
      label: "Needs Review",
    },
  };

  const config = statusConfig[status];

  return (
    <div
      className={`border-2 ${config.borderColor} rounded-lg p-4 ${config.bgColor}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`text-2xl ${config.textColor} font-bold flex-shrink-0`}
        >
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-lg">{field}</h3>
            <span
              className={`text-sm font-medium ${config.textColor} px-2 py-0.5 rounded`}
            >
              {config.label}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2 text-base">
            <div>
              <div className="text-sm text-gray-600 font-medium">
                Application:
              </div>
              <div className="font-medium break-words">{applicationValue}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 font-medium">Label:</div>
              <div className="font-medium break-words">
                {labelValue || <span className="text-gray-400">Not found</span>}
              </div>
            </div>
          </div>

          <div className={`text-sm ${config.textColor} mt-2`}>
            {explanation}
          </div>
        </div>
      </div>
    </div>
  );
}
