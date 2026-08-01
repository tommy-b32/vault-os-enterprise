"use client";

import "./CommercialIntelligenceManualReview.css";

import {
  BuyingRecommendationEngine,
  type BuyingRecommendationResult,
} from "@/lib/brain/BuyingRecommendationEngine";

import type {
  CatalogueProduct,
} from "@/types/catalogue";

import type {
  SupplierCatalogueCardData,
} from "@/types/supplier-catalogue";

type Props = {
  product: CatalogueProduct;
  supplierCard?: SupplierCatalogueCardData | null;
  onManualReview?: () => void;
};

function formatCurrency(
  value: number | null,
  currency: string,
): string {
  if (value === null) {
    return "Not available";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function getUrgencyLabel(
  recommendation: BuyingRecommendationResult,
): string {
  switch (recommendation.urgency) {
    case "critical":
      return "Critical";

    case "high":
      return "High priority";

    case "medium":
      return "Review soon";

    case "low":
      return "Low priority";

    default:
      return "No action";
  }
}

export function CommercialIntelligenceCard({
  product,
  supplierCard = null,
  onManualReview,
}: Props) {
  const recommendation =
    BuyingRecommendationEngine.buildRecommendation({
      product,
      supplierCard,
    });

  return (
    <section className="commercial-intelligence-card">
      <header className="commercial-intelligence-card-header">
        <div>
          <p className="vault-eyebrow">
            Commercial Intelligence
          </p>

          <h3>
            Vault Brain buying recommendation
          </h3>
        </div>

        <span
          className={`commercial-intelligence-urgency is-${recommendation.urgency}`}
        >
          {getUrgencyLabel(
            recommendation,
          )}
        </span>
      </header>

      <section className="commercial-intelligence-recommendation">
        <span>
          Recommendation
        </span>

        <strong>
          {
            recommendation.headline
          }
        </strong>

        <p>
          {
            recommendation.reason
          }
        </p>
      </section>

      <div className="commercial-intelligence-metrics">
        <article>
          <span>
            Current stock
          </span>

          <strong>
            {
              recommendation.currentStock
            }
          </strong>
        </article>

        <article>
          <span>
            Days remaining
          </span>

          <strong>
            {recommendation.estimatedDaysRemaining !==
            null
              ? `${recommendation.estimatedDaysRemaining} days`
              : "Unknown"}
          </strong>
        </article>

        <article>
          <span>
            Lead time
          </span>

          <strong>
            {recommendation.supplierLeadTimeDays !==
            null
              ? `${recommendation.supplierLeadTimeDays} days`
              : "Unknown"}
          </strong>
        </article>

        <article>
          <span>
            Target stock
          </span>

          <strong>
            {recommendation.targetStockDays !==
            null
              ? `${recommendation.targetStockDays} days`
              : "Unknown"}
          </strong>
        </article>

        <article>
          <span>
            Suggested packs
          </span>

          <strong>
            {recommendation.suggestedPacks !==
            null
              ? recommendation.suggestedPacks
              : "Pending data"}
          </strong>
        </article>

        <article>
          <span>
            Projected stock
          </span>

          <strong>
            {recommendation.projectedStockAfterOrder !==
            null
              ? recommendation.projectedStockAfterOrder
              : "Pending data"}
          </strong>
        </article>

        <article>
          <span>
            Order cost
          </span>

          <strong>
            {formatCurrency(
              recommendation.estimatedOrderCost,
              recommendation.currency,
            )}
          </strong>
        </article>

        <article>
          <span>
            Estimated profit
          </span>

          <strong>
            {formatCurrency(
              recommendation.estimatedGrossProfit,
              recommendation.currency,
            )}
          </strong>
        </article>
      </div>

      {recommendation.missingData.length >
      0 ? (
        <div className="commercial-intelligence-missing">
          <span>
            Recommendation limited
          </span>

          <p>
            Add{" "}
            {
              recommendation.missingData.join(
                ", ",
              )
            }{" "}
            for a precise buying quantity.
          </p>
        </div>
      ) : null}

      <footer className="commercial-intelligence-footer">
        <span>
          Reorder trust
        </span>

        {recommendation.trusted ? (
          <strong>
            Trusted for reorder
          </strong>
        ) : onManualReview ? (
          <button
            className="commercial-intelligence-manual-review"
            onClick={onManualReview}
            type="button"
          >
            Search Entire Catalogue →
          </button>
        ) : (
          <strong>
            Manual review required
          </strong>
        )}
      </footer>
    </section>
  );
}