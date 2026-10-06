export type InventoryValuationInput = { styleId: string; parentProductId: string; stockOnHand: number; commercialCost: { landedCostPerPackGbp: number | null; unitsPerPack: number | null; missingRequirements: string[]; resolutionMode: string; packCostSource: string; unitsSource: string; fxSource: string; shippingCostSource: string; importCostSource: string } | null };

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
    const unavailableSource = (source: string) => source === "unavailable" || source === "";
    const costBlockingRequirement = cost?.missingRequirements.some((requirement) => ["pack_cost", "units_per_pack", "exchange_rate_to_gbp", "shipping_cost", "import_cost"].includes(requirement));
    if (!cost || cost.resolutionMode === "unavailable" || unavailableSource(cost.packCostSource) || unavailableSource(cost.unitsSource) || unavailableSource(cost.fxSource) || unavailableSource(cost.shippingCostSource) || unavailableSource(cost.importCostSource) || costBlockingRequirement || typeof packCost !== "number" || !Number.isFinite(packCost) || packCost < 0 || typeof unitsPerPack !== "number" || !Number.isSafeInteger(unitsPerPack) || unitsPerPack <= 0) continue;
    costedUnits += positiveUnits;
    totalGbp += positiveUnits * (packCost / unitsPerPack);
  }
  if (!Number.isFinite(totalGbp)) return null;
  return { totalUnits, costedUnits, uncostedUnits: totalUnits - costedUnits, totalGbp };
}
