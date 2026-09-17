import { createHash } from "node:crypto";
import type { BuyingDecisionReasonSummary } from "@/lib/brain/BuyingDecisionReasonSummary";
import type { PurchaseIntelligenceEvaluation } from "@/lib/brain/PurchaseIntelligenceEngine";
import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import { WalletFreshness } from "./WalletFreshness.ts";

export const MEMORY_SCHEMA_VERSION = 1;
export const EVALUATOR_VERSION = "governed-evaluation-v1";
export const SUMMARY_SEMANTICS_VERSION = "buying-decision-summary-v1";
export const CLASSIFIER_POLICY_VERSION = "trusted-buying-classifier-v1";
/** Server-owned single-store scope; it is never accepted from browser input. */
export const GOVERNED_DECISION_MEMORY_STORE_SCOPE = "default";

export type GovernedDecisionMemoryProjection = {
  store_scope: string; observed_at: string; local_observed_date: string;
  memory_schema_version: number; evaluator_version: string; summary_semantics_version: string; classifier_policy_version: string;
  executive_outcome: BuyingDecisionReasonSummary["outcome"]; outcome_signals: BuyingDecisionReasonSummary["outcomeSignals"];
  summary_counts: { total_evaluated: number; trusted_candidate_count: number; primary_reasons: Array<{ code: string; state: string; stage: string; affected_count: number }> };
  style_states: Array<{ style_id: string; parent_product_id: string; supplier_id: string | null; primary_reason: { code: string; state: string; stage: string } | null; demand_status: string | null; candidate_status: string | null; eligible: boolean | null; trading_evidence_state: string | null }>;
  supplier_qualifications: Array<{ supplier_id: string; state: string; blocker_codes: string[] }>;
  wallet_state: { availability: "AVAILABLE" | "UNAVAILABLE"; purchasing_power_state: string | null; freshness_state: string; available_purchasing_power_gbp: number | null; wallet_last_updated: string | null };
  source_provenance: { inventory: { sync_state: string; last_sync_at: string | null }; trading: { evidence_as_of: string | null }; wallet: { last_updated_at: string | null } };
};

function localDate(value: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Canonicalizes semantic payloads so irrelevant object/collection ordering cannot create history. */
export function canonicalizeGovernedDecisionMemory(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalizeGovernedDecisionMemory).sort().join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeGovernedDecisionMemory(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function governedDecisionMemoryHash(projection: GovernedDecisionMemoryProjection): string {
  // Provenance timestamps are retained for audit but do not represent a new governed state.
  const { observed_at: _observedAt, local_observed_date: _localDate, source_provenance: _provenance, ...semantic } = projection;
  return createHash("sha256").update(canonicalizeGovernedDecisionMemory(semantic)).digest("hex");
}

export function decideGovernedDecisionMemoryCapture(latestSemanticHash: string | null, semanticHash: string, baselineExists: boolean): "change" | "daily_baseline" | null {
  if (latestSemanticHash === semanticHash && baselineExists) return null;
  return baselineExists ? "change" : "daily_baseline";
}

export function buildGovernedDecisionMemoryProjection(input: { observedAt: string; summary: BuyingDecisionReasonSummary; evaluation: PurchaseIntelligenceEvaluation; wallet: PurchasingWalletData | null; inventory: { syncStatus: string; lastInventorySync: string | null }; tradingEvidenceAsOf?: string | null }): GovernedDecisionMemoryProjection {
  const { evaluation, summary, wallet, observedAt } = input;
  const primaryByStyle = new Map(summary.primaryReasons.flatMap((reason) => reason.affectedStyleIds.map((styleId) => [styleId, reason] as const)));
  const demandByStyle = new Map(evaluation.demands.map((demand) => [demand.styleId, demand]));
  const candidateByStyle = new Map(evaluation.candidates.map((candidate) => [candidate.styleId, candidate]));
  const walletFreshness = WalletFreshness.evaluate({ evidenceTimestamp: wallet?.wallet_last_updated ?? null, thresholdMinutes: wallet?.wallet_freshness_threshold_minutes ?? null, evaluatedAt: observedAt });
  return {
    store_scope: GOVERNED_DECISION_MEMORY_STORE_SCOPE, observed_at: observedAt, local_observed_date: localDate(observedAt),
    memory_schema_version: MEMORY_SCHEMA_VERSION, evaluator_version: EVALUATOR_VERSION, summary_semantics_version: SUMMARY_SEMANTICS_VERSION, classifier_policy_version: CLASSIFIER_POLICY_VERSION,
    executive_outcome: summary.outcome, outcome_signals: summary.outcomeSignals,
    summary_counts: { total_evaluated: summary.totalEvaluated, trusted_candidate_count: summary.trustedCandidateCount, primary_reasons: summary.primaryReasons.map((reason) => ({ code: reason.code, state: reason.state, stage: reason.stage, affected_count: reason.affectedStyleIds.length })) },
    style_states: [...new Set([...demandByStyle.keys(), ...candidateByStyle.keys()])].map((styleId) => {
      const demand = demandByStyle.get(styleId) ?? null; const candidate = candidateByStyle.get(styleId) ?? null; const primary = primaryByStyle.get(styleId) ?? null;
      return { style_id: styleId, parent_product_id: demand?.parentProductId ?? candidate?.parentProductId ?? "", supplier_id: demand?.supplierId ?? candidate?.supplierId ?? null, primary_reason: primary ? { code: primary.code, state: primary.state, stage: primary.stage } : null, demand_status: demand?.status ?? null, candidate_status: candidate?.status ?? null, eligible: candidate?.eligible ?? null, trading_evidence_state: candidate?.tradingEvidence.state ?? null };
    }),
    supplier_qualifications: evaluation.qualifications.map((qualification) => ({ supplier_id: qualification.supplier.id, state: qualification.state, blocker_codes: qualification.blockers })),
    wallet_state: { availability: wallet ? "AVAILABLE" : "UNAVAILABLE", purchasing_power_state: wallet?.purchasing_power_state ?? null, freshness_state: walletFreshness.status, available_purchasing_power_gbp: wallet?.available_purchasing_power_gbp ?? null, wallet_last_updated: wallet?.wallet_last_updated ?? null },
    source_provenance: { inventory: { sync_state: input.inventory.syncStatus, last_sync_at: input.inventory.lastInventorySync }, trading: { evidence_as_of: input.tradingEvidenceAsOf ?? null }, wallet: { last_updated_at: wallet?.wallet_last_updated ?? null } },
  };
}
