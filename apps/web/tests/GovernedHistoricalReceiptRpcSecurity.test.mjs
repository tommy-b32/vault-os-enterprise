import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migration = new URL("../../../supabase/migrations/20261114000000_secure_governed_historical_receipt_rpcs.sql", import.meta.url);

test("historical receipt mutations are confined to guarded security-definer RPCs", async () => {
  const sql = await readFile(migration, "utf8");
  for (const text of [
    "revoke all on public.vault_historical_delivery_cost_batches",
    "public.vault_historical_delivery_cost_batch_approvals",
    "public.vault_historical_delivery_cost_batch_corrections",
    "grant select on public.vault_historical_delivery_cost_batches",
    "create or replace function public.stage_governed_historical_delivery_cost_batch",
    "security definer",
    "set search_path = public, pg_temp",
    "GOVERNED_HISTORICAL_DELIVERY_OPERATOR_UNAUTHORISED",
    "stated_landed_total_gbp",
    "role in ('owner', 'operator')",
    "DUPLICATE_GOVERNED_HISTORICAL_DELIVERY_SOURCE",
    "STALE_HISTORICAL_DELIVERY_WRITE",
    "approval_status, note, entered_by_operator_id, original_import",
    "'PENDING'",
    "grant execute on function public.stage_governed_historical_delivery_cost_batch",
    "to service_role",
  ]) assert.match(sql, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
