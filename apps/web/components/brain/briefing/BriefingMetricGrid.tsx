type BriefingMetric = {
  label: string;
  value: string;
  supportingText?: string;
};

type BriefingMetricGridProps = {
  metrics: BriefingMetric[];
};

export function BriefingMetricGrid({
  metrics,
}: BriefingMetricGridProps) {
  if (metrics.length === 0) {
    return null;
  }

  return (
    <div className="briefing-metric-grid">
      {metrics.map((metric) => (
        <article
          className="briefing-metric-card"
          key={metric.label}
        >
          <span>{metric.label}</span>

          <strong>{metric.value}</strong>

          {metric.supportingText && (
            <small>
              {metric.supportingText}
            </small>
          )}
        </article>
      ))}
    </div>
  );
}