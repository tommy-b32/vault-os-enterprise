import VaultIcon, {
  type VaultIconName,
} from "@/components/brain/workspace/VaultIcon";

type MissionMetricProps = {
  label: string;
  value: string | number;
  icon: VaultIconName;
};

export default function MissionMetric({
  label,
  value,
  icon,
}: MissionMetricProps) {
  return (
    <article className="vault-card mission-metric-card">
      <div className="mission-metric-label">
        <span className="vault-card-icon">
          <VaultIcon name={icon} />
        </span>

        <span>{label}</span>
      </div>

      <strong>{value}</strong>
    </article>
  );
}
