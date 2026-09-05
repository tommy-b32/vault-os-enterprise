import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { mkdtemp, readdir, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { boundedShopifyRead } from "../../../supabase/functions/_shared/shopify/bounded-read.ts";
import { planBackfill, runBackfill } from "../../../scripts/shopify-order-backfill.mjs";

import { parseOrderSyncRequest } from "../../../supabase/functions/shopify-order-sync/request.ts";

const functionUrl = new URL("../../../supabase/functions/shopify-order-sync/index.ts", import.meta.url);
const ordersUrl = new URL("../../../supabase/functions/_shared/shopify/orders.ts", import.meta.url);

test("default reconciliation request remains unchanged", async () => {
  assert.deepEqual(parseOrderSyncRequest({}), { mode: "reconciliation" });
  const [handler, orders] = await Promise.all([
    readFile(functionUrl, "utf8"),
    readFile(ordersUrl, "utf8"),
  ]);
  assert.match(handler, /SHOPIFY_ORDER_SYNC_DAYS/);
  assert.match(handler, /fetchRecentShopifyOrders\(updatedSince as string\)/);
  assert.match(handler, /recent_orders_by_updated_at/);
  assert.match(orders, /`updated_at:>=\$\{updatedSince\}`/);
  assert.match(orders, /sortKey: "UPDATED_AT"/);
});

test("historical mode accepts a complete ISO-8601 range", () => {
  assert.deepEqual(parseOrderSyncRequest({
    created_from: "2026-07-01T00:00:00Z",
    created_before: "2026-07-08T00:00:00Z",
  }), {
    mode: "historical_backfill",
    createdFrom: "2026-07-01T00:00:00Z",
    createdBefore: "2026-07-08T00:00:00Z",
  });
});

test("historical query uses an exclusive created-before boundary and CREATED_AT sorting", async () => {
  const source = await readFile(ordersUrl, "utf8");
  assert.match(source, /`created_at:>='\$\{createdFrom\}' created_at:<'\$\{createdBefore\}'`/);
  assert.match(source, /sortKey: "CREATED_AT"/);
});

test("normal pagination remains cursor based at 50 orders per page and 50 pages", async () => {
  const source = await readFile(ordersUrl, "utf8");
  assert.match(source, /const ORDER_PAGE_SIZE = 50/);
  assert.match(source, /const MAX_ORDER_PAGES = 50/);
  assert.match(source, /after: cursor/);
  assert.match(source, /endCursor/);
  assert.match(source, /pagination exceeded its safety limit/);
});

test("idempotent canonical order and line upserts are unchanged", async () => {
  const source = await readFile(ordersUrl, "utf8");
  assert.match(source, /onConflict: "source,shopify_order_id"/);
  assert.match(source, /onConflict: "source,shopify_line_item_id"/);
});

test("cancellations refunds and exact Shopify IDs remain preserved", async () => {
  const source = await readFile(ordersUrl, "utf8");
  assert.match(source, /cancelled_at: order\.cancelledAt/);
  assert.match(source, /refunded_quantity: refund\.quantity/);
  assert.match(source, /shopify_product_id: line\.product\?\.id/);
  assert.match(source, /shopify_variant_id: line\.variant\?\.id/);
  assert.match(source, /historical \? 50 : 250/);
  assert.match(source, /historical \? 25 : 100/);
});

test("invalid and incomplete ranges are rejected", () => {
  for (const input of [
    { created_from: "not-a-date", created_before: "2026-07-08T00:00:00Z" },
    { created_from: "2026-07-01T00:00:00Z" },
    { created_before: "2026-07-08T00:00:00Z" },
    { created_from: "2026-07-08T00:00:00Z", created_before: "2026-07-08T00:00:00Z" },
    { created_from: "2026-07-09T00:00:00Z", created_before: "2026-07-08T00:00:00Z" },
    { created_from: "2026-01-01T00:00:00Z", created_before: "2026-02-01T00:00:00Z" },
    { created_from: "2099-01-01T00:00:00Z", created_before: "2099-01-02T00:00:00Z" },
    { created_from: "2026-02-30T00:00:00Z", created_before: "2026-03-04T00:00:00Z" },
  ]) assert.throws(() => parseOrderSyncRequest(input));
});

function loadOrders(graphql, scopes = ["read_orders", "read_all_orders"]) {
  return readFile(ordersUrl, "utf8").then((source) => {
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    const exports = {};
    new Function("require", "exports", outputText)(() => ({ shopifyGraphQL: (query, ...args) => query.includes("VaultHistoricalAccess")
      ? Promise.resolve({ currentAppInstallation: { accessScopes: scopes.map((handle) => ({ handle })) } })
      : graphql(query, ...args) }), exports);
    return exports;
  });
}

const money = (amount) => ({ shopMoney: { amount: String(amount), currencyCode: "GBP" } });
const fixture = () => ({
  id: "fixture-order", checkoutToken: null, number: 1, name: "fixture", createdAt: "2026-05-03T12:06:22Z", updatedAt: "2026-08-01T12:00:00Z",
  cancelledAt: "2026-08-01T12:00:00Z", currencyCode: "GBP", displayFinancialStatus: "PARTIALLY_REFUNDED", displayFulfillmentStatus: "UNFULFILLED",
  subtotalPriceSet: money(100), totalDiscountsSet: money(0), totalShippingPriceSet: money(0), totalTaxSet: money(0), totalRefundedSet: money(25), totalPriceSet: money(100), currentTotalPriceSet: money(75),
  test: true, tags: [], email: "fixture@example.invalid", customer: { id: "fixture-customer", displayName: "Fixture" },
  lineItems: { nodes: [{ id: "fixture-line", title: "Fixture", variantTitle: null, sku: null, quantity: 4, originalUnitPriceSet: money(25), originalTotalSet: money(100), discountedTotalSet: money(100), product: null, variant: null }], pageInfo: { hasNextPage: false } },
  refunds: [{ refundLineItems: { nodes: [{ quantity: 1, subtotalSet: money(25), lineItem: { id: "fixture-line" } }], pageInfo: { hasNextPage: false } } }],
});

test("historical reads fail closed if the active cached token lacks full order-history access", async () => {
  let orderRequests = 0;
  const orders = await loadOrders(async () => { orderRequests += 1; }, ["read_orders"]);
  await assert.rejects(orders.fetchHistoricalShopifyOrders("2026-05-01T00:00:00Z", "2026-05-08T00:00:00Z"), /read_all_orders on the active token/);
  assert.equal(orderRequests, 0);
});

test("historical pages are small, follow cursors, preserve bounds and exclude customer selections", async () => {
  const calls = [];
  const orders = await loadOrders(async (query, variables, deadline) => {
    calls.push({ query, variables, deadline });
    return { orders: { nodes: [fixture()], pageInfo: { hasNextPage: calls.length === 1, endCursor: "cursor-1" } } };
  });
  assert.equal((await orders.fetchHistoricalShopifyOrders("2026-05-01T00:00:00Z", "2026-05-08T00:00:00Z")).length, 2);
  assert.equal(calls[0].variables.first, 1);
  assert.match(calls[0].query, /lineItems\(first: 50\)/);
  assert.match(calls[0].query, /refundLineItems\(first: 25\)/);
  assert.equal(calls[1].variables.after, "cursor-1");
  assert.equal(calls[0].variables.query, "created_at:>='2026-05-01T00:00:00Z' created_at:<'2026-05-08T00:00:00Z'");
  assert.equal(calls[0].deadline, calls[1].deadline);
  assert.doesNotMatch(calls[0].query, /\bemail\b|\bcustomer\b/);
  await orders.fetchRecentShopifyOrders("2026-08-01T00:00:00Z");
  assert.equal(calls[2].variables.first, 50);
  assert.equal(calls[2].deadline, undefined);
  assert.match(calls[2].query, /email customer/);
});

test("repeated cursors and oversized nested lines fail rather than return partial historical orders", async () => {
  const cycling = await loadOrders(async () => ({ orders: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "same" } } }));
  await assert.rejects(cycling.fetchHistoricalShopifyOrders("a", "b"), /safety limit/);
  const order = fixture();
  order.lineItems.pageInfo.hasNextPage = true;
  const oversized = await loadOrders(async () => ({ orders: { nodes: [order], pageInfo: { hasNextPage: false } } }));
  await assert.rejects(oversized.fetchHistoricalShopifyOrders("a", "b"), /50 line-item limit/);
  let pages = 0;
  const endless = await loadOrders(async () => ({ orders: { nodes: [fixture()], pageInfo: { hasNextPage: true, endCursor: String(++pages) } } }));
  await assert.rejects(endless.fetchHistoricalShopifyOrders("a", "b"), /safety limit/);
  assert.equal(pages, 50);
});

