type BrainMetricProps = {
  label: string;
  value: number | string;
  helper?: string;
  tone?: "default" | "success" | "warning" | "danger";
};

export function BrainMetric({
  label,
  value,
  helper,
  tone = "default",
}: BrainMetricProps) {
  return (
    <article
      className={`brain-metric brain-metric-${tone}`}
    >
      <span className="brain-metric-label">
        {label}
      </span>

      <strong className="brain-metric-value">
        {value}
      </strong>

      {helper && (
        <span className="brain-metric-helper">
          {helper}
        </span>
      )}
    </article>
  );
}