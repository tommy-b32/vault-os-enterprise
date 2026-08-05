import type { SupplierMinimumState } from "@/lib/supplier/SupplierMinimum";

export type SupplierMinimumPolicyInput = {
  supplierId: string;
  value: number | null;
  state: SupplierMinimumState;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const MAXIMUM_MINIMUM_ORDER_VALUE = 9_999_999_999.99;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function parseSupplierMinimumPolicy(
  formData: FormData,
): SupplierMinimumPolicyInput {
  const supplierId = text(formData, "supplier_id");
  const policy = text(formData, "minimum_order_policy");

  if (!UUID_PATTERN.test(supplierId)) {
    throw new Error("Choose a valid canonical supplier.");
  }
  if (policy === "unknown") {
    return { supplierId, value: null, state: "unknown" };
  }
  if (policy === "not_applicable") {
    return { supplierId, value: 0, state: "not_applicable" };
  }
  if (policy !== "defined") {
    throw new Error("Choose a valid minimum-order policy.");
  }

  const rawValue = text(formData, "minimum_order_value");
  if (!rawValue) {
    throw new Error("Enter the defined minimum-order value.");
  }
  if (!MONEY_PATTERN.test(rawValue)) {
    throw new Error("Enter a valid non-negative monetary value with no more than two decimal places.");
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0 || value > MAXIMUM_MINIMUM_ORDER_VALUE) {
    throw new Error("A defined minimum must be greater than zero and within the canonical monetary range.");
  }

  return { supplierId, value, state: "defined" };
}
