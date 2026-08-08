export type PurchaseQuantityIntelligence = {
  weighted_daily_demand: number;
  coverage_days: number;
  target_units: number;
  net_available_stock: number;
  stock_deficit_units: number;
  units_per_pack: number;
  raw_required_packs: number;
  supplier_moq_packs: number;
  recommended_packs: number;
  recommended_units: number;
  quantity_reason: string;
};

type Input = {
  sales7Days: number;
  sales14Days: number;
  sales30Days: number;
  netAvailableStock: number;
  supplierLeadTimeDays: number;
  targetStockDays: number;
  unitsPerPack: number;
  supplierMoqPacks: number;
};

function display(value: number): string {
  return Number(value.toFixed(4)).toString();
}

export function calculatePurchaseQuantity(input: Input): PurchaseQuantityIntelligence {
  const recentUnits = input.sales7Days;
  const middleUnits = Math.max(0, input.sales14Days - input.sales7Days);
  const olderUnits = Math.max(0, input.sales30Days - input.sales14Days);
  const weightedDailyDemand =
    (recentUnits / 7 * 0.70) +
    (middleUnits / 7 * 0.20) +
    (olderUnits / 16 * 0.10);
  const coverageDays = input.supplierLeadTimeDays + input.targetStockDays;
  const targetUnits = Math.ceil(weightedDailyDemand * coverageDays);
  const availableStock = Math.max(0, input.netAvailableStock);
  const stockDeficitUnits = Math.max(0, targetUnits - availableStock);
  const rawRequiredPacks = stockDeficitUnits <= 0 ? 0 : Math.ceil(stockDeficitUnits / input.unitsPerPack);
  const recommendedPacks = stockDeficitUnits <= 0
    ? 0
    : Math.max(rawRequiredPacks, input.supplierMoqPacks);
  const recommendedUnits = recommendedPacks * input.unitsPerPack;
  const quantityReason = `Weighted demand ${display(weightedDailyDemand)} units/day × ${coverageDays} days cover = ${targetUnits} target units. ${availableStock} available leaves a ${stockDeficitUnits}-unit deficit. Pack size ${input.unitsPerPack} results in ${recommendedPacks} recommended ${recommendedPacks === 1 ? "pack" : "packs"}.`;

  return {
    weighted_daily_demand: weightedDailyDemand,
    coverage_days: coverageDays,
    target_units: targetUnits,
    net_available_stock: input.netAvailableStock,
    stock_deficit_units: stockDeficitUnits,
    units_per_pack: input.unitsPerPack,
    raw_required_packs: rawRequiredPacks,
    supplier_moq_packs: input.supplierMoqPacks,
    recommended_packs: recommendedPacks,
    recommended_units: recommendedUnits,
    quantity_reason: quantityReason,
  };
}

export const PurchaseQuantityIntelligenceEngine = { calculate: calculatePurchaseQuantity } as const;
