"use client";

import VaultIcon from "@/components/brain/workspace/VaultIcon";

import type {
  ExecutiveMemoryResult,
} from "@/lib/brain/ExecutiveMemoryEngine";

type TodaysAnalysisProps = {
  analysis: ExecutiveMemoryResult;
};

export default function TodaysAnalysis({
  analysis,
}: TodaysAnalysisProps) {
  const signals = analysis.metricChanges
    .filter((change) => change.delta !== null && change.delta !== 0)
    .slice(0, 5);

  return (
    <section className="morning-briefing">
      <div className="vault-section-heading">
        <div>
          <span className="vault-eyebrow">Today&apos;s Analysis</span>
          <h2>Business signal summary</h2>
        </div>
      </div>

      {!analysis.hasPreviousSnapshot || signals.length === 0 ? (
        <article className="vault-panel mission-empty-state">
          <span className="vault-eyebrow">Evidence building</span>
          <h2>Not enough change evidence yet</h2>
          <p>
            Vault Brain will summarise material business signals after another
            comparable operational snapshot is available.
          </p>
        </article>
      ) : (
        <article className="vault-panel morning-impact-panel">
          <div className="morning-impact-heading">
            <div>
              <span className="vault-card-kicker">Existing reasoning</span>
              <h3>{analysis.headline}</h3>
            </div>

            <span className="morning-impact-status">
              {analysis.improvedSignals} improving · {analysis.declinedSignals} declining
            </span>
          </div>

          <p className="brain-section-description">{analysis.summary}</p>

          <div className="morning-impact-list">
            {signals.map((signal) => (
              <article
                className={`morning-impact-item morning-impact-${signal.tone}`}
                key={signal.id}
              >
                <span className="morning-impact-icon">
                  <VaultIcon
                    name={signal.direction === "declined" ? "shield" : "trend"}
                    size={18}
                  />
                </span>

                <div>
                  <strong>{signal.label}</strong>
                  <p>{signal.description}</p>
                </div>
              </article>
            ))}
          </div>
        </article>
      )}
    </section>
  );
}
