import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20261001000000_shopify_historical_coverage_maintenance.sql", root), "utf8");

test("maintenance advances only one bounded historical window and preserves recent overlap", async () => {
  const db = new PGlite();
  try {
    await db.exec("create schema cron; create table vault_shopify_order_sync_runs(sync_mode text,created_from timestamptz,created_before timestamptz); create table cron.job(jobid bigint,jobname text);");
    const functionSql = migration.match(/create or replace function[\s\S]*?\$\$;/)?.[0];
    assert.ok(functionSql);
    await db.exec(functionSql);
    await db.exec("insert into vault_shopify_order_sync_runs values ('historical_orders_by_created_at','2026-09-01T00:00:00Z','2026-09-06T23:00:00Z')");
    const row = (await db.query("select * from get_shopify_historical_maintenance_window('2026-09-16T12:00:00Z')")).rows[0];
    assert.equal(new Date(row.created_from).toISOString(), "2026-09-06T23:00:00.000Z");
    assert.equal(new Date(row.created_before).toISOString(), "2026-09-11T12:00:00.000Z");
    assert.ok(Date.parse(row.created_before) - Date.parse(row.created_from) <= 7 * 86400000);
    await db.exec("delete from vault_shopify_order_sync_runs; insert into vault_shopify_order_sync_runs values ('historical_orders_by_created_at','2026-09-01T00:00:00Z','2026-09-11T12:00:00Z')");
    assert.equal((await db.query("select * from get_shopify_historical_maintenance_window('2026-09-16T12:00:00Z')")).rows.length, 0);
  } finally { await db.close(); }
});

test("maintenance schedule is daily, Vault-backed, and uses explicit maintenance mode", () => {
  assert.match(migration, /'17 2 \* \* \*'/);
  assert.match(migration, /vault-shopify-historical-coverage-maintenance/);
  assert.match(migration, /\{"mode":"historical_maintenance"\}/);
  assert.match(migration, /vault_order_sync_secret/);
  assert.match(migration, /interval '5 days'/);
});
