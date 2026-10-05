import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collectPaginated, compareProductProfitability, filterAndSortProductProfitability, previousProfitPeriodBounds, summarizeProductProfitability } from "../lib/intelligence/ProductProfitabilityIntelligence.ts";

const row = (name, revenue, units, orders, contribution = revenue / 2) => ({ productId: name, productName: name, eligibleUnits: units, eligibleOrders: orders, verifiedRevenue: revenue, cogs: 1, shippingCost: 1, paymentFees: 1, contribution, asp: revenue / units, contributionPerUnit: contribution / units, contributionMarginPct: contribution / revenue * 100, revenueCoveragePct: 1, excludedOrders: 0 });

test("Stage 2 derives ASP, order count, non-overlapping previous ranges, and percentage-point margin movement", () => {
  const current = summarizeProductProfitability([row("Core Tee", 120, 4, 2, 48)], { eligibleRevenue: 120, excludedRevenue: 0 });
  const previous = summarizeProductProfitability([row("Core Tee", 100, 5, 3, 30)], { eligibleRevenue: 100, excludedRevenue: 0 });
  assert.equal(current.asp, 30); assert.equal(current.eligibleOrders, 2);
  assert.deepEqual(previousProfitPeriodBounds("7d", { from: "2026-09-20T00:00:00.000Z", to: "2026-09-27T00:00:00.000Z" }), { from: "2026-09-13T00:00:00.000Z", to: "2026-09-20T00:00:00.000Z" });
  assert.equal(compareProductProfitability(current, previous)?.marginPpChange, 10);
  assert.equal(previousProfitPeriodBounds("all", null), null);
});

test("Stage 2 summary counts a multi-product order once while product counts remain distinct", () => {
  const products = [row("Tee", 50, 1, 1), row("Hoodie", 70, 1, 1)];
  assert.equal(summarizeProductProfitability(products, { eligibleRevenue: 120, excludedRevenue: 0 }, ["order-1", "order-1"]).eligibleOrders, 1);
  assert.equal(products[0].eligibleOrders, 1); assert.equal(products[1].eligibleOrders, 1);
});

test("Stage 2 detail pagination exhausts pages without duplicate or omitted lines", async () => {
  const pages = [["a", "b"], ["c"], []]; let call = 0;
  const rows = await collectPaginated(async () => pages[call++] ?? [], 2);
  assert.deepEqual(rows, ["a", "b", "c"]); assert.equal(call, 2);
});

test("Stage 2 filters and numerically sorts without changing economics", () => {
  const rows = [row("Low Margin", 200, 2, 1, 20), row("High Margin", 100, 1, 1, 80)];
  assert.deepEqual(filterAndSortProductProfitability(rows, "margin", "margin").map(item => item.productName), ["High Margin", "Low Margin"]);
  assert.deepEqual(filterAndSortProductProfitability(rows, "low", "revenue").map(item => item.productName), ["Low Margin"]);
  assert.equal(rows[0].verifiedRevenue, 200);
});

test("Stage 2 empty profitability remains empty rather than zero-profit", () => {
  const summary = summarizeProductProfitability([], { eligibleRevenue: 0, excludedRevenue: 0 });
  assert.equal(summary.asp, null); assert.equal(summary.contributionMarginPct, null); assert.equal(summary.verifiedRevenue, 0);
});

test("Product Performance uses only the governed read model behind a valid freshness state", async () => {
  const [store, panel, detail] = await Promise.all([
    readFile(new URL("../lib/intelligence/StoreIntelligence.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/intelligence/ProductProfitabilityPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/intelligence/products/[productId]/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(store, /vault_shopify_verified_product_profitability_read_model_state/);
  assert.match(store, /vault_shopify_verified_product_profitability_read_model/);
  assert.doesNotMatch(store, /vault_shopify_verified_product_profitability_line_allocations/);
  assert.match(store, /state === "valid"/);
  for (const state of ["stale", "refreshing", "failed"]) assert.match(store, new RegExp(`state === "${state}"`));
  assert.match(store, /!result\.data/);
  assert.match(store, /ANALYTICS_START/);
  assert.match(store, /combinedProfitabilityBounds/);
  assert.match(store, /previousProfitPeriodBounds/);
  assert.match(store, /vault_shopify_product_profitability_coverage_lines/);
  assert.match(store, /eligibleCoverageRevenue/);
  assert.match(store, /excludedCoverageRevenue/);
  assert.match(store, /revenueCoveragePct: eligibleRevenue \+ excludedRevenue > 0/);
  assert.match(store, /excludedOrders: coverage\?\.excludedOrders\.size \?\? 0/);
  assert.match(store, /from\("vault_shopify_orders"\)\.select\("id,order_number"\)/);
  assert.match(store, /orderNumbers\.get\(line\.order_id\) \?\? "Order"/);
  assert.match(store, /\.eq\("product_id", productId\)/);
  assert.match(store, /\.eq\("refresh_generation", generation\)/);
  assert.match(store, /finalState\.generation !== generation/);
  assert.match(panel, /availability\.message/);
  assert.match(panel, /Units<\/th><th>Orders<\/th><th>ASP/);
  for (const field of ["Order", "Sale date", "COGS", "Contribution"]) assert.match(detail, new RegExp(field));
});

test("Product Performance coverage failure fails closed without aborting the Store Intelligence snapshot", async () => {
  const store = await readFile(new URL("../lib/intelligence/StoreIntelligence.ts", import.meta.url), "utf8");
  assert.match(store, /const coverageFailed = coverageResult\.status === "rejected"/);
  assert.match(store, /profitabilityRows = profitabilityRead\.value/);
  assert.match(store, /if \(coverageFailed\) \{\s+profitabilityReadAvailability = \{ available: false, message: "Product Performance is unavailable because coverage data could not be read safely\." \};\s+\} else if \(profitabilityRead\.status === "fulfilled"\)/);
  assert.match(store, /if \(!coverageFailed && coverageResult\.status === "fulfilled"\) coverageRows = coverageResult\.value\.data \?\? \[\];/);
});
