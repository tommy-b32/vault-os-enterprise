import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const migration = await readFile(new URL("../../../supabase/migrations/20260914000000_fixed_pack_purchase_order_allocations.sql", import.meta.url), "utf8");
const container = `vault-3d5b3a-${process.pid}`;
let started = false;
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
function docker(args, input) { const result = spawnSync("docker", args, { input, encoding: "utf8" }); if (result.status) throw Error(result.stderr || result.stdout); return result.stdout.trim(); }
function sql(text) { return docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "phase3d5b3a", "-t", "-A"], text); }

test("fixed-pack PO allocation and audit schema preserve canonical quantities", async (t) => {
  t.after(() => { if (started) spawnSync("docker", ["rm", "-f", container]); });
  docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=x", "-e", "POSTGRES_DB=phase3d5b3a", "postgres:17"]); started = true;
  for (let attempt = 0; attempt < 40; attempt++) { try { sql("select 1"); break; } catch { if (attempt === 39) throw Error("database not ready"); await new Promise((resolve) => setTimeout(resolve, 250)); } }
  sql(`create extension pgcrypto;create role anon;create role authenticated;create table public.vault_operators(id uuid primary key);create table public.vault_purchase_orders(id uuid primary key default gen_random_uuid());create table public.vault_variants(id uuid primary key);create table public.vault_purchase_order_lines(id uuid primary key default gen_random_uuid(),purchase_order_id uuid not null references public.vault_purchase_orders(id),supplier_id uuid not null,style_id text not null,product_name text not null,recommended_packs integer not null check(recommended_packs>0),recommended_units integer null,units_per_pack integer null,source_recommendation_type text not null default 'advisor',unique(purchase_order_id,style_id));create function public.set_vault_commercial_updated_at() returns trigger language plpgsql as $$begin new.updated_at:=now();return new;end;$$;insert into public.vault_operators values('${id(1)}');insert into public.vault_purchase_orders values('${id(10)}');insert into public.vault_variants values('${id(20)}'),('${id(21)}'),('${id(22)}'),('${id(23)}');`);
  sql(migration);
  const line = (n, packs = 2, units = 6, perPack = 3) => `insert into public.vault_purchase_order_lines(id,purchase_order_id,supplier_id,style_id,product_name,recommended_packs,recommended_units,units_per_pack,source_recommendation_type) values('${id(n)}','${id(10)}','${id(2)}','${id(n)}::Default','Product',${packs},${units},${perPack},'fixed_pack_purchase_recommendation')`;
  const allocation = (lineId, variantId, size, unitsPerPack, orderedUnits) => `insert into public.vault_purchase_order_line_size_allocations(purchase_order_line_id,parent_product_id,model_design,normalized_size,variant_id,shopify_variant_id_snapshot,shopify_inventory_item_id_snapshot,units_per_pack,ordered_units) values('${id(lineId)}','${id(30)}','Default','${size}','${id(variantId)}','shopify-${variantId}','inventory-${variantId}',${unitsPerPack},${orderedUnits})`;
  sql(`${line(100)};begin;${allocation(100, 20, "S", 1, 2)};${allocation(100, 21, "M", 2, 4)};commit;`);
  assert.equal(sql(`select count(*) from public.vault_purchase_order_line_size_allocations where purchase_order_line_id='${id(100)}'`), "2");
  sql(`begin;update public.vault_purchase_order_lines set product_name='Updated product' where id='${id(100)}';update public.vault_purchase_order_line_size_allocations set model_design='Default' where purchase_order_line_id='${id(100)}' and normalized_size='S';commit;`);
  assert.throws(() => sql(`begin;delete from public.vault_purchase_order_line_size_allocations where purchase_order_line_id='${id(100)}' and normalized_size='S';commit;`));
  assert.throws(() => sql(`begin;${allocation(100, 22, "S", 1, 2)};commit;`));
  assert.throws(() => sql(`begin;${allocation(100, 20, "L", 1, 2)};commit;`));
  for (const [index, [unitsPerPack, orderedUnits]] of [[0, 2], [-1, 2], [1, 0], [1, -1]].entries()) assert.throws(() => sql(`begin;${line(110 + index)};${allocation(110 + index, 22, "L", unitsPerPack, orderedUnits)};commit;`));
  assert.throws(() => sql(`begin;${line(120)};insert into public.vault_purchase_order_line_size_allocations(purchase_order_line_id,parent_product_id,model_design,normalized_size,variant_id,shopify_variant_id_snapshot,shopify_inventory_item_id_snapshot,units_per_pack,ordered_units) values('${id(120)}','${id(30)}',' ','L','${id(22)}','shopify-22','inventory-22',1,2);commit;`));
  assert.throws(() => sql(`begin;${line(121)};insert into public.vault_purchase_order_line_size_allocations(purchase_order_line_id,parent_product_id,model_design,normalized_size,variant_id,shopify_variant_id_snapshot,shopify_inventory_item_id_snapshot,units_per_pack,ordered_units) values('${id(121)}','${id(30)}','Default',' ','${id(22)}','shopify-22','inventory-22',1,2);commit;`));
  assert.throws(() => sql(`begin;${line(122)};insert into public.vault_purchase_order_line_size_allocations(purchase_order_line_id,parent_product_id,model_design,normalized_size,variant_id,shopify_variant_id_snapshot,shopify_inventory_item_id_snapshot,units_per_pack,ordered_units) values('${id(122)}','${id(30)}','Default','L','${id(22)}',' ','inventory-22',1,2);commit;`));
  assert.throws(() => sql(`begin;${line(123)};insert into public.vault_purchase_order_line_size_allocations(purchase_order_line_id,parent_product_id,model_design,normalized_size,variant_id,shopify_variant_id_snapshot,shopify_inventory_item_id_snapshot,units_per_pack,ordered_units) values('${id(123)}','${id(30)}','Default','L','${id(22)}','shopify-22',' ',1,2);commit;`));
  assert.throws(() => sql(`begin;${allocation(999, 22, "L", 1, 2)};commit;`));
  assert.throws(() => sql(`begin;${line(124)};${allocation(124, 999, "L", 1, 2)};commit;`));
  sql(`${line(125)};`);
  assert.equal(sql(`select source_recommendation_type from public.vault_purchase_order_lines where id='${id(125)}'`), "fixed_pack_purchase_recommendation");
  assert.throws(() => sql(`begin;${line(126)};${allocation(126, 22, "S", 1, 1)};${allocation(126, 23, "M", 2, 4)};commit;`));
  assert.throws(() => sql(`begin;${line(127)};${allocation(127, 22, "S", 1, 2)};${allocation(127, 23, "M", 1, 2)};commit;`));
  sql(`insert into public.vault_purchase_order_events(purchase_order_id,purchase_order_line_id,operator_id,event_type,idempotency_key,event_snapshot) values('${id(10)}','${id(100)}','${id(1)}','fixed_pack_recommendation_added_to_draft','event-1','{"sizes":["S","M"]}');`);
  assert.equal(sql(`select event_type from public.vault_purchase_order_events`), "fixed_pack_recommendation_added_to_draft");
  assert.throws(() => sql(`update public.vault_purchase_order_events set event_type='changed';`));
  assert.throws(() => sql(`delete from public.vault_purchase_order_events;`));
  assert.throws(() => sql(`set role anon;insert into public.vault_purchase_order_line_size_allocations(purchase_order_line_id,parent_product_id,model_design,normalized_size,variant_id,shopify_variant_id_snapshot,shopify_inventory_item_id_snapshot,units_per_pack,ordered_units) values('${id(100)}','${id(30)}','Default','L','${id(22)}','shopify-22','inventory-22',1,2);`));
  assert.throws(() => sql(`set role authenticated;insert into public.vault_purchase_order_events(purchase_order_id,operator_id,event_type,event_snapshot) values('${id(10)}','${id(1)}','fixed_pack_recommendation_added_to_draft','{}');`));
});
