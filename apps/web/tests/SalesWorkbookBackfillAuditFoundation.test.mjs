import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migration = () => readFile(new URL("../../../supabase/migrations/20261094000000_managed_sales_workbook_backfill_audit_foundation.sql", import.meta.url), "utf8");

test("backfill audit event extends, rather than replaces, the existing event contract", async () => {
  const source = await migration();
  for (const event of ["upload", "replace", "download", "validation_failed", "conflict", "backfill_ready_sales_orders"]) {
    assert.match(source, new RegExp(`'${event}'`));
  }
});

test("backfill metadata is a flat exact allow-list with bounded non-negative counters", async () => {
  const source = await migration();
  for (const field of ["sourceWorkbookVersion", "newWorkbookVersion", "ordersWritten", "rowsWritten", "skippedExistingOrders", "skippedReviewOrders", "targetOrderRange"]) {
    assert.match(source, new RegExp(`'${field}'`));
  }
  assert.match(source, /jsonb_typeof\(audit_payload\) <> 'object'/);
  assert.match(source, /count\(\*\).*<> 7/s);
  assert.match(source, /key not in \(/);
  assert.match(source, /\^\(0\|\[1-9\]\[0-9\]\{0,8\}\)\$/);
  assert.match(source, /targetOrderRange'\) !~ '\^\[1-9\]\[0-9\]\{0,8\}-\[1-9\]\[0-9\]\{0,8\}\$'/);
  assert.match(source, /if range_start > range_end then/);
});

test("version and audit changes remain one RPC transaction with guarded backfill identity", async () => {
  const source = await migration();
  assert.match(source, /for update/);
  assert.match(source, /expected_v is distinct from w\.current_version/);
  assert.match(source, /expected_h is distinct from w\.content_hash/);
  assert.match(source, /if source_v <> prior or new_v <> v then/);
  assert.match(source, /insert into public\.vault_sales_workbook_versions[\s\S]*insert into public\.vault_sales_workbook_audit_events/);
  assert.match(source, /e := 'upload'/);
  assert.match(source, /e := 'replace'/);
  assert.match(source, /e := 'backfill_ready_sales_orders'/);
});

test("RPC remains service-role only and application sanitizer excludes nested or unsupported metadata", async () => {
  const [source, repository] = await Promise.all([
    migration(),
    readFile(new URL("lib/sales-workbook/SalesWorkbookRepository.ts", root), "utf8"),
  ]);
  assert.match(source, /security definer/);
  assert.match(source, /revoke all on function public\.record_sales_workbook_version\(jsonb\) from public, anon, authenticated/);
  assert.match(source, /grant execute on function public\.record_sales_workbook_version\(jsonb\) to service_role/);
  assert.match(repository, /sanitizeSalesWorkbookAuditMetadata/);
  assert.match(repository, /BACKFILL_AUDIT_NUMBER_FIELDS/);
  assert.doesNotMatch(repository, /Object\.assign\(.*metadata|\.\.\.value/);
});
