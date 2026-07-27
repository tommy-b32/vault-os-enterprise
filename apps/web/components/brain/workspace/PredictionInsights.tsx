import Link from "next/link";

import {
  PredictionEngine,
} from "@/lib/brain/PredictionEngine";

import {
  DEMONSTRATION_PREDICTION_INPUTS,
} from "@/lib/brain/demonstrationPredictionData";

import type {
  PredictionRange,
  VaultBrainPrediction,
} from "@/lib/brain/PredictionEngine";

function formatCurrency(
  value: number | null,
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "Unavailable";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRange(
  range: PredictionRange | null,
): string | null {
  if (!range) {
    return null;
  }

  if (range.unit === "gbp") {
    return `${formatCurrency(
      range.minimum,
    )}–${formatCurrency(
      range.maximum,
    )}`;
  }

  const unitLabels: Record<
    Exclude<
      PredictionRange["unit"],
      "gbp"
    >,
    string
  > = {
    orders: "orders",
    units: "units",
    percentage: "%",
    days: "days",
  };

  const unit =
    unitLabels[range.unit];

  if (
    range.unit === "percentage"
  ) {
    return `${range.minimum}%–${range.maximum}%`;
  }

  return `${range.minimum}–${range.maximum} ${unit}`;
}

function getPredictionToneClass(
  prediction: VaultBrainPrediction,
): string {
  return `prediction-${prediction.tone}`;
}

function getStatusLabel(
  prediction: VaultBrainPrediction,
): string {
  switch (prediction.status) {
    case "highly_likely":
      return "Highly likely";

    case "likely":
      return "Likely";

    case "watching":
      return "Watching";

    case "resolved":
      return "Resolved";
  }
}

function PredictionIcon({
  prediction,
}: {
  prediction: VaultBrainPrediction;
}) {
  if (
    prediction.tone === "critical" ||
    prediction.tone === "warning"
  ) {
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
        <path d="M12 3 2.5 20h19z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  }

  if (
    prediction.category === "revenue" ||
    prediction.category === "profit" ||
    prediction.category === "capital"
  ) {
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
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="m7 15 4-4 3 2 5-7" />
      </svg>
    );
  }

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
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4V2" />
      <path d="M20 12h2" />
      <path d="M12 20v2" />
      <path d="M4 12H2" />
      <path d="m9 12 2 2 4-5" />
    </svg>
  );
}

const predictionResult =
  PredictionEngine.analyse(
    DEMONSTRATION_PREDICTION_INPUTS,
    "2026-07-26T20:45:00.000Z",
  );

