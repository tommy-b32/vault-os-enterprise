import type {
  ExecutiveMemoryInsight,
  ExecutiveMemoryResult,
} from "@/lib/brain/ExecutiveMemoryEngine";

type ExecutiveMemoryProps = {
  memory: ExecutiveMemoryResult;
};

function getDirectionLabel(
  memory: ExecutiveMemoryResult,
): string {
  switch (memory.direction) {
    case "improved":
      return "Improved";

    case "declined":
      return "Attention required";

    case "stable":
      return "Stable";

    case "unknown":
      return "Baseline";
  }
}

function getToneClass(
  insight: ExecutiveMemoryInsight,
): string {
  return `memory-learning-${insight.tone}`;
}

function MemoryIcon({
  insight,
}: {
  insight: ExecutiveMemoryInsight;
}) {
  if (
    insight.tone === "critical" ||
    insight.tone === "warning"
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

  if (insight.tone === "positive") {
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
      <path d="M4 17V7" />
      <path d="M4 17h16" />
      <path d="m7 14 4-4 3 2 5-6" />
    </svg>
  );
}

function BaselineIcon() {
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

export default function ExecutiveMemory({
  memory,
}: ExecutiveMemoryProps) {
  const featuredInsight =
    memory.insights[0] ?? null;

  const secondaryInsights =
    memory.insights.slice(1, 5);

  if (
    !memory.hasPreviousSnapshot ||
    !featuredInsight
  ) {
    return (
      <section className="memory-insights-section">
        <div className="vault-section-heading">
          <div>
            <span className="vault-eyebrow">
              Executive Memory
            </span>

            <h2>
              Operational history
            </h2>
          </div>

          <span className="memory-insights-count">
            Baseline active
          </span>
        </div>

        <article className="vault-panel memory-featured-learning memory-learning-info">
          <div className="memory-learning-topline">
            <div className="memory-learning-identity">
              <span className="memory-learning-icon">
                <BaselineIcon />
              </span>

              <div>
                <span className="vault-card-kicker">
                  Vault Brain Memory
                </span>

                <span className="memory-learning-status">
                  Baseline
                </span>
              </div>
            </div>

            <span className="memory-learning-confidence">
              {memory.confidence}% confidence
            </span>
          </div>

          <h3>
            {memory.headline}
          </h3>

          <p className="memory-learning-pattern">
            {memory.summary}
          </p>

          <div className="memory-learning-consequence">
            <span>
              What happens next
            </span>

            <strong>
              Vault Brain will compare the next operational
              snapshot with this baseline and explain any
              material changes.
            </strong>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="memory-insights-section">
      <div className="vault-section-heading">
        <div>
          <span className="vault-eyebrow">
            Executive Memory
          </span>

          <h2>
            What changed since the previous snapshot
          </h2>
        </div>

        <span className="memory-insights-count">
          {getDirectionLabel(memory)}
        </span>
      </div>

      <div className="memory-insights-grid">
        <article
          className={[
            "vault-panel",
            "memory-featured-learning",
            getToneClass(featuredInsight),
          ].join(" ")}
        >
          <div className="memory-learning-topline">
            <div className="memory-learning-identity">
              <span className="memory-learning-icon">
                <MemoryIcon
                  insight={featuredInsight}
                />
              </span>

              <div>
                <span className="vault-card-kicker">
                  Highest-priority change
                </span>

                <span className="memory-learning-status">
                  {getDirectionLabel(memory)}
                </span>
              </div>
            </div>

            <span className="memory-learning-confidence">
              {memory.confidence}% confidence
            </span>
          </div>

          <h3>
            {memory.headline}
          </h3>

          <p className="memory-learning-pattern">
            {memory.summary}
          </p>

          <div className="memory-learning-consequence">
            <span>
              Most important change
            </span>

            <strong>
              {featuredInsight.title}
            </strong>

            <p>
              {featuredInsight.description}
            </p>
          </div>

          <div className="memory-learning-footer">
            <span>
              {memory.improvedSignals} improved
            </span>

            <span>
              {memory.declinedSignals} declined
            </span>

            <span>
              {memory.stableSignals} stable
            </span>
          </div>
        </article>

        <div className="memory-learning-list">
          {secondaryInsights.map(
            (insight) => (
              <article
                className={[
                  "vault-panel",
                  "memory-learning-card",
                  getToneClass(insight),
                ].join(" ")}
                key={insight.id}
              >
                <div className="memory-learning-card-topline">
                  <span className="memory-learning-icon">
                    <MemoryIcon
                      insight={insight}
                    />
                  </span>

                  <div>
                    <span className="memory-learning-status">
                      {insight.direction}
                    </span>

                    <span>
                      Priority {insight.priority}
                    </span>
                  </div>
                </div>

                <h3>
                  {insight.title}
                </h3>

                <p>
                  {insight.description}
                </p>

                <div className="memory-learning-card-footer">
                  <span>
                    Source: {insight.source}
                  </span>
                </div>
              </article>
            ),
          )}
        </div>
      </div>
    </section>
  );
}