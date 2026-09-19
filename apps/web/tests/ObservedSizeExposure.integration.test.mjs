import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("fixtures/phase3d1-postgres-schema.sql", import.meta.url), "utf8");
const migrations = await Promise.all([
  "20260912000000_canonical_model_size_replenishment_evidence.sql",
  "20261005000000_canonical_historical_model_size_evidence.sql",
  "20261006000000_size_distribution_evidence_assessment.sql",
  "20261007000000_size_evidence_sufficiency_foundation.sql",
  "20261008000000_fix_size_evidence_sufficiency_sets.sql",
  "20261009000000_observed_size_exposure_foundation.sql",
].map((filename) => readFile(new URL(`../../../supabase/migrations/${filename}`, import.meta.url), "utf8")));
const [currentMigration, historicalMigration, assessmentMigration, sufficiencyMigration, sufficiencySetsFixMigration, exposureMigration] = migrations;
const container = `vault-phase1b6-exposure-test-${process.pid}`;
const password = "phase1b6-disposable-only";
let started = false;

function docker(args, input) {
  const result = spawnSync("docker", args, { encoding: "utf8", input });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function sql(statement) {
  docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "vault_phase1b6_test", "-X", "-q"], statement);
}

function query(statement) {
  const result = docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "vault_phase1b6_test", "-X", "-q", "-t", "-A"], statement);
  return result ? JSON.parse(result) : null;
}

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const styleId = `${id(1)}::Exposure`;
const serviceableStyleId = `${id(2)}::Serviceable`;
const unavailableStyleId = `${id(3)}::Unavailable`;
const negativeStyleId = `${id(4)}::Negative`;
const stockSplitStyleId = `${id(5)}::Stock Split`;
const missingInventoryStyleId = `${id(6)}::Missing Inventory`;

