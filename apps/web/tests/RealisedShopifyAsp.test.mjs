import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = new URL("../../../supabase/migrations/20260927000000_canonical_realised_shopify_asp.sql", import.meta.url);
const id = (value) => `00000000-0000-0000-0000-${String(value).padStart(12, "0")}`;

async function database() {
  const db = new PGlite();
  await db.exec(`create table vault_products(id uuid primary key);
    create table vault_variants(id uuid primary key, product_id uuid not null, source text not null, source_variant_id text);
    create table vault_shopify_order_sync_runs(completed_at timestamptz not null, sync_days integer not null);
    create table vault_shopify_orders(id uuid primary key, shopify_created_at timestamptz not null, cancelled_at timestamptz, currency text not null, metadata jsonb not null default '{}'::jsonb);
    create table vault_shopify_order_lines(id uuid primary key, order_id uuid not null, shopify_variant_id text, quantity integer not null, refunded_quantity integer not null, net_line_revenue numeric not null);
    create table commercial_source(product_id uuid primary key, product_name text, product_type text, shopify_status text, supplier_id uuid, supplier_company text, inventory_strategy text, restock_enabled boolean, pack_profile text, currency text, exchange_rate_to_gbp numeric, pack_cost numeric, shipping_cost_per_pack numeric, import_cost_per_pack numeric, units_per_pack integer, landed_cost_per_pack numeric, landed_cost_per_pack_gbp numeric, landed_cost_per_unit numeric, average_selling_price numeric, estimated_gross_profit_per_unit numeric, estimated_margin_percent numeric, estimated_return_on_pack_capital_percent numeric, commercial_cost_trusted boolean, missing_commercial_requirements text[], last_supplier_price_update date, commercial_notes text, cost_created_at timestamptz, cost_updated_at timestamptz);
    create view vault_product_commercial_intelligence as select * from commercial_source;
    create view vault_product_commercial_summary as select 0::integer as total_products, 0::integer as stocked_products, 0::integer as commercially_configured_products, 0::integer as products_missing_costs, 0::numeric as commercial_completion_percentage;`);
  for (const value of [1, 2, 3, 4, 5]) await db.query("insert into vault_products values ($1)", [id(value)]);
  await db.exec(`insert into vault_variants values
    ('${id(101)}','${id(1)}','shopify','v-one'),('${id(102)}','${id(1)}','shopify','v-two'),
    ('${id(103)}','${id(2)}','shopify','v-amb'),('${id(104)}','${id(3)}','shopify','v-amb'),
    ('${id(105)}','${id(4)}','shopify','v-eur');
    insert into commercial_source select id,'Product','physical','ACTIVE','${id(500)}','Supplier','stocked',true,'', 'GBP',1,60,0,0,6,60,60,10,999,989,99,9890,true,array[]::text[],null,null,now(),now() from vault_products;
    insert into vault_shopify_order_sync_runs values (now(),7);
    insert into vault_shopify_orders values
      ('${id(201)}',now()-interval '40 days',null,'GBP','{}'),
      ('${id(202)}',now()-interval '10 days',null,'GBP','{}'),
      ('${id(203)}',now()-interval '9 days',null,'GBP','{}'),
      ('${id(204)}',now()-interval '8 days',null,'GBP','{}'),
      ('${id(205)}',now()-interval '7 days',null,'GBP','{}'),
      ('${id(206)}',now()-interval '6 days',now(),'GBP','{}'),
      ('${id(207)}',now()-interval '5 days',null,'GBP','{"test":true}'),
      ('${id(208)}',now()-interval '4 days',null,'EUR','{}'),
      ('${id(209)}',now()-interval '3 days',null,'GBP','{}');
    insert into vault_shopify_order_lines values
      ('${id(301)}','${id(202)}','v-one',2,0,80),
      ('${id(302)}','${id(203)}','v-two',2,0,70),
      ('${id(303)}','${id(204)}','v-one',2,1,35),
      ('${id(304)}','${id(205)}','v-two',1,1,0),
      ('${id(305)}','${id(206)}','v-one',1,0,100),
      ('${id(306)}','${id(207)}','v-one',1,0,100),
      ('${id(307)}','${id(208)}','v-eur',2,0,50),
      ('${id(308)}','${id(209)}','v-amb',1,0,40);`);
  await db.exec(await readFile(migration, "utf8"));
  return db;
}

test("canonical realised ASP uses discounted net revenue and refunded net units across parent styles", async (t) => {
  const db = await database(); t.after(() => db.close());
  const row = (await db.query("select * from vault_product_realised_selling_price where product_id=$1", [id(1)])).rows[0];
  assert.equal(Number(row.net_revenue_gbp), 185);
  assert.equal(Number(row.net_units_sold), 5);
  assert.equal(Number(row.realised_average_selling_price_gbp), 37, JSON.stringify(row));
  assert.equal(row.order_count, 3);
  assert.equal(row.availability, "available");
  const commercial = (await db.query("select average_selling_price, commercial_cost_trusted from vault_product_commercial_intelligence where product_id=$1", [id(1)])).rows[0];
  assert.equal(Number(commercial.average_selling_price), 37);
  assert.equal(commercial.commercial_cost_trusted, true);
});

test("canonical realised ASP reports ambiguous mapping, non-GBP-only sales, and zero sales honestly", async (t) => {
  const db = await database(); t.after(() => db.close());
  const rows = (await db.query("select product_id, availability, unavailable_reason, realised_average_selling_price_gbp from vault_product_realised_selling_price where product_id in ($1,$2,$3,$4) order by product_id", [id(2), id(3), id(4), id(5)])).rows;
  assert.deepEqual(rows.map((row) => row.unavailable_reason), ["shopify_variant_mapping_ambiguous", "shopify_variant_mapping_ambiguous", "shopify_sales_non_gbp_only", "no_net_shopify_sales"]);
  assert.ok(rows.every((row) => row.availability === "unavailable" && row.realised_average_selling_price_gbp === null));
});

test("canonical realised ASP becomes unavailable for stale or incomplete history and does not use legacy manual ASP", async (t) => {
  const db = await database(); t.after(() => db.close());
  await db.exec("update vault_shopify_order_sync_runs set completed_at=now()-interval '31 minutes'");
  let row = (await db.query("select availability, unavailable_reason from vault_product_realised_selling_price where product_id=$1", [id(1)])).rows[0];
  assert.deepEqual(row, { availability: "unavailable", unavailable_reason: "shopify_order_history_stale" });
  await db.exec("update vault_shopify_order_sync_runs set completed_at=now(); delete from vault_shopify_orders where shopify_created_at < now()-interval '30 days'");
  row = (await db.query("select availability, unavailable_reason from vault_product_realised_selling_price where product_id=$1", [id(1)])).rows[0];
  assert.deepEqual(row, { availability: "unavailable", unavailable_reason: "shopify_order_history_incomplete" });
  const commercial = (await db.query("select average_selling_price from vault_product_commercial_intelligence where product_id=$1", [id(1)])).rows[0];
  assert.equal(commercial.average_selling_price, null);
});
