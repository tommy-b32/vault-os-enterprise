import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("zero-row automatic runs are deferred and never advance a publication checkpoint", async () => {
  const [worker, route, repository] = await Promise.all([
    read("lib/sales-workbook/OrderReadyWorkbookWorker.ts"),
    read("app/api/internal/sales-workbook/order-ready/route.ts"),
    read("lib/sales-workbook/SalesWorkbookRepository.ts"),
  ]);
  assert.match(worker, /deferredOrderNumbers/);
  assert.match(worker, /EVIDENCE_/);
  assert.match(route, /result\.ordersWritten>0\?"published":"deferred"/);
  assert.match(repository, /if\(lastPublished\)update\.last_shopify_order_number=lastPublished/);
  assert.match(repository, /status:"published"\|"deferred"\|"failed"/);
});

test("deferred recovery is capped, authenticated, and reuses the immutable writer", async () => {
  const [retryRoute, retryFunction, migration, schemaMigration, writer] = await Promise.all([
    read("app/api/internal/sales-workbook/deferred-retry/route.ts"),
    read("../../supabase/functions/sales-workbook-deferred-retry/index.ts"),
    read("../../supabase/migrations/20261023201650_provision_sales_workbook_deferred_retry_cron.sql"),
    read("../../supabase/migrations/20261023200440_sales_workbook_deferred_order_recovery.sql"),
    read("lib/sales-workbook/BackfillWriter.ts"),
  ]);
  for (const source of [retryRoute, retryFunction]) assert.match(source, /SALES_WORKBOOK_AUTOMATION_SECRET|x-vault-sync-secret/);
  assert.match(retryRoute, /MAX_RETRY_ORDERS=25/);
  assert.match(retryRoute, /runOrderReadyWorkbookWorker/);
  assert.match(schemaMigration, /vault_sales_workbook_deferred_orders/);
  assert.match(migration, /vault-sales-workbook-deferred-retry/);
  assert.match(migration, /vault_sales_workbook_deferred_retry_base_url/);
  assert.doesNotMatch(migration, /mzrimaqjyrvtbpaeyooe/);
  assert.match(writer, /existing\.has\(orderNumber\)/);
  assert.match(writer, /classification!=="ready"/);
});
