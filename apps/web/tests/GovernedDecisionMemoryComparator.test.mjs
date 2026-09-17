import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compareGovernedDecisionMemoryRecords } from "../lib/brain/GovernedDecisionMemoryComparator.ts";

function record(overrides = {}) {
  return { memory_schema_version: 1, evaluator_version: "eval-1", summary_semantics_version: "summary-1", classifier_policy_version: "classifier-1", capture_kind: "daily_baseline", semantic_hash: "a".repeat(64), executive_outcome: "NO_ACTION_REQUIRED", outcome_signals: { hasNoAction: true, hasGatheringEvidence: false, hasBlocked: false, hasUnavailable: false, hasActionAvailable: false }, summary_counts: { total_evaluated: 1, trusted_candidate_count: 0, primary_reasons: [{ code: "demand", state: "NO_ACTION_REQUIRED", stage: "DEMAND", affected_count: 1 }] }, style_states: [{ style_id: "style-a", parent_product_id: "parent-a", supplier_id: "supplier-a", primary_reason: { code: "demand", state: "NO_ACTION_REQUIRED", stage: "DEMAND" }, demand_status: "no_replenishment_required", candidate_status: "ineligible", eligible: false, trading_evidence_state: "SUFFICIENT_EVIDENCE" }], supplier_qualifications: [{ supplier_id: "supplier-a", state: "ready_to_purchase", blocker_codes: ["a", "b"] }], wallet_state: { availability: "AVAILABLE", purchasing_power_state: "healthy", freshness_state: "current", available_purchasing_power_gbp: 4471.73, wallet_last_updated: "2026-10-03T09:00:00.000Z" }, ...overrides };
}
const categories = (result) => result.changes.map((change) => change.category);

test("identical compatible records and capture-kind-only changes have no business delta", () => {
  assert.deepEqual(compareGovernedDecisionMemoryRecords(record(), record()).changes, []);
  assert.deepEqual(compareGovernedDecisionMemoryRecords(record({ capture_kind: "change" }), record()).changes, []);
});

test("executive signals and summary counts compare independently and normalize primary reason order", () => {
  let result = compareGovernedDecisionMemoryRecords(record(), record({ executive_outcome: "MIXED" }));
  assert.deepEqual(categories(result), ["EXECUTIVE_OUTCOME_CHANGED"]);
  result = compareGovernedDecisionMemoryRecords(record(), record({ outcome_signals: { ...record().outcome_signals, hasBlocked: true } }));
  assert.deepEqual(categories(result), ["OUTCOME_SIGNAL_CHANGED"]);
  result = compareGovernedDecisionMemoryRecords(record(), record({ summary_counts: { ...record().summary_counts, total_evaluated: 2, trusted_candidate_count: 1 } }));
  assert.deepEqual(categories(result), ["SUMMARY_COUNT_CHANGED", "SUMMARY_COUNT_CHANGED"]);
  const reasons = [...record().summary_counts.primary_reasons, { code: "supplier", state: "BLOCKED", stage: "SUPPLIER", affected_count: 2 }];
  assert.deepEqual(compareGovernedDecisionMemoryRecords(record({ summary_counts: { ...record().summary_counts, primary_reasons: reasons } }), record({ summary_counts: { ...record().summary_counts, primary_reasons: [...reasons].reverse() } })).changes, []);
  result = compareGovernedDecisionMemoryRecords(record(), record({ summary_counts: { ...record().summary_counts, primary_reasons: [{ ...record().summary_counts.primary_reasons[0], affected_count: 2 }] } }));
  assert.equal(result.changes[0].changedFields[0], "affected_count");
});

test("style identity is style_id only and array ordering is ignored", () => {
  const styleB = { ...record().style_states[0], style_id: "style-b" };
  assert.deepEqual(categories(compareGovernedDecisionMemoryRecords(record(), record({ style_states: [] }))), ["STYLE_STATE_REMOVED"]);
  assert.deepEqual(categories(compareGovernedDecisionMemoryRecords(record({ style_states: [] }), record())), ["STYLE_STATE_ADDED"]);
  assert.deepEqual(categories(compareGovernedDecisionMemoryRecords(record(), record({ style_states: [styleB] }))), ["STYLE_STATE_ADDED", "STYLE_STATE_REMOVED"]);
  assert.deepEqual(compareGovernedDecisionMemoryRecords(record({ style_states: [record().style_states[0], styleB] }), record({ style_states: [styleB, record().style_states[0]] })).changes, []);
  const changed = compareGovernedDecisionMemoryRecords(record(), record({ style_states: [{ ...record().style_states[0], eligible: true, candidate_status: "eligible" }] }));
  assert.deepEqual(categories(changed), ["STYLE_STATE_CHANGED"]);
  assert.deepEqual(changed.changes[0].changedFields, ["candidate_status", "eligible"]);
});

