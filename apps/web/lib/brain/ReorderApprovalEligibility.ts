type ReorderApprovalEligibilityInput = {
  configuration_trusted: boolean;
  inventory_strategy: string;
  restock_enabled: boolean;
  reorder_approval: { approval_state: string } | null;
};

type FuturePurchasingInput = {
  inventory_strategy: string;
  restock_enabled: boolean;
};

export function isFuturePurchasingProduct(
  product: FuturePurchasingInput,
): boolean {
  return product.inventory_strategy === "stocked" && product.restock_enabled;
}

export function requiresCommercialCostRemediation(
  product: FuturePurchasingInput,
  landedCostPerPackGbp: number | null,
): boolean {
  return isFuturePurchasingProduct(product) && (
    landedCostPerPackGbp === null ||
    !Number.isFinite(landedCostPerPackGbp) ||
    landedCostPerPackGbp <= 0
  );
}

export function requiresTargetStockDaysRemediation(
  product: FuturePurchasingInput,
  targetStockDays: number | null,
): boolean {
  return isFuturePurchasingProduct(product) && (
    targetStockDays === null ||
    !Number.isFinite(targetStockDays) ||
    targetStockDays <= 0
  );
}

export function requiresExplicitReorderApproval(
  product: ReorderApprovalEligibilityInput,
): boolean {
  return product.configuration_trusted &&
    isFuturePurchasingProduct(product) &&
    product.reorder_approval?.approval_state !== "approved";
}
