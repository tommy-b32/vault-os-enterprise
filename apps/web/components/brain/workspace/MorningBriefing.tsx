import {
  MorningBriefingEngine,
} from "@/lib/brain/MorningBriefingEngine";

import {
  NarratorEngine,
} from "@/lib/brain/NarratorEngine";

import type {
  MorningBriefingImpact,
  MorningBriefingMetric,
  VaultBrainOperationalSnapshot,
  VaultBrainSignalTone,
} from "@/lib/brain/types";

type MorningBriefingProps = {
  snapshot: VaultBrainOperationalSnapshot;
};

function getMetricToneClass(
  tone: VaultBrainSignalTone,
): string {
  return `morning-metric-${tone}`;
}

function getImpactToneClass(
  tone: VaultBrainSignalTone,
): string {
  return `morning-impact-${tone}`;
}

function getMetricIcon(
  metric: MorningBriefingMetric,
) {
  switch (metric.id) {
    case "orders":
      return (
        <>
          <path d="M6 5h12l1 15H5z" />
          <path d="M9 8V5a3 3 0 0 1 6 0v3" />
          <path d="M9 12h6" />
        </>
      );

    case "revenue":
    case "profit":
    case "cash":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M14.5 7.5a3 3 0 0 0-5 2v6" />
          <path d="M8 12h5" />
          <path d="M8 17h8" />
        </>
      );

    case "items-sold":
      return (
        <>
          <path d="M4 7h16v13H4z" />
          <path d="M7 4h10l2 3H5z" />
          <path d="M9 11h6" />
        </>
      );

    case "average-order":
      return (
        <>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="m7 15 4-4 3 2 5-7" />
        </>
      );

    case "inventory-health":
      return (
        <>
          <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z" />
          <path d="m9 12 2 2 4-5" />
        </>
      );
  }
}

function MetricIcon({
  metric,
}: {
  metric: MorningBriefingMetric;
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="20"
    >
      {getMetricIcon(metric)}
    </svg>
  );
}

function SummaryIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M9.5 4.5A3 3 0 0 0 5 7a3 3 0 0 0 0 5 3 3 0 0 0 2 5.5" />
      <path d="M14.5 4.5A3 3 0 0 1 19 7a3 3 0 0 1 0 5 3 3 0 0 1-2 5.5" />
      <path d="M9.5 4.5v15" />
      <path d="M14.5 4.5v15" />
    </svg>
  );
}

function ImpactIcon({
  impact,
}: {
  impact: MorningBriefingImpact;
}) {
  if (
    impact.tone === "critical" ||
    impact.tone === "warning"
  ) {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
        width="18"
      >
        <path d="M12 3 2.5 20h19z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  }

  if (impact.tone === "positive") {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
        width="18"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.7 2.7L16.5 9" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="18"
    >
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function MorningBriefing({
  snapshot,
}: MorningBriefingProps) {
  const operationalBriefing =
    MorningBriefingEngine.analyseOperational(
      snapshot,
    );

  const narratorStory =
    NarratorEngine.analyse({
      snapshot,

      impacts:
        operationalBriefing.impacts,

      recommendations:
        operationalBriefing.recommendations,
    });

  const primaryMetrics =
    operationalBriefing.metrics.filter(
      (metric) =>
        [
          "orders",
          "revenue",
          "profit",
          "cash",
          "inventory-health",
        ].includes(metric.id),
    );

  const displayedImpacts =
    narratorStory.impacts.length > 0
      ? narratorStory.impacts
      : operationalBriefing.impacts;

  return (
    <section className="morning-briefing">
      <article className="vault-panel morning-briefing-panel">
        <div className="morning-briefing-introduction">
          <div className="morning-briefing-title-row">
            <div>
              <span className="vault-eyebrow">
                Morning Briefing
              </span>

              <h2>
                {narratorStory.greeting}
              </h2>
            </div>

            <span className="morning-briefing-ready">
              {narratorStory.confidence}% confidence
            </span>
          </div>

          <p className="morning-briefing-period">
            {narratorStory.headline}
          </p>
        </div>

        <div className="morning-briefing-narrative">
          <div className="morning-narrative-heading">
            <span className="morning-narrative-icon">
              <SummaryIcon />
            </span>

            <div>
              <span className="vault-card-kicker">
                Vault Brain Summary
              </span>

              <strong>
                What changed while you were away
              </strong>
            </div>
          </div>

          <div className="morning-narrative-copy">
            {narratorStory.narrative.map(
              (statement, index) => (
                <p key={`${statement}-${index}`}>
                  {statement}
                </p>
              ),
            )}
          </div>
        </div>

        <div className="morning-briefing-summary-heading">
          <span className="vault-card-kicker">
            Business Signals
          </span>

          <span>
            Revenue, orders, profit, cash and inventory
          </span>
        </div>

        <div className="morning-briefing-metrics">
          {primaryMetrics.map((metric) => (
            <article
              className={`morning-briefing-metric ${getMetricToneClass(
                metric.tone,
              )}`}
              key={metric.id}
            >
              <span className="morning-briefing-metric-icon">
                <MetricIcon metric={metric} />
              </span>

              <div>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>

                {metric.supportingText ? (
                  <p>
                    {metric.supportingText}
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </article>

      <article className="vault-panel morning-impact-panel">
        <div className="morning-impact-heading">
          <div>
            <span className="vault-eyebrow">
              Business Impact
            </span>

            <h3>
              What changed because of the latest trading
              period
            </h3>
          </div>

          <span className="morning-impact-status">
            Analysis complete
          </span>
        </div>

        <div className="morning-impact-list">
          {displayedImpacts.map((impact) => (
            <article
              className={`morning-impact-item ${getImpactToneClass(
                impact.tone,
              )}`}
              key={impact.id}
            >
              <span className="morning-impact-icon">
                <ImpactIcon impact={impact} />
              </span>

              <div>
                <strong>
                  {impact.title}
                </strong>

                <p>
                  {impact.description}
                </p>

                <span className="morning-impact-confidence">
                  {impact.confidence}% confidence
                </span>
              </div>
            </article>
          ))}
        </div>
      </article>
    </section>
  );
}