test("supplier qualifications compare membership, state, and blocker sets without ordering", () => {
  assert.deepEqual(categories(compareGovernedDecisionMemoryRecords(record(), record({ supplier_qualifications: [] }))), ["SUPPLIER_QUALIFICATION_REMOVED"]);
  assert.deepEqual(categories(compareGovernedDecisionMemoryRecords(record({ supplier_qualifications: [] }), record())), ["SUPPLIER_QUALIFICATION_ADDED"]);
  assert.deepEqual(categories(compareGovernedDecisionMemoryRecords(record(), record({ supplier_qualifications: [{ ...record().supplier_qualifications[0], state: "blocked_by_capital" }] }))), ["SUPPLIER_QUALIFICATION_CHANGED"]);
  assert.deepEqual(categories(compareGovernedDecisionMemoryRecords(record(), record({ supplier_qualifications: [{ ...record().supplier_qualifications[0], blocker_codes: ["a", "c"] }] }))), ["SUPPLIER_QUALIFICATION_CHANGED"]);
  assert.deepEqual(compareGovernedDecisionMemoryRecords(record(), record({ supplier_qualifications: [{ ...record().supplier_qualifications[0], blocker_codes: ["b", "a"] }] })).changes, []);
});

test("wallet business changes are distinct from wallet evidence timestamp refresh", () => {
  assert.deepEqual(compareGovernedDecisionMemoryRecords(record(), record({ wallet_state: { ...record().wallet_state, wallet_last_updated: "2026-10-03T10:00:00.000Z" }, semantic_hash: "b".repeat(64) })).changes, []);
  const capacity = compareGovernedDecisionMemoryRecords(record(), record({ wallet_state: { ...record().wallet_state, available_purchasing_power_gbp: 4471.72 } }));
  assert.deepEqual(categories(capacity), ["WALLET_STATE_CHANGED"]);
  assert.deepEqual(capacity.changes[0].changedFields, ["available_purchasing_power_gbp"]);
  const state = compareGovernedDecisionMemoryRecords(record(), record({ wallet_state: { ...record().wallet_state, availability: "UNAVAILABLE", freshness_state: "stale", available_purchasing_power_gbp: null, wallet_last_updated: "2026-10-03T10:00:00.000Z" } }));
  assert.deepEqual(state.changes[0].changedFields, ["availability", "available_purchasing_power_gbp", "freshness_state"]);
});

test("version boundaries and malformed nested records fail closed", () => {
  const version = compareGovernedDecisionMemoryRecords(record(), record({ evaluator_version: "eval-2", executive_outcome: "MIXED" }));
  assert.equal(version.status, "version_incompatible"); assert.deepEqual(categories(version), ["VERSION_INCOMPATIBLE"]);
  for (const invalid of [null, record({ style_states: [{ ...record().style_states[0], eligible: "true" }] }), record({ supplier_qualifications: [{ ...record().supplier_qualifications[0], blocker_codes: [1] }] })]) {
    const result = compareGovernedDecisionMemoryRecords(invalid, record());
    assert.equal(result.status, "malformed"); assert.deepEqual(categories(result), ["MALFORMED_RECORD"]);
  }
  assert.equal(compareGovernedDecisionMemoryRecords(record(), record({ outcome_signals: {} })).status, "malformed");
});

test("A to B and B to A retain deterministic inverse transitions without trusting hash alone", () => {
  const a = record(); const b = record({ executive_outcome: "MIXED", semantic_hash: "b".repeat(64) });
  const forward = compareGovernedDecisionMemoryRecords(a, b); const reverse = compareGovernedDecisionMemoryRecords(b, a);
  assert.equal(forward.changes[0].before, "NO_ACTION_REQUIRED"); assert.equal(forward.changes[0].after, "MIXED");
  assert.equal(reverse.changes[0].before, "MIXED"); assert.equal(reverse.changes[0].after, "NO_ACTION_REQUIRED");
  assert.deepEqual(compareGovernedDecisionMemoryRecords(record({ semantic_hash: "a".repeat(64) }), record({ semantic_hash: "z".repeat(64) })).changes, []);
});

test("comparator is stored-state-only and has no live evaluation or persistence dependency", async () => {
  const source = await readFile(new URL("../lib/brain/GovernedDecisionMemoryComparator.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /runGovernedDecisionEvaluation|TrustedBuyingCandidateClassifier|PurchaseIntelligenceEngine|supabaseAdmin|GovernedDecisionMemoryRepository|recordGovernedDecisionMemory|runGovernedDecisionMemoryCapture/);
});
