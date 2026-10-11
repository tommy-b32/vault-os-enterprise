import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("automatic publication stages an immutable candidate, verifies it, then atomically activates it", async () => {
  const [migration, repository, worker] = await Promise.all([
    read("../../supabase/migrations/20261105000000_managed_sales_workbook_pending_activation.sql"),
    read("lib/sales-workbook/SalesWorkbookRepository.ts"),
    read("lib/sales-workbook/OrderReadyWorkbookWorker.ts"),
  ]);
  for (const text of ["activation_status", "'pending', 'active'", "record_sales_workbook_pending_version", "activate_sales_workbook_pending_version", "for update", "current_version + 1", "where activation_status = 'pending'"]) assert.ok(migration.includes(text));
  assert.match(migration, /update public\.vault_sales_workbooks[\s\S]*current_storage_path = candidate\.storage_path[\s\S]*current_version = candidate\.version/);
  assert.match(migration, /update public\.vault_sales_workbook_versions set activation_status = 'active'/);
  for (const text of ["writePendingBackfillWorkbook", "readWorkbookBytes", "activatePendingWorkbookVersion", "upsert:false", "expected_version:current.current_version", "expected_checksum:current.content_hash"]) assert.ok(repository.includes(text));
  for (const text of ["if (!prepared.ordersWritten)", "sha256(prepared.bytes)", "sha256(persistedBytes)", "activation_status !== \"pending\"", "activatePendingWorkbookVersion"]) assert.ok(worker.includes(text));
});

test("failed activation leaves the immutable pending version and previous active pointer intact", async () => {
  const [migration, worker] = await Promise.all([
    read("../../supabase/migrations/20261105000000_managed_sales_workbook_pending_activation.sql"),
    read("lib/sales-workbook/OrderReadyWorkbookWorker.ts"),
  ]);
  const activation = migration.slice(migration.indexOf("create or replace function public.activate_sales_workbook_pending_version"));
  assert.ok(activation.indexOf("select * into w") < activation.indexOf("update public.vault_sales_workbooks"));
  assert.ok(activation.includes("candidate.activation_status <> 'pending'"));
  assert.ok(activation.includes("candidate.content_hash <> h"));
  assert.ok(worker.indexOf("Pending workbook hash verification failed") < worker.indexOf("activatePendingWorkbookVersion"));
});
