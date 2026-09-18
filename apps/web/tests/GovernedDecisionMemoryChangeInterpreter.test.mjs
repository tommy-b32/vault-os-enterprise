import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../lib/brain/GovernedDecisionMemoryChangeInterpreter.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const labels = { demand_no_replenishment_required: "Canonical demand does not currently require replenishment.", demand_evidence_unavailable: "Demand evidence is incomplete.", demand_excluded_by_strategy: "The style is excluded by inventory strategy." };
const exports = {}; new Function("require", "exports", output)((name) => name === "@/lib/brain/BuyingDecisionReasonSummary" ? { governedPrimaryReasonExplanation: (code) => labels[code] ?? null } : require(name), exports);
const { interpretGovernedDecisionMemoryChange: interpret } = exports;
const change = (category, subjectId, before, after, changedFields = []) => ({ category, subjectId, before, after, changedFields });

test("interpreter uses authoritative known reason labels and fails closed for future codes", () => {
  const known = interpret({ status: "comparable", changes: [change("SUMMARY_COUNT_CHANGED", "demand_no_replenishment_required", { affected_count: 97 }, { affected_count: 98 })] });
  assert.equal(known.observedChanges[0], "Canonical demand does not currently require replenishment: 97 → 98 styles.");
  for (const [code, label] of Object.entries(labels)) assert.match(interpret({ status: "comparable", changes: [change("SUMMARY_COUNT_CHANGED", code, { affected_count: 1 }, { affected_count: 2 })] }).observedChanges[0], new RegExp(label.split(".")[0]));
  assert.match(interpret({ status: "comparable", changes: [change("SUMMARY_COUNT_CHANGED", "future_code", { affected_count: 1 }, { affected_count: 2 })] }).observedChanges[0], /A governed reason count changed/);
});

test("interpreter presents stored transitions without causal inference", () => {
  assert.match(interpret({ status: "comparable", changes: [change("STYLE_STATE_CHANGED", "style", { primary_reason: { code: "demand_evidence_unavailable" } }, { primary_reason: { code: "demand_no_replenishment_required" } })] }).observedChanges[0], /A style moved from/);
  assert.equal(interpret({ status: "comparable", changes: [change("SUPPLIER_QUALIFICATION_CHANGED", "supplier", { blocker_codes: [] }, { blocker_codes: ["supplier_minimum_packs_not_satisfied"] })] }).observedChanges[0], "Supplier minimum pack requirement was not satisfied.");
  assert.match(interpret({ status: "comparable", changes: [change("SUPPLIER_QUALIFICATION_CHANGED", "supplier", { blocker_codes: ["supplier_minimum_packs_not_satisfied"] }, { blocker_codes: [] })] }).observedChanges[0], /no longer present/);
  assert.match(interpret({ status: "comparable", changes: [change("SUPPLIER_QUALIFICATION_CHANGED", "supplier", { blocker_codes: [] }, { blocker_codes: ["future"] })] }).observedChanges[0], /recorded supplier blocker/);
  assert.equal(interpret({ status: "comparable", changes: [change("WALLET_STATE_CHANGED", null, { available_purchasing_power_gbp: 4471.73 }, { available_purchasing_power_gbp: 4608.85 }, ["available_purchasing_power_gbp"])] }).observedChanges[0], "Available purchasing power increased by £137.12, from £4,471.73 to £4,608.85.");
  assert.match(interpret({ status: "comparable", changes: [change("WALLET_STATE_CHANGED", null, { available_purchasing_power_gbp: 10 }, { available_purchasing_power_gbp: 9 }, ["available_purchasing_power_gbp"])] }).observedChanges[0], /decreased by £1.00/);
  assert.equal(interpret({ status: "comparable", changes: [change("OUTCOME_SIGNAL_CHANGED", "hasBlocked", false, true)] }).observedChanges[0], "A governed blocked outcome became present.");
  const grouped = interpret({ status: "comparable", changes: [change("EXECUTIVE_OUTCOME_CHANGED", null, "MIXED", "NO_ACTION_REQUIRED"), change("OUTCOME_SIGNAL_CHANGED", "hasBlocked", true, false)] });
  assert.match(grouped.observedChanges[0], /Executive outcome changed/); assert.equal(grouped.supportingStoredChanges.length, 1); assert.match(grouped.causeStatus.message, /does not establish its cause/);
});

test("interpreter remains pure and excludes live reconstruction or persistence", () => {
  assert.doesNotMatch(source, /supabase|runGovernedDecisionEvaluation|runGovernedDecisionMemoryCapture|recordGovernedDecisionMemory|GovernedDecisionMemoryRepository|vault_operational_snapshots|getCatalogueData|getLiveInventorySnapshot|PurchaseIntelligenceEngine/);
});
