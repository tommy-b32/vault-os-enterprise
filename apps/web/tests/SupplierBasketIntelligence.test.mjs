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
  sales7Days: 2, sales14Days: 2, sales30Days: 2, daysSinceLastSale: 1,
  currentStock: 1, demand_score: 75, trusted: true, ...overrides,
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

test("supplier one pack short without strong candidates is MINIMUM_NOT_JUSTIFIED", () => {
  const result = evaluate({ demands: [demand({ suggestedPacks: 4, suggestedUnits: 20 })] });
  assert.equal(result.purchasing_state, "MINIMUM_NOT_JUSTIFIED");
  assert.equal(result.packs_short, 1);
});

test("supplier ten packs short without strong candidates is MINIMUM_NOT_JUSTIFIED", () => {
  const result = evaluate({ supplierOverrides: { minimumOrderPacks: 20 }, demands: [demand({ suggestedPacks: 10, suggestedUnits: 50 })] });
  assert.equal(result.purchasing_state, "MINIMUM_NOT_JUSTIFIED");
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

test("returns only the top fifteen one-pack candidates needed to cover a twenty-pack minimum", () => {
  const required = demand({ suggestedPacks: 5, suggestedUnits: 25 });
  const candidates = Array.from({ length: 20 }, (_, index) => demand({
    styleId: `candidate-${String(index + 1).padStart(2, "0")}`,
    productName: `Candidate ${index + 1}`,
    status: "no_replenishment_required",
    suggestedPacks: 0,
    suggestedUnits: 0,
    sales7Days: 20 - index,
  }));
  const demands = [required, ...candidates];
  const products = demands.map((entry) => product({ style_id: entry.styleId }));
  const result = evaluate({ supplierOverrides: { minimumOrderPacks: 20 }, demands, products });

  assert.deepEqual(
    result.additional_qualifying_products.map((entry) => entry.style_id),
    candidates.slice(0, 15).map((entry) => entry.styleId),
  );
  assert.equal(
    result.total_required_packs + result.additional_qualifying_products.reduce((total, entry) => total + entry.required_packs, 0),
    20,
  );
});

test("variable canonical MOQ contributions reduce shortfall and selection stops once covered", () => {
  const demands = [
    demand({ suggestedPacks: 17, suggestedUnits: 85 }),
    demand({ styleId: "candidate-a", status: "no_replenishment_required", suggestedPacks: 0, suggestedUnits: 0, productMoqPacks: 2, urgency: "CRITICAL" }),
    demand({ styleId: "candidate-b", status: "no_replenishment_required", suggestedPacks: 0, suggestedUnits: 0, productMoqPacks: 2, urgency: "HIGH" }),
    demand({ styleId: "candidate-c", status: "no_replenishment_required", suggestedPacks: 0, suggestedUnits: 0, productMoqPacks: 4, urgency: "MEDIUM" }),
  ];
  const products = demands.map((entry) => product({ style_id: entry.styleId }));
  const result = evaluate({ supplierOverrides: { minimumOrderPacks: 20 }, demands, products });

  assert.deepEqual(result.additional_qualifying_products.map((entry) => entry.style_id), ["candidate-a", "candidate-b"]);
  assert.deepEqual(result.additional_qualifying_products.map((entry) => entry.required_packs), [2, 2]);
  assert.equal(result.total_required_packs + 4, 21);
});

test("returns no advisory candidates when required packs already satisfy the supplier minimum", () => {
  const candidate = demand({
    styleId: "candidate", status: "no_replenishment_required", suggestedPacks: 0,
    suggestedUnits: 0, productMoqPacks: 2,
  });
  const result = evaluate({
    supplierOverrides: { minimumOrderPacks: 20, minimumOrderValue: 1_000 },
    demands: [demand({ suggestedPacks: 20, suggestedUnits: 100 }), candidate],
    products: [product(), product({ style_id: "candidate" })],
  });

  assert.deepEqual(result.additional_qualifying_products, []);
});

test("sold in the last seven days qualifies for additional basket consideration", () => {
  const candidate = demand({
    styleId: "candidate", status: "no_replenishment_required", suggestedPacks: 0,
    suggestedUnits: 0, sales7Days: 1, sales14Days: 1, daysSinceLastSale: 1,
  });
  const result = evaluate({
    supplierOverrides: { minimumOrderPacks: 20 },
    demands: [demand({ suggestedPacks: 1, suggestedUnits: 5 }), candidate],
    products: [product(), product({ style_id: "candidate" })],
  });

  assert.deepEqual(result.additional_qualifying_products.map((entry) => entry.style_id), ["candidate"]);
});

test("two sales in fourteen days with a recent last sale qualifies", () => {
  const candidate = demand({
    styleId: "candidate", status: "no_replenishment_required", suggestedPacks: 0,
    suggestedUnits: 0, sales7Days: 0, sales14Days: 2, daysSinceLastSale: 14,
  });
  const result = evaluate({
    supplierOverrides: { minimumOrderPacks: 20 },
    demands: [demand({ suggestedPacks: 1, suggestedUnits: 5 }), candidate],
    products: [product(), product({ style_id: "candidate" })],
  });

  assert.deepEqual(result.additional_qualifying_products.map((entry) => entry.style_id), ["candidate"]);
});

test("isolated thirty-day sales do not satisfy basket demand quality", () => {
  for (const [sales14Days, sales30Days, daysSinceLastSale] of [[1, 3, 10], [0, 1, 20]]) {
    const candidate = demand({
      styleId: "candidate", status: "no_replenishment_required", demand_status: "SLOW",
      suggestedPacks: 0, suggestedUnits: 0, sales7Days: 0, sales14Days, sales30Days,
      daysSinceLastSale, currentStock: 0, netAvailableStock: 0,
    });
    const result = evaluate({
      supplierOverrides: { minimumOrderPacks: 20 },
      demands: [demand({ suggestedPacks: 1, suggestedUnits: 5 }), candidate],
      products: [product(), product({ style_id: "candidate" })],
    });

    assert.equal(candidate.demand_status, "SLOW");
    assert.deepEqual(result.additional_qualifying_products, []);
  }
});

test("stock pressure alone cannot qualify weak demand and the supplier shortfall remains unresolved", () => {
  const strong = demand({
    styleId: "strong", status: "no_replenishment_required", suggestedPacks: 0,
    suggestedUnits: 0, productMoqPacks: 2, sales7Days: 1,
  });
  const weak = demand({
    styleId: "weak", status: "no_replenishment_required", demand_status: "SLOW",
    suggestedPacks: 0, suggestedUnits: 0, productMoqPacks: 10,
    sales7Days: 0, sales14Days: 0, sales30Days: 1, daysSinceLastSale: 20,
    currentStock: 0, netAvailableStock: 0,
  });
  const result = evaluate({
    supplierOverrides: { minimumOrderPacks: 10 },
    demands: [demand({ suggestedPacks: 5, suggestedUnits: 25 }), strong, weak],
    products: [product(), product({ style_id: "strong" }), product({ style_id: "weak" })],
  });

  assert.deepEqual(result.additional_qualifying_products.map((entry) => entry.style_id), ["strong"]);
  assert.equal(result.total_required_packs + result.additional_qualifying_products[0].required_packs, 7);
  assert.equal(result.minimum_reached_with_additions, false);
});

test("five required plus four supported advisory packs leaves eleven packs unjustified", () => {
  const demands = [
    demand({ suggestedPacks: 5, suggestedUnits: 25 }),
    demand({ styleId: "advisory-a", status: "no_replenishment_required", suggestedPacks: 0, suggestedUnits: 0, productMoqPacks: 3, urgency: "CRITICAL" }),
    demand({ styleId: "advisory-b", status: "no_replenishment_required", suggestedPacks: 0, suggestedUnits: 0, productMoqPacks: 1, urgency: "HIGH" }),
  ];
  const result = evaluate({
    supplierOverrides: { minimumOrderPacks: 20 },
    demands,
    products: demands.map((entry) => product({ style_id: entry.styleId })),
  });

  assert.equal(result.required_packs, 5);
  assert.equal(result.total_required_packs, 5);
  assert.equal(result.advisory_supported_packs, 4);
  assert.equal(result.intelligent_basket_packs, 9);
  assert.equal(result.remaining_shortfall_packs, 11);
  assert.equal(result.minimum_supported_by_demand, false);
  assert.equal(result.purchasing_state, "MINIMUM_NOT_JUSTIFIED");
  assert.equal(result.estimated_order_value, 50);
  assert.equal(result.projected_intelligent_basket_spend, 90);
});

test("five required plus fifteen ranked advisory packs supports the supplier minimum", () => {
  const candidates = Array.from({ length: 15 }, (_, index) => demand({
    styleId: `advisory-${String(index + 1).padStart(2, "0")}`,
    status: "no_replenishment_required",
    suggestedPacks: 0,
    suggestedUnits: 0,
    sales7Days: 15 - index,
  }));
  const demands = [demand({ suggestedPacks: 5, suggestedUnits: 25 }), ...candidates];
  const result = evaluate({
    supplierOverrides: { minimumOrderPacks: 20 },
    demands,
    products: demands.map((entry) => product({ style_id: entry.styleId })),
  });

  assert.equal(result.required_packs, 5);
  assert.equal(result.advisory_supported_packs, 15);
  assert.equal(result.intelligent_basket_packs, 20);
  assert.equal(result.remaining_shortfall_packs, 0);
  assert.equal(result.minimum_supported_by_demand, true);
  assert.equal(result.purchasing_state, "READY_TO_ORDER");
  assert.deepEqual(result.additional_qualifying_products.map((entry) => entry.style_id), candidates.map((entry) => entry.styleId));
});

test("ACTIVE stock seven with pack five is excluded from additional qualification", () => {
  const candidate = demand({
    styleId: "candidate", status: "no_replenishment_required", suggestedPacks: 0,
    suggestedUnits: 0, currentStock: 7, netAvailableStock: 7, unitsPerPack: 5,
  });
  const result = evaluate({
    supplierOverrides: { minimumOrderPacks: 20 },
    demands: [demand({ suggestedPacks: 1, suggestedUnits: 5 }), candidate],
    products: [product(), product({ style_id: "candidate" })],
  });
  assert.deepEqual(result.additional_qualifying_products, []);
});

test("ACTIVE stock exactly one pack is included in additional qualification", () => {
  const candidate = demand({
    styleId: "candidate", status: "no_replenishment_required", suggestedPacks: 0,
    suggestedUnits: 0, currentStock: 5, netAvailableStock: 5, unitsPerPack: 5,
  });
  const result = evaluate({
    supplierOverrides: { minimumOrderPacks: 20 },
    demands: [demand({ suggestedPacks: 1, suggestedUnits: 5 }), candidate],
    products: [product(), product({ style_id: "candidate" })],
  });
  assert.deepEqual(result.additional_qualifying_products.map((entry) => entry.style_id), ["candidate"]);
});

test("ACTIVE stock below one pack is included in additional qualification", () => {
  const candidate = demand({
    styleId: "candidate", status: "no_replenishment_required", suggestedPacks: 0,
    suggestedUnits: 0, currentStock: 3, netAvailableStock: 3, unitsPerPack: 5,
  });
  const result = evaluate({
    supplierOverrides: { minimumOrderPacks: 20 },
    demands: [demand({ suggestedPacks: 1, suggestedUnits: 5 }), candidate],
    products: [product(), product({ style_id: "candidate" })],
  });
  assert.deepEqual(result.additional_qualifying_products.map((entry) => entry.style_id), ["candidate"]);
});

test("DORMANT stock zero is excluded from additional qualification", () => {
  const candidate = demand({
    styleId: "candidate", status: "no_replenishment_required", demand_status: "DORMANT",
    suggestedPacks: 0, suggestedUnits: 0, currentStock: 0, netAvailableStock: 0, unitsPerPack: 5,
  });
  const result = evaluate({
    supplierOverrides: { minimumOrderPacks: 20 },
    demands: [demand({ suggestedPacks: 1, suggestedUnits: 5 }), candidate],
    products: [product(), product({ style_id: "candidate" })],
  });
  assert.deepEqual(result.additional_qualifying_products, []);
});

test("basket additions are advisory and never create purchase orders", async () => {
  const [engine, page] = await Promise.all([
    readFile(new URL("../lib/brain/SupplierBasketIntelligenceEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/purchase-intelligence/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Advisory only/);
  assert.match(page, /Strong advisory packs/);
  assert.match(page, /Remaining shortfall/);
  assert.match(page, /no additional products currently meet the demand-quality threshold/);
  assert.doesNotMatch(engine + page, /insert\(|update\(|delete\(|createPurchaseOrder/);
});
