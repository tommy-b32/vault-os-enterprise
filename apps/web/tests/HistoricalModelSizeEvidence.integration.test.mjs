import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const schema = await readFile(new URL("fixtures/phase3d1-postgres-schema.sql", import.meta.url), "utf8");
const currentMigration = await readFile(new URL("../../../supabase/migrations/20260912000000_canonical_model_size_replenishment_evidence.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../../../supabase/migrations/20261005000000_canonical_historical_model_size_evidence.sql", import.meta.url), "utf8");
const assessmentMigration = await readFile(new URL("../../../supabase/migrations/20261006000000_size_distribution_evidence_assessment.sql", import.meta.url), "utf8");
const sufficiencyMigration = await readFile(new URL("../../../supabase/migrations/20261007000000_size_evidence_sufficiency_foundation.sql", import.meta.url), "utf8");
const sufficiencySetsFixMigration = await readFile(new URL("../../../supabase/migrations/20261008000000_fix_size_evidence_sufficiency_sets.sql", import.meta.url), "utf8");
const exposureMigration = await readFile(new URL("../../../supabase/migrations/20261009000000_observed_size_exposure_foundation.sql", import.meta.url), "utf8");
const container = `vault-phase1b3-test-${process.pid}`;
const password = "phase1b3-disposable-only";
let started = false;

function docker(args, input) { const result = spawnSync("docker", args, { encoding: "utf8", input }); if (result.status !== 0) throw new Error(result.stderr || result.stdout); return result.stdout.trim(); }
function sql(statement) { docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "vault_phase1b3_test", "-X", "-q"], statement); }
function query(statement) { const result = docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "vault_phase1b3_test", "-X", "-q", "-t", "-A"], statement); return result ? JSON.parse(result) : null; }
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

