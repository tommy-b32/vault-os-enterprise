import type {
  CapitalDecisionInput,
  CapitalDecisionResult,
  CapitalInputState,
  CapitalState,
} from "@/lib/brain/types";

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function inspectNumber(
  value: number | null | undefined,
  allowNegative = false,
): CapitalInputState {
  if (value === null || value === undefined) {
    return { state: "missing", value: null };
  }

  if (!Number.isFinite(value) || (!allowNegative && value < 0)) {
    return { state: "invalid", value: null };
  }

  return { state: "available", value };
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
  const inputStates = {
    ledgerBalanceGbp: inspectNumber(input.ledgerBalanceGbp, true),
    protectedReserveGbp: inspectNumber(input.protectedReserveGbp),
    committedOrdersGbp: inspectNumber(input.committedOrdersGbp),
    proposedPurchaseGbp: inspectNumber(input.proposedPurchaseGbp),
    manualSpendingLimitGbp:
      input.manualSpendingLimitGbp === null ||
      input.manualSpendingLimitGbp === undefined
        ? null
        : inspectNumber(input.manualSpendingLimitGbp),
  };
  const unavailable =
    input.walletAvailable === false ||
    Object.values(inputStates).some(
      (state) => state !== null && state.state !== "available",
    );

  if (unavailable) {
    return {
      decision: "unavailable",
      state: "unavailable",
      availability: "unavailable",
      walletLastUpdated: input.walletLastUpdated ?? null,
      inputStates,
      ledgerBalanceGbp: Number.NaN,
      protectedReserveGbp: Number.NaN,
      committedOrdersGbp: Number.NaN,
      calculatedPurchasingPowerGbp: Number.NaN,
      availablePurchasingPowerGbp: Number.NaN,
      proposedPurchaseGbp: Number.NaN,
      remainingPurchasingPowerGbp: Number.NaN,
      projectedCashAfterPurchaseGbp: Number.NaN,
      reserveProtected: false,
      affordable: false,
      confidence: 0,
      headline: "Capital inputs are unavailable.",
      explanation:
        "Vault Brain cannot evaluate capital until every required wallet input is available and valid.",
    };
  }

  const ledgerBalanceGbp =
    roundCurrency(inputStates.ledgerBalanceGbp.value as number);

  const protectedReserveGbp =
    roundCurrency(
      inputStates.protectedReserveGbp.value as number,
    );

  const committedOrdersGbp =
    roundCurrency(
      inputStates.committedOrdersGbp.value as number,
    );

  const proposedPurchaseGbp =
    roundCurrency(
      inputStates.proposedPurchaseGbp.value as number,
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
          input.manualSpendingLimitGbp,
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
      availability: "available",
      walletLastUpdated: input.walletLastUpdated ?? null,
      inputStates,

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
      availability: "available",
      walletLastUpdated: input.walletLastUpdated ?? null,
      inputStates,

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
    availability: "available",
    walletLastUpdated: input.walletLastUpdated ?? null,
    inputStates,

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
