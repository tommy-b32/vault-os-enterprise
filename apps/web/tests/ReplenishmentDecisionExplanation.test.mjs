import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ReplenishmentDecisionExplanationEngine } from "../lib/brain/ReplenishmentDecisionExplanation.ts";

const demand = (overrides = {}) => ({
  styleId: "style", productName: "Product", demand_status: "ACTIVE", urgency: "HIGH",
  sales7Days: 1, sales14Days: 1, sales30Days: 2, daysSinceLastSale: 1,
  currentStock: 1, netAvailableStock: 1, replenishment_qualified: true,
  replenishment_gate_reason: "ACTIVE demand proceeds through replenishment qualification.",
  status: "needs_replenishment", suggestedPacks: 1, suggestedUnits: 5,
  quantity_intelligence: { target_units: 5, stock_deficit_units: 4 },
  missingRequirements: [], ...overrides,
});

test("ACTIVE with positive canonical quantity explains REPLENISH_NOW", () => {
  const explanation = ReplenishmentDecisionExplanationEngine.explain(demand());
  assert.equal(explanation.state, "REPLENISH_NOW");
  assert.equal(explanation.recommended_quantity, "1 pack / 5 units");
  assert.match(explanation.reason, /existing canonical recommended quantity/);
});

test("ACTIVE with sufficient stock explains NO_REPLENISHMENT", () => {
  const explanation = ReplenishmentDecisionExplanationEngine.explain(demand({
    status: "no_replenishment_required", suggestedPacks: 0, suggestedUnits: 0,
    currentStock: 20, netAvailableStock: 20,
    quantity_intelligence: { target_units: 5, stock_deficit_units: 0 },
  }));
  assert.equal(explanation.state, "NO_REPLENISHMENT");
  assert.match(explanation.reason, /available stock already covers calculated demand/);
});

test("qualifying SLOW with positive quantity explains REPLENISH_NOW", () => {
  const explanation = ReplenishmentDecisionExplanationEngine.explain(demand({
    demand_status: "SLOW", urgency: "CRITICAL", sales7Days: 0, sales14Days: 1,
    replenishment_gate_reason: "SLOW demand has at least 1 sale in 14 days and a last sale within 14 days.",
  }));
  assert.equal(explanation.state, "REPLENISH_NOW");
  assert.equal(explanation.recommended_quantity, "1 pack / 5 units");
});

test("non-qualifying SLOW explains WATCH without implying no demand", () => {
  const reason = "1 sale in 30 days; last sale 28 days ago. Demand remains SLOW but recent evidence does not yet justify replenishment.";
  const explanation = ReplenishmentDecisionExplanationEngine.explain(demand({
    demand_status: "SLOW", sales7Days: 0, sales14Days: 0, sales30Days: 1,
    daysSinceLastSale: 28, replenishment_qualified: false,
    replenishment_gate_reason: reason, status: "no_replenishment_required",
    suggestedPacks: 0, suggestedUnits: 0, quantity_intelligence: null,
  }));
  assert.equal(explanation.state, "WATCH");
  assert.equal(explanation.reason, reason);
  assert.equal(explanation.recommended_quantity, null);
});

test("DORMANT explains NO_REPLENISHMENT", () => {
  const explanation = ReplenishmentDecisionExplanationEngine.explain(demand({
    demand_status: "DORMANT", urgency: null, sales7Days: 0, sales14Days: 0,
    sales30Days: 0, daysSinceLastSale: null, replenishment_qualified: false,
    status: "no_replenishment_required", suggestedPacks: 0, suggestedUnits: 0,
    quantity_intelligence: null,
  }));
  assert.equal(explanation.state, "NO_REPLENISHMENT");
  assert.equal(explanation.reason, "No qualifying recent demand.");
});

test("NO_EVIDENCE preserves every canonical missing requirement", () => {
  const missingRequirements = ["sales_history_30_incomplete", "stock_unavailable"];
  const explanation = ReplenishmentDecisionExplanationEngine.explain(demand({
    demand_status: "NO_EVIDENCE", urgency: null, replenishment_qualified: false,
    status: "evidence_unavailable", suggestedPacks: null, suggestedUnits: null,
    quantity_intelligence: null, missingRequirements,
  }));
  assert.equal(explanation.state, "EVIDENCE_UNAVAILABLE");
  assert.deepEqual(explanation.missing_requirements, missingRequirements);
  assert.match(explanation.reason, /sales history 30 incomplete/);
  assert.match(explanation.reason, /stock unavailable/);
});

test("explanation is read-only and does not alter qualification or quantity", () => {
  const input = demand();
  const before = structuredClone(input);
  const explanation = ReplenishmentDecisionExplanationEngine.explain(input);
  assert.deepEqual(input, before);
  assert.equal(input.replenishment_qualified, true);
  assert.equal(explanation.recommended_quantity, `${input.suggestedPacks} pack / ${input.suggestedUnits} units`);
});

test("presentation does not consume inventory history or create orders", async () => {
  const [explanation, diagnostics, page] = await Promise.all([
    readFile(new URL("../lib/brain/ReplenishmentDecisionExplanation.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/brain/PurchaseIntelligenceDiagnostics.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/purchase-intelligence/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(explanation, /vault_inventory_level_snapshots|AVAILABILITY_CONSTRAINED/);
  assert.match(diagnostics, /demands\.map\(ReplenishmentDecisionExplanationEngine\.explain\)/);
  assert.match(page, /Decision:/);
  assert.match(page, /Sales:/);
  assert.match(page, /Stock:/);
  assert.match(page, /Recommended:/);
  assert.doesNotMatch(explanation + diagnostics + page, /createPurchaseOrder|insert\(|update\(|delete\(/);
});
