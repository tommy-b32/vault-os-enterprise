import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20261032000000_verified_shopify_product_profitability.sql", root), "utf8");
const correction = await readFile(new URL("supabase/migrations/20261033000000_allocate_verified_customer_shipping_revenue.sql", root), "utf8");

test("product profitability allocates only reconcilable verified Stage 1 sales and reports coverage separately", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table vault_products(id text primary key, source text not null, source_product_id text not null, title text not null);
    create table vault_variants(id text primary key, source text not null, source_variant_id text not null, product_id text not null);
    create table vault_shopify_order_lines(
      id text primary key, order_id text not null, shopify_product_id text, shopify_variant_id text,
      cogs_quantity integer not null, net_line_revenue numeric not null,
      cogs_status text not null default 'invalid_cost', cogs_history_id text, cogs_snapshotted_at timestamptz,
      total_cogs_gbp numeric, financial_treatment_status text not null default 'not_applicable',
      financial_treatment_history_id text, financial_treatment text, financial_treatment_snapshotted_at timestamptz,
      sale_time_direct_cogs_gbp numeric
    );
    create table stage_1_contributions(
      order_id text primary key, shopify_created_at timestamptz not null, canonical_net_revenue numeric not null,
      observed_purchased_label_cost_gbp numeric not null, covered_payment_fees_gbp numeric not null,
      estimated_operational_contribution_gbp numeric not null
    );
    create table stage_1_diagnostics(order_id text primary key, exclusion_reason_codes text[] not null);
    create table vault_shopify_orders(id text primary key, shipping numeric not null default 0);
    create view vault_shopify_verified_order_operational_contributions as select * from stage_1_contributions;
    create view vault_shopify_order_operational_contribution_diagnostics as select * from stage_1_diagnostics;
    insert into vault_products values ('p-a','shopify','shopify-p-a','Product A'),('p-b','shopify','shopify-p-b','Product B'),('p-service','shopify','shopify-p-service','Service');
    insert into vault_variants values ('v-a','shopify','variant-a','p-a'),('v-b','shopify','variant-b','p-b'),('v-service','shopify','variant-service','p-service');`);
  await db.exec(migration);
  await db.exec(correction);

  const contribution = async (id, revenue, shipping, fees, result, customerShipping = 0) => {
    await db.query("insert into vault_shopify_orders values($1,$2)", [id, customerShipping]);
    return db.query("insert into stage_1_contributions values($1,'2026-09-25T12:00:00Z',$2,$3,$4,$5)", [id, revenue, shipping, fees, result]);
  };
  const diagnostic = (id, reasons = []) => db.query("insert into stage_1_diagnostics values($1,$2)", [id, reasons]);
  const merchandise = (id, variant, revenue, cogs, units = 1) => db.query(
    `insert into vault_shopify_order_lines(id,order_id,shopify_product_id,shopify_variant_id,cogs_quantity,net_line_revenue,cogs_status,cogs_history_id,cogs_snapshotted_at,total_cogs_gbp)
     values($1,$2,$3,$4,$5,$6,'trusted',$7,'2026-09-25T12:00:00Z',$8)`,
    [`line-${id}-${variant}`, id, `shopify-p-${variant === "variant-a" ? "a" : "b"}`, variant, units, revenue, `cost-${id}-${variant}`, cogs],
  );
  const service = (id, revenue) => db.query(
    `insert into vault_shopify_order_lines(id,order_id,shopify_product_id,shopify_variant_id,cogs_quantity,net_line_revenue,financial_treatment_status,financial_treatment_history_id,financial_treatment,financial_treatment_snapshotted_at,sale_time_direct_cogs_gbp)
     values($1,$2,'shopify-p-service','variant-service',1,$3,'trusted_no_direct_cogs_at_sale',$4,'no_direct_cogs_at_sale','2026-09-25T12:00:00Z',0)`,
    [`line-${id}-service`, id, revenue, `treatment-${id}`],
  );

  await t.test("single-product order allocates verified costs and reconciles contribution", async () => {
    await contribution("single", 100, 10, 5, 45); await diagnostic("single"); await merchandise("single", "variant-a", 100, 40, 2);
    const row = (await db.query(`select eligible_orders,eligible_units,eligible_net_revenue,trusted_direct_sale_time_cogs_gbp,allocated_shipping_cost_gbp,allocated_payment_fees_gbp,operational_contribution_gbp,contribution_per_eligible_unit_gbp,contribution_margin_pct from vault_shopify_verified_product_profitability where product_id='p-a'`)).rows[0];
    assert.equal(row.eligible_orders, 1); assert.equal(row.eligible_units, 2);
    assert.equal(Number(row.eligible_net_revenue), 100); assert.equal(Number(row.trusted_direct_sale_time_cogs_gbp), 40);
    assert.equal(Number(row.allocated_shipping_cost_gbp), 10); assert.equal(Number(row.allocated_payment_fees_gbp), 5);
    assert.equal(Number(row.operational_contribution_gbp), 45); assert.equal(Number(row.contribution_per_eligible_unit_gbp), 22.5);
    assert.equal(Number(row.contribution_margin_pct), 45);
  });

  await t.test("unequal two-product order allocates shipping and payment fees proportionally without drift", async () => {
    await contribution("split", 100, 10, 4, 51); await diagnostic("split");
    await merchandise("split", "variant-a", 25, 5); await merchandise("split", "variant-b", 75, 30);
    const rows = (await db.query(`select product_id,allocated_shipping_cost_gbp,allocated_payment_fees_gbp,operational_contribution_gbp from vault_shopify_verified_product_profitability_line_allocations where order_id='split' order by product_id`)).rows;
    assert.deepEqual(rows.map(row => ({ product_id: row.product_id, shipping: Number(row.allocated_shipping_cost_gbp), fees: Number(row.allocated_payment_fees_gbp), contribution: Number(row.operational_contribution_gbp) })), [
      { product_id: "p-a", shipping: 2.5, fees: 1, contribution: 16.5 }, { product_id: "p-b", shipping: 7.5, fees: 3, contribution: 34.5 },
    ]);
    const totals = (await db.query(`select sum(allocated_shipping_cost_gbp) shipping,sum(allocated_payment_fees_gbp) fees,sum(operational_contribution_gbp) contribution from vault_shopify_verified_product_profitability_line_allocations where order_id='split'`)).rows[0];
    assert.deepEqual({ shipping: Number(totals.shipping), fees: Number(totals.fees), contribution: Number(totals.contribution) }, { shipping: 10, fees: 4, contribution: 51 });
  });

  await t.test("verified customer shipping revenue is separate, proportional, and reconciles contribution", async () => {
    await contribution("customer-shipping", 73.77, 3.77, 3.98, 40.98, 3.77); await diagnostic("customer-shipping");
    await merchandise("customer-shipping", "variant-a", 35, 12.52); await merchandise("customer-shipping", "variant-b", 35, 12.52);
    const rows = (await db.query("select allocated_customer_shipping_revenue_gbp,allocated_total_revenue_gbp,allocated_shipping_cost_gbp,operational_contribution_gbp from vault_shopify_verified_product_profitability_line_allocations where order_id='customer-shipping' order by product_id")).rows;
    assert.deepEqual(rows.map(row => [Number(row.allocated_customer_shipping_revenue_gbp), Number(row.allocated_total_revenue_gbp), Number(row.allocated_shipping_cost_gbp), Number(row.operational_contribution_gbp)]), [[1.885,36.885,1.885,20.49],[1.885,36.885,1.885,20.49]]);
    const total = (await db.query("select sum(allocated_total_revenue_gbp) revenue,sum(operational_contribution_gbp) contribution from vault_shopify_verified_product_profitability_line_allocations where order_id='customer-shipping'")).rows[0];
    assert.equal(Number(total.revenue),73.77); assert.equal(Number(total.contribution),40.98);
  });

  await t.test("governed no-direct-cost service line uses its immutable sale-time zero", async () => {
    await contribution("service", 10, 1, 0.5, 8.5); await diagnostic("service"); await service("service", 10);
    const row = (await db.query(`select trusted_direct_sale_time_cogs_gbp,operational_contribution_gbp from vault_shopify_verified_product_profitability_line_allocations where order_id='service'`)).rows[0];
    assert.equal(Number(row.trusted_direct_sale_time_cogs_gbp), 0); assert.equal(Number(row.operational_contribution_gbp), 8.5);
  });

  await t.test("excluded sales remain coverage only and never receive fabricated contribution", async () => {
    await diagnostic("excluded", ["missing_or_untrusted_sold_line_cogs"]);
    await db.query("insert into vault_shopify_order_lines(id,order_id,shopify_product_id,shopify_variant_id,cogs_quantity,net_line_revenue) values('line-excluded','excluded','shopify-p-b','variant-b',1,50)");
    assert.equal((await db.query("select count(*)::int count from vault_shopify_verified_product_profitability_line_allocations where order_id='excluded'")).rows[0].count, 0);
    const coverage = (await db.query(`select total_canonical_sold_orders,eligible_orders,excluded_orders,excluded_units,excluded_revenue from vault_shopify_product_profitability_coverage where product_id='p-b'`)).rows[0];
    assert.deepEqual({ ...coverage, total_canonical_sold_orders: Number(coverage.total_canonical_sold_orders), eligible_orders: Number(coverage.eligible_orders), excluded_orders: Number(coverage.excluded_orders), excluded_units: Number(coverage.excluded_units), excluded_revenue: Number(coverage.excluded_revenue) }, { total_canonical_sold_orders: 3, eligible_orders: 2, excluded_orders: 1, excluded_units: 1, excluded_revenue: 50 });
  });

  await t.test("zero or non-reconciling allocation denominators fail closed without changing Stage 1 coverage", async () => {
    await contribution("zero", 0, 0, 0, 0); await diagnostic("zero"); await merchandise("zero", "variant-a", 0, 0);
    await contribution("mismatch", 101, 1, 1, 99); await diagnostic("mismatch"); await merchandise("mismatch", "variant-b", 100, 0);
    assert.equal((await db.query("select count(*)::int count from vault_shopify_verified_product_profitability_line_allocations where order_id in ('zero','mismatch')")).rows[0].count, 0);
    const coverage = (await db.query(`select eligible_orders,allocation_unavailable_eligible_orders from vault_shopify_product_profitability_coverage where product_id='p-a'`)).rows[0];
    assert.deepEqual({ eligible_orders: Number(coverage.eligible_orders), allocation_unavailable_eligible_orders: Number(coverage.allocation_unavailable_eligible_orders) }, { eligible_orders: 4, allocation_unavailable_eligible_orders: 1 });
  });

  await t.test("views are service-role-only", async () => {
    const grants = (await db.query(`select has_table_privilege('anon','vault_shopify_verified_product_profitability','select') anon_read,
      has_table_privilege('authenticated','vault_shopify_verified_product_profitability','select') authenticated_read,
      has_table_privilege('service_role','vault_shopify_verified_product_profitability','select') service_read`)).rows[0];
    assert.deepEqual(grants, { anon_read: false, authenticated_read: false, service_read: true });
  });
});
