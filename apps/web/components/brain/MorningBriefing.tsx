import { BrainCard } from "@/components/ui/BrainCard";
import { BrainGrid } from "@/components/ui/BrainGrid";
import { BrainMetric } from "@/components/ui/BrainMetric";
import { BrainPill } from "@/components/ui/BrainPill";
import { BrainProgress } from "@/components/ui/BrainProgress";

import type {
  MorningBriefingResult,
  MorningBriefingTone,
} from "@/lib/brain/MorningBriefingEngine";

type Props = {
  briefing: MorningBriefingResult;
};

type MetricTone =
  | "default"
  | "success"
  | "warning"
  | "danger";

function getMetricTone(
  tone: MorningBriefingTone,
): MetricTone {
  switch (tone) {
    case "success":
      return "success";

    case "warning":
      return "warning";

    case "danger":
      return "danger";

    default:
      return "default";
  }
}

function getReadinessTone(
  readinessPercentage: number,
): MetricTone {
  if (readinessPercentage >= 80) {
    return "success";
  }

  if (readinessPercentage >= 35) {
    return "warning";
  }

  return "danger";
}

export function MorningBriefing({
  briefing,
}: Props) {
  return (
    <BrainCard
      title="Vault Brain"
      subtitle="Daily Intelligence Briefing"
      className="morning-briefing"
    >
      <div className="brain-stack-large">
        <div className="morning-briefing-hero">
          <div className="morning-briefing-copy">
            <BrainPill
              tone={getReadinessTone(
                briefing.readinessPercentage,
              )}
            >
              {briefing.readinessLabel} readiness
            </BrainPill>

            <div>
              <p className="morning-briefing-greeting">
                {briefing.greeting}
              </p>

              <h2>
                {briefing.headline}
              </h2>
            </div>

            <p className="morning-briefing-summary">
              {briefing.summary}
            </p>
          </div>

          <div className="morning-briefing-readiness">
            <BrainMetric
              label="Commercial Readiness"
              value={`${briefing.readinessPercentage}%`}
              helper={briefing.readinessLabel}
              tone={getReadinessTone(
                briefing.readinessPercentage,
              )}
            />
          </div>
        </div>

        <BrainProgress
          label="Vault Brain readiness"
          value={briefing.readinessPercentage}
          helper="Combined catalogue completion, supplier coverage and trusted commercial cost data."
        />

        <BrainGrid columns={3}>
          {briefing.items.map((item) => (
            <BrainMetric
              key={item.id}
              label={item.label}
              value={item.value}
              tone={getMetricTone(item.tone)}
            />
          ))}
        </BrainGrid>

        <div className="morning-briefing-recommendation">
          <div>
            <p className="vault-eyebrow">
              Today&apos;s Recommendation
            </p>

            <h3>
              {briefing.recommendation}
            </h3>
          </div>

          <a
            className="vault-primary-button"
            href="/catalogue"
          >
            Review Catalogue
          </a>
        </div>
      </div>
    </BrainCard>
  );
}