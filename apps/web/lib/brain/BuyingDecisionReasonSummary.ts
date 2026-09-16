import type { DemandIntelligenceResult } from "@/lib/brain/DemandIntelligenceEngine";
import type { PurchaseIntelligenceEvaluation, SupplierPurchasingQualification } from "@/lib/brain/PurchaseIntelligenceEngine";
import type { TrustedBuyingCandidateRejectionReason } from "@/lib/brain/TrustedBuyingCandidateClassifier";

export type BuyingDecisionReasonStage = "INVENTORY" | "DEMAND" | "TRADING_EVIDENCE" | "COMMERCIAL" | "SUPPLIER" | "CAPITAL" | "POLICY" | "QUANTITY" | "CONFIGURATION" | "UNKNOWN";
export type BuyingDecisionReasonState = "NO_ACTION_REQUIRED" | "GATHERING_EVIDENCE" | "BLOCKED" | "UNAVAILABLE" | "ELIGIBLE" | "INFORMATIONAL" | "UNKNOWN";
export type BuyingDecisionOutcome = "TRUSTED_CANDIDATE_AVAILABLE" | "NO_TRUSTED_CANDIDATE" | "EVALUATION_UNAVAILABLE";

export type BuyingDecisionReason = {
  code: string;
  stage: BuyingDecisionReasonStage;
  state: BuyingDecisionReasonState;
  explanation: string;
  affectedStyleIds: string[];
  affectedParentProductIds: string[];
  source: "DemandIntelligenceEngine" | "TrustedBuyingCandidateClassifier" | "PurchaseIntelligenceEngine";
  details: string[];
};

export type BuyingDecisionReasonSummary = {
  generatedAt: string;
  outcome: BuyingDecisionOutcome;
  totalEvaluated: number;
  trustedCandidateCount: number;
  stages: Array<{ stage: BuyingDecisionReasonStage; state: BuyingDecisionReasonState; affectedCount: number }>;
  reasons: BuyingDecisionReason[];
  primaryReasons: BuyingDecisionReason[];
  limitations: string[];
};

type ReasonMetadata = Pick<BuyingDecisionReason, "stage" | "state" | "explanation">;

