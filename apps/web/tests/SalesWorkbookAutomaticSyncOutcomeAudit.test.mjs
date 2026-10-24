import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migration = new URL("../../../supabase/migrations/20261110000000_sales_workbook_automatic_sync_outcome_audit.sql", import.meta.url);

test("automatic sync outcome is added without broadening the governed audit contract", async () => {
  const sql = await readFile(migration, "utf8");
  for (const event of ["upload", "replace", "download", "validation_failed", "conflict", "backfill_ready_sales_orders", "repair_governed_tracking", "pending_ready_sales_workbook_version", "activate_ready_sales_workbook_version", "multi_field_correction", "automatic_sync_outcome"]) assert.match(sql, new RegExp(`'${event}'`));
  assert.match(sql, /drop constraint if exists vault_sales_workbook_audit_events_event_type_check/);
  assert.doesNotMatch(sql, /grant\s|revoke\s|disable trigger|drop trigger|alter table[^;]*disable/i);
});
