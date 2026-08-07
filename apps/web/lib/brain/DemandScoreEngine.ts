export type DemandLevel = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type DemandScoreInput = {
  currentStock: number;
  netAvailableStock: number;
  sold7d: number;
  sold14d: number;
  sold30d: number;
  daysSinceLastSale: number | null;
  supplierLeadTimeDays: number;
  targetStockDays: number;
  unitsPerPack: number;
};

export type DemandScoreResult = {
  demand_score: number;
  demand_level: DemandLevel;
  demand_score_reason: string;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function scoreDemand(input: DemandScoreInput): DemandScoreResult {
  const recentUnits = input.sold7d;
  const middleUnits = Math.max(0, input.sold14d - input.sold7d);
  const olderUnits = Math.max(0, input.sold30d - input.sold14d);
  const weightedDailyDemand =
    (recentUnits / 7) * 0.7 +
    (middleUnits / 7) * 0.2 +
    (olderUnits / 16) * 0.1;

  const momentum = Math.min(35, recentUnits * 18 + middleUnits * 6 + olderUnits * 2);
  const recency = input.daysSinceLastSale === null
    ? 0
    : 20 * (1 - clamp(input.daysSinceLastSale, 0, 30) / 30);
  const packPressure = 20 * (
    1 - clamp(input.currentStock, 0, input.unitsPerPack) / input.unitsPerPack
  );
  const horizonDemand = weightedDailyDemand * (
    input.supplierLeadTimeDays + input.targetStockDays
  );
  const coveragePressure = horizonDemand <= 0
    ? 0
    : 25 * clamp(
        1 - Math.max(0, input.netAvailableStock) / (horizonDemand + 1),
        0,
        1,
      );
  const demandScore = clamp(
    Math.round(momentum + recency + packPressure + coveragePressure),
    0,
    100,
  );
  const demandLevel: DemandLevel = demandScore >= 70
    ? "HIGH"
    : demandScore >= 40
      ? "MEDIUM"
      : demandScore > 0
        ? "LOW"
        : "NONE";

  return {
    demand_score: demandScore,
    demand_level: demandLevel,
    demand_score_reason: [
      `${input.currentStock} on hand and ${input.netAvailableStock} net available`,
      `${input.sold7d}/${input.sold14d}/${input.sold30d} units sold over 7/14/30 days`,
      input.daysSinceLastSale === null
        ? "no recorded sale in the 30-day window"
        : `last sale ${input.daysSinceLastSale} days ago`,
      `${input.supplierLeadTimeDays}-day lead time`,
      `${input.targetStockDays} target stock days`,
      `${input.unitsPerPack} units per pack`,
    ].join("; "),
  };
}

export const DemandScoreEngine = { score: scoreDemand } as const;