test("Phase 1B3 preserves current model-size evidence and fails historical evidence closed", async (t) => {
  t.after(() => { if (started) spawnSync("docker", ["rm", "-f", container], { encoding: "utf8" }); });
  docker(["run", "--rm", "-d", "--name", container, "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=vault_phase1b3_test", "postgres:17"]); started = true;
  for (let attempt = 0; attempt < 30; attempt++) { try { query("select 1"); break; } catch { await new Promise((resolve) => setTimeout(resolve, 250)); if (attempt === 29) throw new Error("PostgreSQL did not become ready"); } }
  sql(schema); sql(currentMigration);
  sql(`
    create table test_trading (style_id text primary key, parent_product_id uuid, style_name text, verified_live_at timestamptz, evidence_as_of timestamptz, coverage_complete boolean, order_evidence_fresh boolean);
    create view public.vault_style_trading_evidence as select test_trading.*, 'SUFFICIENT_EVIDENCE'::text as maturity_state from test_trading;
    insert into public.vault_products values ('${id(1)}','shopify','ACTIVE'),('${id(2)}','shopify','ACTIVE'),('${id(3)}','shopify','ACTIVE'),('${id(4)}','shopify','ACTIVE');
    insert into public.vault_variants values
      ('${id(101)}','${id(1)}','shopify','alpha-xl','Alpha','XL',true,'resolved'),
      ('${id(102)}','${id(1)}','shopify','alpha-l','Alpha','L',true,'resolved'),
      ('${id(103)}','${id(1)}','shopify','alpha-old','Alpha','2XL',false,'resolved'),
      ('${id(201)}','${id(2)}','shopify','beta-m','Beta','M',true,'resolved'),
      ('${id(202)}','${id(2)}','shopify','beta-unresolved',null,null,true,'unresolved'),
      ('${id(301)}','${id(3)}','shopify','duplicate','Gamma','S',true,'resolved'),
      ('${id(302)}','${id(3)}','shopify','duplicate','Gamma','M',true,'resolved'),
      ('${id(401)}','${id(4)}','shopify','delta-s','Delta','S',true,'resolved');
    insert into public.vault_inventory_levels values ('${id(901)}','${id(101)}',5,1,2,now()),('${id(902)}','${id(102)}',4,0,0,now()),('${id(903)}','${id(201)}',2,0,0,now());
    insert into public.vault_shopify_order_sync_runs values ('${id(1001)}',30,now());
    insert into public.vault_shopify_orders values
      ('${id(1101)}',now()-interval '31 days',null,'{}'),('${id(1102)}',now()-interval '10 days',null,'{}'),('${id(1103)}',now()-interval '5 days',null,'{}'),('${id(1104)}',now()-interval '2 days',null,'{}'),('${id(1105)}',now()-interval '3 days',now(),'{}'),('${id(1106)}',now()-interval '3 days',null,'{"test":true}'),('${id(1107)}',now()-interval '4 days',null,'{}'),('${id(1108)}',now()-interval '50 days',null,'{}');
    insert into public.vault_shopify_order_lines values
      ('${id(1201)}','${id(1101)}','alpha-xl',1,0),('${id(1202)}','${id(1102)}','alpha-l',3,1),('${id(1203)}','${id(1103)}','alpha-xl',3,3),('${id(1204)}','${id(1104)}','alpha-old',4,0),('${id(1205)}','${id(1105)}','alpha-xl',99,0),('${id(1206)}','${id(1106)}','alpha-xl',99,0),('${id(1207)}','${id(1107)}','beta-unresolved',2,0),('${id(1208)}','${id(1108)}','alpha-xl',1,0);
    insert into test_trading values
      ('${id(1)}::Alpha','${id(1)}','Alpha',now()-interval '40 days',now()-interval '1 minute',true,true),
      ('${id(2)}::Beta','${id(2)}','Beta',now()-interval '40 days',now()-interval '1 minute',true,true),
      ('${id(3)}::Gamma','${id(3)}','Gamma',now()-interval '40 days',now()-interval '1 minute',false,true),
      ('${id(4)}::Delta','${id(4)}','Delta',now()-interval '40 days',now()-interval '1 minute',true,true);
  `);
  const before = query("select coalesce(json_agg(v order by model_size_id),'[]') from public.vault_model_size_replenishment_intelligence v");
  sql(migration);
  const after = query("select coalesce(json_agg(v order by model_size_id),'[]') from public.vault_model_size_replenishment_intelligence v");
  assert.deepEqual(after, before, "current model-size projection must be exact pre/post parity");
  assert.equal(query("select count(*) from public.vault_canonical_resolved_commercial_order_lines where shopify_variant_id='alpha-xl'"), 3);
  const historical = query("select coalesce(json_agg(v order by style_id,normalized_size),'[]') from public.vault_historical_model_size_evidence v");
  const alpha = historical.filter((row) => row.style_id === `${id(1)}::Alpha`);
  assert.equal(alpha.every((row) => row.historical_evidence_available), true);
  assert.equal(alpha.find((row) => row.normalized_size === "2XL").historical_attributable_observed_units, 4);
  assert.equal(alpha.find((row) => row.normalized_size === "2XL").historical_observed_demand_share, 4 / 7);
  assert.equal(alpha.find((row) => row.normalized_size === "XL").historical_attributable_observed_units, 1);
  assert.equal(alpha[0].historical_availability_censoring, "not_evaluated");
  const beta = historical.find((row) => row.style_id === `${id(2)}::Beta`);
  assert.equal(beta.historical_evidence_available, false); assert.equal(beta.historical_evidence_unavailable_reason, "style_sales_mapping_incomplete");
  const gamma = historical.find((row) => row.style_id === `${id(3)}::Gamma`);
  assert.equal(gamma.historical_evidence_available, false); assert.equal(gamma.historical_evidence_unavailable_reason, "sales_history_coverage_incomplete");
  const delta = historical.find((row) => row.style_id === `${id(4)}::Delta`);
  assert.equal(delta.historical_evidence_available, true); assert.equal(delta.total_historical_size_attributable_observed_units, 0); assert.equal(delta.historical_observed_demand_share, null);
  assert.equal(query("select count(*) from public.vault_model_size_replenishment_intelligence where normalized_size='2XL'"), 1);
  assert.equal(query("select available_stock from public.vault_model_size_replenishment_intelligence where normalized_size='2XL'"), 0);
  sql(`create table public.vault_shopify_inventory_sync_runs (id uuid primary key, sync_status text not null);
    create table public.vault_locations (id uuid primary key);
    create table public.vault_inventory_level_snapshots (id uuid primary key, inventory_sync_run_id uuid, variant_id uuid, location_id uuid, observed_at timestamptz, available integer);
    insert into vault_shopify_inventory_sync_runs values ('${id(2001)}','current'); insert into vault_locations values ('${id(2002)}');
    insert into vault_inventory_level_snapshots values ('${id(2003)}','${id(2001)}','${id(101)}','${id(2002)}',now()-interval '2 days',2),('${id(2004)}','${id(2001)}','${id(101)}','${id(2002)}',now()-interval '1 day',0),('${id(2005)}','${id(2001)}','${id(102)}','${id(2002)}',now()-interval '1 day',1);`);
  const baseBefore = query("select coalesce(json_agg(json_build_object('order_line_id',order_line_id,'shopify_variant_id',shopify_variant_id,'shopify_created_at',shopify_created_at,'net_units',net_units,'parent_product_id',parent_product_id,'model_design',model_design,'normalized_size',normalized_size,'mapping_status',mapping_status) order by order_line_id),'[]') from vault_canonical_resolved_commercial_order_lines");
  sql(assessmentMigration);
  const baseAfter = query("select coalesce(json_agg(json_build_object('order_line_id',order_line_id,'shopify_variant_id',shopify_variant_id,'shopify_created_at',shopify_created_at,'net_units',net_units,'parent_product_id',parent_product_id,'model_design',model_design,'normalized_size',normalized_size,'mapping_status',mapping_status) order by order_line_id),'[]') from vault_canonical_resolved_commercial_order_lines");
  assert.deepEqual(baseAfter, baseBefore, "shared commercial-line fields retain exact pre/post parity");
  const assessment = query("select coalesce(json_agg(v order by canonical_style_id,canonical_size),'[]') from vault_size_distribution_evidence_assessment v");
  const alphaXLAssessment = assessment.find((row) => row.canonical_style_id === `${id(1)}::Alpha` && row.canonical_size === 'XL');
  assert.equal(alphaXLAssessment.historical_distinct_order_count, 1); assert.equal(alphaXLAssessment.retained_inventory_observation_count, 2); assert.equal(alphaXLAssessment.retained_positive_availability_observations, 1); assert.equal(alphaXLAssessment.retained_zero_or_negative_availability_observations, 1); assert.equal(alphaXLAssessment.historical_availability_opportunity, 'not_evaluated');
  sql(`update public.vault_variants set model_design='Beta', normalized_size='M', identity_resolution_status='resolved' where id='${id(202)}';
    update public.vault_variants set source_active=true where id='${id(103)}';
    insert into public.vault_inventory_levels values ('${id(904)}','${id(103)}',1,0,0,now()),('${id(905)}','${id(401)}',1,0,0,now()),('${id(906)}','${id(202)}',1,0,0,now());`);
  const assessmentBeforeSufficiency = query("select coalesce(json_agg(v order by canonical_style_id,canonical_size),'[]') from vault_size_distribution_evidence_assessment v");
  sql(sufficiencyMigration);
  const assessmentAfterSufficiency = query("select coalesce(json_agg(v order by canonical_style_id,canonical_size),'[]') from vault_size_distribution_evidence_assessment v");
  assert.deepEqual(assessmentAfterSufficiency, assessmentBeforeSufficiency, "Phase 1B5B must not alter Phase 1B4 factual evidence");
  const sufficiency = query("select coalesce(json_agg(v order by canonical_style_id),'[]') from vault_size_evidence_sufficiency v");
  assert.equal(sufficiency.length, 4, "sufficiency is style-level, not size-level");
  const alphaSufficiency = sufficiency.find((row) => row.canonical_style_id === `${id(1)}::Alpha`);
  const betaSufficiency = sufficiency.find((row) => row.canonical_style_id === `${id(2)}::Beta`);
  const gammaSufficiency = sufficiency.find((row) => row.canonical_style_id === `${id(3)}::Gamma`);
  const deltaSufficiency = sufficiency.find((row) => row.canonical_style_id === `${id(4)}::Delta`);
  assert.equal(alphaSufficiency.size_evidence_sufficiency_state, "DESCRIPTIVE_ONLY");
  assert.equal(betaSufficiency.size_evidence_sufficiency_state, "DESCRIPTIVE_ONLY", "one observed size remains descriptive only");
  assert.equal(betaSufficiency.historically_observed_size_count, 1);
  assert.equal(deltaSufficiency.size_evidence_sufficiency_state, "NOT_OBSERVED");
  assert.equal(gammaSufficiency.size_evidence_sufficiency_state, "UNAVAILABLE");
  assert.equal(gammaSufficiency.size_evidence_sufficiency_state === "NOT_OBSERVED", false, "unavailable evidence is never converted to zero observations");
  assert.equal(alphaSufficiency.historical_distinct_commercial_orders, 3, "style order count must be distinct across sizes, not a sum of size counts");
  assert.equal(alphaSufficiency.historical_first_observed_at > new Date(Date.now() - 40 * 86400000).toISOString(), true, "out-of-interval positive commercial lines must not affect style-level historical facts");
  assert.equal(alphaSufficiency.has_multiple_historical_orders, true);
  assert.equal(alphaSufficiency.has_multiple_historical_selling_dates, true);
  assert.equal(alphaSufficiency.has_multiple_historical_selling_weeks, true);
  assert.equal(alphaSufficiency.has_multiple_historically_observed_sizes, true);
  assert.equal(alphaSufficiency.historical_adds_sizes_beyond_current, true);
  assert.equal(alphaSufficiency.availability_censoring_limitation, "NOT_EVALUATED");
  assert.equal(deltaSufficiency.availability_censoring_limitation, "NOT_EVALUATED", "censoring limitation does not change state");
  assert.equal(Object.keys(alphaSufficiency).some((key) => /curve|buy|reorder|recommend/i.test(key)), false, "no curve or buying output may be introduced");
  sql(sufficiencySetsFixMigration);
  const assessmentAfterSetsFix = query("select coalesce(json_agg(v order by canonical_style_id,canonical_size),'[]') from vault_size_distribution_evidence_assessment v");
  assert.deepEqual(assessmentAfterSetsFix, assessmentBeforeSufficiency, "forward set fix must not alter Phase 1B4 evidence");
  const fixedSufficiency = query("select coalesce(json_agg(v order by canonical_style_id),'[]') from vault_size_evidence_sufficiency v");
  const alphaFixed = fixedSufficiency.find((row) => row.canonical_style_id === `${id(1)}::Alpha`);
  const deltaFixed = fixedSufficiency.find((row) => row.canonical_style_id === `${id(4)}::Delta`);
  const alphaAssessment = assessmentAfterSetsFix.find((row) => row.canonical_style_id === `${id(1)}::Alpha`);
  const deltaAssessment = assessmentAfterSetsFix.find((row) => row.canonical_style_id === `${id(4)}::Delta`);
  for (const field of ["sizes_observed_current", "sizes_observed_historically", "sizes_observed_both", "sizes_observed_current_only", "sizes_observed_historical_only"]) {
    assert.deepEqual(alphaFixed[field], alphaAssessment[field], `${field} must exactly preserve governed assessment semantics`);
    assert.deepEqual(deltaFixed[field], deltaAssessment[field], `${field} must preserve zero-observation null/array semantics`);
  }
  assert.notEqual(alphaFixed.sizes_observed_historically, null, "positive multi-size evidence must not lose its historical set");
  assert.equal(alphaFixed.historically_observed_size_count, 3);
  assert.equal(alphaFixed.size_evidence_sufficiency_state, alphaSufficiency.size_evidence_sufficiency_state);
  assert.equal(alphaFixed.historical_distinct_commercial_orders, alphaSufficiency.historical_distinct_commercial_orders);
  assert.equal(alphaFixed.historical_distinct_selling_dates, alphaSufficiency.historical_distinct_selling_dates);
  assert.equal(alphaFixed.historical_distinct_selling_weeks, alphaSufficiency.historical_distinct_selling_weeks);
  assert.equal(alphaFixed.historical_first_observed_at, alphaSufficiency.historical_first_observed_at);
  assert.equal(alphaFixed.historical_latest_observed_at, alphaSufficiency.historical_latest_observed_at);
  assert.equal(alphaFixed.historical_observation_span, alphaSufficiency.historical_observation_span);
  assert.equal(alphaFixed.has_multiple_historical_orders, alphaSufficiency.has_multiple_historical_orders);
  assert.equal(alphaFixed.availability_censoring_limitation, "NOT_EVALUATED");
  sql(`update public.vault_inventory_levels set available_quantity=0 where variant_id='${id(102)}';`);
  sql(exposureMigration);
  const exposure = query("select coalesce(json_agg(v order by canonical_style_id),'[]') from vault_observed_size_exposure v");
  const alphaExposure = exposure.find((row) => row.canonical_style_id === `${id(1)}::Alpha`);
  const deltaExposure = exposure.find((row) => row.canonical_style_id === `${id(4)}::Delta`);
  const gammaExposure = exposure.find((row) => row.canonical_style_id === `${id(3)}::Gamma`);
  assert.equal(alphaExposure.observed_exposure_available, true);
  assert.equal(alphaExposure.historical_observed_units, 7);
  assert.equal(alphaExposure.historical_observed_exposed_units, 2);
  assert.equal(alphaExposure.historical_observed_serviceable_units, 5);
  assert.equal(alphaExposure.historical_observed_exposed_share, 2 / 7);
  assert.equal(alphaExposure.historical_observed_serviceable_share, 5 / 7);
  assert.deepEqual(alphaExposure.historical_observed_unavailable_sizes, ['L']);
  assert.equal(alphaExposure.current_observed_exposed_units + alphaExposure.current_observed_serviceable_units, alphaExposure.current_observed_units);
  assert.equal(deltaExposure.observed_exposure_available, false);
  assert.equal(deltaExposure.observed_exposure_unavailable_reason, 'no_governed_observed_sizes');
  assert.equal(gammaExposure.observed_exposure_available, false);
  assert.equal(gammaExposure.observed_exposure_unavailable_reason, 'size_evidence_unavailable');
  assert.equal(Object.keys(alphaExposure).some((key) => /curve|buy|reorder|recommend|healthy|broken/i.test(key)), false);
});
