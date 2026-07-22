import { BrainDecisionCard } from "@/components/brain/BrainDecisionCard";

import type {
  CommercialCalculations,
} from "@/components/catalogue/editor/commercial/useCommercialCalculator";

import { VaultBrain } from "@/lib/brain/VaultBrain";

type CommercialReviewCardProps = {
  calculations: CommercialCalculations;
  productConfigured: boolean;
  supplierAssigned: boolean;
  unitsPerPack: number | null;
  packCostEntered: boolean;
  sellingPriceEntered: boolean;
};

function formatPercent(
  value: number | null,
): string {
  return value === null
    ? "—"
    : `${value.toFixed(1)}%`;
}

function formatGbp(
  value: number | null,
): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 2,
      }).format(value);
}

export function CommercialReviewCard({
  calculations,
  productConfigured,
  supplierAssigned,
  unitsPerPack,
  packCostEntered,
  sellingPriceEntered,
}: CommercialReviewCardProps) {
  const review = VaultBrain.commercial.reviewProduct({
    productConfigured,
    supplierAssigned,
    unitsPerPack,
    packCostEntered,
    sellingPriceEntered,

    marginPercent:
      calculations.marginPercent,

    returnOnCapital:
      calculations.returnOnCapital,

    grossProfitPerUnit:
      calculations.grossProfit,
  });

  const packEconomicsReady =
    packCostEntered &&
    sellingPriceEntered &&
    unitsPerPack !== null &&
    unitsPerPack > 0;

  const state =
    review.decision === "buy"
      ? "approved"
      : review.decision === "hold"
        ? "review"
        : review.decision === "avoid"
          ? "rejected"
          : "waiting";

  const actionLabel =
    review.decision === "buy"
      ? "BUY"
      : review.decision === "hold"
        ? "HOLD"
        : review.decision === "avoid"
          ? "AVOID"
          : "COMPLETE DATA";

  return (
    <BrainDecisionCard
      actionLabel={actionLabel}
      checks={[
        {
          label: "Commercial Analysis",
          status:
            review.decision === "buy"
              ? "ready"
              : review.decision === "hold"
                ? "warning"
                : review.decision === "avoid"
                  ? "blocked"
                  : "waiting",
        },
        {
          label: "Supplier Intelligence",
          status: supplierAssigned
            ? "ready"
            : "waiting",
        },
        {
          label: "Product Configuration",
          status: productConfigured
            ? "ready"
            : "waiting",
        },
        {
          label: "Pack Economics",
          status: packEconomicsReady
            ? "ready"
            : "waiting",
        },
        {
          label: "Inventory Position",
          status: "waiting",
        },
        {
          label: "Capital Allocation",
          status: "waiting",
        },
        {
          label: "Purchasing Strategy",
          status: "waiting",
        },
        {
          label: "Demand Forecast",
          status: "waiting",
        },
      ]}
      confidence={review.confidence}
      explanation={review.explanation}
      headline={review.headline}
      metrics={[
        {
          label: "Gross margin",
          value: formatPercent(
            review.marginPercent,
          ),
        },
        {
          label: "Return on capital",
          value: formatPercent(
            review.returnOnCapital,
          ),
        },
        {
          label: "Gross profit per unit",
          value: formatGbp(
            review.grossProfitPerUnit,
          ),
        },
      ]}
      missingInputs={review.missingInputs}
      state={state}
      statusLabel={review.label}
      title="Commercial Analysis"
    />
  );
}