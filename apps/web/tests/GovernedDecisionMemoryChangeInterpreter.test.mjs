import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { compareGovernedDecisionMemoryRecords } from "../lib/brain/GovernedDecisionMemoryComparator.ts";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../lib/brain/GovernedDecisionMemoryChangeInterpreter.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const labels = { demand_no_replenishment_required: "Canonical demand does not currently require replenishment.", demand_evidence_unavailable: "Demand evidence is incomplete.", demand_excluded_by_strategy: "The style is excluded by inventory strategy." };
const exports = {}; new Function("require", "exports", output)((name) => name === "@/lib/brain/BuyingDecisionReasonSummary" ? { governedPrimaryReasonExplanation: (code) => labels[code] ?? null } : require(name), exports);
const { interpretGovernedDecisionMemoryChange: interpret } = exports;

function record(primaryReasons) { return { memory_schema_version: 1, evaluator_version: "eval-1", summary_semantics_version: "summary-1", classifier_policy_version: "classifier-1", executive_outcome: "NO_ACTION_REQUIRED", outcome_signals: { hasActionAvailable: false, hasBlocked: false, hasGatheringEvidence: false, hasNoAction: true, hasUnavailable: false }, summary_counts: { total_evaluated: 1, trusted_candidate_count: 0, primary_reasons: primaryReasons }, style_states: [], supplier_qualifications: [], wallet_state: { availability: "AVAILABLE", purchasing_power_state: "healthy", freshness_state: "current", available_purchasing_power_gbp: 1, wallet_last_updated: "2026-01-01T00:00:00.000Z" } }; }
const reason = (code, count, state = "NO_ACTION_REQUIRED", stage = "DEMAND") => ({ code, state, stage, affected_count: count });
function primaryChange(previous, current) { return compareGovernedDecisionMemoryRecords(record(previous), record(current)).changes.find((change) => change.category === "SUMMARY_COUNT_CHANGED" && change.subjectId !== "total_evaluated" && change.subjectId !== "trusted_candidate_count"); }

test("interpreter resolves known primary-reason labels from real comparator records", () => {
  const change = primaryChange([reason("demand_no_replenishment_required", 97)], [reason("demand_no_replenishment_required", 98)]);
  assert.equal(change.subjectId, "demand_no_replenishment_required\u0000NO_ACTION_REQUIRED\u0000DEMAND");
  assert.deepEqual(change.before, reason("demand_no_replenishment_required", 97)); assert.deepEqual(change.after, reason("demand_no_replenishment_required", 98));
  assert.equal(interpret({ status: "comparable", changes: [change] }).observedChanges[0], "Canonical demand does not currently require replenishment: 97 → 98 styles.");
  for (const code of ["demand_evidence_unavailable", "demand_excluded_by_strategy"]) assert.match(interpret({ status: "comparable", changes: [primaryChange([reason(code, 1)], [reason(code, 2)])] }).observedChanges[0], new RegExp(labels[code].replace(".", "")));
});

test("interpreter uses real introduced, removed, unknown, and inconsistent primary-reason comparator output safely", () => {
  const introduced = primaryChange([], [reason("demand_evidence_unavailable", 6)]); const removed = primaryChange([reason("demand_evidence_unavailable", 6)], []);
  assert.equal(introduced.changedFields[0], "primary_reason"); assert.equal(removed.changedFields[0], "primary_reason");
  assert.match(interpret({ status: "comparable", changes: [introduced] }).observedChanges[0], /A governed reason count changed/);
  assert.match(interpret({ status: "comparable", changes: [removed] }).observedChanges[0], /A governed reason count changed/);
  const unknown = primaryChange([reason("future_reason", 1)], [reason("future_reason", 2)]);
  assert.match(interpret({ status: "comparable", changes: [unknown] }).observedChanges[0], /A governed reason count changed/);
  const inconsistent = { ...primaryChange([reason("demand_evidence_unavailable", 1)], [reason("demand_evidence_unavailable", 2)]), after: reason("demand_excluded_by_strategy", 2) };
  assert.match(interpret({ status: "comparable", changes: [inconsistent] }).observedChanges[0], /A governed reason count changed/);
});

test("interpreter remains pure and excludes live reconstruction or persistence", () => {
  assert.doesNotMatch(source, /supabase|runGovernedDecisionEvaluation|runGovernedDecisionMemoryCapture|recordGovernedDecisionMemory|GovernedDecisionMemoryRepository|vault_operational_snapshots|getCatalogueData|getLiveInventorySnapshot|PurchaseIntelligenceEngine/);
});
