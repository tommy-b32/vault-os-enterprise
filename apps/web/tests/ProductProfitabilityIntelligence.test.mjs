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

test("Stage 2 keeps the detail evidence contract and fail-closed allocation source", async () => {
  const [store, panel, detail] = await Promise.all([
    readFile(new URL("../lib/intelligence/StoreIntelligence.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/intelligence/ProductProfitabilityPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/intelligence/products/[productId]/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(store, /vault_shopify_verified_product_profitability_line_allocations/);
  assert.match(panel, /Units<\/th><th>Orders<\/th><th>ASP/);
  for (const field of ["Order", "Sale date", "COGS", "Contribution"]) assert.match(detail, new RegExp(field));
});
