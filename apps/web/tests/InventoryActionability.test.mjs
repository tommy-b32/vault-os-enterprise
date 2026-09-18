import assert from "node:assert/strict";
import test from "node:test";
import { classifyInventoryActionability, summarizeInventoryActionability } from "../lib/brain/InventoryActionability.ts";

function demand(overrides = {}) { return { styleId: "style", status: "needs_replenishment", trusted: true, replenishment_qualified: true, replenishment_gate_reason: "Replenishment evaluation required.", ...overrides }; }

test("inventory actionability reuses governed demand and trading-evidence states", () => {
  assert.equal(classifyInventoryActionability({ demand: demand(), tradingEvidenceState: "SUFFICIENT_EVIDENCE" }).state, "action_required");
  assert.equal(classifyInventoryActionability({ demand: demand(), tradingEvidenceState: "DEVELOPING_EVIDENCE" }).state, "watch");
  assert.equal(classifyInventoryActionability({ demand: demand({ status: "no_replenishment_required", replenishment_qualified: true }), tradingEvidenceState: "SUFFICIENT_EVIDENCE" }).state, "healthy");
  assert.equal(classifyInventoryActionability({ demand: demand({ status: "no_replenishment_required", replenishment_qualified: false }), tradingEvidenceState: "SUFFICIENT_EVIDENCE" }).state, "no_action_required");
  assert.equal(classifyInventoryActionability({ demand: demand({ status: "excluded_by_strategy" }), tradingEvidenceState: "UNKNOWN" }).state, "no_action_required");
  assert.equal(classifyInventoryActionability({ demand: demand({ status: "evidence_unavailable", trusted: false }), tradingEvidenceState: "UNKNOWN" }).state, "unavailable");
});

test("actionability aggregation is deterministic and does not create buying decisions", () => {
  const items = ["action_required", "watch", "healthy", "no_action_required", "unavailable"].map((state) => ({ styleId: state, state, reason: "", replenishmentEvaluationRequired: state === "action_required" }));
  assert.deepEqual(summarizeInventoryActionability(items), { action_required: 1, watch: 1, healthy: 1, no_action_required: 1, unavailable: 1 });
  assert.equal(items[0].replenishmentEvaluationRequired, true);
});