const reasonMetadata: Record<TrustedBuyingCandidateRejectionReason, ReasonMetadata> = {
  canonical_product_missing: { stage: "CONFIGURATION", state: "UNAVAILABLE", explanation: "Canonical product identity is unavailable." },
  configuration_untrusted: { stage: "CONFIGURATION", state: "BLOCKED", explanation: "Canonical configuration is not trusted." },
  inventory_strategy_not_stocked: { stage: "CONFIGURATION", state: "NO_ACTION_REQUIRED", explanation: "This style is not configured as stocked inventory." },
  restock_disabled: { stage: "CONFIGURATION", state: "NO_ACTION_REQUIRED", explanation: "Restocking is disabled for this style." },
  reorder_approval_missing: { stage: "POLICY", state: "BLOCKED", explanation: "Explicit reorder approval is required." },
  supplier_missing: { stage: "SUPPLIER", state: "UNAVAILABLE", explanation: "A canonical supplier is unavailable." },
  supplier_inactive: { stage: "SUPPLIER", state: "BLOCKED", explanation: "The assigned supplier is inactive." },
  supplier_currency_missing: { stage: "SUPPLIER", state: "UNAVAILABLE", explanation: "Supplier currency is unavailable." },
  commercial_data_missing: { stage: "COMMERCIAL", state: "BLOCKED", explanation: "Canonical commercial data is not trusted." },
  invalid_or_missing_commercial_cost: { stage: "COMMERCIAL", state: "BLOCKED", explanation: "A valid canonical landed cost is unavailable." },
  profitability_incomplete: { stage: "COMMERCIAL", state: "UNAVAILABLE", explanation: "Commercial profitability inputs are incomplete." },
  margin_below_threshold: { stage: "COMMERCIAL", state: "BLOCKED", explanation: "The governed margin threshold is not met." },
  return_below_threshold: { stage: "COMMERCIAL", state: "BLOCKED", explanation: "The governed return threshold is not met." },
  stock_above_threshold: { stage: "INVENTORY", state: "NO_ACTION_REQUIRED", explanation: "Current inventory does not require replenishment." },
  inventory_unavailable: { stage: "INVENTORY", state: "UNAVAILABLE", explanation: "Canonical inventory evidence is unavailable." },
  inventory_stale: { stage: "INVENTORY", state: "GATHERING_EVIDENCE", explanation: "Canonical inventory evidence is stale." },
  sales_history_unavailable: { stage: "TRADING_EVIDENCE", state: "GATHERING_EVIDENCE", explanation: "Canonical sales-history evidence is unavailable." },
  supplier_lead_time_missing: { stage: "SUPPLIER", state: "UNAVAILABLE", explanation: "Supplier lead time is unavailable." },
  target_stock_days_missing: { stage: "DEMAND", state: "GATHERING_EVIDENCE", explanation: "Target stock days are required before replenishment can be trusted." },
  units_per_pack_missing: { stage: "SUPPLIER", state: "UNAVAILABLE", explanation: "Units per supplier pack are unavailable." },
  supplier_moq_missing: { stage: "SUPPLIER", state: "UNAVAILABLE", explanation: "Supplier MOQ is unavailable." },
  replenishment_untrusted: { stage: "TRADING_EVIDENCE", state: "GATHERING_EVIDENCE", explanation: "Replenishment evidence is not trusted." },
  quantity_unavailable: { stage: "QUANTITY", state: "UNAVAILABLE", explanation: "A governed replenishment quantity is unavailable." },
  quantity_not_positive: { stage: "QUANTITY", state: "NO_ACTION_REQUIRED", explanation: "The calculated replenishment quantity is not positive." },
  quantity_below_minimum_policy_unresolved: { stage: "POLICY", state: "BLOCKED", explanation: "The calculated quantity is below the applicable minimum policy." },
  supplier_minimum_unknown: { stage: "SUPPLIER", state: "UNAVAILABLE", explanation: "Supplier minimum policy is unknown." },
  supplier_minimum_not_evaluated: { stage: "SUPPLIER", state: "BLOCKED", explanation: "Supplier minimum policy has not been evaluated." },
  supplier_minimum_currency_unavailable: { stage: "SUPPLIER", state: "UNAVAILABLE", explanation: "Supplier minimum currency is unavailable." },
  wallet_unavailable: { stage: "CAPITAL", state: "UNAVAILABLE", explanation: "Purchasing-wallet evidence is unavailable." },
  wallet_freshness_unknown: { stage: "CAPITAL", state: "GATHERING_EVIDENCE", explanation: "Purchasing-wallet freshness cannot be evaluated." },
  wallet_stale: { stage: "CAPITAL", state: "GATHERING_EVIDENCE", explanation: "Purchasing-wallet evidence is stale." },
  capital_not_evaluated: { stage: "CAPITAL", state: "INFORMATIONAL", explanation: "Per-style capital approval is evaluated at supplier qualification." },
  insufficient_reserve_safe_capacity: { stage: "CAPITAL", state: "BLOCKED", explanation: "Reserve-safe purchasing capacity is insufficient." },
  protected_reserve_breach: { stage: "CAPITAL", state: "BLOCKED", explanation: "The protected reserve would be breached." },
};

function groupedReason(input: Omit<BuyingDecisionReason, "affectedStyleIds" | "affectedParentProductIds" | "details"> & { styleIds?: Iterable<string>; parentIds?: Iterable<string>; details?: Iterable<string> }): BuyingDecisionReason {
  return { ...input, affectedStyleIds: [...new Set(input.styleIds ?? [])].filter(Boolean), affectedParentProductIds: [...new Set(input.parentIds ?? [])].filter(Boolean), details: [...new Set(input.details ?? [])].filter(Boolean) };
}

function demandState(status: DemandIntelligenceResult["status"]): BuyingDecisionReasonState {
  return status === "no_replenishment_required" || status === "excluded_by_strategy" ? "NO_ACTION_REQUIRED" : status === "evidence_unavailable" ? "GATHERING_EVIDENCE" : status === "needs_replenishment" ? "ELIGIBLE" : "UNKNOWN";
}

function qualificationState(qualification: SupplierPurchasingQualification): BuyingDecisionReasonState {
  return qualification.state === "ready_to_purchase" ? "ELIGIBLE" : qualification.state === "evidence_unavailable" ? "UNAVAILABLE" : qualification.state === "blocked_by_capital" || qualification.state === "blocked_by_approval" || qualification.state === "blocked_by_supplier_policy" ? "BLOCKED" : "GATHERING_EVIDENCE";
}

/**
 * Presentation-only projection of a completed governed evaluation. It neither
 * evaluates a gate nor changes candidate eligibility.
 */
