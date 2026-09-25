import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const operational = await read("supabase/migrations/20261028000000_verified_shopify_order_operational_contribution.sql");
const treatment = await read("supabase/migrations/20261031000000_governed_financial_treatments.sql");
const vaultCareProduct = "00000000-0000-0000-0000-000000000001";
const plainServiceProduct = "00000000-0000-0000-0000-000000000002";
const governedServiceProduct = "00000000-0000-0000-0000-000000000003";
const merchandiseProduct = "00000000-0000-0000-0000-000000000004";

test("governed financial treatment is explicit, immutable, effective-dated, and preserves Stage 1 fail-closed COGS", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create function gen_random_uuid() returns uuid language sql as $$
      select (substr(md5(random()::text),1,8)||'-'||substr(md5(random()::text),1,4)||'-4'||substr(md5(random()::text),1,3)||'-a'||substr(md5(random()::text),1,3)||'-'||substr(md5(random()::text),1,12))::uuid
    $$; create role anon; create role authenticated; create role service_role;
    create table vault_products(id uuid primary key, source text not null, source_product_id text not null unique, title text);
    create table vault_variants(id uuid primary key default gen_random_uuid(), product_id uuid not null references vault_products(id), source text not null, source_variant_id text not null unique);
    create table vault_product_settings(product_id uuid primary key references vault_products(id), inventory_strategy text not null);
    create table vault_product_cost_versions(id uuid primary key);
    create table vault_shopify_orders(id text primary key, source text, shopify_order_id text, order_number text, shopify_created_at timestamptz, shopify_updated_at timestamptz, currency text, cancelled_at timestamptz, metadata jsonb);
    create table vault_shopify_verified_order_financials(order_id text, shopify_order_id text, shopify_created_at timestamptz, order_source_updated_at timestamptz, currency text, canonical_net_revenue numeric);
    create table vault_shopify_order_lines(id text primary key, order_id text, source text, shopify_line_item_id text, shopify_product_id text, shopify_variant_id text, quantity integer, refunded_quantity integer, cogs_quantity integer, cogs_status text, cogs_history_id text, cogs_snapshotted_at timestamptz, unit_cogs_gbp numeric, total_cogs_gbp numeric);
    create table vault_shopify_shipping_costs(order_id text, shopify_order_id text, source_state text, currency text, accounting_status text, label_count integer, label_cost_gbp numeric);
    create table vault_shopify_payment_fee_coverage(order_id text, shopify_order_id text, coverage_state text);
    create table vault_shopify_payment_fee_records(order_id text, shopify_order_id text, gateway text, transaction_kind text, transaction_status text, fee_amount numeric, fee_currency text, tax_amount numeric, tax_currency text, source_classification text, reconciliation_state text, counts_toward_profit boolean);
    insert into vault_products values
      ('${vaultCareProduct}','shopify','gid://shopify/Product/16145627939194','VaultCare'),
      ('${plainServiceProduct}','shopify','gid://shopify/Product/plain-service','Plain service'),
      ('${governedServiceProduct}','shopify','gid://shopify/Product/governed-service','Governed service'),
      ('${merchandiseProduct}','shopify','gid://shopify/Product/merchandise','Merchandise');
    insert into vault_variants(product_id,source,source_variant_id) values
      ('${vaultCareProduct}','shopify','vaultcare-v'), ('${plainServiceProduct}','shopify','plain-service-v'),
      ('${governedServiceProduct}','shopify','governed-service-v'), ('${merchandiseProduct}','shopify','merch-v');
    insert into vault_product_settings values ('${vaultCareProduct}','service'),('${plainServiceProduct}','service'),('${governedServiceProduct}','service'),('${merchandiseProduct}','stocked');`);
  await db.exec(operational);
  await db.exec(treatment);
  await db.query(`insert into vault_product_financial_treatment_versions(product_id,effective_from,treatment,provenance)
    values($1, clock_timestamp(), 'governed_service_cost_required', 'test governed service')`, [governedServiceProduct]);
  await db.query(`insert into vault_product_financial_treatment_versions(product_id,effective_from,treatment,provenance)
    values($1, clock_timestamp(), 'merchandise_cogs_required', 'test merchandise')`, [merchandiseProduct]);

  const future = "2099-01-01T00:00:00Z";
  const order = async (id, revenue = 100, soldAt = future) => {
    await db.query("insert into vault_shopify_orders(id,source,shopify_order_id,order_number,shopify_created_at,shopify_updated_at,currency,cancelled_at,metadata) values($1,'shopify',$2,$1,$3,$3,'GBP',null,'{" + '"test":false' + "}')", [id, `gid://shopify/Order/${id}`, soldAt]);
    await db.query("insert into vault_shopify_verified_order_financials values($1,$2,$3,$3,'GBP',$4)", [id, `gid://shopify/Order/${id}`, soldAt, revenue]);
    await db.query("insert into vault_shopify_shipping_costs values($1,$2,'covered','GBP','unreconciled',1,7)", [id, `gid://shopify/Order/${id}`]);
    await db.query("insert into vault_shopify_payment_fee_coverage values($1,$2,'covered')", [id, `gid://shopify/Order/${id}`]);
    await db.query("insert into vault_shopify_payment_fee_records values($1,$2,'shopify_payments','SALE','SUCCESS',3,'GBP',1,'GBP','shopify_payments','covered',true)", [id, `gid://shopify/Order/${id}`]);
  };
  const line = (id, variant, options = {}) => {
    const { trusted = false, refunded = 0, quantity = 1, cost = 30 } = options;
    return db.query(`insert into vault_shopify_order_lines(id,order_id,source,shopify_line_item_id,shopify_product_id,shopify_variant_id,quantity,refunded_quantity,cogs_quantity,cogs_status,cogs_history_id,cogs_snapshotted_at,unit_cogs_gbp,total_cogs_gbp)
      values($1,$2,'shopify',$1,null,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [
      `line-${id}-${variant}`, id, variant, quantity, refunded, quantity - refunded,
      trusted ? "trusted" : "invalid_cost", trusted ? `history-${id}-${variant}` : null,
      trusted ? future : null, trusted ? cost / Math.max(quantity - refunded, 1) : null, trusted ? cost : null,
    ]);
  };
  const reasons = async id => (await db.query("select exclusion_reason_codes from vault_shopify_order_operational_contribution_diagnostics where order_id=$1", [id])).rows[0].exclusion_reason_codes;

  await t.test("merchandise with trusted immutable COGS passes and missing COGS fails", async () => {
    await order("merch-trusted"); await line("merch-trusted", "merch-v", { trusted: true });
    assert.deepEqual(await reasons("merch-trusted"), []);
    await order("merch-fails"); await line("merch-fails", "merch-v");
    assert.deepEqual(await reasons("merch-fails"), ["missing_or_untrusted_sold_line_cogs"]);
  });

  await t.test("service inventory strategy alone remains fail-closed", async () => {
    await order("plain-service"); await line("plain-service", "plain-service-v");
    assert.deepEqual(await reasons("plain-service"), ["missing_or_untrusted_sold_line_cogs"]);
  });

  await t.test("governed service cost remains fail-closed without trusted cost", async () => {
    await order("governed-service"); await line("governed-service", "governed-service-v");
    assert.deepEqual(await reasons("governed-service"), ["missing_or_untrusted_sold_line_cogs"]);
  });

  await t.test("treatment effective after sale does not reinterpret historical line", async () => {
    await order("vaultcare-before", 104.95, "2000-01-01T00:00:00Z"); await line("vaultcare-before", "vaultcare-v");
    assert.deepEqual(await reasons("vaultcare-before"), ["missing_or_untrusted_sold_line_cogs"]);
  });

  await t.test("trusted explicit sale-time zero passes without fabricating product COGS", async () => {
    await order("vaultcare", 104.95); await line("vaultcare", "vaultcare-v");
    const vaultLine = (await db.query("select financial_treatment,financial_treatment_status,sale_time_direct_cogs_gbp,cogs_history_id from vault_shopify_order_lines where order_id='vaultcare'")).rows[0];
    assert.deepEqual(vaultLine, { financial_treatment: "no_direct_cogs_at_sale", financial_treatment_status: "trusted_no_direct_cogs_at_sale", sale_time_direct_cogs_gbp: "0.00", cogs_history_id: null });
    assert.deepEqual(await reasons("vaultcare"), []);
    assert.deepEqual((await db.query("select canonical_net_revenue,trusted_net_sold_line_cogs_gbp,estimated_operational_contribution_gbp from vault_shopify_verified_order_operational_contributions where order_id='vaultcare'")).rows[0], { canonical_net_revenue: "104.95", trusted_net_sold_line_cogs_gbp: "0.00", estimated_operational_contribution_gbp: "93.95" });
  });

  await t.test("effective-date boundary and multiple versions resolve deterministically", async () => {
    await db.query(`insert into vault_product_financial_treatment_versions(product_id,effective_from,treatment,provenance)
      values($1,'2099-02-01T00:00:00Z','no_direct_cogs_at_sale','exact-boundary')`, [plainServiceProduct]);
    await order("boundary-before", 4.95, "2099-01-31T23:59:59Z"); await line("boundary-before", "plain-service-v");
    await order("boundary-exact", 4.95, "2099-02-01T00:00:00Z"); await line("boundary-exact", "plain-service-v");
    assert.deepEqual(await reasons("boundary-before"), ["missing_or_untrusted_sold_line_cogs"]);
    assert.deepEqual(await reasons("boundary-exact"), []);
    await assert.rejects(db.query(`insert into vault_product_financial_treatment_versions(product_id,effective_from,treatment,provenance)
      values($1,'2099-02-01T00:00:00Z','merchandise_cogs_required','ambiguous')`, [plainServiceProduct]), /duplicate key/);
  });

  await t.test("later treatment and repeated collection cannot rewrite a zero-treatment snapshot", async () => {
    await db.query(`insert into vault_product_financial_treatment_versions(product_id,effective_from,treatment,provenance)
      values($1,'2099-01-02T00:00:00Z','merchandise_cogs_required','later test treatment')`, [vaultCareProduct]);
    await db.query("update vault_shopify_order_lines set quantity=1,cogs_status='trusted',cogs_history_id='later-cost',cogs_snapshotted_at=clock_timestamp(),unit_cogs_gbp=99,total_cogs_gbp=99 where order_id='vaultcare'");
    assert.deepEqual((await db.query("select financial_treatment,financial_treatment_status,sale_time_direct_cogs_gbp from vault_shopify_order_lines where order_id='vaultcare'")).rows[0], { financial_treatment: "no_direct_cogs_at_sale", financial_treatment_status: "trusted_no_direct_cogs_at_sale", sale_time_direct_cogs_gbp: "0.00" });
    assert.equal((await db.query("select trusted_net_sold_line_cogs_gbp from vault_shopify_verified_order_operational_contributions where order_id='vaultcare'")).rows[0].trusted_net_sold_line_cogs_gbp, "0.00");
    await order("vaultcare-later", 4.95, "2099-01-03T00:00:00Z"); await line("vaultcare-later", "vaultcare-v");
    assert.deepEqual(await reasons("vaultcare-later"), ["missing_or_untrusted_sold_line_cogs"], "the later merchandise treatment resolves for later sales");
  });

  await t.test("mixed merchandise and service preserves all canonical revenue", async () => {
    await order("mixed", 104.95); await line("mixed", "merch-v", { trusted: true, cost: 30 }); await line("mixed", "vaultcare-v");
    assert.deepEqual(await reasons("mixed"), []);
    assert.deepEqual((await db.query("select trusted_net_sold_line_cogs_gbp,estimated_operational_contribution_gbp from vault_shopify_verified_order_operational_contributions where order_id='mixed'")).rows[0], { trusted_net_sold_line_cogs_gbp: "30.00", estimated_operational_contribution_gbp: "63.95" });
  });

  await t.test("refund and cancellation preserve the original treatment snapshot", async () => {
    await db.query("update vault_shopify_order_lines set refunded_quantity=1,cogs_quantity=0 where order_id='vaultcare'");
    const afterRefund = (await db.query("select financial_treatment,financial_treatment_status,sale_time_direct_cogs_gbp from vault_shopify_order_lines where order_id='vaultcare'")).rows[0];
    assert.deepEqual(afterRefund, { financial_treatment: "no_direct_cogs_at_sale", financial_treatment_status: "trusted_no_direct_cogs_at_sale", sale_time_direct_cogs_gbp: "0.00" });
    await db.query("update vault_shopify_orders set cancelled_at=clock_timestamp() where id='vaultcare'");
    assert.deepEqual(await reasons("vaultcare"), ["cancelled_order", "no_net_sold_lines"]);
    assert.equal((await db.query("select financial_treatment_status from vault_shopify_order_lines where order_id='vaultcare'")).rows[0].financial_treatment_status, "trusted_no_direct_cogs_at_sale");
  });

  await t.test("#1283-style independent merchandise gap remains excluded while #1264-style sole VaultCare blocker passes", async () => {
    await order("1283-style", 64.95); await line("1283-style", "vaultcare-v"); await line("1283-style", "merch-v");
    assert.deepEqual(await reasons("1283-style"), ["missing_or_untrusted_sold_line_cogs"]);
    await order("1264-style", 4.95); await line("1264-style", "vaultcare-v");
    assert.deepEqual(await reasons("1264-style"), []);
  });

  await t.test("versions, snapshots, and service-only dry-run access are immutable and restricted", async () => {
    await assert.rejects(db.query("update vault_product_financial_treatment_versions set treatment='merchandise_cogs_required'"), /immutable/);
    await assert.rejects(db.query("delete from vault_product_financial_treatment_versions"), /immutable/);
    const grants = (await db.query("select has_table_privilege('anon','vault_product_financial_treatment_versions','select') anon_table, has_table_privilege('authenticated','vault_product_financial_treatment_versions','select') authenticated_table, has_table_privilege('service_role','vault_product_financial_treatment_versions','select') service_table, has_table_privilege('anon','vault_shopify_financial_treatment_reconciliation_dry_run','select') anon_report, has_table_privilege('service_role','vault_shopify_financial_treatment_reconciliation_dry_run','select') service_report")).rows[0];
    assert.deepEqual(grants, { anon_table: false, authenticated_table: false, service_table: true, anon_report: false, service_report: true });
    const functionGrants = (await db.query("select has_function_privilege('anon','append_product_financial_treatment(uuid,text,timestamp with time zone,text)','EXECUTE') anon_append, has_function_privilege('authenticated','append_product_financial_treatment(uuid,text,timestamp with time zone,text)','EXECUTE') authenticated_append, has_function_privilege('service_role','append_product_financial_treatment(uuid,text,timestamp with time zone,text)','EXECUTE') service_append")).rows[0];
    assert.deepEqual(functionGrants, { anon_append: false, authenticated_append: false, service_append: true });
    assert.equal((await db.query("select relrowsecurity from pg_class where relname='vault_product_financial_treatment_versions'")).rows[0].relrowsecurity, true);
    await assert.rejects(db.query(`select append_product_financial_treatment($1,'no_direct_cogs_at_sale',clock_timestamp()-interval '1 day','backdate')`, [plainServiceProduct]), /cannot be backdated/);
  });

  await t.test("unrelated historical merchandise remains fail-closed and no product-cost version is fabricated", async () => {
    await order("historic-merch", 100, "2000-01-01T00:00:00Z"); await line("historic-merch", "merch-v");
    assert.deepEqual(await reasons("historic-merch"), ["missing_or_untrusted_sold_line_cogs"]);
    assert.equal((await db.query("select count(*)::int count from vault_product_cost_versions")).rows[0].count, 0);
    assert.doesNotMatch(treatment, /insert into public\.vault_product_cost_versions/i);
  });
});
