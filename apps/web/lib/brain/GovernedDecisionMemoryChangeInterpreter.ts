import { governedPrimaryReasonExplanation } from "@/lib/brain/BuyingDecisionReasonSummary";
import type { GovernedDecisionMemoryChange, GovernedDecisionMemoryComparison } from "@/lib/brain/GovernedDecisionMemoryComparator";

export type GovernedChangeInterpretation = { observedChanges: string[]; supportingStoredChanges: string[]; causeStatus: { status: "not_established"; message: string } | null };

const CAUSE_UNAVAILABLE = "Stored governed memory confirms the change but does not establish its cause.";
const BLOCKERS: Record<string, string> = {
  supplier_minimum_packs_not_satisfied: "Supplier minimum pack requirement was not satisfied.",
  supplier_minimum_value_not_satisfied: "Supplier minimum order value was not satisfied.",
  supplier_minimum_policy_unknown: "Supplier minimum policy was unknown.",
  supplier_minimum_value_not_evaluated: "Supplier minimum order value was not evaluated.",
  supplier_currency_missing: "Supplier currency was unavailable.", supplier_inactive_or_unknown: "Supplier was inactive or unavailable.",
  reorder_approval_missing: "Reorder approval was required.", commercial_data_missing: "Commercial data was not trusted.",
  commercial_profitability_below_threshold: "Commercial profitability was below the governed threshold.", supplier_basket_cost_unavailable: "Supplier basket cost was unavailable.",
  wallet_unavailable: "Purchasing-wallet evidence was unavailable.", wallet_freshness_unknown: "Purchasing-wallet freshness could not be evaluated.", wallet_stale: "Purchasing-wallet evidence was stale.",
  insufficient_reserve_safe_capacity: "Reserve-safe purchasing capacity was insufficient.",
};
function object(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function gbp(value: unknown): string | null { return typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) : null; }
function title(value: unknown): string { return typeof value === "string" ? value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()) : "the recorded outcome"; }
function reason(value: unknown): string | null { const style = object(value); const candidate = object(style?.primary_reason); return candidate && typeof candidate.code === "string" ? governedPrimaryReasonExplanation(candidate.code) : null; }
function signal(change: GovernedDecisionMemoryChange): string { const present = change.after === true; const name = change.subjectId === "hasBlocked" ? "blocked outcome" : change.subjectId === "hasActionAvailable" ? "action-available outcome" : change.subjectId === "hasGatheringEvidence" ? "evidence-gathering outcome" : change.subjectId === "hasNoAction" ? "no-action outcome" : change.subjectId === "hasUnavailable" ? "unavailable-evidence outcome" : "governed outcome"; return present ? `A governed ${name} became present.` : `No governed ${name} is present in the later record.`; }
function primaryReasonIdentity(value: unknown): { code: string; state: string; stage: string } | null { const candidate = object(value); return candidate && typeof candidate.code === "string" && typeof candidate.state === "string" && typeof candidate.stage === "string" ? { code: candidate.code, state: candidate.state, stage: candidate.stage } : null; }
function primaryReasonCount(change: GovernedDecisionMemoryChange): string {
  const before = object(change.before); const after = object(change.after); const beforeIdentity = change.before === null ? null : primaryReasonIdentity(change.before); const afterIdentity = change.after === null ? null : primaryReasonIdentity(change.after);
  const identity = beforeIdentity && afterIdentity && (beforeIdentity.code !== afterIdentity.code || beforeIdentity.state !== afterIdentity.state || beforeIdentity.stage !== afterIdentity.stage) ? null : afterIdentity ?? beforeIdentity;
  const label = identity ? governedPrimaryReasonExplanation(identity.code) : null;
  if (!before || !after || typeof before.affected_count !== "number" || typeof after.affected_count !== "number" || !label) return `A governed reason count changed from ${before?.affected_count ?? "unavailable"} to ${after?.affected_count ?? "unavailable"}.`;
  return `${label.replace(/\.$/, "")}: ${before.affected_count} → ${after.affected_count} styles.`;
}
function supplier(change: GovernedDecisionMemoryChange): string[] {
  const before = object(change.before); const after = object(change.after); const oldCodes = new Set(Array.isArray(before?.blocker_codes) ? before.blocker_codes.filter((code): code is string => typeof code === "string") : []); const newCodes = new Set(Array.isArray(after?.blocker_codes) ? after.blocker_codes.filter((code): code is string => typeof code === "string") : []);
  const added = [...newCodes].filter((code) => !oldCodes.has(code)).map((code) => BLOCKERS[code] ?? "A recorded supplier blocker became present.");
  const removed = [...oldCodes].filter((code) => !newCodes.has(code)).map((code) => code === "supplier_minimum_packs_not_satisfied" ? "The recorded supplier minimum-pack blocker is no longer present." : BLOCKERS[code] ? `The recorded supplier blocker is no longer present: ${BLOCKERS[code].replace(/\.$/, "")}.` : "A recorded supplier blocker is no longer present.");
  return [...added, ...removed];
}
function interpret(change: GovernedDecisionMemoryChange): string[] {
  if (change.category === "EXECUTIVE_OUTCOME_CHANGED") return [`Executive outcome changed from ${title(change.before)} to ${title(change.after)}.`];
  if (change.category === "OUTCOME_SIGNAL_CHANGED") return [signal(change)];
  if (change.category === "SUMMARY_COUNT_CHANGED") { if (change.subjectId === "total_evaluated") return [`Evaluated styles changed from ${change.before} to ${change.after}.`]; if (change.subjectId === "trusted_candidate_count") return [`Trusted buying candidates changed from ${change.before} to ${change.after}.`]; return [primaryReasonCount(change)]; }
  if (change.category === "STYLE_STATE_ADDED") return ["A style entered governed evaluation."];
  if (change.category === "STYLE_STATE_REMOVED") return ["A style left governed evaluation."];
  if (change.category === "STYLE_STATE_CHANGED") { const before = reason(change.before); const after = reason(change.after); return before && after && before !== after ? [`A style moved from '${before}' to '${after}'.`] : ["A style changed governed state."]; }
  if (change.category === "SUPPLIER_QUALIFICATION_ADDED") return ["A supplier entered governed qualification."];
  if (change.category === "SUPPLIER_QUALIFICATION_REMOVED") return ["A supplier left governed qualification."];
  if (change.category === "SUPPLIER_QUALIFICATION_CHANGED") return supplier(change).length ? supplier(change) : ["A supplier qualification changed."];
  if (change.category === "WALLET_STATE_CHANGED") { const before = object(change.before); const after = object(change.after); const left = gbp(before?.available_purchasing_power_gbp); const right = gbp(after?.available_purchasing_power_gbp); if (left && right && typeof before?.available_purchasing_power_gbp === "number" && typeof after?.available_purchasing_power_gbp === "number") { const delta = Math.abs(after.available_purchasing_power_gbp - before.available_purchasing_power_gbp); return [`Available purchasing power ${after.available_purchasing_power_gbp >= before.available_purchasing_power_gbp ? "increased" : "decreased"} by ${gbp(delta)}, from ${left} to ${right}.`]; } if (change.changedFields.includes("availability")) return ["Purchasing wallet availability changed."]; if (change.changedFields.includes("purchasing_power_state")) return ["Purchasing power state changed."]; return ["Purchasing wallet freshness changed."]; }
  return [];
}

/** Pure interpretation of comparator output; it does not query, evaluate, capture, or persist. */
export function interpretGovernedDecisionMemoryChange(comparison: GovernedDecisionMemoryComparison): GovernedChangeInterpretation {
  if (comparison.status !== "comparable" || !comparison.changes.length) return { observedChanges: [], supportingStoredChanges: [], causeStatus: null };
  const executive = comparison.changes.filter((change) => change.category === "EXECUTIVE_OUTCOME_CHANGED");
  const observed = executive.length ? executive : comparison.changes;
  const supporting = executive.length ? comparison.changes.filter((change) => change.category !== "EXECUTIVE_OUTCOME_CHANGED") : [];
  return { observedChanges: observed.flatMap(interpret), supportingStoredChanges: supporting.flatMap(interpret), causeStatus: { status: "not_established", message: CAUSE_UNAVAILABLE } };
}
