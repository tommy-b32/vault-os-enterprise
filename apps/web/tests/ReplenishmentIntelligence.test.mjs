import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BuyingRecommendationEngine } from "../lib/brain/BuyingRecommendationEngine.ts";

function product(overrides = {}) {
  const replenishment = {
    styleId: "parent::Black",
    parentProductId: "parent",
    stockOnHand: 0,
    committedStock: 0,
    incomingStock: 0,
    netAvailableStock: 0,
    averageDailySales: 1,
    averageWeeklySales: 7,
    salesHistoryDays: 7,
    reorderPoint: null,
    safetyStock: null,
    targetStockDays: 14,
    supplierLeadTimeDays: 7,
    unitsPerPack: 5,
    supplierMoqPacks: 1,
    freshness: "2026-08-05T00:00:00Z",
    supplierMinimumOrderState: "satisfied",
    trusted: true,
    missingRequirements: [],
    ...overrides.replenishment_intelligence,
  };

  return {
    style_id: "parent::Black",
    parent_product_id: "parent",
    product_name: "Product",
    stock_on_hand: 0,
    target_stock_days: 14,
    supplier_moq_packs: 1,
    inventory_strategy: "stocked",
    restock_enabled: true,
    configuration_trusted: true,
    trusted_for_reorder: true,
    sales_intelligence: {
      average_daily_sales: replenishment.averageDailySales,
      average_weekly_sales: replenishment.averageWeeklySales,
      average_monthly_sales: null,
      last_sale_date: null,
      days_since_last_sale: null,
      sales_velocity: "medium",
      reorder_point: null,
      safety_stock: null,
    },
    commercial_cost: {
      units_per_pack: 5,
      pack_cost: 10,
      currency: "GBP",
      estimated_gross_profit_per_unit: 5,
      commercial_cost_trusted: true,
    },
    replenishment_intelligence: replenishment,
    ...overrides,
    replenishment_intelligence: replenishment,
  };
}

test("complete canonical replenishment inputs produce a trusted quantity", () => {
  const result = BuyingRecommendationEngine.buildRecommendation({
    product: product(),
  });

  assert.equal(result.trusted, true);
  assert.equal(result.status, "reorder");
  assert.ok(result.suggestedPacks > 0);
});

test("missing mandatory inputs and unknown supplier minimum block trust", () => {
  for (const missing of [
    "sales_history_unavailable",
    "variant_mapping_missing",
    "stock_unavailable",
    "committed_stock_unavailable",
    "incoming_stock_unavailable",
    "supplier_lead_time_missing",
    "target_stock_days_missing",
    "units_per_pack_missing",
    "supplier_moq_missing",
    "supplier_minimum_order_unknown",
  ]) {
    const result = BuyingRecommendationEngine.buildRecommendation({
      product: product({
        replenishment_intelligence: {
          trusted: false,
          supplierMinimumOrderState:
            missing === "supplier_minimum_order_unknown" ? "unknown" : "satisfied",
          missingRequirements: [missing],
        },
      }),
    });

    assert.equal(result.trusted, false);
    assert.equal(result.status, "insufficient_data");
    assert.ok(result.missingData.includes(missing));
  }
});

test("Catalogue preserves canonical committed and incoming stock", async () => {
  const source = await readFile(
    new URL("../lib/catalogue.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /committed_stock: style\.committed_stock/);
  assert.match(source, /incoming_stock: style\.incoming_stock/);
  assert.match(source, /replenishment_intelligence:/);
});

test("a valid zero-sales window remains zero and needs no reorder", () => {
  const result = BuyingRecommendationEngine.buildRecommendation({
    product: product({
      replenishment_intelligence: {
        averageDailySales: 0,
        averageWeeklySales: 0,
      },
    }),
  });

  assert.equal(result.averageDailySales, 0);
  assert.equal(result.status, "healthy");
  assert.equal(result.suggestedPacks, 0);
});

test("canonical SQL deduplicates lines and excludes cancelled and test orders", async () => {
  const [sql, ingestionSql] = await Promise.all([
    readFile(
      new URL(
        "../../../supabase/migrations/20260805000000_style_replenishment_intelligence.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../supabase/migrations/20260803000000_shopify_order_ingestion.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(ingestionSql, /unique \(source, shopify_line_item_id\)/);
  assert.match(sql, /orders\.cancelled_at is null/);
  assert.match(sql, /metadata ->> 'test'/);
  assert.match(sql, /quantity - line\.refunded_quantity/);
  assert.match(sql, /source_variant_id = line\.shopify_variant_id/);
  assert.doesNotMatch(sql, /line\.title\s*=/);
});

test("Advisor no longer exposes MOQ-or-one as a trusted quantity", async () => {
  const source = await readFile(
    new URL("../lib/brain/AdvisorEngine.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /Math\.max\(\s*1,\s*product\.supplier_moq_packs/);
  assert.match(source, /BuyingRecommendationEngine\.buildRecommendation/);
  assert.match(source, /trusted_quantity_unavailable/);
});
