import Link from "next/link";

import {
  LearningEngine,
} from "@/lib/brain/LearningEngine";

import {
  DEMONSTRATION_LEARNING_OBSERVATIONS,
} from "@/lib/brain/demonstrationLearningData";

import type {
  VaultBrainLearning,
} from "@/lib/brain/LearningEngine";

function getLearningToneClass(
  learning: VaultBrainLearning,
): string {
  return `memory-learning-${learning.tone}`;
}

function getStatusLabel(
  learning: VaultBrainLearning,
): string {
  switch (learning.status) {
    case "established":
      return "Established";

    case "emerging":
      return "Emerging";

    case "observing":
      return "Observing";

    case "retired":
      return "Retired";
  }
}

function MemoryIcon({
  learning,
}: {
  learning: VaultBrainLearning;
}) {
  if (
    learning.tone === "critical" ||
    learning.tone === "warning"
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

  if (learning.tone === "positive") {
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
      <path d="M9.5 4.5A3 3 0 0 0 5 7a3 3 0 0 0 0 5 3 3 0 0 0 2 5.5" />
      <path d="M14.5 4.5A3 3 0 0 1 19 7a3 3 0 0 1 0 5 3 3 0 0 1-2 5.5" />
      <path d="M9.5 4.5v15" />
      <path d="M14.5 4.5v15" />
    </svg>
  );
}

const memory =
  LearningEngine.analyse(
    DEMONSTRATION_LEARNING_OBSERVATIONS,
    "2026-07-26T20:45:00.000Z",
  );

export default function MemoryInsights() {
  const featuredLearning =
    memory.highestConfidenceLearning;

  const secondaryLearnings =
    memory.learnings
      .filter(
        (learning) =>
          learning.id !==
          featuredLearning?.id,
      )
      .slice(0, 4);

  if (!featuredLearning) {
    return null;
  }

  return (
    <section className="memory-insights-section">
      <div className="vault-section-heading">
        <div>
          <span className="vault-eyebrow">
            Learned Patterns
          </span>

          <h2>
            Emerging patterns
          </h2>
        </div>

        <span className="memory-insights-count">
          {memory.learnings.length} learned patterns
        </span>
      </div>

      <div className="memory-insights-grid">
        <article
          className={[
            "vault-panel",
            "memory-featured-learning",
            getLearningToneClass(
              featuredLearning,
            ),
          ].join(" ")}
        >
          <div className="memory-learning-topline">
            <div className="memory-learning-identity">
              <span className="memory-learning-icon">
                <MemoryIcon
                  learning={featuredLearning}
                />
              </span>

              <div>
                <span className="vault-card-kicker">
                  Highest-confidence learning
                </span>

                <span className="memory-learning-status">
                  {getStatusLabel(
                    featuredLearning,
                  )}
                </span>
              </div>
            </div>

            <span className="memory-learning-confidence">
              {featuredLearning.confidence}% confidence
            </span>
          </div>

          <h3>
            {featuredLearning.title}
          </h3>

          <p className="memory-learning-pattern">
            {featuredLearning.pattern}
          </p>

          <div className="memory-learning-consequence">
            <span>
              Why it matters
            </span>

            <strong>
              {featuredLearning.consequence}
            </strong>
          </div>

          <div className="memory-learning-recommendation">
            <span>
              Vault Brain recommends
            </span>

            <strong>
              {
                featuredLearning
                  .recommendation.title
              }
            </strong>

            <p>
              {
                featuredLearning
                  .recommendation.explanation
              }
            </p>

            {featuredLearning
              .recommendation.actionHref &&
            featuredLearning
              .recommendation.actionLabel ? (
              <Link
                className="memory-learning-action"
                href={
                  featuredLearning
                    .recommendation.actionHref
                }
              >
                {
                  featuredLearning
                    .recommendation.actionLabel
                }

                <span aria-hidden="true">
                  →
                </span>
              </Link>
            ) : null}
          </div>

          <div className="memory-learning-footer">
            <span>
              Observed{" "}
              {featuredLearning.timesObserved} times
            </span>

            <span>
              {featuredLearning.evidence.length} evidence records
            </span>
          </div>
        </article>

        <div className="memory-learning-list">
          {secondaryLearnings.map(
            (learning) => (
              <article
                className={[
                  "vault-panel",
                  "memory-learning-card",
                  getLearningToneClass(
                    learning,
                  ),
                ].join(" ")}
                key={learning.id}
              >
                <div className="memory-learning-card-topline">
                  <span className="memory-learning-icon">
                    <MemoryIcon
                      learning={learning}
                    />
                  </span>

                  <div>
                    <span className="memory-learning-status">
                      {getStatusLabel(
                        learning,
                      )}
                    </span>

                    <span>
                      {learning.confidence}% confidence
                    </span>
                  </div>
                </div>

                <h3>
                  {learning.title}
                </h3>

                <p>
                  {learning.consequence}
                </p>

                <div className="memory-learning-card-footer">
                  <span>
                    Seen {learning.timesObserved} times
                  </span>

                  {learning.recommendation
                    .actionHref &&
                  learning.recommendation
                    .actionLabel ? (
                    <Link
                      href={
                        learning
                          .recommendation
                          .actionHref
                      }
                    >
                      Review
                      <span aria-hidden="true">
                        →
                      </span>
                    </Link>
                  ) : null}
                </div>
              </article>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
