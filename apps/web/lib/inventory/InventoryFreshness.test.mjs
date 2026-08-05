import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  deriveInventorySyncStatus,
  INVENTORY_FRESHNESS_THRESHOLD_MS,
} from "./InventoryFreshness.ts";

const completed = (completedAt) => ({
  sync_status: "current",
  sync_started_at: completedAt,
  sync_completed_at: completedAt,
});

test("canonical inventory status uses the approved 30-minute threshold", () => {
  const now = new Date("2026-08-05T12:00:00.000Z");
  const atThreshold = completed(new Date(now.getTime() - INVENTORY_FRESHNESS_THRESHOLD_MS).toISOString());
  const beyondThreshold = completed(new Date(now.getTime() - INVENTORY_FRESHNESS_THRESHOLD_MS - 1).toISOString());

  assert.equal(deriveInventorySyncStatus({ latestRun: atThreshold, latestSuccessfulRun: atThreshold, now }), "current");
  assert.equal(deriveInventorySyncStatus({ latestRun: beyondThreshold, latestSuccessfulRun: beyondThreshold, now }), "delayed");
});

test("syncing and failed runs take precedence over prior success", () => {
  const success = completed("2026-08-05T11:55:00.000Z");
  assert.equal(deriveInventorySyncStatus({
    latestRun: { ...success, sync_status: "syncing", sync_completed_at: null },
    latestSuccessfulRun: success,
    now: new Date("2026-08-05T12:00:00.000Z"),
  }), "syncing");
  assert.equal(deriveInventorySyncStatus({
    latestRun: { ...success, sync_status: "failed" },
    latestSuccessfulRun: success,
    now: new Date("2026-08-05T12:00:00.000Z"),
  }), "failed");
});

test("absence of a successful run is delayed, not fabricated current", () => {
  assert.equal(deriveInventorySyncStatus({
    latestRun: null,
    latestSuccessfulRun: null,
    now: new Date("2026-08-05T12:00:00.000Z"),
  }), "delayed");
});

test("scheduled and manual refresh use the single canonical Edge Function", async () => {
  const [edgeFunction, route, migration, liveSnapshot, panel] = await Promise.all([
    readFile(new URL("../../../../supabase/functions/shopify-inventory-sync/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/inventory/refresh/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../../supabase/migrations/20260806000000_shopify_inventory_sync_schedule.sql", import.meta.url), "utf8"),
    readFile(new URL("../brain/getLiveInventorySnapshot.ts", import.meta.url), "utf8"),
    readFile(new URL("../../components/inventory/InventorySyncPanel.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(edgeFunction, /from\(\s*"vault_inventory_levels"/);
  assert.match(edgeFunction, /vault_shopify_inventory_sync_runs/);
  assert.match(route, /functions\.invoke\(\s*"shopify-inventory-sync"/);
  assert.match(migration, /functions\/v1\/shopify-inventory-sync/);
  assert.match(migration, /'\*\/10 \* \* \* \*'/);
  assert.match(liveSnapshot, /InventorySyncRepository\.getFreshness/);
  assert.match(route, /authorizeApiRequest\(\["owner", "operator"\]\)/);
  assert.match(panel, /disabled=\{refreshing \|\| freshness\.syncStatus === "syncing"\}/);
  assert.match(panel, /router\.refresh\(\)/);
  assert.match(panel, /Refreshing…/);
  assert.doesNotMatch(route, /vault_inventory_levels/);
  assert.doesNotMatch(migration, /(?:insert\s+into|update|upsert)[\s\S]*vault_inventory_levels/i);
});

test("freshness contract exposes required diagnostics", async () => {
  const contract = await readFile(new URL("./InventoryFreshness.ts", import.meta.url), "utf8");
  for (const field of [
    "lastInventorySync", "syncStatus", "syncDuration", "productsProcessed",
    "productsUpdated", "syncStartedAt", "syncCompletedAt", "shopifyApiSuccess", "errors",
  ]) assert.match(contract, new RegExp(`\\b${field}\\b`));
  for (const status of ["syncing", "current", "delayed", "failed"]) {
    assert.match(contract, new RegExp(`"${status}"`));
  }
});