test("Phase 1B6B reports exact historical observed-size exposure", async (t) => {
  t.after(() => {
    if (started) spawnSync("docker", ["rm", "-f", container], { encoding: "utf8" });
  });
  docker(["run", "--rm", "-d", "--name", container, "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=vault_phase1b6_test", "postgres:17"]);
  started = true;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { query("select 1"); break; } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (attempt === 29) throw new Error("PostgreSQL did not become ready");
    }
  }

  sql(schema);
  sql(currentMigration);
  sql(`
    create table test_trading (
      style_id text primary key,
      parent_product_id uuid,
      style_name text,
      verified_live_at timestamptz,
      evidence_as_of timestamptz,
      coverage_complete boolean,
      order_evidence_fresh boolean
    );
    create view public.vault_style_trading_evidence as
      select test_trading.*, 'SUFFICIENT_EVIDENCE'::text as maturity_state from test_trading;
    create table public.vault_shopify_inventory_sync_runs (id uuid primary key, sync_status text not null);
    create table public.vault_locations (id uuid primary key);
    create table public.vault_inventory_level_snapshots (
      id uuid primary key, inventory_sync_run_id uuid, variant_id uuid,
      location_id uuid, observed_at timestamptz, available integer
    );

    insert into public.vault_products values
      ('${id(1)}', 'shopify', 'ACTIVE'), ('${id(2)}', 'shopify', 'ACTIVE'),
      ('${id(3)}', 'shopify', 'ACTIVE'), ('${id(4)}', 'shopify', 'ACTIVE'),
      ('${id(5)}', 'shopify', 'ACTIVE'), ('${id(6)}', 'shopify', 'ACTIVE');
    insert into public.vault_variants values
      ('${id(101)}', '${id(1)}', 'shopify', 'exposure-s', 'Exposure', 'S', true, 'resolved'),
      ('${id(102)}', '${id(1)}', 'shopify', 'exposure-m', 'Exposure', 'M', true, 'resolved'),
      ('${id(103)}', '${id(1)}', 'shopify', 'exposure-l', 'Exposure', 'L', true, 'resolved'),
      ('${id(104)}', '${id(1)}', 'shopify', 'exposure-xl', 'Exposure', 'XL', true, 'resolved'),
      ('${id(105)}', '${id(2)}', 'shopify', 'serviceable-s', 'Serviceable', 'S', true, 'resolved'),
      ('${id(106)}', '${id(2)}', 'shopify', 'serviceable-m', 'Serviceable', 'M', true, 'resolved'),
      ('${id(107)}', '${id(3)}', 'shopify', 'unavailable-s', 'Unavailable', 'S', true, 'resolved'),
      ('${id(108)}', '${id(3)}', 'shopify', 'unavailable-m', 'Unavailable', 'M', true, 'resolved'),
      ('${id(109)}', '${id(4)}', 'shopify', 'negative-m', 'Negative', 'M', true, 'resolved'),
      ('${id(110)}', '${id(5)}', 'shopify', 'stock-split-s', 'Stock Split', 'S', true, 'resolved'),
      ('${id(111)}', '${id(5)}', 'shopify', 'stock-split-xl', 'Stock Split', 'XL', true, 'resolved'),
      ('${id(112)}', '${id(6)}', 'shopify', 'missing-inventory-m', 'Missing Inventory', 'M', true, 'resolved'),
      ('${id(113)}', '${id(6)}', 'shopify', 'missing-inventory-l', 'Missing Inventory', 'L', true, 'resolved');
    insert into public.vault_inventory_levels values
      ('${id(201)}', '${id(101)}', 3, 0, 0, now()),
      ('${id(202)}', '${id(102)}', 0, 0, 0, now()),
      ('${id(203)}', '${id(103)}', 0, 0, 0, now()),
      ('${id(204)}', '${id(104)}', 4, 0, 0, now()),
      ('${id(205)}', '${id(105)}', 2, 0, 0, now()),
      ('${id(206)}', '${id(106)}', 4, 0, 0, now()),
      ('${id(207)}', '${id(107)}', 0, 0, 0, now()),
      ('${id(208)}', '${id(108)}', 0, 0, 0, now()),
      ('${id(209)}', '${id(109)}', 0, 1, 0, now()),
      ('${id(210)}', '${id(110)}', 3, 0, 0, now()),
      ('${id(211)}', '${id(111)}', 5, 0, 0, now()),
      ('${id(212)}', '${id(112)}', 2, 0, 0, now());
    insert into public.vault_shopify_order_sync_runs values ('${id(301)}', 30, now());
    insert into public.vault_shopify_orders values
      ('${id(401)}', now() - interval '31 days', null, '{}'),
      ('${id(402)}', now() - interval '29 days', null, '{}'),
      ('${id(403)}', now() - interval '28 days', null, '{}'),
      ('${id(404)}', now() - interval '27 days', null, '{}'),
      ('${id(405)}', now() - interval '26 days', null, '{}'),
      ('${id(406)}', now() - interval '25 days', null, '{}'),
      ('${id(407)}', now() - interval '24 days', null, '{}'),
      ('${id(408)}', now() - interval '23 days', null, '{}'),
      ('${id(409)}', now() - interval '22 days', null, '{}'),
      ('${id(410)}', now() - interval '21 days', null, '{}'),
      ('${id(411)}', now() - interval '20 days', null, '{}'),
      ('${id(412)}', now() - interval '19 days', null, '{}');
    insert into public.vault_shopify_order_lines values
      ('${id(501)}', '${id(401)}', 'exposure-s', 1, 0),
      ('${id(502)}', '${id(402)}', 'exposure-m', 7, 0),
      ('${id(503)}', '${id(403)}', 'exposure-l', 8, 0),
      ('${id(504)}', '${id(404)}', 'exposure-xl', 4, 0),
      ('${id(505)}', '${id(405)}', 'serviceable-s', 2, 0),
      ('${id(506)}', '${id(406)}', 'serviceable-m', 3, 0),
      ('${id(507)}', '${id(407)}', 'unavailable-s', 2, 0),
      ('${id(508)}', '${id(408)}', 'unavailable-m', 3, 0),
      ('${id(509)}', '${id(409)}', 'negative-m', 6, 0),
      ('${id(510)}', '${id(410)}', 'stock-split-s', 2, 0),
      ('${id(511)}', '${id(411)}', 'missing-inventory-m', 4, 0),
      ('${id(512)}', '${id(412)}', 'missing-inventory-l', 6, 0);
    insert into test_trading values
      ('${styleId}', '${id(1)}', 'Exposure', now() - interval '40 days', now() - interval '1 minute', true, true),
      ('${serviceableStyleId}', '${id(2)}', 'Serviceable', now() - interval '40 days', now() - interval '1 minute', true, true),
      ('${unavailableStyleId}', '${id(3)}', 'Unavailable', now() - interval '40 days', now() - interval '1 minute', true, true),
      ('${negativeStyleId}', '${id(4)}', 'Negative', now() - interval '40 days', now() - interval '1 minute', true, true),
      ('${stockSplitStyleId}', '${id(5)}', 'Stock Split', now() - interval '40 days', now() - interval '1 minute', true, true),
      ('${missingInventoryStyleId}', '${id(6)}', 'Missing Inventory', now() - interval '40 days', now() - interval '1 minute', true, true);
  `);

  sql(historicalMigration);
  sql(assessmentMigration);
  sql(sufficiencyMigration);
  sql(sufficiencySetsFixMigration);
  sql(exposureMigration);

  const historicalUnits = query(`
    select coalesce(json_agg(json_build_object('size', normalized_size, 'units', historical_attributable_observed_units) order by normalized_size), '[]')
    from public.vault_historical_model_size_evidence
    where style_id = '${styleId}'
  `);
  assert.deepEqual(historicalUnits, [
    { size: "L", units: 8 }, { size: "M", units: 7 }, { size: "S", units: 1 }, { size: "XL", units: 4 },
  ], "fixture historical units must use governed historical evidence");

  const historicalSizes = query(`
    select array_to_json(sizes_observed_historically) from public.vault_size_evidence_sufficiency
    where canonical_style_id = '${styleId}'
  `);
  assert.deepEqual(historicalSizes, ["L", "M", "S", "XL"], "fixture must expose its complete governed historical size set");

  const inventory = query(`
    select coalesce(json_agg(json_build_object('size', normalized_size, 'stock', net_available_stock) order by normalized_size), '[]')
    from public.vault_model_size_replenishment_intelligence
    where style_id = '${styleId}'
  `);
  assert.deepEqual(inventory, [
    { size: "L", stock: 0 }, { size: "M", stock: 0 }, { size: "S", stock: 3 }, { size: "XL", stock: 4 },
  ], "fixture inventory must retain the exact trusted current stock context");
  assert.equal(query(`select coalesce(to_json(bool_and(trusted)), 'null'::json) from public.vault_model_size_replenishment_intelligence where style_id = '${styleId}'`), true);
  assert.equal(query(`select to_json(size_evidence_sufficiency_state) from public.vault_size_evidence_sufficiency where canonical_style_id = '${styleId}'`), "DESCRIPTIVE_ONLY");

  const exposure = query(`select row_to_json(v) from public.vault_observed_size_exposure v where canonical_style_id = '${styleId}'`);
  assert.equal(exposure.observed_exposure_available, true);
  assert.equal(exposure.historical_observed_units, 20);
  assert.equal(exposure.historical_observed_serviceable_units, 5);
  assert.equal(exposure.historical_observed_exposed_units, 15);
  assert.equal(exposure.historical_observed_serviceable_share, 0.25);
  assert.equal(exposure.historical_observed_exposed_share, 0.75);
  assert.deepEqual(exposure.historical_observed_unavailable_sizes, ["L", "M"]);
  assert.deepEqual(exposure.historical_observed_serviceable_sizes, ["S", "XL"]);
  assert.equal(exposure.historical_observed_units, exposure.historical_observed_serviceable_units + exposure.historical_observed_exposed_units);
  assert.equal(exposure.historical_observed_serviceable_share + exposure.historical_observed_exposed_share, 1);
  assert.equal(Object.keys(exposure).some((key) => /healthy|degraded|broken|confidence|recommend|reorder|buy/i.test(key)), false);

  const serviceable = query(`select row_to_json(v) from public.vault_observed_size_exposure v where canonical_style_id = '${serviceableStyleId}'`);
  assert.equal(serviceable.observed_exposure_available, true);
  assert.equal(serviceable.historical_observed_units > 0, true);
  assert.equal(serviceable.historical_observed_serviceable_units, serviceable.historical_observed_units);
  assert.equal(serviceable.historical_observed_exposed_units, 0);
  assert.equal(serviceable.historical_observed_serviceable_share, 1);
  assert.equal(serviceable.historical_observed_exposed_share, 0);
  assert.deepEqual(serviceable.current_observed_sizes, ["M", "S"]);
  assert.deepEqual(serviceable.current_observed_serviceable_sizes, ["M", "S"]);
  assert.deepEqual(serviceable.current_observed_unavailable_sizes, []);
  assert.deepEqual(serviceable.historical_observed_serviceable_sizes, ["M", "S"]);
  assert.deepEqual(serviceable.historical_observed_unavailable_sizes, []);

  const unavailable = query(`select row_to_json(v) from public.vault_observed_size_exposure v where canonical_style_id = '${unavailableStyleId}'`);
  assert.equal(unavailable.observed_exposure_available, true);
  assert.equal(unavailable.historical_observed_units > 0, true);
  assert.equal(unavailable.historical_observed_serviceable_units, 0);
  assert.equal(unavailable.historical_observed_exposed_units, unavailable.historical_observed_units);
  assert.equal(unavailable.historical_observed_serviceable_share, 0);
  assert.equal(unavailable.historical_observed_exposed_share, 1);
  assert.deepEqual(unavailable.current_observed_sizes, ["M", "S"]);
  assert.deepEqual(unavailable.current_observed_unavailable_sizes, ["M", "S"]);
  assert.deepEqual(unavailable.current_observed_serviceable_sizes, []);
  assert.deepEqual(unavailable.historical_observed_unavailable_sizes, ["M", "S"]);
  assert.deepEqual(unavailable.historical_observed_serviceable_sizes, []);

  const negativeInventory = query(`
    select row_to_json(v) from public.vault_model_size_replenishment_intelligence v
    where style_id = '${negativeStyleId}' and normalized_size = 'M'
  `);
  assert.equal(negativeInventory.trusted, true);
  assert.equal(negativeInventory.net_available_stock, -1, "signed net stock must remain governed rather than clamped");
  const negative = query(`select row_to_json(v) from public.vault_observed_size_exposure v where canonical_style_id = '${negativeStyleId}'`);
  assert.equal(negative.observed_exposure_available, true);
  assert.deepEqual(negative.historical_observed_unavailable_sizes, ["M"]);
  assert.equal(negative.historical_observed_units, 6);
  assert.equal(negative.historical_observed_exposed_units, 6);
  assert.equal(negative.historical_observed_serviceable_units, 0);
  assert.equal(negative.total_current_stock, -1, "stock context also preserves signed inventory");
  assert.equal(negative.current_stock_in_historically_observed_sizes, -1);
  assert.equal(negative.current_stock_in_historically_unobserved_sizes, null);

  const stockSplit = query(`select row_to_json(v) from public.vault_observed_size_exposure v where canonical_style_id = '${stockSplitStyleId}'`);
  assert.equal(stockSplit.observed_exposure_available, true);
  assert.deepEqual(stockSplit.historical_observed_sizes, ["S"]);
  assert.equal(stockSplit.historical_observed_units, 2, "unobserved XL stock must not enter the historical observed-unit denominator");
  assert.equal(stockSplit.historical_observed_serviceable_units, 2);
  assert.equal(stockSplit.historical_observed_exposed_units, 0);
  assert.equal(stockSplit.historical_observed_serviceable_share, 1);
  assert.equal(stockSplit.historical_observed_exposed_share, 0);
  assert.equal(stockSplit.current_stock_in_historically_observed_sizes, 3);
  assert.equal(stockSplit.current_stock_in_historically_unobserved_sizes, 5);
  assert.equal(stockSplit.total_current_stock, 8);
  assert.equal(stockSplit.current_stock_in_historically_observed_sizes + stockSplit.current_stock_in_historically_unobserved_sizes, stockSplit.total_current_stock);

  assert.equal(query(`select to_json(total_historical_observed_units) from public.vault_size_evidence_sufficiency where canonical_style_id = '${missingInventoryStyleId}'`), 10);
  const missingInventory = query(`select row_to_json(v) from public.vault_observed_size_exposure v where canonical_style_id = '${missingInventoryStyleId}'`);
  assert.equal(missingInventory.observed_exposure_available, false);
  assert.equal(missingInventory.historical_observed_units, 10, "missing inventory must not hide governed historical observed demand");
  assert.deepEqual(missingInventory.historical_observed_sizes, ["L", "M"]);
  for (const field of ["historical_observed_unavailable_sizes", "historical_observed_serviceable_sizes", "historical_observed_serviceable_units", "historical_observed_exposed_units", "historical_observed_serviceable_share", "historical_observed_exposed_share"]) assert.equal(missingInventory[field], null, `${field} must fail closed`);

  sql(`
    insert into public.vault_products values ('${id(7)}','shopify','ACTIVE'),('${id(8)}','shopify','ACTIVE'),('${id(9)}','shopify','ACTIVE'),('${id(10)}','shopify','ACTIVE');
    insert into public.vault_variants values
      ('${id(114)}','${id(7)}','shopify','untrusted-m','Untrusted Inventory','M',true,'resolved'),('${id(115)}','${id(7)}','shopify','untrusted-l','Untrusted Inventory','L',true,'resolved'),
      ('${id(116)}','${id(8)}','shopify','historical-only-m','Historical Only','M',true,'resolved'),('${id(117)}','${id(9)}','shopify','current-only-m','Current Only','M',true,'resolved'),
      ('${id(118)}','${id(10)}','shopify','not-observed-m','Not Observed','M',true,'resolved');
    insert into public.vault_inventory_levels values
      ('${id(213)}','${id(114)}',2,0,0,now()),('${id(214)}','${id(115)}',2,0,0,now()-interval '1 hour'),('${id(215)}','${id(116)}',2,0,0,now()),('${id(216)}','${id(117)}',2,0,0,now()),('${id(217)}','${id(118)}',2,0,0,now());
    insert into public.vault_shopify_orders values ('${id(413)}',now()-interval '18 days',null,'{}'),('${id(414)}',now()-interval '17 days',null,'{}'),('${id(415)}',now()-interval '31 days',null,'{}'),('${id(416)}',now()-interval '10 days',null,'{}');
    insert into public.vault_shopify_order_lines values ('${id(513)}','${id(413)}','untrusted-m',4,0),('${id(514)}','${id(414)}','untrusted-l',6,0),('${id(515)}','${id(415)}','historical-only-m',5,0),('${id(516)}','${id(416)}','current-only-m',7,0);
    insert into test_trading values
      ('${id(7)}::Untrusted Inventory','${id(7)}','Untrusted Inventory',now()-interval '40 days',now()-interval '1 minute',true,true),
      ('${id(8)}::Historical Only','${id(8)}','Historical Only',now()-interval '40 days',now()-interval '1 minute',true,true),
      ('${id(9)}::Current Only','${id(9)}','Current Only',now()-interval '40 days',now()-interval '15 days',true,true),
      ('${id(10)}::Not Observed','${id(10)}','Not Observed',now()-interval '40 days',now()-interval '1 minute',true,true);
  `);
  const untrusted = query(`select row_to_json(v) from public.vault_observed_size_exposure v where canonical_style_id='${id(7)}::Untrusted Inventory'`);
  assert.equal(untrusted.observed_exposure_available,false); assert.equal(untrusted.historical_observed_units,10); assert.deepEqual(untrusted.historical_observed_sizes,["L","M"]);
  for (const field of ["historical_observed_unavailable_sizes","historical_observed_serviceable_sizes","historical_observed_serviceable_units","historical_observed_exposed_units","historical_observed_serviceable_share","historical_observed_exposed_share"]) assert.equal(untrusted[field],null);
  const historicalOnly=query(`select row_to_json(v) from public.vault_observed_size_exposure v where canonical_style_id='${id(8)}::Historical Only'`);
  assert.deepEqual(historicalOnly.historical_observed_sizes,["M"]); assert.equal(historicalOnly.historical_observed_units,5); assert.deepEqual(historicalOnly.current_observed_sizes,[]); assert.equal(historicalOnly.current_observed_units,null); assert.equal(historicalOnly.historical_observed_units,historicalOnly.historical_observed_serviceable_units+historicalOnly.historical_observed_exposed_units);
  const currentOnly=query(`select row_to_json(v) from public.vault_observed_size_exposure v where canonical_style_id='${id(9)}::Current Only'`);
  assert.deepEqual(currentOnly.current_observed_sizes,["M"]); assert.equal(currentOnly.current_observed_units,7); assert.deepEqual(currentOnly.historical_observed_sizes,[]); assert.equal(currentOnly.historical_observed_units,null); assert.equal(currentOnly.observed_exposure_available,false);
  const notObserved=query(`select row_to_json(v) from public.vault_observed_size_exposure v where canonical_style_id='${id(10)}::Not Observed'`);
  assert.equal(notObserved.size_evidence_sufficiency_state,'NOT_OBSERVED'); assert.equal(notObserved.observed_exposure_available,false); assert.equal(notObserved.observed_exposure_unavailable_reason,'no_governed_observed_sizes');
});
