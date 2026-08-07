import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DemandScoreEngine } from "../lib/brain/DemandScoreEngine.ts";

const score = (overrides = {}) => DemandScoreEngine.score({
  currentStock: 2,
  netAvailableStock: 2,
  sold7d: 2,
  sold14d: 2,
  sold30d: 2,
  daysSinceLastSale: 0,
  supplierLeadTimeDays: 10,
  targetStockDays: 7,
  unitsPerPack: 5,
  ...overrides,
});

test("stock 2 with two recent sales produces HIGH demand", () => {
  const result = score();
  assert.equal(result.demand_level, "HIGH");
  assert.ok(result.demand_score >= 70);
});

test("stock 3 with one seven-day sale and two thirty-day sales is at least MEDIUM", () => {
  const result = score({ currentStock: 3, netAvailableStock: 3, sold7d: 1, sold14d: 1, sold30d: 2 });
  assert.ok(["HIGH", "MEDIUM"].includes(result.demand_level));
});

test("stock 1 with older demand and a recent last sale is at least MEDIUM", () => {
  const result = score({ currentStock: 1, netAvailableStock: 1, sold7d: 0, sold14d: 0, sold30d: 2 });
  assert.ok(["HIGH", "MEDIUM"].includes(result.demand_level));
});

test("low stock with no thirty-day sales remains NONE or LOW", () => {
  const result = score({ currentStock: 1, netAvailableStock: 1, sold7d: 0, sold14d: 0, sold30d: 0, daysSinceLastSale: null });
  assert.ok(["NONE", "LOW"].includes(result.demand_level));
});

test("healthy stock scores below an otherwise identical low-stock style", () => {
  const low = score();
  const healthy = score({ currentStock: 30, netAvailableStock: 30 });
  assert.ok(low.demand_score > healthy.demand_score);
});

test("score is deterministic and always bounded from zero to one hundred", () => {
  for (const input of [
    {},
    { currentStock: 0, netAvailableStock: -3, sold7d: 100, sold14d: 150, sold30d: 300 },
    { currentStock: 1000, netAvailableStock: 1000, sold7d: 0, sold14d: 0, sold30d: 0, daysSinceLastSale: null },
  ]) {
    const result = score(input);
    assert.ok(result.demand_score >= 0 && result.demand_score <= 100);
    assert.deepEqual(result, score(input));
  }
});

test("canonical sales view reuses exact order evidence for 7, 14 and 30 days", async () => {
  const sql = await readFile(
    new URL("../../../supabase/migrations/20260814000000_deterministic_demand_signals.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /mapping\.source_variant_id = line\.shopify_variant_id/);
  assert.match(sql, /orders\.cancelled_at is null/);
  assert.match(sql, /line\.quantity - line\.refunded_quantity/);
  for (const days of [7, 14, 30]) assert.match(sql, new RegExp(`interval '${days} days'`));
});

test("purchasing qualification contracts remain outside demand scoring", async () => {
  const source = await readFile(new URL("../lib/brain/DemandScoreEngine.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /supplier minimum|approval|wallet|capital|commercial/i);
});
