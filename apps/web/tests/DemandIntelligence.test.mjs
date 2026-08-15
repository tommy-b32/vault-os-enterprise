import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DemandIntelligenceEngine } from "../lib/brain/DemandIntelligenceEngine.ts";
import { PurchaseIntelligenceDiagnostics } from "../lib/brain/PurchaseIntelligenceDiagnostics.ts";
import { SupplierBasketIntelligenceEngine } from "../lib/brain/SupplierBasketIntelligenceEngine.ts";

function product(overrides = {}) {
  const replenishment = {
    styleId: "parent::Black", parentProductId: "parent", stockOnHand: 0,
    committedStock: 0, incomingStock: 0, netAvailableStock: 0,
    averageDailySales: 1, averageWeeklySales: 7, sales7Days: 7, sales14Days: 9, sales30Days: 12,
    lastSaleDate: "2026-08-07T00:00:00Z", daysSinceLastSale: 0,
    salesHistory30Complete: true, salesHistoryDays: 7,
    reorderPoint: null, safetyStock: null, targetStockDays: 14,
    supplierLeadTimeDays: 7, unitsPerPack: 5, supplierMoqPacks: 1,
    freshness: "2026-08-07T00:00:00Z", supplierMinimumOrderState: "not_satisfied",
    trusted: false, missingRequirements: ["supplier_minimum_order_not_evaluated"],
    ...overrides.replenishment_intelligence,
  };
  return {
    style_id: "parent::Black", parent_product_id: "parent", product_name: "Product",
    supplier_id: "supplier", inventory_strategy: "stocked", restock_enabled: true,
    configuration_trusted: true, trusted_for_reorder: false, reorder_approval: null,
    stock_on_hand: replenishment.stockOnHand ?? 0, supplier_moq_packs: replenishment.supplierMoqPacks,
    sales_intelligence: {
      average_daily_sales: replenishment.averageDailySales,
      average_weekly_sales: replenishment.averageWeeklySales,
      average_monthly_sales: null, last_sale_date: null, days_since_last_sale: null,
      sales_velocity: "medium", reorder_point: null, safety_stock: null,
    },
    commercial_cost: { units_per_pack: 5, pack_cost: 10, currency: "GBP", commercial_cost_trusted: false },
    replenishment_intelligence: replenishment,
    ...overrides,
    replenishment_intelligence: replenishment,
  };
}

test("supplier minimum policy does not block positive demand", () => {
  for (const missing of ["supplier_minimum_order_not_evaluated", "supplier_minimum_order_unknown"]) {
    const result = DemandIntelligenceEngine.evaluate(product({
      replenishment_intelligence: { trusted: false, missingRequirements: [missing] },
    }));
    assert.equal(result.status, "needs_replenishment");
    assert.ok(result.calculatedPacks > 0);
  }
});

test("wallet and reorder approval are not demand inputs", () => {
  const result = DemandIntelligenceEngine.evaluate(product({ trusted_for_reorder: false, reorder_approval: null }));
  assert.equal(result.status, "needs_replenishment");
  assert.ok(result.suggestedPacks > 0);
  assert.equal("wallet" in result, false);
});

test("trusted low stock and genuine healthy stock are distinguished", () => {
  const low = DemandIntelligenceEngine.evaluate(product());
  const healthy = DemandIntelligenceEngine.evaluate(product({
    stock_on_hand: 100,
    replenishment_intelligence: { stockOnHand: 100, netAvailableStock: 100 },
  }));
  assert.equal(low.status, "needs_replenishment");
  assert.equal(healthy.status, "no_replenishment_required");
  assert.equal(healthy.calculatedPacks, 0);
  assert.equal(healthy.trusted, true);
});

test("missing operational evidence remains unavailable", () => {
  for (const [field, value, reason] of [
    ["stockOnHand", null, "stock_unavailable"],
    ["targetStockDays", null, "target_stock_days_missing"],
    ["sales14Days", null, "fourteen_day_sales_unavailable"],
  ]) {
    const result = DemandIntelligenceEngine.evaluate(product({
      replenishment_intelligence: { [field]: value, missingRequirements: [reason] },
    }));
    assert.equal(result.status, "evidence_unavailable");
    assert.equal(result.calculatedPacks, null);
    assert.equal(result.demand_score, null);
    assert.equal(result.demand_level, null);
    if (field === "sales14Days") {
      assert.equal(result.demand_status, "NO_EVIDENCE");
      assert.match(result.demand_reason, /unavailable|incomplete/i);
    }
    assert.ok(result.missingRequirements.includes(reason));
  }
});

test("non-replenished strategies are explicitly excluded", () => {
  for (const inventory_strategy of ["dropship", "do_not_restock", "discontinued", "service"]) {
    assert.equal(
      DemandIntelligenceEngine.evaluate(product({ inventory_strategy })).status,
      "excluded_by_strategy",
    );
  }
});

test("product MOQ behaviour remains unchanged", () => {
  const result = DemandIntelligenceEngine.evaluate(product({
    supplier_moq_packs: 10,
    replenishment_intelligence: { supplierMoqPacks: 10 },
  }));
  assert.ok(result.calculatedPacks < 10);
  assert.equal(result.suggestedPacks, 10);
});

