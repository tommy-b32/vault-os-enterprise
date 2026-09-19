import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("fixtures/phase3d1-postgres-schema.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../../../supabase/migrations/20261010000000_historical_size_availability_observation_evidence.sql", import.meta.url), "utf8");
const container = `vault-phase1b7b-test-${process.pid}`;
const password = "phase1b7b-disposable-only";
let started = false;

function docker(args, input) {
  const result = spawnSync("docker", args, { encoding: "utf8", input });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
function sql(statement) { docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "vault_phase1b7b_test", "-X", "-q"], statement); }
function query(statement) {
  const result = docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "vault_phase1b7b_test", "-X", "-q", "-t", "-A"], statement);
  return result ? JSON.parse(result) : null;
}
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

test("Phase 1B7B exposes only factual retained size observation evidence", async (t) => {
  t.after(() => { if (started) spawnSync("docker", ["rm", "-f", container], { encoding: "utf8" }); });
  docker(["run", "--rm", "-d", "--name", container, "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=vault_phase1b7b_test", "postgres:17"]);
  started = true;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { query("select 1"); break; } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (attempt === 29) throw new Error("PostgreSQL did not become ready");
    }
  }

  sql(schema);
  sql(`
    create table public.vault_shopify_inventory_sync_runs (id uuid primary key, sync_status text not null);
    create table public.vault_locations (id uuid primary key);
    create table public.vault_inventory_level_snapshots (
      id uuid primary key, inventory_sync_run_id uuid not null, variant_id uuid not null,
      location_id uuid not null, observed_at timestamptz not null, available integer not null,
      history_kind text not null
    );
    insert into public.vault_products values ('${id(1)}','shopify','ACTIVE'),('${id(2)}','shopify','ACTIVE'),('${id(3)}','shopify','ACTIVE');
    insert into public.vault_variants values
      ('${id(101)}','${id(1)}','shopify','alpha-m','Alpha','M',true,'resolved'),
      ('${id(102)}','${id(1)}','shopify','alpha-s','Alpha','S',true,'resolved'),
      ('${id(201)}','${id(2)}','shopify','beta-unresolved',null,null,true,'unresolved'),
      ('${id(301)}','${id(3)}','shopify','duplicate','Gamma','M',true,'resolved'),
      ('${id(302)}','${id(3)}','shopify','duplicate','Gamma','L',true,'resolved');
    insert into public.vault_shopify_inventory_sync_runs values ('${id(401)}','current'),('${id(402)}','current'),('${id(403)}','failed');
    insert into public.vault_locations values ('${id(501)}'),('${id(502)}');
    insert into public.vault_inventory_level_snapshots values
      ('${id(601)}','${id(401)}','${id(101)}','${id(501)}','2026-09-01 09:00:00+00',4,'legacy'),
      ('${id(602)}','${id(401)}','${id(101)}','${id(501)}','2026-09-02 09:00:00+00',0,'daily_baseline'),
      ('${id(603)}','${id(402)}','${id(101)}','${id(502)}','2026-09-03 09:00:00+00',-2,'change'),
      ('${id(604)}','${id(402)}','${id(102)}','${id(501)}','2026-09-03 10:00:00+00',3,'daily_baseline'),
      ('${id(605)}','${id(402)}','${id(201)}','${id(501)}','2026-09-03 10:00:00+00',5,'daily_baseline'),
      ('${id(606)}','${id(402)}','${id(301)}','${id(501)}','2026-09-03 10:00:00+00',5,'daily_baseline'),
      ('${id(607)}','${id(403)}','${id(101)}','${id(501)}','2026-09-04 10:00:00+00',7,'change');
  `);
  sql(migration);

  const alphaM = query(`select row_to_json(v) from public.vault_historical_size_availability_observation_evidence v where canonical_style_id='${id(1)}::Alpha' and normalized_size='M'`);
  assert.equal(alphaM.first_observed_at, "2026-09-01T09:00:00+00:00");
  assert.equal(alphaM.latest_observed_at, "2026-09-03T09:00:00+00:00");
  assert.equal(alphaM.first_observation_date, "2026-09-01");
  assert.equal(alphaM.latest_observation_date, "2026-09-03");
  assert.equal(alphaM.total_observation_count, 3);
  assert.equal(alphaM.distinct_observation_date_count, 3);
  assert.equal(alphaM.distinct_successful_inventory_sync_run_count, 2);
  assert.equal(alphaM.distinct_location_count, 2);
  assert.equal(alphaM.positive_available_observation_count, 1);
  assert.equal(alphaM.zero_available_observation_count, 1);
  assert.equal(alphaM.negative_available_observation_count, 1);
  assert.equal(alphaM.zero_or_negative_available_observation_count, 2);
  assert.equal(alphaM.minimum_observed_available, -2);
  assert.equal(alphaM.maximum_observed_available, 4);
  assert.equal(alphaM.legacy_observation_count, 1);
  assert.equal(alphaM.daily_baseline_observation_count, 1);
  assert.equal(alphaM.change_observation_count, 1);

  const pointObservationSequence = query(`select json_build_object(
    'total_observation_count', total_observation_count,
    'first_observed_at', first_observed_at,
    'latest_observed_at', latest_observed_at,
    'positive_available_observation_count', positive_available_observation_count,
    'zero_available_observation_count', zero_available_observation_count,
    'negative_available_observation_count', negative_available_observation_count
  ) from public.vault_historical_size_availability_observation_evidence where canonical_style_id='${id(1)}::Alpha' and normalized_size='M'`);
  assert.deepEqual(pointObservationSequence, {
    total_observation_count: 3,
    first_observed_at: "2026-09-01T09:00:00+00:00",
    latest_observed_at: "2026-09-03T09:00:00+00:00",
    positive_available_observation_count: 1,
    zero_available_observation_count: 1,
    negative_available_observation_count: 1,
  }, "multiple timestamped states remain factual point observations, not an inferred availability interval");

  const rows = query("select coalesce(json_agg(json_build_object('style',canonical_style_id,'size',normalized_size) order by canonical_style_id,normalized_size),'[]') from public.vault_historical_size_availability_observation_evidence");
  assert.deepEqual(rows, [
    { style: `${id(1)}::Alpha`, size: "M" },
    { style: `${id(1)}::Alpha`, size: "S" },
  ], "unresolved and duplicate Shopify identities must not enter the canonical projection");

  const provenance = query("select row_to_json(v) from public.vault_historical_size_availability_observation_provenance v");
  assert.equal(provenance.total_successful_observation_count, 6);
  assert.equal(provenance.deterministically_mapped_observation_count, 4);
  assert.equal(provenance.unresolved_or_incomplete_canonical_mapping_observation_count, 2);
  assert.equal(provenance.distinct_location_count, 2);
  assert.equal(provenance.distinct_successful_inventory_sync_run_count, 2);

  const fields = query("select coalesce(json_agg(column_name order by column_name),'[]') from information_schema.columns where table_schema='public' and table_name='vault_historical_size_availability_observation_evidence'");
  assert.equal(fields.some((field) => /duration|hour|period|opportunity|censor|sales|demand|curve|forecast|reorder|buy/i.test(field)), false, "projection must not infer intervals, availability opportunity, sales, or decisions");
  assert.equal(migration.includes("lead("), false);
  assert.equal(migration.includes("lag("), false);
  assert.match(migration, /current governed vault_variants mapping at query time, is not historically versioned, and does not prove the current identity was the historical identity at an observation timestamp/);
});