export default function PredictionInsights() {
  const featuredPrediction =
    predictionResult.highestPriorityPrediction;

  const secondaryPredictions =
    predictionResult.predictions
      .filter(
        (prediction) =>
          prediction.id !==
          featuredPrediction?.id,
      )
      .slice(0, 5);

  if (!featuredPrediction) {
    return null;
  }

  const featuredRange =
    formatRange(
      featuredPrediction.predictedRange,
    );

  return (
    <section className="prediction-insights-section">
      <div className="vault-section-heading">
        <div>
          <span className="vault-eyebrow">
            Vault Brain Prediction
          </span>

          <h2>
            What Vault Brain expects next
          </h2>
        </div>

        <span className="prediction-summary-status">
          {predictionResult.predictions.length} active forecasts
        </span>
      </div>

      <div className="prediction-insights-grid">
        <article
          className={[
            "vault-panel",
            "prediction-featured",
            getPredictionToneClass(
              featuredPrediction,
            ),
          ].join(" ")}
        >
          <div className="prediction-featured-topline">
            <div className="prediction-identity">
              <span className="prediction-icon">
                <PredictionIcon
                  prediction={featuredPrediction}
                />
              </span>

              <div>
                <span className="vault-card-kicker">
                  Highest-priority forecast
                </span>

                <span className="prediction-status">
                  {getStatusLabel(
                    featuredPrediction,
                  )}
                </span>
              </div>
            </div>

            <span className="prediction-confidence">
              {featuredPrediction.confidence}% confidence
            </span>
          </div>

          <div className="prediction-window">
            <span>
              Prediction window
            </span>

            <strong>
              {
                featuredPrediction
                  .window.label
              }
            </strong>
          </div>

          <h3>
            {featuredPrediction.title}
          </h3>

          <p className="prediction-summary">
            {featuredPrediction.summary}
          </p>

          <div className="prediction-measures">
            {featuredRange ? (
              <div>
                <span>
                  Forecast
                </span>

                <strong>
                  {featuredRange}
                </strong>
              </div>
            ) : null}

            {featuredPrediction
              .potentialRevenueAtRiskGbp !==
            null ? (
              <div>
                <span>
                  Revenue at risk
                </span>

                <strong>
                  {formatCurrency(
                    featuredPrediction
                      .potentialRevenueAtRiskGbp,
                  )}
                </strong>
              </div>
            ) : null}

            <div>
              <span>
                Evidence strength
              </span>

              <strong>
                {
                  featuredPrediction
                    .evidenceStrength
                }%
              </strong>
            </div>

            <div>
              <span>
                Evidence records
              </span>

              <strong>
                {
                  featuredPrediction
                    .evidence.length
                }
              </strong>
            </div>
          </div>

          <div className="prediction-recommendation">
            <span>
              Recommended action
            </span>

            <strong>
              {
                featuredPrediction
                  .recommendation.title
              }
            </strong>

            <p>
              {
                featuredPrediction
                  .recommendation.explanation
              }
            </p>

            {featuredPrediction
              .recommendation.actionHref &&
            featuredPrediction
              .recommendation.actionLabel ? (
              <Link
                className="prediction-action"
                href={
                  featuredPrediction
                    .recommendation.actionHref
                }
              >
                {
                  featuredPrediction
                    .recommendation.actionLabel
                }

                <span aria-hidden="true">
                  →
                </span>
              </Link>
            ) : null}
          </div>
        </article>

        <div className="prediction-list">
          {secondaryPredictions.map(
            (prediction) => {
              const predictionRange =
                formatRange(
                  prediction.predictedRange,
                );

              return (
                <article
                  className={[
                    "vault-panel",
                    "prediction-card",
                    getPredictionToneClass(
                      prediction,
                    ),
                  ].join(" ")}
                  key={prediction.id}
                >
                  <div className="prediction-card-topline">
                    <span className="prediction-icon">
                      <PredictionIcon
                        prediction={prediction}
                      />
                    </span>

                    <div>
                      <span className="prediction-status">
                        {getStatusLabel(
                          prediction,
                        )}
                      </span>

                      <span>
                        {prediction.confidence}% confidence
                      </span>
                    </div>
                  </div>

                  <span className="prediction-card-window">
                    {prediction.window.label}
                  </span>

                  <h3>
                    {prediction.title}
                  </h3>

                  <p>
                    {prediction.summary}
                  </p>

                  {predictionRange ? (
                    <div className="prediction-card-value">
                      <span>
                        Forecast
                      </span>

                      <strong>
                        {predictionRange}
                      </strong>
                    </div>
                  ) : null}

                  {prediction
                    .potentialRevenueAtRiskGbp !==
                  null ? (
                    <div className="prediction-card-value">
                      <span>
                        Revenue at risk
                      </span>

                      <strong>
                        {formatCurrency(
                          prediction
                            .potentialRevenueAtRiskGbp,
                        )}
                      </strong>
                    </div>
                  ) : null}

                  <div className="prediction-card-footer">
                    <span>
                      {
                        prediction
                          .evidence.length
                      } evidence records
                    </span>

                    {prediction
                      .recommendation.actionHref &&
                    prediction
                      .recommendation.actionLabel ? (
                      <Link
                        href={
                          prediction
                            .recommendation.actionHref
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
              );
            },
          )}
        </div>
      </div>
    </section>
  );
}