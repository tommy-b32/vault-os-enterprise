type BrainConfidenceBarProps = {
  value: number;
  label?: string;
};

export function BrainConfidenceBar({
  value,
  label = "Decision Confidence",
}: BrainConfidenceBarProps) {
  const safeValue = Math.max(
    0,
    Math.min(100, Math.round(value)),
  );

  return (
    <div className="brain-confidence">
      <div className="brain-confidence-heading">
        <span>{label}</span>

        <strong>{safeValue}%</strong>
      </div>

      <div
        aria-label={`${label} ${safeValue}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={safeValue}
        className="brain-confidence-track"
        role="progressbar"
      >
        <span
          style={{
            width: `${safeValue}%`,
          }}
        />
      </div>
    </div>
  );
}