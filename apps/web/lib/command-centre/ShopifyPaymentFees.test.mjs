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