export function buildBuyingDecisionReasonSummary(evaluation: PurchaseIntelligenceEvaluation, generatedAt: string): BuyingDecisionReasonSummary {
  const reasons: BuyingDecisionReason[] = [];
  const demandGroups = new Map<DemandIntelligenceResult["status"], DemandIntelligenceResult[]>();
  for (const demand of evaluation.demands) demandGroups.set(demand.status, [...(demandGroups.get(demand.status) ?? []), demand]);
  for (const [status, demands] of demandGroups) {
    if (status === "needs_replenishment") continue;
    reasons.push(groupedReason({ code: `demand_${status}`, stage: "DEMAND", state: demandState(status), explanation: status === "no_replenishment_required" ? "Canonical demand does not currently require replenishment." : status === "evidence_unavailable" ? "Demand evidence is incomplete." : "This style is excluded by its inventory strategy.", source: "DemandIntelligenceEngine", styleIds: demands.map((demand) => demand.styleId), parentIds: demands.map((demand) => demand.parentProductId), details: demands.flatMap((demand) => [demand.replenishment_gate_reason, ...demand.missingRequirements]) }));
  }
  const candidatesByReason = new Map<TrustedBuyingCandidateRejectionReason, typeof evaluation.candidates>();
  for (const candidate of evaluation.candidates) for (const code of candidate.rejectionReasons) candidatesByReason.set(code, [...(candidatesByReason.get(code) ?? []), candidate]);
  for (const [code, candidates] of candidatesByReason) {
    const metadata = reasonMetadata[code];
    reasons.push(groupedReason({ code, ...metadata, source: "TrustedBuyingCandidateClassifier", styleIds: candidates.map((candidate) => candidate.styleId), parentIds: candidates.map((candidate) => candidate.parentProductId), details: [] }));
  }
  for (const qualification of evaluation.qualifications) {
    reasons.push(groupedReason({ code: `supplier_qualification_${qualification.state}`, stage: qualification.state === "blocked_by_capital" ? "CAPITAL" : "SUPPLIER", state: qualificationState(qualification), explanation: qualification.state.replaceAll("_", " "), source: "PurchaseIntelligenceEngine", styleIds: qualification.demandProducts.map((demand) => demand.styleId), parentIds: qualification.demandProducts.map((demand) => demand.parentProductId), details: qualification.blockers }));
  }
  const trustedCandidateCount = evaluation.candidates.filter((candidate) => candidate.eligible).length;
  const primaryByStyle = new Map<string, BuyingDecisionReason>();
  // Presentation precedence only: richer demand outcomes explain no-action/evidence
  // before a downstream quantity reason. Eligibility remains classifier-owned.
  for (const reason of reasons) for (const styleId of reason.affectedStyleIds) {
    const previous = primaryByStyle.get(styleId);
    if (!previous || (reason.source === "DemandIntelligenceEngine" && (reason.state === "NO_ACTION_REQUIRED" || reason.state === "GATHERING_EVIDENCE"))) primaryByStyle.set(styleId, reason);
  }
  const stageStyles = new Map<string, { stage: BuyingDecisionReasonStage; state: BuyingDecisionReasonState; styleIds: Set<string> }>();
  for (const reason of reasons) {
    const key = `${reason.stage}:${reason.state}`;
    const entry = stageStyles.get(key) ?? { stage: reason.stage, state: reason.state, styleIds: new Set<string>() };
    reason.affectedStyleIds.forEach((styleId) => entry.styleIds.add(styleId));
    stageStyles.set(key, entry);
  }
  const stages = [...stageStyles.values()].map(({ stage, state, styleIds }) => ({ stage, state, affectedCount: styleIds.size }));
  const parentByStyle = new Map([...evaluation.demands, ...evaluation.candidates].map((item) => [item.styleId, item.parentProductId]));
  const primaryStyleIds = new Map<BuyingDecisionReason, string[]>();
  for (const [styleId, reason] of primaryByStyle) primaryStyleIds.set(reason, [...(primaryStyleIds.get(reason) ?? []), styleId]);
  const primaryReasons = [...primaryStyleIds.entries()].map(([reason, styleIds]) => ({ ...reason, affectedStyleIds: styleIds, affectedParentProductIds: [...new Set(styleIds.map((styleId) => parentByStyle.get(styleId) ?? "").filter(Boolean))] }));
  return { generatedAt, outcome: trustedCandidateCount > 0 ? "TRUSTED_CANDIDATE_AVAILABLE" : evaluation.candidates.length > 0 ? "NO_TRUSTED_CANDIDATE" : "EVALUATION_UNAVAILABLE", totalEvaluated: evaluation.candidates.length, trustedCandidateCount, stages, reasons, primaryReasons, limitations: evaluation.candidates.length === 0 ? ["No candidate evaluation was available."] : [] };
}

export const BuyingDecisionReasonSummary = { build: buildBuyingDecisionReasonSummary } as const;
