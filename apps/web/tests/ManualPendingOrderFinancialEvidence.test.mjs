import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../", import.meta.url);

test("manual pending-order evidence is immutable, owner-bound, exact-order-bound, and does not alter COGS", async () => {
  const [migration, route, view, ui] = await Promise.all([
    readFile(new URL("../../supabase/migrations/20261128000000_governed_manual_pending_order_financial_evidence.sql", root), "utf8"),
    readFile(new URL("app/api/shopify-financial-evidence/manual/route.ts", root), "utf8"),
    readFile(new URL("app/api/sales-workbook/view/route.ts", root), "utf8"),
    readFile(new URL("components/operations/SalesWorkbookUpload.tsx", root), "utf8"),
  ]);
  for (const text of ["vault_shopify_manual_financial_evidence", "shipping_cost", "payment_fee", "amount_gbp >= 0", "unique (order_id, evidence_type)", "immutable_shopify_manual_financial_evidence", "record_shopify_manual_financial_evidence", "Verified Shopify shipping evidence already exists", "Verified Shopify payment-fee evidence already exists", "role='owner'"]) assert.ok(migration.includes(text), `missing ${text}`);
  assert.match(route, /requireOperatorRole\("owner"\)/);
  assert.match(route, /\^\\d\+\(\?:\\\.\\d\{1,2\}\)\?\$/);
  assert.match(route, /p_supporting_evidence/);
  assert.match(view, /vault_shopify_manual_financial_evidence/);
  assert.match(view, /postageSource: shopifyPostage !== null \? "shopify" : manualShipping \? "manual" : "missing"/);
  assert.match(ui, /aria-label="Pending Orders"/);
  assert.match(ui, /Save evidence/);
  assert.match(ui, /\/api\/shopify-financial-evidence\/manual/);
  assert.match(ui, /COGS: \{row\.cost \|\| "Missing"\}/);
  assert.doesNotMatch(route, /cogs|workbook|writePendingBackfillWorkbook/i);
});

