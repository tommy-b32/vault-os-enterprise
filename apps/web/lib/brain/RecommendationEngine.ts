import type {
  RecommendationEngineInput,
  RecommendationEngineResult,
  RecommendationPipelineItem,
} from "@/lib/brain/types";

function clampConfidence(
  value: number,
): number {
  return Math.max(
    0,
    Math.min(100, Math.round(value)),
  );
}

function normalisePositiveInteger(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor(value),
  );
}

function getPipeline(
  input: RecommendationEngineInput,
): RecommendationPipelineItem[] {
  const commercialStatus =
    input.commercial.decision === "buy"
      ? "ready"
      : input.commercial.decision === "hold"
        ? "warning"
        : input.commercial.decision === "avoid"
          ? "blocked"
          : "waiting";

  const capitalStatus =
    input.capital.decision === "approved"
      ? "ready"
      : input.capital.decision === "limited"
        ? "warning"
        : "blocked";

  const inventoryStatus =
    !input.inventory.dataAvailable
      ? "waiting"
      : input.inventory.reorderRequired
        ? "ready"
        : input.inventory.urgency === "medium"
          ? "warning"
          : "waiting";

  const supplierStatus =
    !input.supplier.dataAvailable ||
    !input.supplier.supplierAssigned ||
    !input.supplier.rulesConfirmed
      ? "waiting"
      : !input.supplier.recommendationEnabled ||
          !input.supplier.minimumOrderSatisfied
        ? "blocked"
        : "ready";

  return [
    {
      engine: "commercial",
      label: "Commercial Analysis",
      status: commercialStatus,
      explanation:
        input.commercial.explanation,
    },
    {
      engine: "capital",
      label: "Capital Allocation",
      status: capitalStatus,
      explanation:
        input.capital.explanation,
    },
    {
      engine: "inventory",
      label: "Inventory Position",
      status: inventoryStatus,
      explanation:
        input.inventory.explanation,
    },
    {
      engine: "supplier",
      label: "Supplier Intelligence",
      status: supplierStatus,
      explanation:
        input.supplier.explanation,
    },
  ];
}

function getMissingInputs(
  input: RecommendationEngineInput,
): string[] {
  const missingInputs = [
    ...input.commercial.missingInputs,
  ];

  if (!input.inventory.dataAvailable) {
    missingInputs.push("inventory data");
  }

  if (!input.supplier.dataAvailable) {
    missingInputs.push("supplier rules");
  }

  if (!input.supplier.supplierAssigned) {
    missingInputs.push("supplier");
  }

  if (!input.supplier.rulesConfirmed) {
    missingInputs.push(
      "confirmed supplier rules",
    );
  }

  return Array.from(
    new Set(missingInputs),
  );
}

function calculateConfidence(
  input: RecommendationEngineInput,
  missingInputs: string[],
): number {
  if (missingInputs.length > 0) {
    return clampConfidence(
      100 -
        missingInputs.length * 12,
    );
  }

  const confidenceValues = [
    input.commercial.confidence,
    input.capital.confidence,
    input.inventory.confidence,
    input.supplier.confidence,
  ].filter((value) =>
    Number.isFinite(value),
  );

  if (confidenceValues.length === 0) {
    return 0;
  }

  const average =
    confidenceValues.reduce(
      (total, value) =>
        total + value,
      0,
    ) / confidenceValues.length;

  return clampConfidence(average);
}

function getAffordablePackQuantity(
  input: RecommendationEngineInput,
): number {
  const proposedPackQuantity =
    normalisePositiveInteger(
      input.proposedPackQuantity,
    );

  if (
    proposedPackQuantity <= 0 ||
    input.proposedPurchaseGbp <= 0
  ) {
    return 0;
  }

  const estimatedCostPerPack =
    input.proposedPurchaseGbp /
    proposedPackQuantity;

  if (
    !Number.isFinite(
      estimatedCostPerPack,
    ) ||
    estimatedCostPerPack <= 0
  ) {
    return 0;
  }

  return normalisePositiveInteger(
    input.capital
      .availablePurchasingPowerGbp /
      estimatedCostPerPack,
  );
}

