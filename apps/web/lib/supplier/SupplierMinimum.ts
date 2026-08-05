export type SupplierMinimumState =
  | "unknown"
  | "not_applicable"
  | "defined";

export type SupplierMinimum = {
  value: number | null;
  currency: string | null;
  state: SupplierMinimumState;
};

export function createSupplierMinimum({
  value,
  currency,
}: {
  value: number | null;
  currency: string | null;
}): SupplierMinimum {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return { value: null, currency, state: "unknown" };
  }

  if (value === 0) {
    return { value, currency, state: "not_applicable" };
  }

  return { value, currency, state: "defined" };
}

export const SupplierMinimumContract = {
  create: createSupplierMinimum,
} as const;
