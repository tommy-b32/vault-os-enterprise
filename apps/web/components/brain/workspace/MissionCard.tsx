import Link from "next/link";

import MissionAction from "@/components/brain/workspace/MissionAction";
import MissionPriorityBadge from "@/components/brain/workspace/MissionPriorityBadge";
import VaultIcon from "@/components/brain/workspace/VaultIcon";
import type { Mission } from "@/types/missions";

type MissionCardProps = {
  mission: Mission;
  featured?: boolean;
};

function formatMissionSource(source: string): string {
  return source
    .split("-")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

export default function MissionCard({
  mission,
  featured = false,
}: MissionCardProps) {
  const secondaryActions = mission.actions.filter(
    (action) =>
      action.kind === "secondary" && action.href,
  );

  return (
    <article
      className={[
        "vault-panel",
        "mission-card",
        featured ? "mission-card-featured" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="mission-card-topline">
        <div className="mission-card-identity">
          <MissionPriorityBadge mission={mission} />

          <span className="mission-source">
            {formatMissionSource(mission.source)}
          </span>
        </div>

        <span className="mission-confidence">
          <strong>{mission.score.confidence}%</strong>
          {" confidence"}
        </span>
      </div>

      <div className="mission-copy">
        <h3>{mission.title}</h3>
        <p>{mission.summary}</p>
      </div>

      <div className="mission-outcome">
        <span className="mission-outcome-icon">
          <VaultIcon name="target" size={20} />
        </span>

        <div>
          <span className="vault-card-kicker">
            Expected outcome
          </span>

          <p>{mission.outcome}</p>
        </div>
      </div>

      {mission.evidence.length > 0 ? (
        <div className="mission-evidence-grid">
          {mission.evidence.map((item) => (
            <div
              className="mission-evidence"
              key={`${mission.id}-${item.label}`}
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mission-card-actions">
        <MissionAction mission={mission} />

        {secondaryActions.map((action) => (
          <Link
            className="vault-secondary-button mission-secondary-action"
            href={action.href as string}
            key={action.id}
          >
            {action.label}
          </Link>
        ))}
      </div>
    </article>
  );
}
