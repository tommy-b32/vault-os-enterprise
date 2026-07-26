"use client";

import { BrainPill } from "@/components/ui/BrainPill";

import type {
  CatalogueMatchingResult,
} from "@/lib/brain/CatalogueMatchingEngine";

type Props = {
  result: CatalogueMatchingResult;
  onAccept?: (
    result: CatalogueMatchingResult,
  ) => void;
  onReviewAlternatives?: (
    result: CatalogueMatchingResult,
  ) => void;
};

function getStatusTone(
  status: CatalogueMatchingResult["status"],
):
  | "default"
  | "success"
  | "warning"
  | "danger" {
  switch (status) {
    case "matched":
      return "success";

    case "possible_match":
      return "warning";

    case "unmatched":
    default:
      return "danger";
  }
}

function getStatusLabel(
  status: CatalogueMatchingResult["status"],
): string {
  switch (status) {
    case "matched":
      return "Strong match";

    case "possible_match":
      return "Review suggested";

    case "unmatched":
    default:
      return "No match found";
  }
}

export function CatalogueMatchCard({
  result,
  onAccept,
  onReviewAlternatives,
}: Props) {
  const bestMatch = result.bestMatch;

  return (
    <section className="catalogue-match-card">
      <header className="catalogue-match-card-header">
        <div>
          <p className="vault-eyebrow">
            Vault Brain Matching
          </p>

          <h3>Suggested Fabric Vault product</h3>
        </div>

        <BrainPill
          tone={getStatusTone(result.status)}
        >
          {getStatusLabel(result.status)}
        </BrainPill>
      </header>

      {bestMatch ? (
        <>
          <div className="catalogue-match-primary">
            <div>
              <span>Best match</span>

              <h4>
                {bestMatch.product.product_name}
              </h4>

              <p>
                Vault Brain compared supplier,
                brand, colour and naming signals.
              </p>
            </div>

            <div className="catalogue-match-confidence">
              <span>Confidence</span>

              <strong>
                {bestMatch.confidence}%
              </strong>
            </div>
          </div>

          <div className="catalogue-match-signals">
            {bestMatch.signals.length > 0 ? (
              bestMatch.signals.map((signal) => (
                <article
                  key={`${signal.reason}-${signal.label}`}
                >
                  <span aria-hidden="true">
                    ✓
                  </span>

                  <div>
                    <strong>
                      {signal.label}
                    </strong>

                    <small>
                      +{signal.score} confidence
                    </small>
                  </div>
                </article>
              ))
            ) : (
              <p>
                No supporting matching signals
                were recorded.
              </p>
            )}
          </div>

          {result.alternatives.length > 0 ? (
            <div className="catalogue-match-alternatives">
              <span>
                Alternative matches
              </span>

              {result.alternatives.map(
                (alternative) => (
                  <article
                    key={
                      alternative.product
                        .product_id
                    }
                  >
                    <strong>
                      {
                        alternative.product
                          .product_name
                      }
                    </strong>

                    <small>
                      {alternative.confidence}%
                    </small>
                  </article>
                ),
              )}
            </div>
          ) : null}

          <footer className="catalogue-match-actions">
            <button
              onClick={() =>
                onReviewAlternatives?.(result)
              }
              type="button"
            >
              Review Alternatives
            </button>

            <button
              className="is-primary"
              disabled={
                result.status === "unmatched"
              }
              onClick={() =>
                onAccept?.(result)
              }
              type="button"
            >
              Accept Match
            </button>
          </footer>
        </>
      ) : (
        <div className="catalogue-match-empty">
          <h4>No suitable product match found</h4>

          <p>
            This supplier catalogue card will
            need to be linked manually or used to
            create a new Fabric Vault product.
          </p>

          <button
            onClick={() =>
              onReviewAlternatives?.(result)
            }
            type="button"
          >
            Review Products
          </button>
        </div>
      )}
    </section>
  );
}