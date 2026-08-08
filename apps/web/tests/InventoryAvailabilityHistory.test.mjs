import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../../../", import.meta.url);
const migrationUrl = new URL("supabase/migrations/20260815000000_inventory_availability_history.sql", repositoryRoot);
const syncUrl = new URL("supabase/functions/shopify-inventory-sync/index.ts", repositoryRoot);

test("schema stores append-only variant/location observations for each sync run", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const field of [
    "inventory_sync_run_id", "variant_id", "location_id", "observed_at",
    "available", "committed", "incoming", "on_hand", "available_for_sale",
    "inventory_tracked", "created_at",
  ]) assert.match(sql, new RegExp(`\\b${field}\\b`));
  assert.match(sql, /unique \(inventory_sync_run_id, variant_id, location_id\)/);
  assert.match(sql, /before update or delete on public\.vault_inventory_level_snapshots/);
  assert.match(sql, /raise exception 'vault_inventory_level_snapshots is append-only'/);
});

test("later successful runs append observations while exact-run retries are idempotent", async () => {
  const [sql, sync] = await Promise.all([readFile(migrationUrl, "utf8"), readFile(syncUrl, "utf8")]);
  assert.match(sql, /unique \(inventory_sync_run_id, variant_id, location_id\)/);
  assert.match(sync, /inventory_sync_run_id: run\.id/);
  assert.match(sync, /onConflict: "inventory_sync_run_id,variant_id,location_id"/);
  assert.match(sync, /ignoreDuplicates: true/);
  const snapshotWrite = sync.match(/\.from\("vault_inventory_level_snapshots"\)[\s\S]*?if \(snapshotError\)/)?.[0] ?? "";
  assert.doesNotMatch(snapshotWrite, /\.update\(/);
});

test("snapshot uses the same canonical quantities and timestamp as current inventory", async () => {
  const sync = await readFile(syncUrl, "utf8");
  assert.match(sync, /observed_at: syncedAt/);
  assert.match(sync, /available: row\.available_quantity/);
  assert.match(sync, /committed: row\.committed_quantity/);
  assert.match(sync, /incoming: row\.incoming_quantity/);
  assert.match(sync, /on_hand: row\.on_hand_quantity/);
  assert.match(sync, /synced_at: syncedAt/);
  assert.match(sync, /from\(\s*"vault_inventory_levels"[\s\S]*onConflict:\s*"variant_id,location_id"/);
});

test("a run becomes current only after all snapshot writes succeed", async () => {
  const sync = await readFile(syncUrl, "utf8");
  const snapshotWrite = sync.indexOf('.from("vault_inventory_level_snapshots")');
  const currentCompletion = sync.indexOf('sync_status: "current"', snapshotWrite);
  assert.ok(snapshotWrite > 0);
  assert.ok(currentCompletion > snapshotWrite);
  assert.match(sync, /if \(snapshotError\) throw snapshotError/);
  assert.match(sync, /sync_status: "failed"/);
});

test("derived evidence excludes partial failed runs and never claims window completeness", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /successful_run\.sync_status = 'current'/);
  assert.match(sql, /earliest_observed_at/);
  assert.match(sql, /latest_observed_at/);
  assert.match(sql, /observation_count/);
  assert.match(sql, /observation_history_exists/);
  assert.match(sql, /Observation count does not imply 7\/14\/30-day completeness/);
  assert.doesNotMatch(sql, /ADEQUATELY_AVAILABLE|AVAILABILITY_CONSTRAINED/);
});

test("raw options are preserved without guessing normalized size", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /variant\.option_1 as raw_option_1/);
  assert.match(sql, /variant\.option_2 as raw_option_2/);
  assert.match(sql, /variant\.option_3 as raw_option_3/);
  assert.match(sql, /null::text as normalized_size/);
  assert.match(sql, /unavailable_option_names_not_persisted/);
});

test("security and retention contracts prohibit browser writes and retain at least 120 days", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /revoke all on public\.vault_inventory_level_snapshots from anon, authenticated/);
  assert.match(sql, /grant select on public\.vault_inventory_level_snapshots to authenticated/);
  assert.match(sql, /operator\.is_active = true/);
  assert.match(sql, /Retain for at least 120 days; no automatic deletion is configured/);
  assert.doesNotMatch(sql, /interval '[0-9]{1,2} days'/);
});