test("replaying after a line-write failure updates canonical keys without duplicate orders or lines", async () => {
  const orders = await loadOrders(() => { throw new Error("Unexpected request"); });
  const savedOrders = new Map();
  const savedLines = new Map();
  let failLines = true;
  const client = { from(table) { return { upsert(rows, options) {
    if (table === "vault_shopify_orders") {
      assert.equal(options.onConflict, "source,shopify_order_id");
      savedOrders.set(rows.shopify_order_id, rows);
      return { select() { return { single: async () => ({ data: { id: "canonical-fixture" }, error: null }) }; } };
    }
    assert.equal(options.onConflict, "source,shopify_line_item_id");
    if (failLines) { failLines = false; return Promise.resolve({ error: new Error("Simulated line failure") }); }
    for (const row of rows) savedLines.set(row.shopify_line_item_id, row);
    return Promise.resolve({ error: null });
  } }; } };
  await assert.rejects(orders.upsertShopifyOrder(client, fixture(), { omitCustomerData: true }), /line failure/);
  await orders.upsertShopifyOrder(client, fixture(), { omitCustomerData: true });
  await orders.upsertShopifyOrder(client, fixture(), { omitCustomerData: true });
  assert.equal(savedOrders.size, 1);
  assert.equal(savedLines.size, 1);
  const saved = [...savedOrders.values()][0];
  assert.equal(saved.net_revenue, 75); // Not 75 minus the refund again.
  assert.equal(saved.refunds, 25);
  assert.equal(saved.cancelled_at, fixture().cancelledAt);
  assert.equal(saved.shopify_created_at, fixture().createdAt);
  assert.equal(saved.metadata.test, true);
  assert.equal(savedLines.values().next().value.refunded_quantity, 1);
  assert.equal(savedLines.values().next().value.net_line_revenue, 75);
  for (const field of ["shopify_customer_id", "customer_name", "customer_email"]) assert.ok(!(field in saved));
});

