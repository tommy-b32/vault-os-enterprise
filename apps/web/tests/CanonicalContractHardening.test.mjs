import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BuyingRecommendationEngine } from "../lib/brain/BuyingRecommendationEngine.ts";
import { CapitalEngine } from "../lib/brain/CapitalEngine.ts";
import { SupplierMinimumContract } from "../lib/supplier/SupplierMinimum.ts";

function reorderProduct() {
  return {
    style_id: "product::Black",
    parent_product_id: "product",
    product_name: "Product",
    stock_on_hand: 0,
    supplier_moq_packs: 10,
    inventory_strategy: "stocked",
    restock_enabled: true,
    configuration_trusted: true,
    trusted_for_reorder: true,
    sales_intelligence: {
      average_daily_sales: 1,
      average_weekly_sales: 7,
      average_monthly_sales: null,
      last_sale_date: null,
      days_since_last_sale: null,
      sales_velocity: "medium",
      reorder_point: null,
      safety_stock: 0,
    },
    commercial_cost: {
      units_per_pack: 5,
      pack_cost: 10,
      currency: "GBP",
      estimated_gross_profit_per_unit: 5,
      commercial_cost_trusted: true,
    },
    replenishment_intelligence: {
      styleId: "product::Black",
      parentProductId: "product",
      stockOnHand: 0,
      committedStock: 0,
      incomingStock: 0,
      netAvailableStock: 0,
      averageDailySales: 1,
      averageWeeklySales: 7,
      sales7Days: 7,
      sales14Days: 9,
      sales30Days: 12,
      lastSaleDate: "2026-08-07T00:00:00Z",
      daysSinceLastSale: 0,
      salesHistory30Complete: true,
      salesHistoryDays: 7,
      reorderPoint: null,
      safetyStock: 0,
      targetStockDays: 14,
      supplierLeadTimeDays: 7,
      unitsPerPack: 5,
      supplierMoqPacks: 10,
      freshness: "2026-08-05T00:00:00Z",
      supplierMinimumOrderState: "not_applicable",
      trusted: true,
      missingRequirements: [],
    },
  };
}

test("buying recommendation exposes calculation and MOQ without hiding either", () => {
  const result = BuyingRecommendationEngine.buildRecommendation({
    product: reorderProduct(),
  });

  assert.equal(result.calculatedQuantity, 3);
  assert.equal(result.minimumRequiredQuantity, 10);
  assert.equal(result.suggestedPacks, 10);
});

test("supplier minimum contract preserves value, currency, and explicit state", () => {
  assert.deepEqual(
    SupplierMinimumContract.create({ value: null, currency: "EUR" }),
    { value: null, currency: "EUR", state: "unknown", minimumOrderPacks: null, packState: "unknown" },
  );
  assert.deepEqual(
    SupplierMinimumContract.create({ value: 0, currency: "TRY" }),
    { value: 0, currency: "TRY", state: "not_applicable", minimumOrderPacks: null, packState: "unknown" },
  );
  assert.deepEqual(
    SupplierMinimumContract.create({ value: 250, currency: "EUR" }),
    { value: 250, currency: "EUR", state: "defined", minimumOrderPacks: null, packState: "unknown" },
  );
});

test("CapitalEngine preserves missing and invalid inputs as unavailable", () => {
  const missing = CapitalEngine.reviewPosition({
    ledgerBalanceGbp: null,
    protectedReserveGbp: 100,
    committedOrdersGbp: 50,
    proposedPurchaseGbp: 25,
    walletLastUpdated: "2026-08-05T09:00:00Z",
  });
  const invalid = CapitalEngine.reviewPosition({
    ledgerBalanceGbp: 1000,
    protectedReserveGbp: Number.NaN,
    committedOrdersGbp: 50,
    proposedPurchaseGbp: 25,
  });

  assert.equal(missing.availability, "unavailable");
  assert.equal(missing.inputStates.ledgerBalanceGbp.state, "missing");
  assert.equal(missing.walletLastUpdated, "2026-08-05T09:00:00Z");
  assert.equal(invalid.inputStates.protectedReserveGbp.state, "invalid");
  assert.notEqual(missing.ledgerBalanceGbp, 0);
});

test("wallet contract exposes provenance without defining a stale threshold", async () => {
  const sql = await readFile(
    new URL(
      "../../../supabase/migrations/20260805010000_purchasing_wallet_freshness.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(sql, /wallet_last_updated/);
  assert.match(sql, /max\(updated_at\)/);
  assert.doesNotMatch(sql, /interval\s+'[^']+'/i);
  assert.doesNotMatch(sql, /\bstale\b/i);
});

test("buying and purchase-order identity uses supplier IDs", async () => {
  const [classifier, purchaseOrders, supplierEngine, supplierSources] =
    await Promise.all([
      readFile(new URL("../lib/brain/TrustedBuyingCandidateClassifier.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/purchase-orders/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/brain/SupplierIntelligenceEngine.ts", import.meta.url), "utf8"),
      readFile(new URL("../components/suppliers/ProductSupplierSources.tsx", import.meta.url), "utf8"),
    ]);

  assert.match(classifier, /supplierId: product\.supplier_id/);
  assert.match(purchaseOrders, /candidate\.id === commercialInput\.supplierId/);
  assert.match(purchaseOrders, /orderMap\.get\(commercialInput\.supplierId\)/);
  assert.match(purchaseOrders, /orderMap\.set\(commercialInput\.supplierId/);
  assert.doesNotMatch(purchaseOrders, /supplier_name\.toLowerCase/);
  assert.doesNotMatch(supplierEngine, /profile\.supplierName[\s\S]{0,100}source\.supplierName/);
  assert.doesNotMatch(supplierSources, /score\.supplierName\s*===/);
});
