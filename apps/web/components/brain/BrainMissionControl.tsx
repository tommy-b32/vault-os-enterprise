import { BrainNeuralConfidence } from "@/components/brain/BrainNeuralConfidence";
import { BrainScanSequence } from "@/components/brain/BrainScanSequence";

import type {
  MissionControlResult,
} from "@/lib/brain/MissionControlEngine";

import type {
  ReasoningReport,
  ReasoningLevel,
} from "@/lib/brain/ReasoningEngine";

type Props = {
  mission: MissionControlResult;
  reasoning: ReasoningReport;
};

type ReasoningTone =
  | "success"
  | "warning"
  | "danger"
  | "info";

function getReasoningTone(
  level: ReasoningLevel,
): ReasoningTone {
  switch (level) {
    case "excellent":
      return "success";

    case "good":
      return "info";

    case "warning":
      return "warning";

    case "critical":
      return "danger";

    default:
      return "info";
  }
}

function getReasoningLabel(
  score: number,
): string {
  if (score >= 85) {
    return "Strong commercial position";
  }

  if (score >= 65) {
    return "Commercial position improving";
  }

  if (score >= 40) {
    return "Commercial position restricted";
  }

  return "Commercial position requires attention";
}

export function BrainMissionControl({
  mission,
  reasoning,
}: Props) {
  return (
    <section className="brain-mission-control">
      <div className="brain-mission-header">
        <div>
          <p className="vault-eyebrow">
            Mission Control
          </p>

          <h2>
            Vault Brain Executive Summary
          </h2>
        </div>

        <span className="brain-status-pill">
          {mission.status}
        </span>
      </div>

      <BrainScanSequence />

      <div className="brain-mission-grid">
        <article>
          <span>Today&apos;s Mission</span>

          <strong>
            {mission.mission}
          </strong>
        </article>

        <article>
          <span>Expected Gain</span>

          <strong>
            {mission.expectedGain}
          </strong>
        </article>

        <article>
          <span>Confidence</span>

          <strong>
            {mission.confidence}%
          </strong>
        </article>

        <article>
          <span>Primary Blocker</span>

          <strong>
            {mission.primaryBlocker}
          </strong>
        </article>
      </div>

      <BrainNeuralConfidence
        confidence={mission.confidence}
      />

      <section className="brain-reasoning-panel">
        <header className="brain-reasoning-header">
          <div>
            <p className="vault-eyebrow">
              Reasoning Engine
            </p>

            <h3>
              Vault Brain Commercial Opinion
            </h3>

            <p>
              {getReasoningLabel(
                reasoning.score,
              )}
            </p>
          </div>

          <div className="brain-reasoning-score">
            <span>Reasoning score</span>

            <strong>
              {reasoning.score}
            </strong>

            <small>/100</small>
          </div>
        </header>

        {reasoning.findings.length > 0 ? (
          <div className="brain-reasoning-list">
            {reasoning.findings.map(
              (finding) => {
                const tone =
                  getReasoningTone(
                    finding.level,
                  );

                return (
                  <article
                    key={finding.id}
                    className={`brain-reasoning-finding tone-${tone}`}
                  >
                    <div className="brain-reasoning-finding-topline">
                      <div>
                        <span>
                          {finding.level}
                        </span>

                        <h4>
                          {finding.title}
                        </h4>
                      </div>

                      <strong>
                        {finding.confidence}%
                      </strong>
                    </div>

                    <p>
                      {finding.explanation}
                    </p>

                    <footer>
                      <span>Commercial impact</span>

                      <strong>
                        {finding.impact}
                      </strong>
                    </footer>
                  </article>
                );
              },
            )}
          </div>
        ) : (
          <div className="brain-reasoning-empty">
            <h4>
              No material commercial risks found
            </h4>

            <p>
              Vault Brain did not identify any
              active reasoning findings that
              require attention.
            </p>
          </div>
        )}
      </section>

      <div className="brain-metric-row">
        {mission.metrics.map((metric) => (
          <div
            key={metric.id}
            className={`brain-mini-metric tone-${metric.tone}`}
          >
            <small>{metric.label}</small>

            <h3>{metric.value}</h3>

            <p>{metric.helper}</p>
          </div>
        ))}
      </div>
    </section>
  );
}