export function generateRecommendation(
  input: RecommendationEngineInput,
): RecommendationEngineResult {
  const pipeline = getPipeline(input);

  const missingInputs =
    getMissingInputs(input);

  const confidence =
    calculateConfidence(
      input,
      missingInputs,
    );

  const proposedPackQuantity =
    normalisePositiveInteger(
      input.proposedPackQuantity,
    );

  const inventoryRecommendedQuantity =
    normalisePositiveInteger(
      input.inventory
        .recommendedPackQuantity ?? 0,
    );

  const supplierMinimumQuantity =
    normalisePositiveInteger(
      input.supplier
        .minimumOrderPacks ?? 0,
    );

  const affordablePackQuantity =
    getAffordablePackQuantity(input);

  const maximumSafePurchaseGbp =
    input.capital
      .availablePurchasingPowerGbp;

  const reasons: string[] = [];
  const warnings: string[] = [];

  if (
    input.commercial.decision === "buy"
  ) {
    reasons.push(
      "Commercial margin and return on capital meet Vault Brain targets.",
    );
  }

  if (
    input.inventory.reorderRequired
  ) {
    reasons.push(
      "Inventory intelligence indicates that replenishment is required.",
    );
  }

  if (
    input.capital.reserveProtected
  ) {
    reasons.push(
      "The protected cash reserve remains intact.",
    );
  }

  if (
    input.supplier.minimumOrderSatisfied
  ) {
    reasons.push(
      "The proposed order satisfies the supplier minimum order requirement.",
    );
  }

  if (
    input.capital.decision === "limited"
  ) {
    warnings.push(
      "The purchase is affordable, but little purchasing power will remain.",
    );
  }

  if (
    !input.inventory.reorderRequired &&
    input.inventory.dataAvailable
  ) {
    warnings.push(
      "Current inventory does not yet justify immediate replenishment.",
    );
  }

  if (
    !input.supplier
      .minimumOrderSatisfied &&
    input.supplier.dataAvailable
  ) {
    warnings.push(
      "The proposed quantity does not satisfy the supplier minimum order.",
    );
  }

  if (missingInputs.length > 0) {
    return {
      decision: "complete_data",

      label: "Awaiting data",

      headline:
        "Vault Brain needs more information.",

      explanation:
        "Complete the missing commercial, inventory and supplier information before a trusted purchasing recommendation can be generated.",

      confidence,

      proposedPackQuantity,
      recommendedPackQuantity: 0,

      proposedPurchaseGbp:
        input.proposedPurchaseGbp,

      maximumSafePurchaseGbp,

      affordable:
        input.capital.affordable,

      reserveProtected:
        input.capital.reserveProtected,

      minimumOrderSatisfied:
        input.supplier
          .minimumOrderSatisfied,

      reorderRequired:
        input.inventory
          .reorderRequired,

      pipeline,
      reasons,
      warnings,
      missingInputs,
    };
  }

  if (
    input.commercial.decision === "avoid" ||
    !input.supplier
      .recommendationEnabled ||
    input.supplier.fulfilmentModel ===
      "dropship" ||
    input.supplier.fulfilmentModel ===
      "service"
  ) {
    return {
      decision: "avoid",

      label: "Do not purchase",

      headline:
        "Vault Brain does not approve this purchase.",

      explanation:
        input.commercial.decision ===
        "avoid"
          ? "The product does not currently meet the required commercial return thresholds."
          : "The supplier or fulfilment model is excluded from owned-stock purchasing recommendations.",

      confidence,

      proposedPackQuantity,
      recommendedPackQuantity: 0,

      proposedPurchaseGbp:
        input.proposedPurchaseGbp,

      maximumSafePurchaseGbp,

      affordable:
        input.capital.affordable,

      reserveProtected:
        input.capital.reserveProtected,

      minimumOrderSatisfied:
        input.supplier
          .minimumOrderSatisfied,

      reorderRequired:
        input.inventory
          .reorderRequired,

      pipeline,
      reasons,
      warnings,
      missingInputs,
    };
  }

  if (
    !input.inventory.reorderRequired ||
    input.commercial.decision === "hold"
  ) {
    return {
      decision: "wait",

      label: "Wait",

      headline:
        "The product is viable, but purchasing is not yet justified.",

      explanation:
        !input.inventory
          .reorderRequired
          ? "Commercial performance may be acceptable, but current stock does not yet require replenishment."
          : "The product is profitable, but stronger commercial opportunities should be prioritised first.",

      confidence,

      proposedPackQuantity,
      recommendedPackQuantity: 0,

      proposedPurchaseGbp:
        input.proposedPurchaseGbp,

      maximumSafePurchaseGbp,

      affordable:
        input.capital.affordable,

      reserveProtected:
        input.capital.reserveProtected,

      minimumOrderSatisfied:
        input.supplier
          .minimumOrderSatisfied,

      reorderRequired:
        input.inventory
          .reorderRequired,

      pipeline,
      reasons,
      warnings,
      missingInputs,
    };
  }

  if (
    input.capital.decision ===
      "rejected"
  ) {
    if (
      affordablePackQuantity >=
      supplierMinimumQuantity &&
      affordablePackQuantity > 0
    ) {
      const recommendedPackQuantity =
        inventoryRecommendedQuantity > 0
          ? Math.min(
              affordablePackQuantity,
              inventoryRecommendedQuantity,
            )
          : affordablePackQuantity;

      return {
        decision: "reduce_order",

        label: "Reduce order",

        headline:
          "The proposed purchase is too large, but a smaller order may be safe.",

        explanation:
          "Reduce the order to remain within available purchasing power while protecting the cash reserve.",

        confidence,

        proposedPackQuantity,
        recommendedPackQuantity,

        proposedPurchaseGbp:
          input.proposedPurchaseGbp,

        maximumSafePurchaseGbp,

        affordable: false,

        reserveProtected:
          input.capital.reserveProtected,

        minimumOrderSatisfied:
          recommendedPackQuantity >=
          supplierMinimumQuantity,

        reorderRequired:
          input.inventory
            .reorderRequired,

        pipeline,
        reasons,
        warnings,
        missingInputs,
      };
    }

    return {
      decision: "wait",

      label: "Insufficient capital",

      headline:
        "The purchase cannot be made safely today.",

      explanation:
        "Available purchasing power is below the amount required to place a reserve-safe supplier order.",

      confidence,

      proposedPackQuantity,
      recommendedPackQuantity: 0,

      proposedPurchaseGbp:
        input.proposedPurchaseGbp,

      maximumSafePurchaseGbp,

      affordable: false,

      reserveProtected:
        input.capital.reserveProtected,

      minimumOrderSatisfied: false,

      reorderRequired:
        input.inventory
          .reorderRequired,

      pipeline,
      reasons,
      warnings,
      missingInputs,
    };
  }

  if (
    proposedPackQuantity <
    supplierMinimumQuantity
  ) {
    return {
      decision: "wait",

      label: "MOQ not satisfied",

      headline:
        "The proposed order is below the supplier minimum.",

      explanation:
        `Increase the basket to at least ${supplierMinimumQuantity} packs before Vault Brain can approve the order.`,

      confidence,

      proposedPackQuantity,
      recommendedPackQuantity:
        supplierMinimumQuantity,

      proposedPurchaseGbp:
        input.proposedPurchaseGbp,

      maximumSafePurchaseGbp,

      affordable:
        input.capital.affordable,

      reserveProtected:
        input.capital.reserveProtected,

      minimumOrderSatisfied: false,

      reorderRequired:
        input.inventory
          .reorderRequired,

      pipeline,
      reasons,
      warnings,
      missingInputs,
    };
  }

  const recommendedPackQuantity =
    inventoryRecommendedQuantity > 0
      ? Math.max(
          supplierMinimumQuantity,
          Math.min(
            proposedPackQuantity,
            inventoryRecommendedQuantity,
          ),
        )
      : proposedPackQuantity;

  return {
    decision: "buy",

    label: "Approved",

    headline:
      "Vault Brain approves this purchase.",

    explanation:
      "The product is commercially strong, replenishment is required, sufficient purchasing power is available, the protected reserve remains intact and supplier rules are satisfied.",

    confidence,

    proposedPackQuantity,
    recommendedPackQuantity,

    proposedPurchaseGbp:
      input.proposedPurchaseGbp,

    maximumSafePurchaseGbp,

    affordable:
      input.capital.affordable,

    reserveProtected:
      input.capital.reserveProtected,

    minimumOrderSatisfied:
      input.supplier
        .minimumOrderSatisfied,

    reorderRequired:
      input.inventory
        .reorderRequired,

    pipeline,
    reasons,
    warnings,
    missingInputs,
  };
}

export const RecommendationEngine = {
  generate: generateRecommendation,
};