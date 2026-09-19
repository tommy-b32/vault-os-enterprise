import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../../supabase/migrations/20261012000000_governed_inventory_observation_coverage.sql", import.meta.url), "utf8");
const collector = await readFile(new URL("../../../supabase/functions/shopify-inventory-sync/index.ts", import.meta.url), "utf8");
const name = `vault-phase1b7c-test-${process.pid}`, password = "phase1b7c-disposable-only";
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
let started = false;
function docker(args, input) { const r = spawnSync("docker", args, { encoding: "utf8", input }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout.trim(); }
function sql(value) { docker(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "vault_phase1b7c_test", "-X", "-q"], value); }
function query(value) { const r = docker(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "vault_phase1b7c_test", "-X", "-q", "-t", "-A"], value); return r ? JSON.parse(r) : null; }

test("Phase 1B7C stores only first successful prospective member attestations", async (t) => {
  t.after(() => { if (started) spawnSync("docker", ["rm", "-f", name], { encoding: "utf8" }); });
  docker(["run", "--rm", "-d", "--name", name, "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=vault_phase1b7c_test", "postgres:17"]); started = true;
  for (let n = 0; n < 30; n++) { try { query("select 1"); break; } catch { await new Promise((r) => setTimeout(r, 250)); if (n === 29) throw new Error("PostgreSQL did not become ready"); } }
  sql(`create role anon;create role authenticated;create table public.vault_shopify_inventory_sync_runs(id uuid primary key,sync_status text not null);create table public.vault_variants(id uuid primary key);create table public.vault_inventory_observation_governance_runs(inventory_sync_run_id uuid primary key,expected_population_known boolean not null,reconciliation_state text not null,current_inventory_write_completed boolean not null,history_write_completed boolean not null,daily_baseline_completion_recorded boolean not null,terminal_run_status text not null);`);
  sql(migration);
  assert.equal(query("select count(*) from vault_inventory_observation_daily_member_attestations"), 0, "A/P: migration never backfills legacy snapshots or B7E history");
  sql(`insert into vault_shopify_inventory_sync_runs values('${id(1)}','current'),('${id(2)}','current');insert into vault_variants values('${id(11)}'),('${id(12)}');
    insert into vault_inventory_observation_governance_runs values('${id(1)}',true,'reconciled',true,true,true,'current'),('${id(2)}',true,'reconciled',true,true,true,'current');
    insert into vault_inventory_observation_daily_member_attestations(evidence_date,attesting_inventory_sync_run_id,variant_id,shopify_inventory_item_id,canonical_mapping_status,observed_inventory_level_count,observed_location_count,attested_at) values ('2026-10-12','${id(2)}','${id(11)}','item-a','unresolved_or_incomplete',1,1,now()),('2026-10-12','${id(2)}','${id(12)}','item-b','resolved',1,1,now()) on conflict do nothing;
    insert into vault_inventory_observation_daily_member_attestations(evidence_date,attesting_inventory_sync_run_id,variant_id,shopify_inventory_item_id,canonical_mapping_status,observed_inventory_level_count,observed_location_count,attested_at) values ('2026-10-12','${id(1)}','${id(11)}','item-a','unresolved_or_incomplete',9,9,now()) on conflict do nothing;`);
  assert.equal(query("select count(*) from vault_inventory_observation_daily_member_attestations"), 2, "L: daily attestation is idempotent");
  assert.equal(query(`select to_json(attesting_inventory_sync_run_id) from vault_inventory_observation_daily_member_attestations where variant_id='${id(11)}'`), id(2), "J/M: later successful run may attest and first success is preserved");
  assert.equal(query("select count(*) from vault_inventory_observation_daily_member_attestations where canonical_mapping_status='unresolved_or_incomplete'"), 1, "N: unresolved identity remains variant evidence, not canonical completeness");
  assert.equal(query("select count(*) from vault_governed_inventory_observation_daily_member_coverage"), 2, "successful terminal run is consumable governed coverage");
  sql(`insert into vault_inventory_observation_daily_member_attestations(evidence_date,attesting_inventory_sync_run_id,variant_id,shopify_inventory_item_id,canonical_mapping_status,observed_inventory_level_count,observed_location_count,attested_at) values ('2026-10-13','${id(1)}','${id(11)}','partial-then-failed','unresolved_or_incomplete',1,1,now());`);
  assert.equal(query("select count(*) from vault_inventory_observation_daily_member_attestations where shopify_inventory_item_id='partial-then-failed'"), 1, "database simulation retains a previously committed partial attestation");
  sql(`update vault_shopify_inventory_sync_runs set sync_status='failed' where id='${id(1)}';update vault_inventory_observation_governance_runs set terminal_run_status='failed',daily_baseline_completion_recorded=false where inventory_sync_run_id='${id(1)}';`);
  assert.equal(query("select count(*) from vault_governed_inventory_observation_daily_member_coverage where shopify_inventory_item_id='partial-then-failed'"), 0, "B/C/R: failed operational/governance run attestations cannot be consumed as governed coverage");
  assert.match(collector, /recordDailyMemberAttestations[\s\S]*processableVariants/);
  assert.ok(collector.indexOf('terminal_run_status: "current"') < collector.lastIndexOf("recordDailyMemberAttestations"), "B-I/R: collector attests only after terminal governance success");
  assert.match(collector, /daily_baseline_completion_recorded:\s*false,\s*terminal_run_status:\s*"failed"/);
  assert.doesNotMatch(`${migration}\n${collector}`, /lost_sales|reorder_quantity|target_stock_curve|buying_recommendation/i);
});
