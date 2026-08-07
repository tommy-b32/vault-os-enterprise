export type InventoryVariantMapping = {
  id: string;
  source_inventory_item_id: string;
};

export type ReturnedInventoryItem = {
  id: string;
};

export function findUnavailableInventoryVariantIds(
  variants: InventoryVariantMapping[],
  returnedItems: ReturnedInventoryItem[],
): string[] {
  const returnedInventoryItemIds = new Set(
    returnedItems.map((item) => item.id),
  );

  return variants
    .filter(
      (variant) =>
        !returnedInventoryItemIds.has(
          variant.source_inventory_item_id,
        ),
    )
    .map((variant) => variant.id);
}

