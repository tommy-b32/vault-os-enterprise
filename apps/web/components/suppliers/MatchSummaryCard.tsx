"use client";

import {
  BrainPill,
} from "@/components/ui/BrainPill";

import type {
  CatalogueProductMatch,
} from "@/lib/brain/CatalogueMatchingEngine";

type Props = {
  bestMatch: CatalogueProductMatch | null;
};

function getConfidenceTone(
  confidence: number,
):
  | "success"
  | "warning"
  | "danger" {
  if (confidence >= 80) {
    return "success";
  }

  if (confidence >= 50) {
    return "warning";
  }

  return "danger";
}

export function MatchSummaryCard({
  bestMatch,
}: Props) {
  return (
    <>
      <div className="supplier-product-review-v2-match">
        <div>
          <p className="vault-eyebrow">
            Vault Brain Recommendation
          </p>

          <h3>
            {bestMatch
              ? bestMatch.product.product_name
              : "Create or link manually"}
          </h3>

          <p>
            {bestMatch
              ? "Vault Brain found the strongest available match across supplier, brand, colour and naming signals."
              : "No suitable existing Fabric Vault product was found for this supplier item."}
          </p>
        </div>

        {bestMatch ? (
          <div className="supplier-product-review-v2-confidence">
            <span>
              Confidence
            </span>

            <strong>
              {bestMatch.confidence}%
            </strong>

            <BrainPill
              tone={getConfidenceTone(
                bestMatch.confidence,
              )}
            >
              {bestMatch.confidence >= 80
                ? "Strong match"
                : bestMatch.confidence >= 50
                  ? "Possible match"
                  : "Low confidence"}
            </BrainPill>
          </div>
        ) : (
          <BrainPill tone="danger">
            Manual review
          </BrainPill>
        )}
      </div>

      {bestMatch ? (
        <div className="supplier-product-review-v2-signals">
          {bestMatch.signals.map(
            (signal) => (
              <article
                key={`${signal.reason}-${signal.label}`}
              >
                <span
                  aria-hidden="true"
                >
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
            ),
          )}
        </div>
      ) : null}
    </>
  );
}