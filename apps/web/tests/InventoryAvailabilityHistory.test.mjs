import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../../../", import.meta.url);
const migrationUrl = new URL("supabase/migrations/20260815000000_inventory_availability_history.sql", repositoryRoot);
const retentionMigrationUrl = new URL("supabase/migrations/20260904000000_storage_safe_inventory_and_supplier_catalogue_lifecycle.sql", repositoryRoot);
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

test("unchanged syncs are suppressed while changes, daily baselines and retries are deterministic", async () => {
  const [sql, sync] = await Promise.all([readFile(retentionMigrationUrl, "utf8"), readFile(syncUrl, "utf8")]);
  assert.match(sql, /vault_inventory_level_snapshots_daily_baseline_idx/);
  assert.match(sync, /inventory_sync_run_id: run\.id/);
  assert.match(sync, /record_inventory_level_history/);
  assert.match(sql, /available is distinct from previous_available/);
  assert.match(sql, /committed is distinct from previous_committed/);
  assert.match(sql, /history_kind = 'daily_baseline'/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /on conflict do nothing/);
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
  const snapshotWrite = sync.indexOf('"record_inventory_level_history"');
  const currentCompletion = sync.indexOf('sync_status: "current"', snapshotWrite);
  assert.ok(snapshotWrite > 0);
  assert.ok(currentCompletion > snapshotWrite);
  assert.match(sync, /if \(snapshotError\) throw snapshotError/);
  assert.match(sync, /sync_status: "failed"/);
});

test("retention keeps 48-hour detail, one London daily row, the latest row, and twelve months", async () => {
  const sql = await readFile(retentionMigrationUrl, "utf8");
  assert.match(sql, /interval '48 hours'/);
  assert.match(sql, /interval '12 months'/);
  assert.match(sql, /at time zone 'Europe\/London'/);
  assert.match(sql, /latest_rank <> 1/);
  assert.match(sql, /daily_rank <> 1/);
  assert.match(sql, /batch_size > 25000/);
  assert.match(sql, /vault-inventory-history-retention/);
  assert.doesNotMatch(sql, /cleanup_inventory_level_history_batch\([0-9]+\);\s*-- immediate/i);
});

test("freshness remains tied to successful sync completion when history has no change", async () => {
  const [sync, repository] = await Promise.all([
    readFile(syncUrl, "utf8"),
    readFile(new URL("apps/web/lib/inventory/InventorySyncRepository.ts", repositoryRoot), "utf8"),
  ]);
  assert.match(sync, /historyRowsInserted/);
  assert.match(sync, /sync_status: "current"/);
  assert.match(repository, /latestSuccessfulRun\?\.sync_completed_at/);
  assert.doesNotMatch(repository, /vault_inventory_level_snapshots/);
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
