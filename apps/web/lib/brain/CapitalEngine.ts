import type {
  CapitalDecisionInput,
  CapitalDecisionResult,
  CapitalState,
} from "@/lib/brain/types";

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalisePositive(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function getCapitalState(
  ledgerBalanceGbp: number,
  calculatedPurchasingPowerGbp: number,
): CapitalState {
  if (ledgerBalanceGbp <= 0) {
    return "no_cash";
  }

  if (calculatedPurchasingPowerGbp <= 0) {
    return "reserve_protected";
  }

  if (calculatedPurchasingPowerGbp < 500) {
    return "limited";
  }

  return "healthy";
}

export function reviewCapitalPosition(
  input: CapitalDecisionInput,
): CapitalDecisionResult {
  const ledgerBalanceGbp =
    roundCurrency(input.ledgerBalanceGbp);

  const protectedReserveGbp =
    roundCurrency(
      normalisePositive(
        input.protectedReserveGbp,
      ),
    );

  const committedOrdersGbp =
    roundCurrency(
      normalisePositive(
        input.committedOrdersGbp,
      ),
    );

  const proposedPurchaseGbp =
    roundCurrency(
      normalisePositive(
        input.proposedPurchaseGbp ?? 0,
      ),
    );

  const calculatedPurchasingPowerGbp =
    roundCurrency(
      Math.max(
        ledgerBalanceGbp -
          protectedReserveGbp -
          committedOrdersGbp,
        0,
      ),
    );

  const manualSpendingLimitGbp =
    input.manualSpendingLimitGbp === null ||
    input.manualSpendingLimitGbp === undefined
      ? null
      : roundCurrency(
          normalisePositive(
            input.manualSpendingLimitGbp,
          ),
        );

  const availablePurchasingPowerGbp =
    manualSpendingLimitGbp === null
      ? calculatedPurchasingPowerGbp
      : roundCurrency(
          Math.min(
            calculatedPurchasingPowerGbp,
            manualSpendingLimitGbp,
          ),
        );

  const remainingPurchasingPowerGbp =
    roundCurrency(
      Math.max(
        availablePurchasingPowerGbp -
          proposedPurchaseGbp,
        0,
      ),
    );

  const projectedCashAfterPurchaseGbp =
    roundCurrency(
      ledgerBalanceGbp -
        committedOrdersGbp -
        proposedPurchaseGbp,
    );

  const affordable =
    proposedPurchaseGbp <=
    availablePurchasingPowerGbp;

  const reserveProtected =
    projectedCashAfterPurchaseGbp >=
    protectedReserveGbp;

  const state = getCapitalState(
    ledgerBalanceGbp,
    calculatedPurchasingPowerGbp,
  );

  if (!affordable || !reserveProtected) {
    return {
      decision: "rejected",
      state,

      ledgerBalanceGbp,
      protectedReserveGbp,
      committedOrdersGbp,

      calculatedPurchasingPowerGbp,
      availablePurchasingPowerGbp,

      proposedPurchaseGbp,
      remainingPurchasingPowerGbp,
      projectedCashAfterPurchaseGbp,

      reserveProtected,
      affordable,

      confidence: 100,

      headline:
        "Purchase exceeds safe capital limits.",

      explanation:
        "This purchase would exceed available purchasing power or reduce cash below the protected reserve. Vault Brain does not approve it.",
    };
  }

  if (
    remainingPurchasingPowerGbp < 500 ||
    state === "limited"
  ) {
    return {
      decision: "limited",
      state,

      ledgerBalanceGbp,
      protectedReserveGbp,
      committedOrdersGbp,

      calculatedPurchasingPowerGbp,
      availablePurchasingPowerGbp,

      proposedPurchaseGbp,
      remainingPurchasingPowerGbp,
      projectedCashAfterPurchaseGbp,

      reserveProtected,
      affordable,

      confidence: 100,

      headline:
        "Purchase is affordable, but capital will become limited.",

      explanation:
        "The protected reserve remains intact, but little purchasing power will remain. Prioritise only products with the strongest return and demand.",
    };
  }

  return {
    decision: "approved",
    state,

    ledgerBalanceGbp,
    protectedReserveGbp,
    committedOrdersGbp,

    calculatedPurchasingPowerGbp,
    availablePurchasingPowerGbp,

    proposedPurchaseGbp,
    remainingPurchasingPowerGbp,
    projectedCashAfterPurchaseGbp,

    reserveProtected,
    affordable,

    confidence: 100,

    headline:
      "Purchase is affordable and reserve-safe.",

    explanation:
      "The purchase fits within available purchasing power and leaves the protected reserve intact.",
  };
}

export const CapitalEngine = {
  reviewPosition: reviewCapitalPosition,
};