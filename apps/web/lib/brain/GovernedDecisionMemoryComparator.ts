export type GovernedDecisionMemoryChangeCategory =
  | "EXECUTIVE_OUTCOME_CHANGED"
  | "OUTCOME_SIGNAL_CHANGED"
  | "SUMMARY_COUNT_CHANGED"
  | "STYLE_STATE_ADDED"
  | "STYLE_STATE_REMOVED"
  | "STYLE_STATE_CHANGED"
  | "SUPPLIER_QUALIFICATION_ADDED"
  | "SUPPLIER_QUALIFICATION_REMOVED"
  | "SUPPLIER_QUALIFICATION_CHANGED"
  | "WALLET_STATE_CHANGED"
  | "VERSION_INCOMPATIBLE"
  | "MALFORMED_RECORD";

export type GovernedDecisionMemoryChange = {
  category: GovernedDecisionMemoryChangeCategory;
  subjectId: string | null;
  changedFields: string[];
  before: unknown;
  after: unknown;
};

export type GovernedDecisionMemoryComparison = {
  status: "comparable" | "version_incompatible" | "malformed";
  changes: GovernedDecisionMemoryChange[];
};

type PrimaryReason = { code: string; state: string; stage: string; affected_count: number };
type StyleState = { style_id: string; parent_product_id: string; supplier_id: string | null; primary_reason: { code: string; state: string; stage: string } | null; demand_status: string | null; candidate_status: string | null; eligible: boolean | null; trading_evidence_state: string | null };
type SupplierQualification = { supplier_id: string; state: string; blocker_codes: string[] };
type WalletState = { availability: "AVAILABLE" | "UNAVAILABLE"; purchasing_power_state: string | null; freshness_state: string; available_purchasing_power_gbp: number | null; wallet_last_updated: string | null };
type ParsedRecord = { versions: Record<string, string | number>; executive_outcome: string; outcome_signals: Record<string, boolean>; summary_counts: { total_evaluated: number; trusted_candidate_count: number; primary_reasons: Map<string, PrimaryReason> }; style_states: Map<string, StyleState>; supplier_qualifications: Map<string, SupplierQualification>; wallet_state: WalletState };

const OUTCOME_SIGNALS = ["hasActionAvailable", "hasBlocked", "hasGatheringEvidence", "hasNoAction", "hasUnavailable"] as const;
const VERSION_FIELDS = ["memory_schema_version", "evaluator_version", "summary_semantics_version", "classifier_policy_version"] as const;
const CHANGE_ORDER: GovernedDecisionMemoryChangeCategory[] = ["EXECUTIVE_OUTCOME_CHANGED", "OUTCOME_SIGNAL_CHANGED", "SUMMARY_COUNT_CHANGED", "STYLE_STATE_ADDED", "STYLE_STATE_REMOVED", "STYLE_STATE_CHANGED", "SUPPLIER_QUALIFICATION_ADDED", "SUPPLIER_QUALIFICATION_REMOVED", "SUPPLIER_QUALIFICATION_CHANGED", "WALLET_STATE_CHANGED", "VERSION_INCOMPATIBLE", "MALFORMED_RECORD"];

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function string(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }
function nullableString(value: unknown): string | null | undefined { return value === null ? null : typeof value === "string" ? value : undefined; }
function nullableBoolean(value: unknown): boolean | null | undefined { return value === null || typeof value === "boolean" ? value : undefined; }
function nullableNumber(value: unknown): number | null | undefined { return value === null || (typeof value === "number" && Number.isFinite(value)) ? value : undefined; }
function nonNegativeInteger(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null; }
function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function primaryKey(reason: PrimaryReason): string { return `${reason.code}\u0000${reason.state}\u0000${reason.stage}`; }
function normalizedStrings(value: unknown): string[] | null { if (!Array.isArray(value) || value.some((item) => !string(item))) return null; return [...new Set(value as string[])].sort(); }

