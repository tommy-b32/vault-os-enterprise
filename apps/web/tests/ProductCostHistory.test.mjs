import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const product = "00000000-0000-0000-0000-000000000001";
const supplier = "00000000-0000-0000-0000-000000000002";

test("authoritative cost versions and ingestion execute in PostgreSQL", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table vault_products(id uuid primary key, source text, source_product_id text);
    create table vault_suppliers(id uuid primary key);
    create table vault_variants(id uuid primary key default gen_random_uuid(), product_id uuid references vault_products(id), source text, source_variant_id text, unique(source,source_variant_id));
    create table vault_product_settings(id uuid primary key default gen_random_uuid(), product_id uuid unique references vault_products(id), supplier_id uuid references vault_suppliers(id), inventory_strategy text, pack_profile text, restock_enabled boolean);
    insert into vault_products values('${product}','shopify','product-1');
    insert into vault_suppliers values('${supplier}');
    insert into vault_variants(product_id,source,source_variant_id) values('${product}','shopify','variant-1');
    insert into vault_product_settings(product_id,supplier_id,inventory_strategy,pack_profile,restock_enabled) values('${product}','${supplier}','stocked','polo_6_piece',true);
    create view vault_product_master as select p.id product_id, 'Test'::text product_name, 'Shirt'::text product_type, 'ACTIVE'::text status, s.supplier_id, 'Supplier'::text supplier_company, s.inventory_strategy, s.restock_enabled, s.pack_profile from vault_products p left join vault_product_settings s on s.product_id=p.id;
  `);
  // Execute existing canonical calculation SQL, not a test reimplementation of its formula.
  await db.exec(await read("database/015_product_cost_intelligence.sql"));
  await db.exec(await read("database/019_product_cost_currency.sql"));
  await db.exec(await read("supabase/migrations/20260803000000_shopify_order_ingestion.sql"));
  await db.exec(`update vault_product_costs set pack_cost=48, units_per_pack=6, average_selling_price=30, created_at='2020-01-01', updated_at='2020-01-01' where product_id='${product}';`);
  const before = (await db.query("select clock_timestamp() at")).rows[0].at;
  await db.exec(await read("supabase/migrations/20260907120000_product_cost_versions_and_order_cogs.sql"));
  const versions = async () => (await db.query("select * from vault_product_cost_versions order by effective_from")).rows;
  const initial = (await versions())[0];
  const addLine = async (key, soldAt, variant = "variant-1", quantity = 3) => {
    const order = (await db.query(`insert into vault_shopify_orders(source,shopify_order_id,order_number,order_name,shopify_created_at,shopify_updated_at,currency,subtotal,discounts,shipping,tax,refunds,gross_total,net_revenue)
      values('shopify',$1,$1,$1,$2,$2,'GBP',100,0,0,0,0,100,100) returning id`, [key, soldAt])).rows[0];
    return (await db.query(`insert into vault_shopify_order_lines(order_id,source,shopify_line_item_id,shopify_product_id,shopify_variant_id,title,sku,quantity,unit_price,discount_allocation,net_line_revenue)
      values($1,'shopify',$2,'product-1',$3,'Same title','Same SKU',$4,30,0,90) returning *`, [order.id, key, variant, quantity])).rows[0];
  };
  let first;
  await t.test("deployment baseline is forward-only and old sales remain uncosted", async () => {
    assert.ok(Date.parse(initial.effective_from) >= Date.parse(before));
    assert.equal(initial.reason, "deployment_baseline");
    assert.equal(Number(initial.unit_cogs_gbp), 8);
    const old = await addLine("old", "2020-01-02T00:00:00Z");
    assert.equal(old.cogs_status, "no_effective_cost");
    assert.equal(old.unit_cogs_gbp, null);
  });
  await t.test("exact variant resolves baseline and quantity multiplies numeric unit cost", async () => {
    first = await addLine("first", initial.effective_from);
    assert.equal(first.cogs_status, "trusted");
    assert.equal(first.cogs_history_id, initial.id);
    assert.equal(Number(first.total_cogs_gbp), 24);
    assert.equal(first.cogs_quantity, 3);
  });
  await t.test("current cost changes version costs without changing old sale lookup", async () => {
    await db.exec(`update vault_product_costs set pack_cost=60 where product_id='${product}'`);
    const next = (await versions()).at(-1);
    assert.equal(Number(next.unit_cogs_gbp), 10);
    assert.equal(Number((await addLine("earlier", initial.effective_from)).unit_cogs_gbp), 8);
    assert.equal(Number((await addLine("later", next.effective_from)).unit_cogs_gbp), 10);
  });
  await t.test("retry/upsert preserves the historical snapshot; refunds update only net quantity", async () => {
    const result = (await db.query(`insert into vault_shopify_order_lines(order_id,source,shopify_line_item_id,shopify_product_id,shopify_variant_id,title,quantity,unit_price,discount_allocation,net_line_revenue)
      values($1,'shopify','first','product-1','variant-1','Same title',3,30,0,90)
      on conflict(source,shopify_line_item_id) do update set quantity=excluded.quantity returning *`, [first.order_id])).rows[0];
    assert.equal(result.cogs_history_id, first.cogs_history_id);
    assert.equal(String(result.cogs_snapshotted_at), String(first.cogs_snapshotted_at));
    const refunded = (await db.query("update vault_shopify_order_lines set refunded_quantity=1, unit_cogs_gbp=999 where id=$1 returning *", [first.id])).rows[0];
    assert.equal(Number(refunded.unit_cogs_gbp), 8);
    assert.equal(refunded.cogs_quantity, 2);
    assert.equal(Number(refunded.total_cogs_gbp), 16);
  });
  await t.test("identical cost-save retries do not append duplicate versions", async () => {
    const count = (await versions()).length;
    await db.exec(`insert into vault_product_costs(product_id,pack_cost) values('${product}',60)
      on conflict(product_id) do update set pack_cost=excluded.pack_cost`);
    await db.exec(`update vault_product_costs set pack_cost=60 where product_id='${product}'`);
    assert.equal((await versions()).length, count);
  });
  await t.test("settings affecting canonical pack cost also append history", async () => {
    await db.exec(`update vault_product_costs set units_per_pack=null where product_id='${product}'; update vault_product_settings set pack_profile='tee_5_piece' where product_id='${product}';`);
    assert.equal(Number((await versions()).at(-1).unit_cogs_gbp), 12);
  });
  await t.test("missing exact mapping never falls back to identical title or SKU", async () => {
    const missing = await addLine("missing", initial.effective_from, "unknown-variant");
    assert.equal(missing.cogs_status, "missing_variant");
    assert.equal(missing.total_cogs_gbp, null);
  });
  await t.test("unavailable cost versions block fallback to older valid costs", async () => {
    await db.exec(`update vault_product_costs set pack_cost=null where product_id='${product}'`);
    const latest = (await versions()).at(-1);
    assert.equal(latest.cost_status, "unavailable");
    assert.equal((await addLine("invalid", latest.effective_from)).cogs_status, "invalid_cost");
    assert.equal(Number((await addLine("still-earlier", initial.effective_from)).unit_cogs_gbp), 8);
  });
  await t.test("history is immutable and not writable by application roles", async () => {
    await assert.rejects(db.exec("update vault_product_cost_versions set unit_cogs_gbp=99"), /immutable/);
    await assert.rejects(db.exec("delete from vault_product_cost_versions"), /immutable/);
    await db.exec("set role service_role");
    await assert.rejects(db.exec("insert into vault_product_cost_versions default values"), /permission denied/);
    await db.exec("reset role");
  });
  await t.test("service-role cost edits append atomically and cannot call the history writer directly", async () => {
    await db.exec("grant select, update on vault_product_costs to service_role; set role service_role");
    await db.exec(`update vault_product_costs set pack_cost=70 where product_id='${product}'`);
    await assert.rejects(db.exec(`select append_product_cost_version('${product}','forged')`), /permission denied/);
    await db.exec("reset role");
    assert.equal(Number((await versions()).at(-1).unit_cogs_gbp), 14);
    const count = (await versions()).length;
    await db.exec(`begin; update vault_product_costs set pack_cost=80 where product_id='${product}'; rollback;`);
    assert.equal((await versions()).length, count);
  });
  await t.test("cost deletion records unavailable without erasing past history", async () => {
    await db.exec(`delete from vault_product_costs where product_id='${product}'`);
    assert.equal((await versions()).at(-1).cost_status, "unavailable");
    assert.equal(Number((await addLine("after-delete-old-sale", initial.effective_from)).unit_cogs_gbp), 8);
  });
  await t.test("a new product cost gets its own non-retroactive creation version and explicit zero can be trusted", async () => {
    await db.exec(`update vault_product_settings set inventory_strategy='service' where product_id='${product}';
      insert into vault_product_costs(product_id,supplier_id,pack_cost,units_per_pack,average_selling_price) values('${product}','${supplier}',0,6,30);`);
    const free = (await versions()).at(-1);
    assert.equal(free.cost_status, "trusted");
    assert.equal(Number(free.unit_cogs_gbp), 0);
    const line = await addLine("free", free.effective_from);
    assert.equal(line.cogs_status, "trusted");
    assert.equal(Number(line.total_cogs_gbp), 0);
  });
  await t.test("daily COGS requires every net sold line and uses London dates", async () => {
    const today = new Date().toISOString();
    const todayLine = await addLine("aggregate-trusted", initial.effective_from, "variant-1", 5);
    // Isolate these orders using the same canonical test-order filter as trading.
    await db.exec("update vault_shopify_orders set metadata='{" + '"test":true' + "}'");
    await db.query("update vault_shopify_orders set metadata=$1 where id=$2", [{ test: false }, todayLine.order_id]);
    const query = async at => (await db.query("select * from get_shopify_daily_cogs($1)", [at])).rows[0];
    let total = await query(today);
    assert.equal(Number(total.total_cogs_gbp), 40);
    assert.equal(Number(total.total_units), 5);
    assert.equal(Number(total.missing_cost_lines), 0);
    const missing = await addLine("aggregate-missing", initial.effective_from, "missing-variant", 1);
    await db.query("update vault_shopify_orders set metadata=$1 where id=$2", [{ test: false }, missing.order_id]);
    total = await query(today);
    assert.equal(total.total_cogs_gbp, null);
    assert.equal(Number(total.costed_units), 5);
    assert.equal(Number(total.total_units), 6);
    assert.equal(Number(total.missing_cost_lines), 1);
    await db.query("update vault_shopify_order_lines set refunded_quantity=1 where id=$1", [missing.id]);
    assert.equal(Number((await query(today)).total_cogs_gbp), 40);
    // Stored snapshots stay frozen. Move test order dates only to exercise UTC/London bounds.
    await db.query("update vault_shopify_orders set shopify_created_at='2026-03-29T23:30:00Z' where id=$1", [todayLine.order_id]);
    assert.equal(Number((await query("2026-03-30T10:00:00Z")).total_cogs_gbp), 40);
    assert.equal(Number((await query("2026-03-29T10:00:00Z")).total_cogs_gbp), 0);
    await db.query("update vault_shopify_orders set cancelled_at=clock_timestamp() where id=$1", [todayLine.order_id]);
    assert.equal(Number((await query("2026-03-30T10:00:00Z")).total_cogs_gbp), 0);
  });
});
