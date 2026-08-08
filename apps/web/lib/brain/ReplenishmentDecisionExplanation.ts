import type { DemandIntelligenceResult } from "./DemandIntelligenceEngine.ts";

export type ReplenishmentExplanationState =
  | "REPLENISH_NOW"
  | "WATCH"
  | "NO_REPLENISHMENT"
  | "EVIDENCE_UNAVAILABLE";

export type ReplenishmentDecisionExplanation = {
  style_id: string;
  state: ReplenishmentExplanationState;
  reason: string;
  sales_evidence: string;
  stock_evidence: string;
  recommended_quantity: string | null;
  missing_requirements: string[];
};

function salesEvidence(demand: DemandIntelligenceResult): string {
  const sales = (value: number | null) => value === null
    ? "Unavailable"
    : `${value} ${value === 1 ? "sale" : "sales"}`;
  const recency = demand.daysSinceLastSale === null
    ? "unavailable"
    : `${demand.daysSinceLastSale} ${demand.daysSinceLastSale === 1 ? "day" : "days"} ago`;
  return `${sales(demand.sales7Days)} in 7 days · ${sales(demand.sales14Days)} in 14 · ${sales(demand.sales30Days)} in 30 · Latest sale ${recency}`;
}

function stockEvidence(demand: DemandIntelligenceResult): string {
  const target = demand.quantity_intelligence?.target_units;
  return `On hand ${demand.currentStock ?? "Unavailable"} · Available ${demand.netAvailableStock ?? "Unavailable"}${target === undefined ? "" : ` · Target ${target}`}`;
}

function explainMissing(requirements: string[]): string {
  return requirements.length === 0
    ? "Canonical evidence is unavailable, so no replenishment decision can be made."
    : `Decision unavailable: ${requirements.map((requirement) => requirement.replaceAll("_", " ")).join("; ")}.`;
}

function count(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function targetPackClarification(demand: DemandIntelligenceResult, quantity: string): string | null {
  const targetUnits = demand.quantity_intelligence?.target_units;
  const unitsPerPack = demand.quantity_intelligence?.units_per_pack;
  if (targetUnits === undefined || unitsPerPack === undefined || targetUnits >= unitsPerPack) return null;
  return `Calculated target stock is ${count(targetUnits, "unit")}, but this product can only be purchased in packs of ${unitsPerPack}. Recommended purchase: ${quantity}.`;
}

export function explainReplenishmentDecision(
  demand: DemandIntelligenceResult,
): ReplenishmentDecisionExplanation {
  const quantity = demand.suggestedPacks !== null && demand.suggestedUnits !== null
    ? `${demand.suggestedPacks} ${demand.suggestedPacks === 1 ? "pack" : "packs"} / ${demand.suggestedUnits} units`
    : null;
  const common = {
    style_id: demand.styleId,
    sales_evidence: salesEvidence(demand),
    stock_evidence: stockEvidence(demand),
    missing_requirements: [...demand.missingRequirements],
  };

  if (demand.status === "evidence_unavailable" || demand.demand_status === "NO_EVIDENCE") {
    return {
      ...common,
      state: "EVIDENCE_UNAVAILABLE",
      reason: explainMissing(demand.missingRequirements),
      recommended_quantity: null,
    };
  }

  if (demand.demand_status === "SLOW" && !demand.replenishment_qualified) {
    const recency = demand.daysSinceLastSale === null
      ? "the latest sale date unavailable"
      : `the latest sale ${count(demand.daysSinceLastSale, "day")} ago`;
    return {
      ...common,
      state: "WATCH",
      reason: `Demand remains slow. The style recorded ${count(demand.sales30Days ?? 0, "sale")} in the last 30 days, with ${recency}, so recent evidence does not yet justify replenishment.`,
      recommended_quantity: null,
    };
  }

  if (
    demand.status === "needs_replenishment" &&
    demand.replenishment_qualified &&
    (demand.suggestedPacks ?? 0) > 0
  ) {
    const clarification = targetPackClarification(demand, quantity as string);
    const reason = demand.demand_status === "SLOW"
      ? `This style is still selling, with ${count(demand.sales30Days ?? 0, "sale")} in the last 30 days and the latest ${demand.daysSinceLastSale === null ? "sale date unavailable" : `${count(demand.daysSinceLastSale, "day")} ago`}. Current stock is below the calculated target, so replenishment is justified. Recommended: ${quantity}.`
      : `This style sold within the last 7 days and current stock is below the calculated target. Based on recent demand and stock cover, ${quantity} is recommended.`;
    return {
      ...common,
      state: "REPLENISH_NOW",
      reason: clarification ?? reason,
      recommended_quantity: quantity,
    };
  }

  const reason = demand.quantity_intelligence?.stock_deficit_units === 0
    ? "Demand is present, but current available stock already covers the calculated target."
    : demand.demand_status === "DORMANT"
      ? "No qualifying recent demand currently justifies replenishment."
      : "No qualifying recent demand currently justifies replenishment.";
  return {
    ...common,
    state: "NO_REPLENISHMENT",
    reason,
    recommended_quantity: null,
  };
}

export const ReplenishmentDecisionExplanationEngine = {
  explain: explainReplenishmentDecision,
} as const;
