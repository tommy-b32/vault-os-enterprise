import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { createShippingCostValue, createProfitTodayValue, unavailable } from "./CommandCentreCockpit.ts";

const root = new URL("../../../../", import.meta.url);
const source = await readFile(new URL("supabase/functions/_shared/shopify/shipping-labels.ts", root), "utf8");
const mod = {};
let api;
new Function("exports", "shopifyGraphQL", ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ""), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(mod, (...args) => api(...args));
const order = { id: "00000000-0000-0000-0000-000000000001", shopify_order_id: "gid://shopify/Order/9007199254740993", shopify_created_at: "2026-09-06T00:00:00Z" };
const table = (rows) => ({ columns: ["order_id", "shipping_label_costs", "shipping_labels"].map(name => ({ name })), rows });
const row = ["9007199254740993", "7.54", "2"];
const at = "2026-09-06T12:00:00Z";

test("shipping parser preserves exact IDs, multiple-label totals and real zero; rejects absent/invalid money", () => {
  assert.deepEqual(mod.parseLabelCosts(table([row]), [order]).get(order.shopify_order_id), { cost: "7.54", count: 2 });
  assert.equal(mod.parseLabelCosts(table([[row[0], "0.00", "1"]]), [order]).get(order.shopify_order_id).cost, "0.00");
  assert.equal(mod.parseLabelCosts(table([]), [order]).size, 0);
  for (const bad of [null, "", "NaN", "-1", "1.001"]) assert.throws(() => mod.parseLabelCosts(table([[row[0], bad, "1"]]), [order]));
  for (const bad of [null, "", "0", "1.1"]) assert.throws(() => mod.parseLabelCosts(table([[row[0], "1.00", bad]]), [order]));
  assert.throws(() => mod.parseLabelCosts(table([["123", "1", "1"]]), [order]));
  assert.throws(() => mod.parseLabelCosts(table([row, row]), [order]));
  assert.throws(() => mod.parseLabelCosts({ columns: [], rows: [] }, [order]));
  assert.throws(() => mod.shippingQuery([{ ...order, shopify_order_id: "1) OR true" }]));
  const query = mod.shippingQuery([order]).query;
  assert.match(query, /order_id IN \(9007199254740993\)/);
  assert.match(query, /SINCE 2026-09-05 UNTIL today LIMIT 51/);
});

test("backfill requests are bounded, reproducible and cursor validated", () => {
  const input = mod.parseShippingRequest({}, new Date(at));
  assert.equal(input.createdBefore, new Date(at).toISOString());
  assert.deepEqual(mod.parseShippingRequest(input, new Date(at)), input);
  for (const bad of [{ after: "bad" }, { createdFrom: "bad" }, { unexpected: true }, { createdFrom: "2020-01-01", createdBefore: at }, { createdFrom: at, createdBefore: "2027-01-01" }]) {
    assert.throws(() => mod.parseShippingRequest(bad, new Date(at)));
  }
});

test("sync writes explicit missing rows, replaces totals and refuses failed/truncated analytics", async () => {
  const calls = [];
  let writeCount = 0;
  const orders = [order, { ...order, id: "00000000-0000-0000-0000-000000000002", shopify_order_id: "gid://shopify/Order/2" }];
  const builder = new Proxy({}, { get: (_, key) => key === "then" ? (resolve) => resolve({ data: orders, error: null }) : (...args) => { calls.push([key, ...args]); return builder; } });
  const db = { from: () => builder, rpc: async (name, args) => {
    writeCount++;
    assert.equal(name, "record_shopify_shipping_costs");
    assert.equal(args.snapshots[0].label_cost_gbp, "7.54");
    assert.equal(args.snapshots[0].label_count, 2);
    assert.equal(args.snapshots[1].label_cost_gbp, null);
    assert.equal(args.snapshots[1].label_count, null);
    return { error: null };
  } };
  api = async () => ({ shop: { id: "shop", currencyCode: "GBP", ianaTimezone: "Europe/London" }, shopifyqlQuery: { parseErrors: [], tableData: table([row]) } });
  const result = await mod.syncShippingBatch(db, mod.parseShippingRequest({}));
  assert.equal(result.covered, 1);
  assert.equal(result.processed, 2);
  assert.ok(calls.some(call => call[0] === "gte" && call[1] === "shopify_created_at"));
  assert.ok(calls.some(call => call[0] === "limit" && call[1] === 51));
  api = async () => ({ shop: { currencyCode: "GBP", ianaTimezone: "Europe/London" }, shopifyqlQuery: { parseErrors: ["denied"], tableData: null } });
  await assert.rejects(mod.syncShippingBatch(db, mod.parseShippingRequest({})));
  assert.equal(writeCount, 1);
});

