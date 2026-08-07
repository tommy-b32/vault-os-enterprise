import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  assert.match(source, /`created_at:>=\$\{createdFrom\} created_at:<\$\{createdBefore\}`/);
  assert.match(source, /sortKey: "CREATED_AT"/);
});

test("pagination remains cursor based at 50 orders per page and 50 pages", async () => {
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
  assert.match(source, /exceeds the supported 250 line-item limit/);
  assert.match(source, /refund exceeding the supported 100 line-item limit/);
});

test("invalid and incomplete ranges are rejected", () => {
  for (const input of [
    { created_from: "not-a-date", created_before: "2026-07-08T00:00:00Z" },
    { created_from: "2026-07-01T00:00:00Z" },
    { created_before: "2026-07-08T00:00:00Z" },
    { created_from: "2026-07-08T00:00:00Z", created_before: "2026-07-08T00:00:00Z" },
    { created_from: "2026-07-09T00:00:00Z", created_before: "2026-07-08T00:00:00Z" },
  ]) assert.throws(() => parseOrderSyncRequest(input));
});

test("backfill diagnostics preserve the existing sync-run schema", async () => {
  const source = await readFile(functionUrl, "utf8");
  const insert = source.match(/\.from\("vault_shopify_order_sync_runs"\)[\s\S]*?\.select\("id"\)/)?.[0] ?? "";
  assert.match(source, /historical_orders_by_created_at/);
  assert.match(insert, /sync_days: syncDays/);
  assert.doesNotMatch(insert, /created_from|created_before/);
});