test("dormant demand never receives urgency from low stock", () => {
  const result = DemandIntelligenceEngine.evaluate(product({
    replenishment_intelligence: {
      averageDailySales: 0,
      averageWeeklySales: 0,
      sales7Days: 0,
      sales14Days: 0,
      sales30Days: 0,
      lastSaleDate: null,
      daysSinceLastSale: null,
    },
    sales_intelligence: {
      average_daily_sales: 0,
      average_weekly_sales: 0,
      average_monthly_sales: 0,
      last_sale_date: null,
      days_since_last_sale: null,
      sales_velocity: "very_low",
      reorder_point: null,
      safety_stock: null,
    },
  }));
  assert.equal(result.demand_status, "DORMANT");
  assert.equal(result.urgency, null);
  assert.equal(result.suggestedPacks, 0);
  assert.equal(result.suggestedUnits, 0);
  assert.equal(result.quantity_intelligence, null);
});

test("NO_EVIDENCE never receives a positive quantity", () => {
  const result = DemandIntelligenceEngine.evaluate(product({
    replenishment_intelligence: { salesHistory30Complete: false },
  }));
  assert.equal(result.demand_status, "NO_EVIDENCE");
  assert.equal(result.suggestedPacks, null);
  assert.equal(result.suggestedUnits, null);
  assert.equal(result.quantity_intelligence, null);
});

test("ACTIVE demand continues through the replenishment gate unchanged", () => {
  const result = DemandIntelligenceEngine.evaluate(product());
  assert.equal(result.demand_status, "ACTIVE");
  assert.equal(result.replenishment_qualified, true);
  assert.equal(result.status, "needs_replenishment");
  assert.ok(result.suggestedPacks > 0);
});

test("recent SLOW demand may proceed to quantity intelligence", () => {
  const result = DemandIntelligenceEngine.evaluate(product({
    replenishment_intelligence: {
      sales7Days: 0, sales14Days: 1, sales30Days: 1, daysSinceLastSale: 8,
    },
  }));
  assert.equal(result.demand_status, "SLOW");
  assert.equal(result.replenishment_qualified, true);
  assert.equal(result.status, "needs_replenishment");
  assert.ok(result.suggestedPacks > 0);
});

test("weak SLOW demand is watched independently of stock and receives no positive quantity", () => {
  const evaluateWeak = (stock) => DemandIntelligenceEngine.evaluate(product({
    stock_on_hand: stock,
    replenishment_intelligence: {
      stockOnHand: stock, netAvailableStock: stock, sales7Days: 0, sales14Days: 0,
      sales30Days: 1, daysSinceLastSale: 28,
    },
  }));
  const empty = evaluateWeak(0);
  const stocked = evaluateWeak(5);

  for (const result of [empty, stocked]) {
    assert.equal(result.demand_status, "SLOW");
    assert.equal(result.replenishment_qualified, false);
    assert.equal(result.status, "no_replenishment_required");
    assert.equal(result.suggestedPacks, 0);
    assert.equal(result.suggestedUnits, 0);
    assert.equal(result.quantity_intelligence, null);
    assert.match(result.replenishment_gate_reason, /Demand remains SLOW/);
  }
  assert.equal(empty.urgency, "CRITICAL");
});

test("failed SLOW gate is a watch item, not genuine replenishment or a top basket product", () => {
  const catalogueProduct = product({
    stock_on_hand: 0,
    supplier_id: "supplier",
    reorder_approval: { approval_state: "approved" },
    commercial_cost: {
      units_per_pack: 5, pack_cost: 10, currency: "GBP", commercial_cost_trusted: true,
      landed_cost_per_pack_gbp: 10,
    },
    replenishment_intelligence: {
      stockOnHand: 0, netAvailableStock: 0, sales7Days: 0, sales14Days: 0,
      sales30Days: 1, daysSinceLastSale: 28,
    },
  });
  const weak = DemandIntelligenceEngine.evaluate(catalogueProduct);
  const evaluation = { demands: [weak], qualifications: [], recommendations: [], baskets: [] };
  const [diagnostic] = PurchaseIntelligenceDiagnostics.build({
    suppliers: [{ id: "supplier", name: "Supplier", active: true, currency: "GBP", minimumOrderValue: 0, minimumOrderPacks: 5 }],
    evaluation,
  });
  const basket = SupplierBasketIntelligenceEngine.evaluate({
    supplier: { id: "supplier", name: "Supplier", active: true, currency: "GBP", minimumOrderValue: 0, minimumOrderPacks: 5 },
    demands: [weak],
    products: [catalogueProduct],
  });

  assert.deepEqual(diagnostic.demandItems, []);
  assert.deepEqual(diagnostic.slowDemandWatchItems.map((entry) => entry.styleId), [weak.styleId]);
  assert.deepEqual(basket.top_products, []);
});

test("demand and purchasing policy remain structurally separated", async () => {
  const [demand, purchasing, diagnostics, sql] = await Promise.all([
    readFile(new URL("../lib/brain/DemandIntelligenceEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/brain/PurchaseIntelligenceEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/brain/PurchaseIntelligenceDiagnostics.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../supabase/migrations/20260812000000_canonical_demand_intelligence.sql", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(demand, /CapitalEngine|PurchasingWallet|reorder_approval|minimumOrderValue/);
  assert.match(purchasing, /supplier_minimum_packs_not_satisfied/);
  assert.match(purchasing, /wallet_freshness_unknown/);
  assert.match(diagnostics, /genuineNoReorder/);
  assert.match(diagnostics, /evidenceUnavailable/);
  assert.doesNotMatch(diagnostics, /needsReplenishment === 0 \? "No replenishment/);
  assert.doesNotMatch(sql.match(/\) as trusted,[\s\S]*?\) as missing_requirements/)?.[0] ?? "", /supplier_minimum/);
  assert.match(sql, /supplier_policy_requirements/);
  assert.doesNotMatch(demand, /Math\.max\(\s*1,\s*product\.supplier_moq_packs/);
});
