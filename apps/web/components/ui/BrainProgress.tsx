type BrainProgressProps = {
  label: string;
  value: number;
  helper?: string;
};

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function BrainProgress({
  label,
  value,
  helper,
}: BrainProgressProps) {
  const percentage = clampPercentage(value);

  return (
    <div className="brain-progress">
      <div className="brain-progress-heading">
        <span>{label}</span>

        <strong>{Math.round(percentage)}%</strong>
      </div>

      <div
        className="brain-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percentage)}
      >
        <span
          className="brain-progress-fill"
          style={{
            width: `${percentage}%`,
          }}
        />
      </div>

      {helper && (
        <p className="brain-progress-helper">
          {helper}
        </p>
      )}
    </div>
  );
}