function parseRecord(value: unknown): ParsedRecord | null {
  const record = object(value);
  if (!record || !["NO_ACTION_REQUIRED", "GATHERING_EVIDENCE", "BLOCKED", "ACTION_AVAILABLE", "MIXED", "UNKNOWN"].includes(String(record.executive_outcome))) return null;
  const versions: Record<string, string | number> = {};
  for (const field of VERSION_FIELDS) {
    const version = record[field];
    if ((field === "memory_schema_version" && (!Number.isSafeInteger(version) || Number(version) <= 0)) || (field !== "memory_schema_version" && !string(version))) return null;
    versions[field] = version as string | number;
  }
  const signals = object(record.outcome_signals);
  if (!signals || OUTCOME_SIGNALS.some((field) => typeof signals[field] !== "boolean")) return null;
  const summary = object(record.summary_counts);
  if (!summary || nonNegativeInteger(summary.total_evaluated) === null || nonNegativeInteger(summary.trusted_candidate_count) === null || !Array.isArray(summary.primary_reasons)) return null;
  const reasons = new Map<string, PrimaryReason>();
  for (const raw of summary.primary_reasons) {
    const reason = object(raw); const affected = reason && nonNegativeInteger(reason.affected_count);
    if (!reason || !string(reason.code) || !string(reason.state) || !string(reason.stage) || affected === null) return null;
    const parsed = { code: reason.code as string, state: reason.state as string, stage: reason.stage as string, affected_count: affected };
    if (reasons.has(primaryKey(parsed))) return null;
    reasons.set(primaryKey(parsed), parsed);
  }
  const styles = new Map<string, StyleState>();
  if (!Array.isArray(record.style_states)) return null;
  for (const raw of record.style_states) {
    const style = object(raw); const primary = style && (style.primary_reason === null ? null : object(style.primary_reason));
    if (!style || !string(style.style_id) || !string(style.parent_product_id) || nullableString(style.supplier_id) === undefined || nullableString(style.demand_status) === undefined || nullableString(style.candidate_status) === undefined || nullableBoolean(style.eligible) === undefined || nullableString(style.trading_evidence_state) === undefined || (primary && (!string(primary.code) || !string(primary.state) || !string(primary.stage))) || (style.primary_reason !== null && !primary)) return null;
    const parsed: StyleState = { style_id: style.style_id as string, parent_product_id: style.parent_product_id as string, supplier_id: style.supplier_id as string | null, primary_reason: primary ? { code: primary.code as string, state: primary.state as string, stage: primary.stage as string } : null, demand_status: style.demand_status as string | null, candidate_status: style.candidate_status as string | null, eligible: style.eligible as boolean | null, trading_evidence_state: style.trading_evidence_state as string | null };
    if (styles.has(parsed.style_id)) return null;
    styles.set(parsed.style_id, parsed);
  }
  const suppliers = new Map<string, SupplierQualification>();
  if (!Array.isArray(record.supplier_qualifications)) return null;
  for (const raw of record.supplier_qualifications) {
    const supplier = object(raw); const blockers = supplier && normalizedStrings(supplier.blocker_codes);
    if (!supplier || !string(supplier.supplier_id) || !string(supplier.state) || blockers === null || suppliers.has(supplier.supplier_id as string)) return null;
    suppliers.set(supplier.supplier_id as string, { supplier_id: supplier.supplier_id as string, state: supplier.state as string, blocker_codes: blockers });
  }
  const wallet = object(record.wallet_state);
  if (!wallet || (wallet.availability !== "AVAILABLE" && wallet.availability !== "UNAVAILABLE") || nullableString(wallet.purchasing_power_state) === undefined || !string(wallet.freshness_state) || nullableNumber(wallet.available_purchasing_power_gbp) === undefined || nullableString(wallet.wallet_last_updated) === undefined) return null;
  return { versions, executive_outcome: record.executive_outcome as string, outcome_signals: Object.fromEntries(OUTCOME_SIGNALS.map((field) => [field, signals[field] as boolean])), summary_counts: { total_evaluated: summary.total_evaluated as number, trusted_candidate_count: summary.trusted_candidate_count as number, primary_reasons: reasons }, style_states: styles, supplier_qualifications: suppliers, wallet_state: wallet as WalletState };
}

