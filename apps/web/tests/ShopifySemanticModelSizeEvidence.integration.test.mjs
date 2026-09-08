import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const schema = await readFile(new URL("fixtures/phase3d1-postgres-schema.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../../../supabase/migrations/20260912000000_canonical_model_size_replenishment_evidence.sql", import.meta.url), "utf8");
const container = `vault-phase3d1-test-${process.pid}`;
const password = "phase3d1-disposable-only";
let started = false;

function docker(args, input) {
  const result = spawnSync("docker", args, { encoding: "utf8", input });
  if (result.status !== 0) throw new Error(`docker ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function sql(statement) {
  return docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "vault_phase3d1_test", "-X", "-q"], statement);
}
function query(statement) {
  const result = docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "vault_phase3d1_test", "-X", "-q", "-t", "-A"], statement);
  return result ? JSON.parse(result) : null;
}
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const row = (rows, parent, model, size) => rows.find((r) => r.parent_product_id === id(parent) && r.model_design === model && r.normalized_size === size);

test("actual Phase 3D-1 migration passes against disposable PostgreSQL", async (t) => {
  t.after(() => { if (started) spawnSync("docker", ["rm", "-f", container], { encoding: "utf8" }); });
  docker(["run", "--rm", "-d", "--name", container, "--label", "vault.phase3d1.disposable=true", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=vault_phase3d1_test", "-p", "127.0.0.1::5432", "postgres:17"]);
  started = true;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { query("select 1"); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 250)); if (attempt === 29) throw new Error("disposable PostgreSQL did not become ready"); }
  }
  const inspection = JSON.parse(docker(["inspect", container]));
  assert.equal(inspection[0].Config.Labels["vault.phase3d1.disposable"], "true");
  assert.equal(inspection[0].Config.Env.some((v) => v.includes("mzrimaqjyrvtbpaeyooe")), false);
  assert.equal(Object.keys(inspection[0].NetworkSettings.Ports)[0], "5432/tcp");
  assert.equal(inspection[0].NetworkSettings.Ports["5432/tcp"][0].HostIp, "127.0.0.1");
  assert.equal(query("select json_build_object('database', current_database(), 'server', version())" ).database, "vault_phase3d1_test");
  sql(schema);
  sql(migration);

  const now = "now()";
  sql(`
    insert into public.vault_products values
      ('${id(1)}','shopify','ACTIVE'),('${id(2)}','shopify','ACTIVE'),('${id(3)}','shopify','ACTIVE'),
      ('${id(4)}','shopify','ACTIVE'),('${id(5)}','shopify','ACTIVE'),('${id(6)}','shopify','ACTIVE'),
      ('${id(7)}','shopify','ACTIVE'),('${id(8)}','shopify','ACTIVE');
    insert into public.vault_variants values
      ('${id(101)}','${id(1)}','shopify','a-xl','Alpha','XL',true,'resolved'),
      ('${id(102)}','${id(1)}','shopify','a-l','Alpha','L',true,'resolved'),
      ('${id(201)}','${id(2)}','shopify','b-good','Beta','M',true,'resolved'),
      ('${id(202)}','${id(2)}','shopify','b-unresolved',null,null,true,'unresolved'),
      ('${id(301)}','${id(3)}','shopify','default-xl','Default','XL',true,'resolved'),
      ('${id(401)}','${id(4)}','shopify','historic-xl','Archive','XL',false,'resolved'),
      ('${id(501)}','${id(5)}','shopify','other-xl','Other','S',true,'resolved'),
      ('${id(601)}','${id(6)}','shopify','dup-same','Dup','M',true,'resolved'),
      ('${id(602)}','${id(6)}','shopify','dup-same','Dup','L',true,'resolved'),
      ('${id(701)}','${id(7)}','shopify','dup-cross','Cross','M',true,'resolved'),
      ('${id(801)}','${id(8)}','shopify','dup-cross','Cross','L',true,'resolved');
    insert into public.vault_inventory_levels values
      ('${id(901)}','${id(101)}',5,1,2,${now}),('${id(902)}','${id(101)}',3,2,1,${now}),
      ('${id(903)}','${id(102)}',4,0,0,${now}),('${id(904)}','${id(201)}',2,0,0,${now}),
      ('${id(905)}','${id(301)}',1,0,0,${now}),('${id(906)}','${id(501)}',9,0,0,${now});
    insert into public.vault_shopify_order_sync_runs values ('${id(1001)}',30,${now});
    insert into public.vault_shopify_orders values
      ('${id(1101)}',${now}-interval '31 days',null,'{}'),('${id(1102)}',${now}-interval '1 day',null,'{}'),
      ('${id(1103)}',${now}-interval '5 days',null,'{}'),('${id(1104)}',${now}-interval '10 days',null,'{}'),
      ('${id(1105)}',${now}-interval '20 days',null,'{}'),('${id(1106)}',${now}-interval '2 days',null,'{}'),
      ('${id(1107)}',${now}-interval '3 days',${now}-interval '2 days','{}'),('${id(1108)}',${now}-interval '3 days',null,'{"test":true}'),
      ('${id(1109)}','2026-05-03 12:00+00',null,'{}'),('${id(1110)}','2026-05-04 12:00+00',null,'{}');
    insert into public.vault_shopify_order_lines values
      ('${id(1201)}','${id(1101)}','a-xl',1,0),('${id(1202)}','${id(1102)}','a-xl',2,0),
      ('${id(1203)}','${id(1103)}','a-xl',3,1),('${id(1204)}','${id(1104)}','a-l',3,0),
      ('${id(1205)}','${id(1105)}','historic-xl',4,0),('${id(1206)}','${id(1106)}','a-xl',2,2),
      ('${id(1207)}','${id(1102)}','b-unresolved',2,0),('${id(1208)}','${id(1102)}',null,1,0),
      ('${id(1209)}','${id(1102)}','dup-same',1,0),('${id(1210)}','${id(1102)}','dup-cross',1,0),
      ('${id(1211)}','${id(1102)}','unknown',1,0),('${id(1212)}','${id(1107)}','a-xl',99,0),
      ('${id(1213)}','${id(1108)}','a-xl',99,0),('${id(1214)}','${id(1109)}','a-xl',99,0),('${id(1215)}','${id(1110)}','a-xl',99,0);
  `);
  const rows = query("select coalesce(json_agg(v order by parent_product_id,model_design,normalized_size),'[]') from public.vault_model_size_replenishment_intelligence v");
  const alphaXL = row(rows, 1, "Alpha", "XL"), alphaL = row(rows, 1, "Alpha", "L"), beta = row(rows, 2, "Beta", "M"), archive = row(rows, 4, "Archive", "XL"), other = row(rows, 5, "Other", "S");
  assert.equal(rows.length, 6); assert.ok(alphaXL && alphaL && beta && archive && other);
  assert.deepEqual([alphaXL.available_stock,alphaXL.committed_stock,alphaXL.incoming_stock,alphaXL.net_available_stock],[8,3,3,8]);
  assert.equal(alphaXL.sales_7_day_units,4); assert.equal(alphaXL.sales_14_day_units,4); assert.equal(alphaXL.sales_30_day_units,4);
  assert.equal(alphaL.sales_7_day_units,0); assert.equal(alphaL.sales_14_day_units,3); assert.equal(alphaL.sales_30_day_units,3);
  assert.equal(alphaXL.style_sales_mapping_complete,true); assert.equal(alphaXL.trusted,true);
  assert.equal(alphaXL.global_sales_mapping_complete,false);
  assert.deepEqual([alphaXL.global_unresolved_clean_sales_units,alphaXL.global_unmatched_clean_sales_units],[4,2]);
  assert.equal(beta.style_sales_mapping_complete,false); assert.equal(beta.style_unresolved_clean_sales_units,2); assert.equal(beta.trusted,false); assert.ok(beta.missing_requirements.includes("style_sales_mapping_incomplete"));
  assert.equal(other.style_sales_mapping_complete,true); assert.equal(other.style_unresolved_clean_sales_units,0);
  assert.deepEqual([archive.available_stock,archive.committed_stock,archive.incoming_stock,archive.net_available_stock],[0,0,0,0]); assert.equal(archive.sales_30_day_units,4); assert.equal(archive.inventory_freshness,null); assert.equal(archive.trusted,false);
  assert.equal(row(rows,3,"Default","XL").available_stock,1);
  const rawSales = query(`select json_build_object('seven',coalesce(sum(greatest(l.quantity-l.refunded_quantity,0)) filter(where o.shopify_created_at>=now()-interval '7 days' and l.shopify_variant_id in ('a-xl','a-l','historic-xl')),0),'fourteen',coalesce(sum(greatest(l.quantity-l.refunded_quantity,0)) filter(where o.shopify_created_at>=now()-interval '14 days' and l.shopify_variant_id in ('a-xl','a-l','historic-xl')),0),'thirty',coalesce(sum(greatest(l.quantity-l.refunded_quantity,0)) filter(where o.shopify_created_at>=now()-interval '30 days' and l.shopify_variant_id in ('a-xl','a-l','historic-xl')),0)) from public.vault_shopify_order_lines l join public.vault_shopify_orders o on o.id=l.order_id where o.cancelled_at is null and coalesce((o.metadata->>'test')::boolean,false)=false and o.shopify_created_at>=('2026-05-04 00:00:00'::timestamp at time zone 'Europe/London') and o.shopify_created_at<now()`);
  const viewSales = query("select json_build_object('seven',sum(sales_7_day_units),'fourteen',sum(sales_14_day_units),'thirty',sum(sales_30_day_units)) from public.vault_model_size_replenishment_intelligence where parent_product_id in ('"+id(1)+"','"+id(4)+"')");
  assert.deepEqual(viewSales,rawSales);
  const rawInventory = query("select json_build_object('available',sum(i.available_quantity),'committed',sum(i.committed_quantity),'incoming',sum(i.incoming_quantity)) from public.vault_inventory_levels i join public.vault_variants v on v.id=i.variant_id where v.id in ('"+id(101)+"','"+id(102)+"')");
  const viewInventory = query("select json_build_object('available',sum(available_stock),'committed',sum(committed_stock),'incoming',sum(incoming_stock)) from public.vault_model_size_replenishment_intelligence where parent_product_id='"+id(1)+"'");
  assert.deepEqual(viewInventory,rawInventory);
  const contract = query("select json_agg(json_build_object('name',column_name,'type',data_type,'position',ordinal_position) order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='vault_model_size_replenishment_intelligence'");
  assert.equal(contract.length,25); assert.deepEqual(contract.map((c)=>c.name),['model_size_id','style_id','parent_product_id','model_design','normalized_size','available_stock','committed_stock','incoming_stock','net_available_stock','sales_7_day_units','sales_14_day_units','sales_30_day_units','average_daily_sales','last_sale_date','days_since_last_sale','inventory_freshness','order_history_freshness','sales_history_30_complete','style_sales_mapping_complete','style_unresolved_clean_sales_units','global_sales_mapping_complete','global_unresolved_clean_sales_units','global_unmatched_clean_sales_units','trusted','missing_requirements']);
  assert.deepEqual(contract.map((c)=>c.type),['text','text','uuid','text','text','integer','integer','integer','integer','numeric','numeric','numeric','numeric','timestamp with time zone','integer','timestamp with time zone','timestamp with time zone','boolean','boolean','numeric','boolean','numeric','numeric','boolean','ARRAY']);
  sql("delete from public.vault_shopify_order_sync_runs");
  const noSync = row(query("select coalesce(json_agg(v),'[]') from public.vault_model_size_replenishment_intelligence v"),1,"Alpha","XL");
  assert.ok(noSync); assert.equal(noSync.order_history_freshness,null); assert.equal(noSync.sales_history_30_complete,false); assert.equal(noSync.trusted,false); assert.ok(noSync.missing_requirements.includes("sales_history_unavailable")); assert.equal(noSync.sales_30_day_units,null);
  sql("insert into public.vault_shopify_order_sync_runs values ('"+id(1002)+"',30,now()-interval '31 minutes')");
  const staleSales = row(query("select coalesce(json_agg(v),'[]') from public.vault_model_size_replenishment_intelligence v"),1,"Alpha","XL");
  assert.equal(staleSales.trusted,false); assert.ok(staleSales.missing_requirements.includes("sales_history_stale"));
  sql("delete from public.vault_shopify_order_sync_runs; insert into public.vault_shopify_order_sync_runs values ('"+id(1003)+"',30,now()); update public.vault_inventory_levels set synced_at=now()-interval '31 minutes'");
  const staleInventory = row(query("select coalesce(json_agg(v),'[]') from public.vault_model_size_replenishment_intelligence v"),1,"Alpha","XL");
  assert.equal(staleInventory.trusted,false); assert.ok(staleInventory.missing_requirements.includes("inventory_stale"));
  sql("delete from public.vault_shopify_order_lines where id in ('"+id(1201)+"','"+id(1215)+"'); delete from public.vault_shopify_orders where id in ('"+id(1101)+"','"+id(1110)+"')");
  const incomplete = row(query("select coalesce(json_agg(v),'[]') from public.vault_model_size_replenishment_intelligence v"),1,"Alpha","XL");
  assert.equal(incomplete.sales_history_30_complete,false); assert.ok(incomplete.missing_requirements.includes("sales_history_30_incomplete"));
});
