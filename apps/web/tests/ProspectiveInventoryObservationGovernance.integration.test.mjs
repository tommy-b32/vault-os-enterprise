import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../../supabase/migrations/20261011000000_prospective_inventory_observation_governance.sql", import.meta.url), "utf8");
const collector = await readFile(new URL("../../../supabase/functions/shopify-inventory-sync/index.ts", import.meta.url), "utf8");
const container = `vault-phase1b7e-test-${process.pid}`;
const password = "phase1b7e-disposable-only";
let started = false;
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
function docker(args, input) { const r = spawnSync("docker", args, { encoding: "utf8", input }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout.trim(); }
function sql(s) { docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "vault_phase1b7e_test", "-X", "-q"], s); }
function query(s) { const r = docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "vault_phase1b7e_test", "-X", "-q", "-t", "-A"], s); return r ? JSON.parse(r) : null; }

test("Phase 1B7E prospectively governs inventory observation collection", async (t) => {
  t.after(() => { if (started) spawnSync("docker", ["rm", "-f", container], { encoding: "utf8" }); });
  docker(["run", "--rm", "-d", "--name", container, "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=vault_phase1b7e_test", "postgres:17"]); started = true;
  for (let i = 0; i < 30; i++) { try { query("select 1"); break; } catch { await new Promise((r) => setTimeout(r, 250)); if (i === 29) throw new Error("PostgreSQL did not become ready"); } }
  sql(`create role anon; create role authenticated; create table public.vault_shopify_inventory_sync_runs (id uuid primary key); create table public.vault_variants (id uuid primary key);`);
  sql(migration);
  assert.equal(query("select count(*) from vault_inventory_observation_governance_runs"), 0, "P: migration performs no retrospective governance backfill");
  sql(`insert into vault_shopify_inventory_sync_runs values ('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}'); insert into vault_variants values ('${id(11)}'),('${id(12)}'),('${id(13)}');
    insert into vault_inventory_observation_governance_runs(inventory_sync_run_id,collector_version) values ('${id(1)}','phase1b7e');
    insert into vault_inventory_observation_daily_expected_members(evidence_date,first_selected_inventory_sync_run_id,variant_id,shopify_variant_id,shopify_inventory_item_id,parent_product_id,model_design,normalized_size,canonical_style_id,canonical_mapping_status,collector_eligibility_basis,selected_at) values
    ('2026-10-11','${id(1)}','${id(11)}','v-a','i-a','${id(2)}','Blue','L','${id(2)}::Blue','resolved','shopify_active_variant_with_inventory_item',now()),
    ('2026-10-11','${id(1)}','${id(12)}','v-b','i-b',null,null,null,null,'unresolved_or_incomplete','shopify_active_variant_with_inventory_item',now()) on conflict do nothing;
    insert into vault_inventory_observation_daily_expected_members(evidence_date,first_selected_inventory_sync_run_id,variant_id,shopify_variant_id,shopify_inventory_item_id,parent_product_id,model_design,normalized_size,canonical_style_id,canonical_mapping_status,collector_eligibility_basis,selected_at) values
    ('2026-10-11','${id(2)}','${id(11)}','v-a','i-a','${id(2)}','Blue','L','${id(2)}::Blue','resolved','shopify_active_variant_with_inventory_item',now()) on conflict do nothing;
    insert into vault_inventory_observation_run_exceptions(inventory_sync_run_id,variant_id,shopify_inventory_item_id,exception_stage) values ('${id(1)}','${id(12)}','i-b','shopify_not_returned');
    update vault_inventory_observation_governance_runs set expected_population_known=true,expected_variant_count=2,requested_inventory_item_count=2,returned_inventory_item_count=1,reconciliation_state='unreconciled',history_write_completed=true where inventory_sync_run_id='${id(1)}';`);
  assert.equal(query("select count(*) from vault_inventory_observation_daily_expected_members"), 2, "B/C/R: daily expected membership is immutable and same-day idempotent");
  assert.equal(query("select count(*) from vault_inventory_observation_daily_expected_members where canonical_mapping_status='unresolved_or_incomplete'"), 1, "E: unresolved canonical mapping remains eligible evidence");
  assert.equal(query("select count(*) from vault_inventory_observation_run_exceptions where exception_stage='shopify_not_returned'"), 1, "F/G: omitted or null Shopify returns are explicit exceptions");
  assert.equal(query(`select to_json(daily_baseline_completion_recorded) from vault_inventory_observation_governance_runs where inventory_sync_run_id='${id(1)}'`), false, "L/M: unreconciled run cannot record daily baseline completion");
  sql(`insert into vault_inventory_observation_governance_runs(inventory_sync_run_id,collector_version,expected_population_known,expected_variant_count,requested_inventory_item_count,returned_inventory_item_count,processed_variant_count,reconciliation_state,current_inventory_write_completed,history_write_completed,terminal_run_status,daily_baseline_completion_recorded) values ('${id(3)}','phase1b7e',true,2,1,1,1,'unreconciled',true,true,'current',false);
    insert into vault_inventory_observation_daily_expected_members(evidence_date,first_selected_inventory_sync_run_id,variant_id,shopify_inventory_item_id,canonical_mapping_status,collector_eligibility_basis,selected_at) values
    ('2026-10-11','${id(3)}','${id(11)}','duplicate-item','unresolved_or_incomplete','shopify_active_variant_with_inventory_item',now()),
    ('2026-10-11','${id(3)}','${id(13)}','duplicate-item','unresolved_or_incomplete','shopify_active_variant_with_inventory_item',now());
    insert into vault_inventory_observation_run_exceptions(inventory_sync_run_id,variant_id,shopify_inventory_item_id,exception_stage) values
    ('${id(3)}','${id(11)}','duplicate-item','duplicate_inventory_item_mapping'),
    ('${id(3)}','${id(13)}','duplicate-item','duplicate_inventory_item_mapping');`);
  assert.equal(query(`select count(*) from vault_inventory_observation_daily_expected_members where first_selected_inventory_sync_run_id='${id(3)}'`), 2, "duplicate mapping: both selected variants remain daily expected members");
  assert.equal(query(`select count(*) from vault_inventory_observation_run_exceptions where inventory_sync_run_id='${id(3)}' and exception_stage='duplicate_inventory_item_mapping'`), 2, "duplicate mapping: ambiguity is represented per affected member");
  assert.deepEqual(query(`select row_to_json(x) from (select expected_variant_count,requested_inventory_item_count,returned_inventory_item_count,processed_variant_count,reconciliation_state,daily_baseline_completion_recorded from vault_inventory_observation_governance_runs where inventory_sync_run_id='${id(3)}') x`), { expected_variant_count: 2, requested_inventory_item_count: 1, returned_inventory_item_count: 1, processed_variant_count: 1, reconciliation_state: "unreconciled", daily_baseline_completion_recorded: false }, "duplicate mapping: one returned item cannot claim two processed variants or a complete baseline");
  sql(`insert into vault_inventory_observation_governance_runs(inventory_sync_run_id,collector_version,expected_population_known,expected_variant_count,requested_inventory_item_count,returned_inventory_item_count,processed_variant_count,reconciliation_state,current_inventory_write_completed,history_write_completed,terminal_run_status,daily_baseline_completion_recorded) values ('${id(4)}','phase1b7e',true,1,1,1,1,'reconciled',true,true,'failed',false), ('${id(5)}','phase1b7e',true,1,1,1,1,'reconciled',true,true,'current',true);
    insert into vault_inventory_observation_daily_expected_members(evidence_date,first_selected_inventory_sync_run_id,variant_id,shopify_inventory_item_id,canonical_mapping_status,collector_eligibility_basis,selected_at) values ('2026-10-12','${id(4)}','${id(11)}','late-failure-item','unresolved_or_incomplete','shopify_active_variant_with_inventory_item',now());
    insert into vault_inventory_observation_run_exceptions(inventory_sync_run_id,exception_stage) values ('${id(4)}','history_write_failed');`);
  assert.deepEqual(query(`select row_to_json(x) from (select expected_population_known,reconciliation_state,current_inventory_write_completed,history_write_completed,terminal_run_status,daily_baseline_completion_recorded from vault_inventory_observation_governance_runs where inventory_sync_run_id='${id(4)}') x`), { expected_population_known: true, reconciliation_state: "reconciled", current_inventory_write_completed: true, history_write_completed: true, terminal_run_status: "failed", daily_baseline_completion_recorded: false }, "late terminal failure: earlier factual stages survive but baseline completion fails closed");
  assert.equal(query(`select count(*) from vault_inventory_observation_daily_expected_members where first_selected_inventory_sync_run_id='${id(4)}'`), 1, "late failure does not delete expected-member evidence");
  assert.deepEqual(query(`select row_to_json(x) from (select terminal_run_status,daily_baseline_completion_recorded from vault_inventory_observation_governance_runs where inventory_sync_run_id='${id(5)}') x`), { terminal_run_status: "current", daily_baseline_completion_recorded: true }, "fully successful terminal completion records a governed daily baseline");
  assert.ok(collector.indexOf("if (completionError) throw completionError;") < collector.indexOf("daily_baseline_completion_recorded:"), "terminal governance completion follows successful operational completion");
  assert.match(collector, /daily_baseline_completion_recorded:\s*false,\s*terminal_run_status:\s*"failed"/);
  for (const text of ["expected_population_known", "requested_inventory_item_count", "returned_inventory_item_count", "current_inventory_write_completed", "history_write_completed", "reconciliation_state", "duplicate_inventory_item_mapping", "shopify_not_returned", "current_inventory_write_failed", "history_write_failed", "expected_population_known: true", "recordGovernanceExceptions"]) assert.match(`${migration}\n${collector}`, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(migration, /insert into public\.vault_inventory_observation_(governance_runs|daily_expected_members|run_exceptions)\s+select/i);
  assert.doesNotMatch(`${migration}\n${collector}`, /coverage_percentage|availability_duration|censoring_state|lost_sales|target_curve|reorder_quantity/i);
});