function change(category: GovernedDecisionMemoryChangeCategory, subjectId: string | null, changedFields: string[], before: unknown, after: unknown): GovernedDecisionMemoryChange { return { category, subjectId, changedFields: [...changedFields].sort(), before, after }; }
function ordered(changes: GovernedDecisionMemoryChange[]): GovernedDecisionMemoryChange[] { return changes.sort((left, right) => CHANGE_ORDER.indexOf(left.category) - CHANGE_ORDER.indexOf(right.category) || (left.subjectId ?? "").localeCompare(right.subjectId ?? "") || JSON.stringify(left.changedFields).localeCompare(JSON.stringify(right.changedFields))); }

/** Compares only validated stored evidence; it never evaluates, fetches, captures, or persists. */
export function compareGovernedDecisionMemoryRecords(previous: unknown, current: unknown): GovernedDecisionMemoryComparison {
  const before = parseRecord(previous); const after = parseRecord(current);
  if (!before || !after) return { status: "malformed", changes: [change("MALFORMED_RECORD", !before ? "previous" : "current", [], null, null)] };
  const versionFields = VERSION_FIELDS.filter((field) => before.versions[field] !== after.versions[field]);
  if (versionFields.length) return { status: "version_incompatible", changes: [change("VERSION_INCOMPATIBLE", null, versionFields, before.versions, after.versions)] };
  const changes: GovernedDecisionMemoryChange[] = [];
  if (before.executive_outcome !== after.executive_outcome) changes.push(change("EXECUTIVE_OUTCOME_CHANGED", null, ["executive_outcome"], before.executive_outcome, after.executive_outcome));
  for (const field of OUTCOME_SIGNALS) if (before.outcome_signals[field] !== after.outcome_signals[field]) changes.push(change("OUTCOME_SIGNAL_CHANGED", field, [field], before.outcome_signals[field], after.outcome_signals[field]));
  for (const field of ["total_evaluated", "trusted_candidate_count"] as const) if (before.summary_counts[field] !== after.summary_counts[field]) changes.push(change("SUMMARY_COUNT_CHANGED", field, [field], before.summary_counts[field], after.summary_counts[field]));
  for (const key of [...new Set([...before.summary_counts.primary_reasons.keys(), ...after.summary_counts.primary_reasons.keys()])].sort()) { const left = before.summary_counts.primary_reasons.get(key) ?? null; const right = after.summary_counts.primary_reasons.get(key) ?? null; if (!same(left, right)) changes.push(change("SUMMARY_COUNT_CHANGED", key, left && right ? ["affected_count"] : ["primary_reason"], left, right)); }
  for (const id of [...new Set([...before.style_states.keys(), ...after.style_states.keys()])].sort()) { const left = before.style_states.get(id); const right = after.style_states.get(id); if (!left) changes.push(change("STYLE_STATE_ADDED", id, ["style_state"], null, right)); else if (!right) changes.push(change("STYLE_STATE_REMOVED", id, ["style_state"], left, null)); else if (!same(left, right)) changes.push(change("STYLE_STATE_CHANGED", id, Object.keys(left).filter((field) => !same(left[field as keyof StyleState], right[field as keyof StyleState])), left, right)); }
  for (const id of [...new Set([...before.supplier_qualifications.keys(), ...after.supplier_qualifications.keys()])].sort()) { const left = before.supplier_qualifications.get(id); const right = after.supplier_qualifications.get(id); if (!left) changes.push(change("SUPPLIER_QUALIFICATION_ADDED", id, ["supplier_qualification"], null, right)); else if (!right) changes.push(change("SUPPLIER_QUALIFICATION_REMOVED", id, ["supplier_qualification"], left, null)); else if (!same(left, right)) changes.push(change("SUPPLIER_QUALIFICATION_CHANGED", id, Object.keys(left).filter((field) => field !== "supplier_id" && !same(left[field as keyof SupplierQualification], right[field as keyof SupplierQualification])), left, right)); }
  const walletFields = ["availability", "purchasing_power_state", "freshness_state", "available_purchasing_power_gbp"] as const;
  const changedWalletFields = walletFields.filter((field) => before.wallet_state[field] !== after.wallet_state[field]);
  if (changedWalletFields.length) changes.push(change("WALLET_STATE_CHANGED", null, changedWalletFields, Object.fromEntries(walletFields.map((field) => [field, before.wallet_state[field]])), Object.fromEntries(walletFields.map((field) => [field, after.wallet_state[field]]))));
  return { status: "comparable", changes: ordered(changes) };
}
