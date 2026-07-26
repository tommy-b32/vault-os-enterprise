import type {
  Mission,
  MissionPriorityBand,
} from "@/types/missions";

const PRIORITY_LABELS: Record<
  MissionPriorityBand,
  string
> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

type MissionPriorityBadgeProps = {
  mission: Mission;
};

export default function MissionPriorityBadge({
  mission,
}: MissionPriorityBadgeProps) {
  return (
    <span
      className={`mission-priority mission-priority-${mission.score.priority}`}
    >
      {PRIORITY_LABELS[mission.score.priority]}

      <i>•</i>

      {mission.score.total}
    </span>
  );
}