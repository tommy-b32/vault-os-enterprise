type ReorderApprovalEligibilityInput = {
  configuration_trusted: boolean;
  inventory_strategy: string;
  restock_enabled: boolean;
  reorder_approval: { approval_state: string } | null;
};

export function requiresExplicitReorderApproval(
  product: ReorderApprovalEligibilityInput,
): boolean {
  return product.configuration_trusted &&
    product.inventory_strategy === "stocked" &&
    product.restock_enabled &&
    product.reorder_approval?.approval_state !== "approved";
}
