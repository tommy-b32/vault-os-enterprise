import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("deferred retry scheduler is fail-closed and replaces only its own named job", async () => {
  const migration = await read("../../supabase/migrations/20261124000000_provision_sales_workbook_deferred_retry_scheduler.sql");
  for (const secret of [
    "vault_sales_workbook_deferred_retry_base_url",
    "vault_shopify_order_sync_service_role_jwt",
    "vault_order_sync_secret",
  ]) assert.match(migration, new RegExp(secret));
  assert.match(migration, /raise exception 'sales workbook deferred retry cron configuration is unavailable';/);
  assert.match(migration, /for job_id in select jobid from cron\.job where jobname = 'vault-sales-workbook-deferred-retry'/);
  assert.match(migration, /perform cron\.unschedule\(job_id\);/);
  assert.match(migration, /perform cron\.schedule\([\s\S]*?'vault-sales-workbook-deferred-retry',[\s\S]*?'\*\/15 \* \* \* \*'/);
  assert.match(migration, /Authorization', 'Bearer ' \|\|/);
  assert.match(migration, /'apikey'/);
  assert.match(migration, /'x-vault-sync-secret'/);
  assert.doesNotMatch(migration, /mzrimaqjyrvtbpaeyooe|vault-os-enterprise-5f4k/);
});

test("scheduler targets the authenticated relay, which only forwards to the authenticated retry route", async () => {
  const [migration, relay, retryRoute] = await Promise.all([
    read("../../supabase/migrations/20261124000000_provision_sales_workbook_deferred_retry_scheduler.sql"),
    read("../../supabase/functions/sales-workbook-deferred-retry/index.ts"),
    read("app/api/internal/sales-workbook/deferred-retry/route.ts"),
  ]);
  assert.match(migration, /\/functions\/v1\/sales-workbook-deferred-retry/);
  assert.match(relay, /request\.method!=="POST"/);
  assert.match(relay, /x-vault-sync-secret/);
  assert.match(relay, /x-vault-sales-workbook-automation-secret/);
  assert.match(retryRoute, /timingSafeEqual/);
  assert.match(retryRoute, /runOrderReadyWorkbookWorker/);
});
