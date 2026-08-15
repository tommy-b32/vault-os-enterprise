import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PurchaseQuantityIntelligenceEngine } from "../lib/brain/PurchaseQuantityIntelligenceEngine.ts";

const calculate = (overrides = {}) => PurchaseQuantityIntelligenceEngine.calculate({
  sales7Days: 7,
  sales14Days: 7,
  sales30Days: 7,
  netAvailableStock: 0,
  supplierLeadTimeDays: 7,
  targetStockDays: 7,
  unitsPerPack: 5,
  supplierMoqPacks: 1,
  ...overrides,
});

test("weighted non-overlapping sales windows give faster styles more packs", () => {
  const fast = calculate({ sales7Days: 14, sales14Days: 14, sales30Days: 14 });
  const slow = calculate({ sales7Days: 2, sales14Days: 2, sales30Days: 2 });

  assert.equal(fast.weighted_daily_demand, 1.4);
  assert.equal(fast.target_units, 20);
  assert.equal(fast.recommended_packs, 4);
  assert.equal(slow.weighted_daily_demand, 0.19999999999999998);
  assert.equal(slow.target_units, 3);
  assert.equal(slow.recommended_packs, 1);
});

test("healthy available stock produces zero additional quantity", () => {
  const result = calculate({ netAvailableStock: 20 });
  assert.equal(result.target_units, 10);
  assert.equal(result.stock_deficit_units, 0);
  assert.equal(result.raw_required_packs, 0);
  assert.equal(result.recommended_packs, 0);
  assert.equal(result.recommended_units, 0);
});

test("negative available stock is treated as zero when calculating deficit", () => {
  const result = calculate({ netAvailableStock: -4 });
  assert.equal(result.net_available_stock, -4);
  assert.equal(result.target_units, 10);
  assert.equal(result.stock_deficit_units, 10);
});

test("pack rounding is indivisible and product MOQ is respected", () => {
  const rounded = calculate({ sales7Days: 5, sales14Days: 5, sales30Days: 5, supplierLeadTimeDays: 5, targetStockDays: 5 });
  assert.equal(rounded.target_units, 5);
  assert.equal(rounded.raw_required_packs, 1);
  assert.equal(rounded.recommended_units, 5);

  const moq = calculate({ supplierMoqPacks: 4 });
  assert.equal(moq.raw_required_packs, 2);
  assert.equal(moq.recommended_packs, 4);
  assert.equal(moq.recommended_units, 20);
});

test("supplier-level minimum cannot inflate a style quantity", async () => {
  const source = await readFile(new URL("../lib/brain/PurchaseQuantityIntelligenceEngine.ts", import.meta.url), "utf8");
  const result = calculate({ supplierMoqPacks: 1 });
  assert.equal(result.recommended_packs, 2);
  assert.doesNotMatch(source, /minimumOrderPacks|supplier_minimum_packs|supplierMinimumPacks/);
  assert.match(result.quantity_reason, /Weighted demand 0\.7 units\/day × 14 days cover = 10 target units/);
});

test("quantity remains downstream of demand and cannot create purchasing eligibility or orders", async () => {
  const [demand, purchase, page] = await Promise.all([
    readFile(new URL("../lib/brain/DemandIntelligenceEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/brain/PurchaseIntelligenceEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/purchase-intelligence/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(demand, /const replenishmentQualified = detection\.demand_status === "ACTIVE" \|\| slowReplenishmentQualified/);
  assert.match(demand, /if \(!replenishmentQualified\)/);
  assert.match(purchase, /confidence: state === "ready_to_purchase" \? "trusted" : "advisory"/);
  assert.match(purchase, /reorder_approval_missing/);
  assert.match(page, /Recommended:/);
  assert.match(page, /Target stock:/);
  assert.match(page, /Coverage:/);
  assert.doesNotMatch(demand + purchase + page, /createPurchaseOrder|insert\(|update\(|delete\(/);
});