test("bounded GraphQL reads honor cost restoration and Retry-After without leaking errors", async () => {
  const waits = [];
  let calls = 0;
  const result = await boundedShopifyRead(async () => {
    calls += 1;
    if (calls === 1) return Response.json({ errors: [{ extensions: { code: "THROTTLED" } }], extensions: { cost: { requestedQueryCost: 100, throttleStatus: { maximumAvailable: 1000, currentlyAvailable: 0, restoreRate: 50 } } } });
    if (calls === 2) return new Response("", { status: 429, headers: { "Retry-After": "3" } });
    return Response.json({ data: { complete: true } });
  }, Date.now() + 60000, async (ms) => { waits.push(ms); });
  assert.deepEqual(result, { complete: true });
  assert.deepEqual(waits, [2000, 3000]);
  await assert.rejects(boundedShopifyRead(async () => Response.json({ errors: [{ message: "sensitive upstream detail", extensions: { code: "ACCESS_DENIED" } }] }), Date.now() + 60000), /read rejected/);
  let failures = 0;
  await assert.rejects(boundedShopifyRead(async () => { failures += 1; return new Response("", { status: 503 }); }, Date.now() + 60000, async () => {}), /exhausted bounded retries/);
  assert.equal(failures, 4);
  await assert.rejects(boundedShopifyRead(async () => new Response("", { status: 429, headers: { "Retry-After": "60" } }), Date.now() + 60000), /time budget/);
});

