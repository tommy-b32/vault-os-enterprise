export type InventoryValuationInput = { styleId: string; parentProductId: string; stockOnHand: number; commercialCost: { trusted: boolean; currency: string; landedCostPerPackGbp: number | null; unitsPerPack: number | null } | null };

export type InventoryValuation = {
  totalUnits: number;
  costedUnits: number;
  uncostedUnits: number;
  totalGbp: number;
};

/** Read-only current-stock valuation. A partial total is never presented as exact. */
export function valueCurrentInventory(products: readonly InventoryValuationInput[]): InventoryValuation | null {
  let totalUnits = 0;
  let costedUnits = 0;
  let totalGbp = 0;
  for (const product of products) {
    if (!Number.isFinite(product.stockOnHand)) return null;
    const positiveUnits = Math.max(0, product.stockOnHand);
    totalUnits += positiveUnits;
    if (positiveUnits === 0) continue;
    const cost = product.commercialCost;
    const packCost = cost?.landedCostPerPackGbp;
    const unitsPerPack = cost?.unitsPerPack;
    if (!cost || !cost.trusted || cost.currency !== "GBP" || typeof packCost !== "number" || !Number.isFinite(packCost) || packCost < 0 || typeof unitsPerPack !== "number" || !Number.isSafeInteger(unitsPerPack) || unitsPerPack <= 0) continue;
    costedUnits += positiveUnits;
    totalGbp += positiveUnits * (packCost / unitsPerPack);
  }
  if (!Number.isFinite(totalGbp)) return null;
  return { totalUnits, costedUnits, uncostedUnits: totalUnits - costedUnits, totalGbp };
}
