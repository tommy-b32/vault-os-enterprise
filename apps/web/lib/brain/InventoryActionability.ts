import type { DemandIntelligenceResult } from "@/lib/brain/DemandIntelligenceEngine";
import type { TradingEvidenceState } from "@/lib/brain/TradingEvidencePolicy";

export type InventoryActionabilityState = "action_required" | "watch" | "healthy" | "no_action_required" | "unavailable";
export type InventoryActionability = { styleId: string; state: InventoryActionabilityState; reason: string; replenishmentEvaluationRequired: boolean };

/** Read-only operator projection of existing governed demand and trading-evidence semantics. */
export function classifyInventoryActionability(input: { demand: DemandIntelligenceResult; tradingEvidenceState: TradingEvidenceState | null }): InventoryActionability {
  const { demand, tradingEvidenceState } = input;
  if (demand.status === "excluded_by_strategy") return { styleId: demand.styleId, state: "no_action_required", reason: "Excluded by inventory strategy.", replenishmentEvaluationRequired: false };
  if (demand.status === "evidence_unavailable" || !demand.trusted || tradingEvidenceState === "UNKNOWN" || tradingEvidenceState === null) return { styleId: demand.styleId, state: "unavailable", reason: demand.replenishment_gate_reason, replenishmentEvaluationRequired: false };
  if (demand.status === "no_replenishment_required") return demand.replenishment_qualified
    ? { styleId: demand.styleId, state: "healthy", reason: "Inventory is commercially adequate against current governed evidence.", replenishmentEvaluationRequired: false }
    : { styleId: demand.styleId, state: "no_action_required", reason: "Canonical demand does not currently require replenishment.", replenishmentEvaluationRequired: false };
  if (demand.status === "needs_replenishment" && tradingEvidenceState === "SUFFICIENT_EVIDENCE") return { styleId: demand.styleId, state: "action_required", reason: demand.replenishment_gate_reason, replenishmentEvaluationRequired: true };
  return { styleId: demand.styleId, state: "watch", reason: demand.replenishment_gate_reason, replenishmentEvaluationRequired: false };
}

export function summarizeInventoryActionability(items: InventoryActionability[]): Record<InventoryActionabilityState, number> {
  return items.reduce<Record<InventoryActionabilityState, number>>((counts, item) => ({ ...counts, [item.state]: counts[item.state] + 1 }), { action_required: 0, watch: 0, healthy: 0, no_action_required: 0, unavailable: 0 });
}
