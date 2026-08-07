import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { SupplierBasketIntelligenceEngine } from "../lib/brain/SupplierBasketIntelligenceEngine.ts";

const supplier = (overrides = {}) => ({
  id: "supplier", name: "Supplier", active: true, currency: "GBP",
  minimumOrderValue: 0, minimumOrderPacks: 5, ...overrides,
});
const demand = (overrides = {}) => ({
  styleId: "style-1", productName: "Product 1", supplierId: "supplier",
  status: "needs_replenishment", demand_status: "ACTIVE", urgency: "HIGH",
  suggestedPacks: 5, suggestedUnits: 25, productMoqPacks: 1, unitsPerPack: 5,
  sales7Days: 2, currentStock: 1, demand_score: 75, trusted: true, ...overrides,
});
const product = (overrides = {}) => ({
  style_id: "style-1", supplier_id: "supplier", configuration_trusted: true,
  reorder_approval: { approval_state: "approved" },
  commercial_cost: { commercial_cost_trusted: true, landed_cost_per_pack_gbp: 10 },
  ...overrides,
});
const evaluate = ({ supplierOverrides = {}, demands = [demand()], products = [product()] } = {}) =>
  SupplierBasketIntelligenceEngine.evaluate({ supplier: supplier(supplierOverrides), demands, products });

test("supplier already meeting both minima is READY_TO_ORDER", () => {
  const result = evaluate({ supplierOverrides: { minimumOrderValue: 50, minimumOrderPacks: 5 } });
  assert.equal(result.purchasing_state, "READY_TO_ORDER");
  assert.equal(result.packs_short, 0);
  assert.equal(result.value_short, 0);
});

test("supplier one pack short is NEAR_MINIMUM", () => {
  const result = evaluate({ demands: [demand({ suggestedPacks: 4, suggestedUnits: 20 })] });
  assert.equal(result.purchasing_state, "NEAR_MINIMUM");
  assert.equal(result.packs_short, 1);
});

test("supplier ten packs short is BUILD_BASKET", () => {
  const result = evaluate({ supplierOverrides: { minimumOrderPacks: 20 }, demands: [demand({ suggestedPacks: 10, suggestedUnits: 50 })] });
  assert.equal(result.purchasing_state, "BUILD_BASKET");
  assert.equal(result.packs_short, 10);
});

test("supplier without positive replenishment demand is NO_DEMAND", () => {
  const result = evaluate({ demands: [demand({ status: "no_replenishment_required", suggestedPacks: 0, suggestedUnits: 0 })] });
  assert.equal(result.purchasing_state, "NO_DEMAND");
  assert.equal(result.products_recommended, 0);
});

test("additional products rank by urgency, recent sales, stock, then demand score", () => {
  const demands = [
    demand({ suggestedPacks: 1, suggestedUnits: 5 }),
    demand({ styleId: "critical", productName: "Critical", status: "no_replenishment_required", suggestedPacks: 0, suggestedUnits: 0, urgency: "CRITICAL", sales7Days: 1, currentStock: 2, demand_score: 60 }),
    demand({ styleId: "high-sales", productName: "High sales", status: "no_replenishment_required", suggestedPacks: 0, suggestedUnits: 0, urgency: "HIGH", sales7Days: 4, currentStock: 1, demand_score: 90 }),
    demand({ styleId: "high-low-stock", productName: "Low stock", status: "no_replenishment_required", suggestedPacks: 0, suggestedUnits: 0, urgency: "HIGH", sales7Days: 2, currentStock: 0, demand_score: 95 }),
  ];
  const products = demands.map((entry) => product({ style_id: entry.styleId }));
  const result = evaluate({ supplierOverrides: { minimumOrderPacks: 20 }, demands, products });
  assert.deepEqual(result.additional_qualifying_products.map((entry) => entry.style_id), [
    "critical", "high-sales", "high-low-stock",
  ]);
});

test("basket additions are advisory and never create purchase orders", async () => {
  const [engine, page] = await Promise.all([
    readFile(new URL("../lib/brain/SupplierBasketIntelligenceEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/purchase-intelligence/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Advisory only/);
  assert.doesNotMatch(engine + page, /insert\(|update\(|delete\(|createPurchaseOrder/);
});
