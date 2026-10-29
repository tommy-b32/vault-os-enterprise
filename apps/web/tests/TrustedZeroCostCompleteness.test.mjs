import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../../../supabase/migrations/20261122000000_trusted_zero_cost_completeness.sql", import.meta.url), "utf8");

test("trusted zero financial treatment completes only its exact line without creating Stage 1 COGS", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table vault_shopify_order_operational_contribution_diagnostics_base (
      order_id text, shopify_order_id text, shopify_created_at timestamptz, order_source_updated_at timestamptz,
      financial_row_count bigint, financial_currency text, canonical_net_revenue numeric,
      net_sold_line_count bigint, trusted_net_sold_line_count bigint, trusted_net_sold_line_cogs_gbp numeric,
      shipping_row_count bigint, shipping_source_state text, shipping_currency text, shipping_accounting_status text,
      shipping_label_count integer, observed_purchased_label_cost_gbp numeric, payment_coverage_row_count bigint,
      payment_coverage_state text, covered_fee_row_count bigint, valid_covered_fee_row_count bigint,
      covered_payment_fees_gbp numeric, exclusion_reason_codes text[]
    );
    create table vault_shopify_order_lines (
      id text, order_id text, cogs_quantity integer, financial_treatment text,
      financial_treatment_status text, financial_treatment_history_id text,
      financial_treatment_snapshotted_at timestamptz, sale_time_direct_cogs_gbp numeric
    );
    create table vault_stage1_sold_line_cogs_resolutions (
      order_line_id text, order_id text, resolved_cogs_gbp numeric
    );
  `);
  await db.exec(migration.replace("notify pgrst, 'reload schema';", ""));
  const base = async (orderId, lineCount) => db.query(`insert into vault_shopify_order_operational_contribution_diagnostics_base values
    ($1, $1, clock_timestamp(), clock_timestamp(), 1, 'GBP', 74.95, $2, 1, 15.58, 1, 'covered', 'GBP', 'unreconciled', 1, 2.95, 1, 'covered', 1, 1, 4.04, array['missing_or_untrusted_sold_line_cogs'])`, [orderId, lineCount]);
  const diagnostics = async orderId => (await db.query(`select resolved_sold_line_count, resolved_sold_line_cogs_gbp, exclusion_reason_codes from vault_shopify_order_operational_contribution_diagnostics where order_id = $1`, [orderId])).rows[0];

  const order1336 = "c96d9293-2308-4ce1-9210-c84e3000e5f1";
  const valentinoLine = "93061d97-9d55-467b-ae9d-15c9590b899b";
  const vaultCareLine = "e8adacf3-aa2c-4c57-bff9-d519ed10460c";
  await base(order1336, 3);
  await db.query(`insert into vault_stage1_sold_line_cogs_resolutions values
    ('dsq', $1, 15.58), ($2, $1, 11.0730)`, [order1336, valentinoLine]);
  await db.query(`insert into vault_shopify_order_lines values
    ($1, $2, 1, 'no_direct_cogs_at_sale', 'trusted_no_direct_cogs_at_sale', 'treatment-1', clock_timestamp(), 0)`, [vaultCareLine, order1336]);
  assert.deepEqual(await diagnostics(order1336), {
    resolved_sold_line_count: 3,
    resolved_sold_line_cogs_gbp: "26.6530",
    exclusion_reason_codes: [],
  });
  assert.deepEqual((await db.query(`select * from vault_stage1_sold_line_cogs_resolutions where order_line_id = $1`, [vaultCareLine])).rows, []);

  await base("stage1-precedence", 1);
  await db.query(`insert into vault_stage1_sold_line_cogs_resolutions values ('precedence-line', 'stage1-precedence', 7)`);
  await db.query(`insert into vault_shopify_order_lines values
    ('precedence-line', 'stage1-precedence', 1, 'no_direct_cogs_at_sale', 'trusted_no_direct_cogs_at_sale', 'treatment-precedence', clock_timestamp(), 0)`);
  assert.deepEqual(await diagnostics("stage1-precedence"), {
    resolved_sold_line_count: 1,
    resolved_sold_line_cogs_gbp: "7",
    exclusion_reason_codes: [],
  });

  for (const [orderId, history, snappedAt, amount] of [
    ["partial-history", null, "clock_timestamp()", 0],
    ["partial-snapshot", "treatment-2", null, 0],
    ["partial-amount", "treatment-3", "clock_timestamp()", 0.01],
  ]) {
    await base(orderId, 2);
    await db.query(`insert into vault_stage1_sold_line_cogs_resolutions values ($1 || '-direct', $1, 15.58)`, [orderId]);
    await db.query(`insert into vault_shopify_order_lines values ($1 || '-zero', $1, 1, 'no_direct_cogs_at_sale', 'trusted_no_direct_cogs_at_sale', $2, ${snappedAt ?? "null"}, $3)`, [orderId, history, amount]);
    assert.deepEqual((await diagnostics(orderId)).exclusion_reason_codes, ["missing_or_untrusted_sold_line_cogs"]);
  }

  await base("ordinary-merchandise", 2);
  await db.query(`insert into vault_stage1_sold_line_cogs_resolutions values ('ordinary-direct', 'ordinary-merchandise', 15.58)`);
  await db.query(`insert into vault_shopify_order_lines values
    ('ordinary-untrusted', 'ordinary-merchandise', 1, null, 'not_applicable', null, null, null)`);
  assert.deepEqual((await diagnostics("ordinary-merchandise")).exclusion_reason_codes, ["missing_or_untrusted_sold_line_cogs"]);
});

test("migration preserves the security-invoker contract and does not broaden Stage 1 or allocation sources", () => {
  assert.match(migration, /with \(security_barrier = true, security_invoker = true\)/);
  assert.match(migration, /and not exists \([\s\S]*vault_stage1_sold_line_cogs_resolutions/);
  assert.match(migration, /sale_time_direct_cogs_gbp = 0/);
  assert.match(migration, /grant select on public\.vault_shopify_order_operational_contribution_diagnostics to service_role/);
  assert.doesNotMatch(migration, /create or replace view public\.vault_stage1_sold_line_cogs_resolutions/);
  assert.doesNotMatch(migration, /vault_shopify_verified_product_profitability_line_allocations/);
  assert.doesNotMatch(migration, /get_verified_product_profitability_allocations_for_orders/);
});
