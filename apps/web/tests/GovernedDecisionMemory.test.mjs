import assert from "node:assert/strict";
import test from "node:test";
import { governedDecisionMemoryHash, decideGovernedDecisionMemoryCapture } from "../lib/brain/GovernedDecisionMemory.ts";

function projection(overrides = {}) {
  return { store_scope: "default", observed_at: "2026-10-03T10:00:00.000Z", local_observed_date: "2026-10-03", memory_schema_version: 1, evaluator_version: "eval-1", summary_semantics_version: "summary-1", classifier_policy_version: "classifier-1", executive_outcome: "NO_ACTION_REQUIRED", outcome_signals: { hasNoAction: true, hasGatheringEvidence: false, hasBlocked: false, hasUnavailable: false, hasActionAvailable: false }, summary_counts: { total_evaluated: 1, trusted_candidate_count: 0, primary_reasons: [{ code: "demand_no_replenishment_required", state: "NO_ACTION_REQUIRED", stage: "DEMAND", affected_count: 1 }] }, style_states: [{ style_id: "p::Black", parent_product_id: "p", supplier_id: null, primary_reason: { code: "demand_no_replenishment_required", state: "NO_ACTION_REQUIRED", stage: "DEMAND" }, demand_status: "no_replenishment_required", candidate_status: "ineligible", eligible: false, trading_evidence_state: "SUFFICIENT_EVIDENCE" }], supplier_qualifications: [{ supplier_id: "supplier", state: "ready_to_purchase", blocker_codes: [] }], wallet_state: { availability: "AVAILABLE", purchasing_power_state: "healthy", freshness_state: "current", available_purchasing_power_gbp: 100, wallet_last_updated: "2026-10-03T09:00:00.000Z" }, source_provenance: { inventory: { sync_state: "current", last_sync_at: "2026-10-03T09:00:00.000Z" }, trading: { evidence_as_of: "2026-10-03T09:00:00.000Z" }, wallet: { last_updated_at: "2026-10-03T09:00:00.000Z" } }, ...overrides };
}

test("semantic hash is deterministic and excludes observation/provenance timestamps", () => {
  const first = projection();
  const secondStyle = { ...first.style_states[0], style_id: "q::Blue", parent_product_id: "q" };
  const secondSupplier = { supplier_id: "supplier-2", state: "policy_unresolved", blocker_codes: ["supplier_minimum_policy_unknown"] };
  const ordered = projection({ style_states: [first.style_states[0], secondStyle], supplier_qualifications: [first.supplier_qualifications[0], secondSupplier] });
  const reordered = projection({ style_states: [secondStyle, first.style_states[0]], supplier_qualifications: [secondSupplier, first.supplier_qualifications[0]], observed_at: "2026-10-03T12:00:00.000Z", source_provenance: { inventory: { sync_state: "current", last_sync_at: "2026-10-03T11:00:00.000Z" }, trading: { evidence_as_of: "2026-10-03T11:00:00.000Z" }, wallet: { last_updated_at: "2026-10-03T11:00:00.000Z" } } });
  assert.equal(governedDecisionMemoryHash(ordered), governedDecisionMemoryHash(reordered));
  assert.equal(governedDecisionMemoryHash(first), governedDecisionMemoryHash(projection({ observed_at: "2026-10-03T12:00:00.000Z" })));
});

test("governed semantic, freshness, rule, and state changes change the hash", () => {
  const base = projection(); const hash = governedDecisionMemoryHash(base);
  for (const changed of [projection({ executive_outcome: "GATHERING_EVIDENCE" }), projection({ wallet_state: { ...base.wallet_state, freshness_state: "stale" } }), projection({ evaluator_version: "eval-2" }), projection({ style_states: [{ ...base.style_states[0], trading_evidence_state: "UNKNOWN" }] }), projection({ supplier_qualifications: [{ supplier_id: "supplier", state: "blocked_by_capital", blocker_codes: ["insufficient_reserve_safe_capacity"] }] })]) assert.notEqual(hash, governedDecisionMemoryHash(changed));
});

test("capture decision is idempotent, supports return states, baseline uniqueness, and store-scoped callers", () => {
  assert.equal(decideGovernedDecisionMemoryCapture(null, "a", false), "daily_baseline");
  assert.equal(decideGovernedDecisionMemoryCapture("a", "a", true), null);
  assert.equal(decideGovernedDecisionMemoryCapture("a", "b", true), "change");
  assert.equal(decideGovernedDecisionMemoryCapture("b", "a", true), "change");
  assert.equal(decideGovernedDecisionMemoryCapture("a", "a", false), "daily_baseline");
});

test("unknown and unavailable are retained as explicit governed values", () => {
  const unknown = projection({ executive_outcome: "UNKNOWN", style_states: [{ ...projection().style_states[0], trading_evidence_state: "UNKNOWN" }] });
  const unavailable = projection({ outcome_signals: { hasNoAction: false, hasGatheringEvidence: false, hasBlocked: false, hasUnavailable: true, hasActionAvailable: false }, wallet_state: { ...projection().wallet_state, availability: "UNAVAILABLE", available_purchasing_power_gbp: null } });
  assert.equal(unknown.executive_outcome, "UNKNOWN");
  assert.equal(unavailable.wallet_state.availability, "UNAVAILABLE");
  assert.notEqual(governedDecisionMemoryHash(unknown), governedDecisionMemoryHash(unavailable));
});

test("the governed memory scope is server-owned rather than projection input", async () => {
  const fs = await import("node:fs/promises");
  const memory = await fs.readFile(new URL("../lib/brain/GovernedDecisionMemory.ts", import.meta.url), "utf8");
  assert.match(memory, /store_scope: GOVERNED_DECISION_MEMORY_STORE_SCOPE/);
  assert.doesNotMatch(memory, /storeScope\?: string/);
});

test("memory implementation excludes legacy snapshots, narrative, UI severity, and recorder calls from read services", async () => {
  const fs = await import("node:fs/promises");
  const [memory, recorder, timeline, brain] = await Promise.all(["lib/brain/GovernedDecisionMemory.ts", "lib/brain/GovernedDecisionMemoryRecorder.ts", "lib/brain/getCommercialDecisionTimeline.ts", "lib/brain/getVaultBrainIntelligence.ts"].map((path) => fs.readFile(new URL(`../${path}`, import.meta.url), "utf8")));
  assert.doesNotMatch(memory + recorder, /vault_operational_snapshots|saveOperationalSnapshot|DEMONSTRATION_OPERATIONAL_SNAPSHOT|severity|recommendation/i);
  assert.doesNotMatch(timeline + brain, /recordGovernedDecisionMemory|runGovernedDecisionMemoryCapture/);
});

test("database boundary validates immutable input, derives London date, remains forward-only, and is service-role-only", async () => {
  const fs = await import("node:fs/promises");
  const migration = await fs.readFile(new URL("../../../supabase/migrations/20261003000000_governed_decision_memory.sql", import.meta.url), "utf8");
  for (const text of ["jsonb_typeof(input) <> 'object'", "semantic hash is invalid", "executive outcome is invalid", "payload has invalid JSON shapes", "observed at time zone 'Europe/London'", "observed < latest_observed", "vault_governed_decision_memory is append-only", "revoke all on function public.record_governed_decision_memory(jsonb) from public, anon, authenticated", "grant execute on function public.record_governed_decision_memory(jsonb) to service_role"]) assert.match(migration, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(migration, /where capture_kind = 'daily_baseline'/);
});
