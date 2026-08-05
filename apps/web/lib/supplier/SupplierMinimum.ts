export type SupplierMinimumState =
  | "unknown"
  | "not_applicable"
  | "defined";

export type SupplierMinimum = {
  value: number | null;
  currency: string | null;
  state: SupplierMinimumState;
  minimumOrderPacks: number | null;
  packState: SupplierMinimumState;
};

function stateFor(value: number | null): SupplierMinimumState {
  if (value === null || !Number.isFinite(value) || value < 0) return "unknown";
  return value === 0 ? "not_applicable" : "defined";
}

export function createSupplierMinimum({
  value,
  currency,
  minimumOrderPacks,
}: {
  value: number | null;
  currency: string | null;
  minimumOrderPacks?: number | null;
}): SupplierMinimum {
  const monetaryState = stateFor(value);
  const packValue = minimumOrderPacks === undefined ? null : minimumOrderPacks;
  const packState = stateFor(packValue);
  const state = minimumOrderPacks === undefined
    ? monetaryState
    : monetaryState === "defined" || packState === "defined"
      ? "defined"
      : monetaryState === "not_applicable" && packState === "not_applicable"
        ? "not_applicable"
        : "unknown";

  return {
    value: monetaryState === "unknown" ? null : value,
    currency,
    state,
    minimumOrderPacks: packState === "unknown" ? null : packValue,
    packState,
  };
}

export const SupplierMinimumContract = {
  create: createSupplierMinimum,
} as const;