test("pinned UTC windows exactly partition the year through reference, including a short final window", () => {
  const through = "2026-09-05T11:00:00Z";
  const windows = planBackfill(through);
  assert.equal(windows[0].created_from, "2026-01-01T00:00:00.000Z");
  assert.equal(windows.at(-1).created_before, "2026-09-05T11:00:00.000Z");
  for (let index = 0; index < windows.length; index += 1) {
    assert.ok(Date.parse(windows[index].created_before) - Date.parse(windows[index].created_from) <= 7 * 86400000);
    if (index) assert.equal(windows[index - 1].created_before, windows[index].created_from);
  }
  assert.throws(() => planBackfill("2099-01-01T00:00:00Z"));
  assert.throws(() => planBackfill("2026-02-30T00:00:00Z"));
  assert.throws(() => planBackfill(through, 169));
});

test("runner defaults to offline dry plan, checkpoints only acknowledged windows and stops on uncertain outcomes", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "vault-backfill-test-"));
  t.after(async () => { for (const file of await readdir(directory)) await unlink(join(directory, file)); await rmdir(directory); });
  const checkpoint = join(directory, "checkpoint.json");
  const options = { through: "2026-01-10T00:00:00Z", checkpoint };
  const env = { SUPABASE_EDGE_JWT: "fixture-jwt", VAULT_ORDER_SYNC_SECRET: "fixture-secret" };
  let invocations = 0;
  const fetchImpl = async (_url, init) => {
    invocations += 1;
    const window = JSON.parse(init.body);
    return Response.json({ success: true, sync_mode: "historical_orders_by_created_at", ...window, orders_synced: 0, order_lines_synced: 0, completed_at: "2026-09-05T11:00:00Z" });
  };
  const dependencies = { fetchImpl, env, log: () => {} };
  await runBackfill(options, dependencies);
  assert.equal(invocations, 0);
  assert.deepEqual(await readdir(directory), []);
  await runBackfill({ ...options, execute: true }, dependencies);
  assert.equal(invocations, 1);
  assert.equal(JSON.parse(await readFile(checkpoint, "utf8")).receipts.length, 1);
  await assert.rejects(runBackfill({ ...options, execute: true }, { ...dependencies, fetchImpl: async () => { throw new Error("private connection detail"); } }), /outcome is uncertain/);
  assert.equal(JSON.parse(await readFile(checkpoint, "utf8")).receipts.length, 1);
  await assert.rejects(runBackfill({ ...options, execute: true }, dependencies), /Uncertain previous invocation/);
  await assert.rejects(runBackfill({ ...options, execute: true, retryUncertain: true }, dependencies), /Uncertain previous invocation/);
  await runBackfill({ ...options, execute: true, retryUncertain: true }, { ...dependencies, now: () => Date.now() + 601000 });
  assert.equal(JSON.parse(await readFile(checkpoint, "utf8")).receipts.length, 2);
  await runBackfill({ ...options, execute: true }, dependencies);
  assert.equal(invocations, 2);
});

test("backfill diagnostics preserve the existing sync-run schema", async () => {
  const source = await readFile(functionUrl, "utf8");
  const insert = source.match(/\.from\("vault_shopify_order_sync_runs"\)[\s\S]*?\.select\("id"\)/)?.[0] ?? "";
  assert.match(source, /historical_orders_by_created_at/);
  assert.match(insert, /sync_days: syncDays/);
  assert.doesNotMatch(insert, /created_from|created_before/);
});
