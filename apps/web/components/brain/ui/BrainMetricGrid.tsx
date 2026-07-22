type BrainMetric = {
  label: string;
  value: string;
};

type BrainMetricGridProps = {
  metrics: BrainMetric[];
};

export function BrainMetricGrid({
  metrics,
}: BrainMetricGridProps) {
  if (metrics.length === 0) {
    return null;
  }

  return (
    <div className="brain-decision-metrics">
      {metrics.map((metric) => (
        <div key={metric.label}>
          <span>{metric.label}</span>

          <strong>{metric.value}</strong>
        </div>
      ))}
    </div>
  );
}