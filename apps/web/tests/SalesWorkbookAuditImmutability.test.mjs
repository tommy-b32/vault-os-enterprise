import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migration = new URL("../../../supabase/migrations/20261112000000_harden_sales_workbook_audit_event_immutability.sql", import.meta.url);

test("Sales Workbook audit events remain insertable but immutable", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /revoke update, delete on public\.vault_sales_workbook_audit_events from service_role/);
  assert.match(sql, /grant select, insert on public\.vault_sales_workbook_audit_events to service_role/);
  assert.match(sql, /before update or delete on public\.vault_sales_workbook_audit_events/);
  assert.match(sql, /sales workbook audit events are immutable/);
  assert.doesNotMatch(sql, /disable trigger|drop constraint|alter column/i);
});
