import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../../supabase/migrations/20261084000000_cleanup_obsolete_exclusive_test_draft.sql", import.meta.url),
  "utf8",
);
const governedDeletionMigration = await readFile(
  new URL("../../../supabase/migrations/20261083000000_delete_disposable_purchase_orders.sql", import.meta.url),
  "utf8",
);

test("obsolete Exclusive test-draft cleanup is limited to the exact purchase order, lines, and events", () => {
  assert.match(migration, /5328b05b-b46b-4403-80bb-f3e062fda1a0/);
  assert.match(migration, /7302925c-df69-4f24-bcc9-5aea6cb753d4/);
  assert.match(migration, /14555f78-16b4-4d46-aea6-5ee44bcf5e71/);
  assert.match(migration, /ee43e4eb-ec2f-41ca-9185-51067287cf1a/);
  assert.match(migration, /fad9dad5-e358-4c56-be79-8763442790ab/);
  assert.match(migration, /fixed_pack_recommendation_added_to_draft/);
  assert.match(migration, /manual_fixed_pack_added_to_draft/);
});

test("cleanup fails closed for extra audit events and operational evidence", () => {
  assert.match(migration, /count\(\*\).*vault_purchase_order_events[\s\S]*<> 2/);
  assert.match(migration, /event\.id <> all\(expected_event_ids\)/);
  assert.match(migration, /vault_purchase_order_payments/);
  assert.match(migration, /vault_purchase_order_receipts/);
  assert.match(migration, /vault_governed_inventory_cost_lots/);
  assert.match(migration, /vault_purchase_order_gbp_landed_cost_allocation_lines/);
  assert.match(migration, /operational or accounting evidence/);
});

test("cleanup temporarily disables only the verified event append-only trigger", () => {
  assert.match(
    migration,
    /alter table public\.vault_purchase_order_events\s+disable trigger vault_purchase_order_events_append_only;/,
  );
  assert.match(
    migration,
    /alter table public\.vault_purchase_order_events\s+enable trigger vault_purchase_order_events_append_only;/,
  );
  assert.doesNotMatch(migration, /disable trigger all/i);
  assert.doesNotMatch(migration, /disable trigger user/i);
  assert.match(
    migration,
    /delete from public\.vault_purchase_order_events event\s+where event\.purchase_order_id = target_purchase_order_id\s+and event\.id = any\(expected_event_ids\);/,
  );
});

test("cleanup does not weaken the reusable governed deletion policy", () => {
  assert.doesNotMatch(migration, /create (or replace )?function public\.delete_disposable_vault_purchase_order/i);
  assert.match(governedDeletionMigration, /Purchase order with immutable operational evidence cannot be deleted/);
});
