import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { createPaymentFeeValue, unavailable } from "./CommandCentreCockpit.ts";

const root = new URL("../../../../", import.meta.url);
const source = await readFile(new URL("supabase/functions/_shared/shopify/payment-fees.ts", root), "utf8");
const mod = {};
new Function("exports", "shopifyGraphQL", ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ""), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(mod, () => { throw new Error("not used"); });

function loadPaymentFees(shopifyGraphQL) {
  const result = {};
  new Function("exports", "shopifyGraphQL", ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ""), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(result, shopifyGraphQL);
  return result;
}

function exactRecoverySupabase(orders) {
  const calls = { writes: [] };
  return {
    calls,
    from(table) {
      assert.equal(table, "vault_shopify_orders");
      return {
        select() { return this; },
        eq() { return this; },
        async in(column, ids) {
          assert.equal(column, "shopify_order_id");
          assert.deepEqual(ids, orders.map(order => order.shopify_order_id));
          return { data: orders, error: null };
        },
      };
    },
    async rpc(name, payload) { calls.writes.push({ name, payload }); return { error: null }; },
  };
}

const at = "2026-09-06T12:00:00Z";
const fee = (id = "fee-1", amount = "1.44", currencyCode = "GBP") => ({ id, type: "PROCESSING_FEE", amount: { amount, currencyCode }, taxAmount: { amount: "0.00", currencyCode } });
const transaction = (overrides = {}) => ({ id: "txn-1", kind: "SALE", status: "SUCCESS", gateway: "shopify_payments", paymentId: "payment-1", processedAt: at, fees: [fee()], ...overrides });
const order = transactions => ({ id: "gid://shopify/Order/1259", transactions });

test("uses the exact successful Shopify Payments fee including tax once", () => {
  const result = mod.classifyPaymentFees(order([transaction({ fees: [fee("fee-1", "1.44"), fee("fee-2", "0.10")] })]), "00000000-0000-0000-0000-000000000001", at);
  assert.equal(result.coverage.coverage_state, "covered");
  assert.equal(result.records.length, 2);
  assert.ok(result.records.every(record => record.counts_toward_profit));
  assert.equal(result.records[0].fee_amount, "1.44");
  assert.equal(result.records[0].fee_currency, "GBP");
});

test("failed attempts never count, while external, missing, duplicate, refunded and foreign-currency payments block coverage", () => {
  assert.equal(mod.classifyPaymentFees(order([transaction({ id: "failed", status: "FAILURE", fees: [fee("failed-fee", "1.50")] }), transaction()]), "id", at).coverage.coverage_state, "covered");
  assert.equal(mod.classifyPaymentFees(order([transaction({ gateway: "paypal" })]), "id", at).coverage.coverage_state, "unsupported_gateway");
  assert.equal(mod.classifyPaymentFees(order([transaction({ fees: [] })]), "id", at).coverage.coverage_state, "unresolved_missing_fee");
  assert.equal(mod.classifyPaymentFees(order([transaction(), transaction({ id: "txn-2", paymentId: "payment-2", fees: [fee("fee-2")] })]), "id", at).coverage.coverage_state, "unresolved_duplicate_payment");
  assert.equal(mod.classifyPaymentFees(order([transaction(), transaction({ id: "refund", kind: "REFUND", fees: [] })]), "id", at).coverage.coverage_state, "unresolved_reversal_or_adjustment");
  assert.equal(mod.classifyPaymentFees(order([transaction({ fees: [fee("fee-1", "1.44", "EUR")] })]), "id", at).coverage.coverage_state, "unresolved_currency");
});

test("daily payment fee value requires complete GBP coverage and follows source freshness", () => {
  const snapshot = { total: 1.44, orderCount: 2, coveredOrders: 2, sourceAt: at };
  const trading = { orderCount: 2, currency: "GBP" };
  const source = { status: "live", generatedAt: at };
  assert.equal(createPaymentFeeValue(snapshot, trading, source).value.amount, 1.44);
  for (const invalid of [null, { ...snapshot, total: null }, { ...snapshot, coveredOrders: 1 }, { ...snapshot, orderCount: 3 }, { ...snapshot, sourceAt: null }]) assert.deepEqual(createPaymentFeeValue(invalid, trading, source), unavailable());
  assert.equal(createPaymentFeeValue(snapshot, trading, { ...source, generatedAt: "2026-09-08T12:31:00Z" }).state, "stale");
  assert.equal(createPaymentFeeValue(snapshot, { ...trading, currency: "EUR" }, source).state, "unavailable");
});

