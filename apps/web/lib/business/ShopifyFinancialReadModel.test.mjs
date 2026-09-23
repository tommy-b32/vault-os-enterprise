import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";

const root = new URL("../../../../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20261026000000_verified_shopify_order_financial_read_model.sql", root), "utf8");
const legacyContractMigration = await readFile(new URL("supabase/migrations/20261027000000_verified_shopify_order_financial_legacy_contract.sql", root), "utf8");
const repositorySource = await readFile(new URL("ShopifyFinancialReadModelRepository.ts", import.meta.url), "utf8");
const at = "2026-09-23T12:00:00Z";
const fingerprint = "source-fingerprint";

test("verified financial read model admits only complete, current, contract-consistent GBP evidence", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table vault_shopify_orders(id text primary key,source text,shopify_order_id text,shopify_created_at timestamptz,shopify_updated_at timestamptz,currency text,net_revenue numeric);
      create table vault_shopify_financial_capture_completeness_observations(source text,shopify_order_id text,order_source_updated_at timestamptz,evidence_mode text,observed_at timestamptz,source_content_fingerprint text,payload_fingerprint text,fingerprint_contract_version text,discount_application_count int,discount_allocation_count int,refund_count int,refund_line_count int,refund_transaction_count int,discount_applications_complete boolean,line_items_complete boolean,refunds_complete boolean,refund_lines_complete boolean,refund_transactions_complete boolean);
      create table vault_shopify_discount_application_observations(source text,shopify_order_id text,application_index int,order_source_updated_at timestamptz,pricing_currency text,fingerprint_contract_version text,payload_fingerprint text,source_content_fingerprint text,created_at timestamptz);
      create table vault_shopify_line_discount_allocation_observations(source text,shopify_order_id text,shopify_line_item_id text,application_index int,order_source_updated_at timestamptz,allocated_shop_amount numeric,allocated_shop_currency text,allocated_presentment_currency text,fingerprint_contract_version text,payload_fingerprint text,source_content_fingerprint text,created_at timestamptz);
      create table vault_shopify_refund_observations(source text,shopify_order_id text,shopify_refund_id text,refund_source_updated_at timestamptz,total_refunded_amount numeric,currency text,fingerprint_contract_version text,payload_fingerprint text,source_content_fingerprint text,created_at timestamptz);
      create table vault_shopify_refund_line_observations(source text,shopify_order_id text,shopify_refund_id text,shopify_refund_line_item_id text,refund_source_updated_at timestamptz,subtotal_amount numeric,tax_amount numeric,currency text,fingerprint_contract_version text,payload_fingerprint text,source_content_fingerprint text,created_at timestamptz);
      create table vault_shopify_refund_transaction_observations(source text,shopify_order_id text,shopify_order_transaction_id text,refund_source_updated_at timestamptz,currency text,fingerprint_contract_version text,payload_fingerprint text,source_content_fingerprint text,created_at timestamptz);
      create table vault_shopify_financial_discount_application_latest(source text);
      create table vault_shopify_financial_line_discount_allocation_latest(source text);
      create table vault_shopify_financial_refund_latest(source text);
      create table vault_shopify_financial_refund_line_latest(source text);
      create table vault_shopify_financial_refund_transaction_latest(source text);
      create table vault_shopify_financial_refund_reconciliation(shopify_order_id text,reconciliation_state text);`);
    await db.exec(migration);
    await db.exec(legacyContractMigration);
    const order = async (id, updated = "2026-09-20T10:00:00Z", currency = "GBP") => db.query("insert into vault_shopify_orders values($1,'shopify',$2,$3,$4,$5,$6)", [id, id, at, updated, currency, "100"]);
    const capture = async (id, updated = "2026-09-20T10:00:00Z", counts = [0,0,0,0,0], overrides = {}) => db.query(`insert into vault_shopify_financial_capture_completeness_observations values('shopify',$1,$2,'historical',$3,$4,$4,'shopify-source-content-v1',$5,$6,$7,$8,$9,true,true,true,true,true)`, [id, updated, at, fingerprint, ...counts]);
    const valid = ["shopify-source-content-v1", fingerprint, fingerprint];
    const legacy = ["legacy-full-row-v1", "legacy-payload", null];
    await order("zero"); await capture("zero");
    await order("complete"); await capture("complete", "2026-09-20T10:00:00Z", [1,1,1,1,1]);
    await db.query("insert into vault_shopify_discount_application_observations values('shopify','complete',0,$1,'GBP',$2,$3,$4,$5)", ["2026-09-20T10:00:00Z", ...valid, at]);
    await db.query("insert into vault_shopify_line_discount_allocation_observations values('shopify','complete','line',0,$1,10,'GBP','GBP',$2,$3,$4,$5)", ["2026-09-20T10:00:00Z", ...valid, at]);
    await db.query("insert into vault_shopify_refund_observations values('shopify','complete','refund',$1,20,'GBP',$2,$3,$4,$5)", [at, ...valid, at]);
    await db.query("insert into vault_shopify_refund_line_observations values('shopify','complete','refund','refund-line',$1,15,5,'GBP',$2,$3,$4,$5)", [at, ...valid, at]);
    await db.query("insert into vault_shopify_refund_transaction_observations values('shopify','complete','refund-tx',$1,'GBP',$2,$3,$4,$5)", [at, ...valid, at]);
    await db.query("insert into vault_shopify_financial_refund_reconciliation values('complete','reconciled')");
    // Mirrors the eleven immutable historical discount orders: legacy contract is
    // valid per C2, has a payload fingerprint, and intentionally lacks source content.
    for (const id of Array.from({ length: 11 }, (_, index) => `legacy-${index}`)) {
      await order(id); await capture(id, "2026-09-20T10:00:00Z", [1,1,0,0,0]);
      await db.query("insert into vault_shopify_discount_application_observations values('shopify',$1,0,$2,'GBP',$3,$4,$5,$6)", [id, "2026-09-20T10:00:00Z", ...legacy, at]);
      await db.query("insert into vault_shopify_line_discount_allocation_observations values('shopify',$1,'line',0,$2,10,'GBP','GBP',$3,$4,$5,$6)", [id, "2026-09-20T10:00:00Z", ...legacy, at]);
    }
    // Contracts may differ between independent evidence families.
    await order("cross-family"); await capture("cross-family", "2026-09-20T10:00:00Z", [1,1,1,1,1]);
    await db.query("insert into vault_shopify_discount_application_observations values('shopify','cross-family',0,$1,'GBP',$2,$3,$4,$5)", ["2026-09-20T10:00:00Z", ...legacy, at]);
    await db.query("insert into vault_shopify_line_discount_allocation_observations values('shopify','cross-family','line',0,$1,10,'GBP','GBP',$2,$3,$4,$5)", ["2026-09-20T10:00:00Z", ...legacy, at]);
    await db.query("insert into vault_shopify_refund_observations values('shopify','cross-family','cross-refund',$1,20,'GBP',$2,$3,$4,$5)", [at, ...valid, at]);
    await db.query("insert into vault_shopify_refund_line_observations values('shopify','cross-family','cross-refund','cross-refund-line',$1,15,5,'GBP',$2,$3,$4,$5)", [at, ...valid, at]);
    await db.query("insert into vault_shopify_refund_transaction_observations values('shopify','cross-family','cross-refund-tx',$1,'GBP',$2,$3,$4,$5)", [at, ...valid, at]);
    // A single family with mixed contracts is not a coherent source version.
    await order("mixed-family"); await capture("mixed-family", "2026-09-20T10:00:00Z", [2,0,0,0,0]);
    await db.query("insert into vault_shopify_discount_application_observations values('shopify','mixed-family',0,$1,'GBP',$2,$3,$4,$5)", ["2026-09-20T10:00:00Z", ...legacy, at]);
    await db.query("insert into vault_shopify_discount_application_observations values('shopify','mixed-family',1,$1,'GBP',$2,$3,$4,$5)", ["2026-09-20T10:00:00Z", ...valid, at]);
    await order("invalid-legacy"); await capture("invalid-legacy", "2026-09-20T10:00:00Z", [0,1,0,0,0]);
    await db.query("insert into vault_shopify_line_discount_allocation_observations values('shopify','invalid-legacy','line',0,$1,1,'GBP','GBP',$2,$3,$4,$5)", ["2026-09-20T10:00:00Z", "legacy-full-row-v1", "legacy-payload", "must-be-null", at]);
    await order("missing");
    await order("stale"); await capture("stale", "2026-09-19T10:00:00Z");
    await order("count-mismatch"); await capture("count-mismatch", "2026-09-20T10:00:00Z", [0,1,0,0,0]);
    await order("fingerprint-mismatch"); await capture("fingerprint-mismatch", "2026-09-20T10:00:00Z", [0,1,0,0,0]);
    await db.query("insert into vault_shopify_line_discount_allocation_observations values('shopify','fingerprint-mismatch','line',0,$1,1,'GBP','GBP',$2,'wrong',$3,$4)", ["2026-09-20T10:00:00Z", "shopify-source-content-v1", fingerprint, at]);
    await order("currency-mismatch"); await capture("currency-mismatch", "2026-09-20T10:00:00Z", [0,1,0,0,0]);
    await db.query("insert into vault_shopify_line_discount_allocation_observations values('shopify','currency-mismatch','line',0,$1,1,'USD','USD',$2,$3,$4,$5)", ["2026-09-20T10:00:00Z", ...valid, at]);
    const { rows } = await db.query("select shopify_order_id,canonical_net_revenue,discount_allocation_total,refund_total,refund_line_merchandise_total,refund_line_tax_total,refund_reconciliation_status from vault_shopify_verified_order_financials order by shopify_order_id");
    assert.equal(rows.length, 14, rows.map(row => row.shopify_order_id).join(","));
    assert.ok(rows.some(row => row.shopify_order_id === "cross-family"));
    assert.equal(rows.filter(row => row.shopify_order_id.startsWith("legacy-")).length, 11);
    assert.ok(!rows.some(row => row.shopify_order_id === "mixed-family" || row.shopify_order_id === "invalid-legacy"));
    const complete = rows.find(row => row.shopify_order_id === "complete");
    const zero = rows.find(row => row.shopify_order_id === "zero");
    assert.deepEqual(complete, { shopify_order_id: "complete", canonical_net_revenue: "100", discount_allocation_total: "10", refund_total: "20", refund_line_merchandise_total: "15", refund_line_tax_total: "5", refund_reconciliation_status: "reconciled" });
    assert.equal(zero.canonical_net_revenue, "100");
    assert.equal(zero.discount_allocation_total, "0");
    assert.equal(zero.refund_reconciliation_status, "not_applicable");
  } finally { await db.close(); }
});

test("read-model migration remains additive, service-role-only, and never re-adjusts canonical revenue", () => {
  assert.match(migration, /create view public\.vault_shopify_verified_order_financials/);
  assert.match(migration, /c\.capture_rows = 1/);
  for (const count of ["discount_application_count", "discount_allocation_count", "refund_count", "refund_line_count", "refund_transaction_count"]) assert.match(migration, new RegExp(`= c\\.${count}`));
  assert.match(migration, /o\.net_revenue as canonical_net_revenue/);
  assert.match(migration, /must not be subtracted again/);
  assert.doesNotMatch(migration, /from public\.vault_shopify_financial_(discount_application|line_discount_allocation|refund|refund_line|refund_transaction)_latest/);
  assert.match(migration, /revoke all on public\.vault_shopify_verified_order_financials from public, anon, authenticated/);
  assert.doesNotMatch(migration, /update public\.vault_shopify_(financial|orders)/i);
  assert.doesNotMatch(migration, /delete from public\.vault_shopify/i);
  assert.match(legacyContractMigration, /create or replace view public\.vault_shopify_verified_order_financials/);
  assert.match(legacyContractMigration, /legacy-full-row-v1' and source_content_fingerprint is null/);
  assert.match(legacyContractMigration, /count\(distinct fingerprint_contract_version\)=1/);
});

test("repository consumes only the verified view and rejects malformed returned facts", async () => {
  const calls = [];
  const row = { order_id: "internal", shopify_order_id: "gid://shopify/Order/1", shopify_created_at: at, order_source_updated_at: at, currency: "GBP", canonical_net_revenue: "100", discount_allocation_total: "10", refund_total: "20", refund_line_merchandise_total: "15", refund_line_tax_total: "5", refund_reconciliation_status: "reconciled", completeness_evidence_mode: "historical", completeness_observed_at: at, completeness_source_content_fingerprint: fingerprint };
  const client = { from(table) { calls.push({ table }); return { select(fields) { calls.at(-1).fields = fields; return this; }, in(key, ids) { calls.at(-1).key = key; calls.at(-1).ids = ids; return Promise.resolve({ data: [row], error: null }); } }; } };
  const compiled = ts.transpileModule(repositorySource.replace(/^import .*;\r?\n/gm, ""), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = {}; new Function("exports", "supabaseAdmin", compiled)(mod, client);
  const result = await mod.ShopifyFinancialReadModelRepository.getByShopifyOrderIds([row.shopify_order_id, row.shopify_order_id]);
  assert.equal(calls[0].table, "vault_shopify_verified_order_financials");
  assert.deepEqual(calls[0].ids, [row.shopify_order_id]);
  assert.equal(result[0].canonicalNetRevenue, 100);
  assert.equal(result[0].refundTotal, 20);
  assert.deepEqual(await mod.ShopifyFinancialReadModelRepository.getByShopifyOrderIds([]), []);
  await assert.rejects(mod.ShopifyFinancialReadModelRepository.getByShopifyOrderIds(Array.from({ length: 51 }, (_, index) => `o-${index}`)), /limited to 50/);
  row.currency = "USD";
  await assert.rejects(mod.ShopifyFinancialReadModelRepository.getByShopifyOrderIds([row.shopify_order_id]), /Invalid verified Shopify financial row/);
});
