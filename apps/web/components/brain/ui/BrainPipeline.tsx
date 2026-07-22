type BrainPipelineCheck = {
  label: string;
  status:
    | "ready"
    | "warning"
    | "blocked"
    | "waiting";
};

type BrainPipelineProps = {
  title?: string;
  checks: BrainPipelineCheck[];
  visibleCheckCount: number;
  analysisComplete: boolean;
};

function getIcon(
  status: BrainPipelineCheck["status"],
) {
  switch (status) {
    case "ready":
      return "✓";

    case "warning":
      return "!";

    case "blocked":
      return "×";

    default:
      return "•";
  }
}

export function BrainPipeline({
  title,
  checks,
  visibleCheckCount,
  analysisComplete,
}: BrainPipelineProps) {
  if (checks.length === 0) {
    return null;
  }

  return (
    <>
      <h4 className="brain-analysis-heading">
        {title ??
          (analysisComplete
            ? "Analysis Complete"
            : "Running Analysis")}
      </h4>

      <div className="brain-analysis-checks">
        {checks.map((check, index) => {
          const visible =
            index < visibleCheckCount;

          const active =
            index === visibleCheckCount &&
            !analysisComplete;

          return (
            <div
              key={check.label}
              className={`brain-analysis-check ${
                visible
                  ? `check-${check.status} is-visible`
                  : "check-waiting is-pending"
              } ${
                active
                  ? "is-active"
                  : ""
              }`}
            >
              <span className="brain-analysis-check-icon">
                {visible
                  ? getIcon(check.status)
                  : "•"}
              </span>

              <span>{check.label}</span>

              <small>
                {visible
                  ? check.status === "ready"
                    ? "Complete"
                    : check.status ===
                        "warning"
                      ? "Review"
                      : check.status ===
                          "blocked"
                        ? "Blocked"
                        : "Waiting"
                  : active
                    ? "Analysing..."
                    : "Queued"}
              </small>
            </div>
          );
        })}
      </div>
    </>
  );
}