test("migration keys exact fees idempotently and refuses a partial daily cohort", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table vault_shopify_orders(id uuid primary key, shopify_order_id text, source text default 'shopify', shopify_created_at timestamptz, cancelled_at timestamptz, metadata jsonb default '{"test":false}');`);
    const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
    await db.exec(await readFile(new URL("supabase/migrations/20260908150000_shopify_payment_fee_records.sql", root), "utf8"));
    for (const n of [1, 2]) await db.query("insert into vault_shopify_orders values ($1,$2,'shopify','2026-09-06T10:00:00Z',null,$3)", [id(n), `gid://shopify/Order/${n}`, JSON.stringify({ test: false })]);
    const coverage = n => ({ order_id: id(n), shopify_order_id: `gid://shopify/Order/${n}`, coverage_state: "covered", fetched_at: at });
    const record = { order_id: id(1), shopify_order_id: "gid://shopify/Order/1", shopify_order_transaction_id: "txn-1", fee_id: "fee-1", gateway: "shopify_payments", transaction_kind: "SALE", transaction_status: "SUCCESS", processed_at: at, fee_amount: "1.44", fee_currency: "GBP", tax_amount: "0.00", tax_currency: "GBP", source_classification: "shopify_payments", reconciliation_state: "covered", counts_toward_profit: true, fetched_at: at };
    const save = (records, snapshots) => db.query("select record_shopify_payment_fees($1::jsonb,$2::jsonb)", [JSON.stringify(records), JSON.stringify(snapshots)]);
    await save([record], [coverage(1)]);
    assert.equal((await db.query("select * from get_shopify_daily_payment_fees('2026-09-06T12:00:00Z')")).rows[0].total_payment_fees_gbp, null);
    await save([], [coverage(2)]);
    assert.equal(Number((await db.query("select * from get_shopify_daily_payment_fees('2026-09-06T12:00:00Z')")).rows[0].total_payment_fees_gbp), 1.44);
    await save([{ ...record, fee_amount: "2.00", fetched_at: "2026-09-06T12:01:00Z" }], [{ ...coverage(1), fetched_at: "2026-09-06T12:01:00Z" }]);
    assert.equal(Number((await db.query("select * from get_shopify_daily_payment_fees('2026-09-06T12:02:00Z')")).rows[0].total_payment_fees_gbp), 2);
  } finally { await db.close(); }
});

test("payment-fee retry is five-minute, authenticated, and only selects unresolved recent coverage", async () => {
  const [retry, migration, config, analyticsSchedule] = await Promise.all([
    readFile(new URL("supabase/functions/shopify-payment-fee-retry/index.ts", root), "utf8"),
    readFile(new URL("supabase/migrations/20261090000000_shopify_payment_fee_retry_schedule.sql", root), "utf8"),
    readFile(new URL("supabase/config.toml", root), "utf8"),
    readFile(new URL("supabase/migrations/20260904120000_shopify_analytics_daily.sql", root), "utf8"),
  ]);
  assert.match(retry, /refreshUnresolvedPaymentFees/);
  assert.match(retry, /X-Vault-Sync-Secret/);
  assert.match(config, /\[functions\.shopify-payment-fee-retry\]\s+verify_jwt = true/);
  assert.match(migration, /'vault-shopify-payment-fee-retry'/);
  assert.match(migration, /'\*\/5 \* \* \* \*'/);
  assert.match(migration, /coverage_state is distinct from 'covered'/);
  assert.match(migration, /cron\.unschedule\(existing_job_id\)/);
  assert.doesNotMatch(migration, /jobid\s*:=\s*\d+|jobid\s*=\s*\d+/);
  assert.match(analyticsSchedule, /'vault-shopify-analytics-refresh',\s*'\*\/15 \* \* \* \*'/);
});

test("exact payment-fee recovery accepts only 1-5 unique Shopify Order GIDs", () => {
  const gid = number => `gid://shopify/Order/${number}`;
  assert.deepEqual(mod.parseExactPaymentFeeOrderIds([gid(1306)]), [gid(1306)]);
  assert.equal(mod.parseExactPaymentFeeOrderIds([1, 2, 3, 4, 5].map(gid)).length, 5);
  assert.throws(() => mod.parseExactPaymentFeeOrderIds([]));
  assert.throws(() => mod.parseExactPaymentFeeOrderIds([gid(1), gid(1)]));
  assert.throws(() => mod.parseExactPaymentFeeOrderIds([1, 2, 3, 4, 5, 6].map(gid)));
  assert.throws(() => mod.parseExactPaymentFeeOrderIds(["1306"]));
});

