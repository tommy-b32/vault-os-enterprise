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
  return `${demand.sales7Days ?? "Unavailable"} sold in 7 days · ${demand.sales14Days ?? "Unavailable"} in 14 · ${demand.sales30Days ?? "Unavailable"} in 30 · Last sale ${demand.daysSinceLastSale === null ? "unavailable" : `${demand.daysSinceLastSale} days ago`}`;
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
    return {
      ...common,
      state: "WATCH",
      reason: demand.replenishment_gate_reason,
      recommended_quantity: null,
    };
  }

  if (
    demand.status === "needs_replenishment" &&
    demand.replenishment_qualified &&
    (demand.suggestedPacks ?? 0) > 0
  ) {
    return {
      ...common,
      state: "REPLENISH_NOW",
      reason: `${demand.demand_status} demand qualifies for replenishment. ${quantity} provides the existing canonical recommended quantity.`,
      recommended_quantity: quantity,
    };
  }

  const reason = demand.quantity_intelligence?.stock_deficit_units === 0
    ? `${demand.demand_status} demand detected, but available stock already covers calculated demand.`
    : demand.demand_status === "DORMANT"
      ? "No qualifying recent demand."
      : "Canonical demand does not currently justify replenishment.";
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
