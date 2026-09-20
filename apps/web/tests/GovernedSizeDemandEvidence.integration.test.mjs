import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../../supabase/migrations/20261014000000_governed_size_demand_evidence.sql", import.meta.url), "utf8");
const name = `vault-b7f-${process.pid}`;
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
let running = false;
const dockerAvailable = spawnSync("docker", ["info"], { encoding: "utf8" }).status === 0;
const run = (args, input) => { const result = spawnSync("docker", args, { encoding: "utf8", input }); if (result.status) throw new Error(result.stderr || result.stdout); return result.stdout.trim(); };
const sql = (input) => run(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "b7f", "-X", "-q"], input);
const value = (input) => JSON.parse(run(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "b7f", "-X", "-q", "-t", "-A"], input));

test("B7F preserves immutable size demand, lifecycle facts, qualification, and unresolved exclusion", { skip: !dockerAvailable && "Docker daemon unavailable" }, async (t) => {
  t.after(() => running && spawnSync("docker", ["rm", "-f", name]));
  run(["run", "--rm", "-d", "--name", name, "-e", "POSTGRES_PASSWORD=x", "-e", "POSTGRES_DB=b7f", "postgres:17"]); running = true;
  for (let attempt = 0; attempt < 30; attempt += 1) { try { value("select 1"); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); } }
  sql(`create extension pgcrypto; create role anon; create role authenticated; create table public.vault_products(id uuid primary key);`);
  sql(migration);
  const product = id(1);
  sql(`insert into vault_products values('${product}');
    insert into vault_shopify_demand_line_observations(source,shopify_order_id,shopify_line_item_id,ordered_at,source_updated_at,observed_at,gross_ordered_units,is_test_order,financial_status,line_title,canonical_product_id,canonical_style_id,model_design,normalized_size,size_domain,size_system,canonical_mapping_state,evidence_state,identity_observed_at) values
    ('shopify','o1','s','2026-10-25 23:30+00','2026-10-25 23:30+00',now(),2,false,'PAID','Tee','${product}','${product}::Black','Black','S','apparel','apparel','resolved','prospective_governed_resolved',now()),
    ('shopify','o2','m','2026-10-26 00:30+00','2026-10-26 00:30+00',now(),1,false,'PENDING','Tee','${product}','${product}::Black','Black','M','apparel','apparel','resolved','legacy_current_mapping_qualified',now()),
    ('shopify','o3','unknown','2026-10-26 00:30+00','2026-10-26 00:30+00',now(),1,false,'PAID','Tee',null,null,null,null,null,null,'unresolved','prospective_unresolved',now()),
    ('shopify','o4','double','2026-10-26 00:30+00','2026-10-26 00:30+00',now(),1,false,'PARTIALLY_REFUNDED','Tee','${product}','${product}::Black','Black','2XL','apparel','apparel','resolved','prospective_governed_resolved',now()),
    ('shopify','o5','test','2026-10-26 00:30+00','2026-10-26 00:30+00',now(),1,true,'PAID','Tee','${product}','${product}::Black','Black','L','apparel','apparel','resolved','excluded_test_order',now());
    insert into vault_shopify_demand_lifecycle_adjustments(source,source_event_key,adjustment_type,shopify_order_id,shopify_line_item_id,occurred_at,adjusted_units,source_observed_at) values
    ('shopify','r1','refund','o1','s','2026-10-26 01:00+00',1,now()),('shopify','c1','whole_order_cancellation','o2','m','2026-10-26 02:00+00',1,now()),
    ('shopify','ra','refund','o4','double','2026-10-26 01:00+00',1,now()),('shopify','rb','refund','o4','double','2026-10-26 01:01+00',1,now()),('shopify','c2','whole_order_cancellation','o4','double','2026-10-26 01:02+00',1,now());`);
  assert.equal(value("select gross_ordered_units from vault_governed_size_demand_evidence where shopify_line_item_id='s'"), 2, "quantity is units");
  assert.equal(value("select refunded_units from vault_governed_size_demand_evidence where shopify_line_item_id='s'"), 1, "partial refund is separate");
  assert.equal(value("select net_retained_units from vault_governed_size_demand_evidence where shopify_line_item_id='s'"), 1, "net is derived without losing gross");
  assert.equal(value("select financially_qualified_net_retained_units from vault_governed_size_demand_evidence where shopify_line_item_id='m'"), 0, "pending is not retained sale");
  assert.equal(value("select refunded_units from vault_governed_size_demand_evidence where shopify_line_item_id='double'"), 2, "two distinct refunds remain two facts");
  assert.equal(value("select net_retained_units from vault_governed_size_demand_evidence where shopify_line_item_id='double'"), 0, "refund plus cancellation never exposes negative net");
  assert.equal(value("select count(*) from vault_governed_size_demand_evidence where shopify_line_item_id='unknown'"), 0, "unresolved cannot enter resolved aggregate");
  assert.equal(value("select count(*) from vault_governed_size_demand_evidence where shopify_line_item_id='test'"), 0, "test orders remain source evidence but not commercial demand");
  assert.equal(value("select count(*) from vault_shopify_demand_line_observations where evidence_state='legacy_current_mapping_qualified'"), 1, "legacy qualification is explicit");
  assert.throws(() => sql("update vault_shopify_demand_line_observations set normalized_size='L' where shopify_line_item_id='s'"), /immutable/);
  assert.throws(() => sql("insert into vault_shopify_demand_lifecycle_adjustments(source,source_event_key,adjustment_type,shopify_order_id,shopify_line_item_id,occurred_at,adjusted_units,source_observed_at) values('shopify','r1','refund','o1','s',now(),1,now())"), /duplicate/);
  assert.equal(value("select (ordered_at at time zone 'Europe/London')::date from vault_governed_size_demand_evidence where shopify_line_item_id='s'"), "2026-10-26", "London date is consumer-derived and DST-safe");
});

test("B7F contract remains evidence-only and uses immutable/idempotent source keys", () => {
  assert.match(migration, /unique \(source, shopify_line_item_id\)/);
  assert.match(migration, /unique \(source, source_event_key\)/);
  assert.match(migration, /prospective_governed_resolved/);
  assert.match(migration, /legacy_current_mapping_qualified/);
  assert.match(migration, /Europe\/London|financially_qualified/);
  assert.doesNotMatch(migration, /forecast_|lost_sales_estimate|recommended_packs|reorder_quantity/i);
});