test("exact recovery persists an unresolved snapshot when Shopify returns no eligible fee", async () => {
  const gid = "gid://shopify/Order/1306";
  const supabase = exactRecoverySupabase([{ id: "canonical-1306", shopify_order_id: gid, shopify_created_at: at }]);
  const exact = loadPaymentFees(async (_query, variables) => {
    assert.deepEqual(variables, { ids: [gid] });
    return { shop: { currencyCode: "GBP", ianaTimezone: "Europe/London" }, nodes: [{ id: gid, transactions: [transaction({ fees: [] })] }] };
  });
  const result = await exact.syncExactPaymentFeeOrders(supabase, [gid]);
  assert.deepEqual(result, { processed: 1, covered: 0, requestedOrderIds: [gid] });
  assert.equal(supabase.calls.writes.length, 1);
  assert.equal(supabase.calls.writes[0].name, "record_shopify_payment_fees");
  assert.equal(supabase.calls.writes[0].payload.fee_records.length, 0);
  assert.equal(supabase.calls.writes[0].payload.coverage_snapshots[0].coverage_state, "unresolved_missing_fee");
});

test("exact recovery persists only exact governed Shopify fee evidence", async () => {
  const gid = "gid://shopify/Order/1328";
  const supabase = exactRecoverySupabase([{ id: "canonical-1328", shopify_order_id: gid, shopify_created_at: at }]);
  const exact = loadPaymentFees(async () => ({ shop: { currencyCode: "GBP", ianaTimezone: "Europe/London" }, nodes: [{ id: gid, transactions: [transaction()] }] }));
  const result = await exact.syncExactPaymentFeeOrders(supabase, [gid]);
  assert.equal(result.covered, 1);
  assert.equal(supabase.calls.writes[0].payload.coverage_snapshots[0].coverage_state, "covered");
  assert.equal(supabase.calls.writes[0].payload.fee_records[0].fee_amount, "1.44");
});

test("a partial exact Shopify response fails closed before governed fee persistence", async () => {
  const first = "gid://shopify/Order/1306", second = "gid://shopify/Order/1328";
  const supabase = exactRecoverySupabase([{ id: "canonical-1306", shopify_order_id: first, shopify_created_at: at }, { id: "canonical-1328", shopify_order_id: second, shopify_created_at: at }]);
  const exact = loadPaymentFees(async () => ({ shop: { currencyCode: "GBP", ianaTimezone: "Europe/London" }, nodes: [{ id: first, transactions: [transaction()] }, null] }));
  await assert.rejects(() => exact.syncExactPaymentFeeOrders(supabase, [first, second]), /incomplete/);
  assert.equal(supabase.calls.writes.length, 0);
});

test("an unsupported exact order mapping fails closed before Shopify or fee persistence", async () => {
  const gid = "gid://shopify/Order/1306";
  const calls = { writes: 0 };
  const supabase = { from: () => ({ select() { return this; }, eq() { return this; }, async in() { return { data: [], error: null }; } }), async rpc() { calls.writes++; return { error: null }; } };
  let fetched = false;
  const exact = loadPaymentFees(async () => { fetched = true; throw new Error("must not fetch"); });
  await assert.rejects(() => exact.syncExactPaymentFeeOrders(supabase, [gid]), /mapping is incomplete/);
  assert.equal(fetched, false);
  assert.equal(calls.writes, 0);
});

test("Sales Workbook recovery route is owner/operator-only, exact-order-only, and never accesses workbook storage", async () => {
  const route = await readFile(new URL("apps/web/app/api/sales-workbook/payment-fee-recovery/route.ts", root), "utf8");
  for (const text of ["requireOperatorRole(\"owner\", \"operator\")", "VAULT_ORDER_SYNC_SECRET", "shopify-payment-fee-retry", "X-Vault-Sync-Secret", "shopifyOrderIds", "MAX_EXACT_ORDERS = 5"]) assert.ok(route.includes(text));
  assert.doesNotMatch(route, /storage|SalesWorkbookRepository|XLSX|backfill|tracking-repair/i);
});