test("manual evidence persists once, audits its owner, and rejects conflicts or mutation", async () => {
  const migration = await readFile(new URL("../../supabase/migrations/20261128000000_governed_manual_pending_order_financial_evidence.sql", root), "utf8");
  const db = new PGlite();
  const owner = "00000000-0000-4000-8000-000000000001", order = "00000000-0000-4000-8000-000000000002";
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table vault_operators(id uuid primary key, role text, is_active boolean);
    create table vault_shopify_orders(id uuid primary key, source text);
    create table vault_shopify_shipping_costs(order_id uuid, source_state text, label_cost_gbp numeric);
    create table vault_shopify_payment_fee_coverage(order_id uuid, coverage_state text);
    create function reject_shopify_financial_evidence_change_mutation() returns trigger language plpgsql as $$begin raise exception 'immutable'; end$$;
    insert into vault_operators values('${owner}','owner',true); insert into vault_shopify_orders values('${order}','shopify');`);
  await db.exec(migration);
  const call = (type, amount = "0.00") => db.query("select record_shopify_manual_financial_evidence($1,$2,$3,$4,$5,$6) as id", [order, type, amount, "Confirmed from carrier invoice", "INV-42", owner]);
  const saved = await call("shipping_cost");
  assert.equal(saved.rows.length, 1);
  const evidence = await db.query("select evidence_type,amount_gbp,recorded_by_operator_id from vault_shopify_manual_financial_evidence");
  assert.deepEqual(evidence.rows[0], { evidence_type: "shipping_cost", amount_gbp: "0.00", recorded_by_operator_id: owner });
  await assert.rejects(() => call("shipping_cost", "1.00"), /already exists/);
  await assert.rejects(() => db.query("update vault_shopify_manual_financial_evidence set amount_gbp=1"), /immutable/);
  await db.query("insert into vault_shopify_payment_fee_coverage values($1,'covered')", [order]);
  await assert.rejects(() => call("payment_fee", "1.00"), /Verified Shopify payment-fee evidence already exists/);
  await assert.rejects(() => call("payment_fee", "-1.00"), /Invalid manual financial evidence/);
  await db.close();
});

test("bounded allocation recognises complete manual evidence once and leaves incomplete orders unresolved", async () => {
  const migration = await readFile(new URL("../../supabase/migrations/20261129000000_sales_workbook_manual_financial_evidence_allocations.sql", root), "utf8");
  const db = new PGlite();
  const order = "00000000-0000-4000-8000-000000000012", line = "00000000-0000-4000-8000-000000000013", product = "00000000-0000-4000-8000-000000000014";
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table vault_shopify_verified_order_operational_contributions(order_id uuid, canonical_net_revenue numeric, observed_purchased_label_cost_gbp numeric, covered_payment_fees_gbp numeric);
    create table vault_shopify_orders(id uuid, shipping numeric);
    create table vault_shopify_order_lines(id uuid,order_id uuid,cogs_quantity integer,financial_treatment text,financial_treatment_status text,financial_treatment_history_id uuid,financial_treatment_snapshotted_at timestamptz,sale_time_direct_cogs_gbp numeric,shopify_variant_id text,shopify_product_id text);
    create table vault_stage1_sold_line_cogs_resolutions(order_line_id uuid,resolved_cogs_gbp numeric);
    create table vault_shopify_resolved_line_discount_evidence(order_line_id uuid,resolved_net_line_revenue numeric,resolution_status text);
    create table vault_variants(source text,source_variant_id text,product_id uuid);
    create table vault_products(id uuid,source text,source_product_id text);
    create table vault_shopify_manual_financial_evidence(order_id uuid,evidence_type text,amount_gbp numeric);
    insert into vault_shopify_verified_order_operational_contributions values('${order}',100,null,null);
    insert into vault_shopify_orders values('${order}',0); insert into vault_shopify_order_lines(id,order_id,cogs_quantity,shopify_variant_id) values('${line}','${order}',1,'variant-1');
    insert into vault_stage1_sold_line_cogs_resolutions values('${line}',20); insert into vault_shopify_resolved_line_discount_evidence values('${line}',100,'resolved_source_backed');
    insert into vault_variants values('shopify','variant-1','${product}'); insert into vault_products values('${product}','shopify',null);`);
  await db.exec(migration);
  let result = await db.query("select * from get_verified_product_profitability_allocations_for_orders($1)", [[order]]);
  assert.equal(result.rows.length, 0, "one or both missing financial costs must remain unresolved");
  await db.query("insert into vault_shopify_manual_financial_evidence values($1,'shipping_cost',3),($1,'payment_fee',1)", [order]);
  result = await db.query("select * from get_verified_product_profitability_allocations_for_orders($1)", [[order]]);
  assert.deepEqual(result.rows.map(row => ({ ...row, allocated_shipping_cost_gbp: Number(row.allocated_shipping_cost_gbp), allocated_payment_fees_gbp: Number(row.allocated_payment_fees_gbp) })), [{ order_id: order, order_line_id: line, allocated_shipping_cost_gbp: 3, allocated_payment_fees_gbp: 1 }]);
  await db.query("update vault_shopify_verified_order_operational_contributions set observed_purchased_label_cost_gbp=4,covered_payment_fees_gbp=2 where order_id=$1", [order]);
  result = await db.query("select * from get_verified_product_profitability_allocations_for_orders($1)", [[order]]);
  assert.deepEqual(result.rows.map(row => ({ ...row, allocated_shipping_cost_gbp: Number(row.allocated_shipping_cost_gbp), allocated_payment_fees_gbp: Number(row.allocated_payment_fees_gbp) })), [{ order_id: order, order_line_id: line, allocated_shipping_cost_gbp: 4, allocated_payment_fees_gbp: 2 }], "verified Shopify evidence takes precedence");
  await db.close();
});