test("Shipping requires every today's order, correct currency and freshness; payment fees still block profit", () => {
  const snapshot = { total: 7.54, orderCount: 2, coveredOrders: 2, sourceAt: at };
  const trading = { orderCount: 2, currency: "GBP" };
  const source = { status: "live", generatedAt: at };
  const value = createShippingCostValue(snapshot, trading, source);
  assert.equal(value.value.amount, 7.54);
  for (const bad of [null, { ...snapshot, total: null }, { ...snapshot, coveredOrders: 1 }, { ...snapshot, orderCount: 3 }, { ...snapshot, sourceAt: null }, { ...snapshot, sourceAt: "2027-01-01" }]) {
    assert.deepEqual(createShippingCostValue(bad, trading, source), unavailable());
  }
  assert.equal(createShippingCostValue(snapshot, { ...trading, currency: "USD" }, source).state, "unavailable");
  assert.equal(createShippingCostValue(snapshot, trading, { ...source, generatedAt: "2026-09-06T12:31:00Z" }).state, "stale");
  assert.equal(createShippingCostValue(snapshot, trading, { ...source, status: "stale" }).state, "stale");
  assert.equal(createShippingCostValue(snapshot, trading, { ...source, status: "error" }).state, "unavailable");
  const profit = createProfitTodayValue({ revenue: value, productCost: value, shipping: value, metaSpend: value, paymentFees: unavailable() });
  assert.equal(profit.estimatedProfit.state, "unavailable");
  assert.deepEqual(profit.missingInputs, ["payment fees"]);
});

test("migration enforces idempotency, identity, missing coverage and London order-day boundaries", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table vault_shopify_orders(id uuid primary key, shopify_order_id text, source text default 'shopify',
        shopify_created_at timestamptz, cancelled_at timestamptz, metadata jsonb default '{"test":false}');`);
    await db.exec(await readFile(new URL("supabase/migrations/20260908120000_shopify_shipping_costs.sql", root), "utf8"));
    const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
    for (const [n, date, metadata, cancelled] of [
      [1, "2026-03-29T23:00:00Z", { test: false }, null],
      [2, "2026-03-30T10:00:00Z", { test: false }, null],
      [3, "2026-03-29T22:59:59Z", { test: false }, null],
      [4, "2026-03-30T10:00:00Z", { test: true }, null],
      [5, "2026-03-30T10:00:00Z", { test: false }, "2026-03-30T11:00:00Z"],
    ]) await db.query("insert into vault_shopify_orders values ($1,$2,'shopify',$3,$4,$5)", [id(n), `gid://shopify/Order/${n}`, date, cancelled, JSON.stringify(metadata)]);
    const snapshot = (n, cost = "3.77", fetched = "2026-03-30T12:00:00Z") => ({ order_id: id(n), shopify_order_id: `gid://shopify/Order/${n}`, shop_id: "shop", label_cost_gbp: cost, label_count: cost === null ? null : 2, fetched_at: fetched, query_from: "2026-03-28" });
    const save = rows => db.query("select record_shopify_shipping_costs($1::jsonb)", [JSON.stringify(rows)]);
    const daily = async () => (await db.query("select * from get_shopify_daily_shipping('2026-03-30T12:00:00Z')")).rows[0];
    await save([snapshot(1)]);
    assert.equal((await daily()).order_count, 2);
    assert.equal((await daily()).total_shipping_gbp, null);
    await save([snapshot(2)]);
    await save([snapshot(2)]);
    assert.equal(Number((await daily()).total_shipping_gbp), 7.54);
    await save([snapshot(2, "99.00", "2026-03-30T11:00:00Z")]);
    assert.equal(Number((await daily()).total_shipping_gbp), 7.54);
    await save([snapshot(2, "4.00", "2026-03-30T12:01:00Z")]);
    assert.equal(Number((await daily()).total_shipping_gbp), 7.77);
    await save([snapshot(2, null, "2026-03-30T12:02:00Z")]);
    assert.equal((await daily()).total_shipping_gbp, null);
    assert.equal((await daily()).accounting_status, "unreconciled");
    await assert.rejects(save([{ ...snapshot(1), shopify_order_id: "gid://shopify/Order/2" }]));
    await assert.rejects(save([{ ...snapshot(1), query_from: "2026-03-31" }]));
    await assert.rejects(save([{ ...snapshot(1), label_cost_gbp: "-1" }]));
    assert.equal((await db.query("select * from get_shopify_daily_shipping('2026-01-01')")).rows[0].total_shipping_gbp, null);
  } finally { await db.close(); }
});
