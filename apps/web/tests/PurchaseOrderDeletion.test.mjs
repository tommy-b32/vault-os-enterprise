import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const governedDeletionMigration = await readFile(
  new URL("../../../supabase/migrations/20261086000000_allow_disposable_cancelled_purchase_order_deletion.sql", import.meta.url),
  "utf8",
);
const originalDeletionMigration = await readFile(
  new URL("../../../supabase/migrations/20261083000000_delete_disposable_purchase_orders.sql", import.meta.url),
  "utf8",
);
const eventProtectionMigration = await readFile(
  new URL("../../../supabase/migrations/20261085000000_governed_disposable_draft_event_deletion.sql", import.meta.url),
  "utf8",
);
const repository = await readFile(
  new URL("../lib/purchase-orders/PurchaseOrderRepository.ts", import.meta.url),
  "utf8",
);
const action = await readFile(
  new URL("../app/purchase-orders/actions.ts", import.meta.url),
  "utf8",
);
const listPage = await readFile(
  new URL("../app/purchase-orders/page.tsx", import.meta.url),
  "utf8",
);
const button = await readFile(
  new URL("../components/purchase-orders/DeletePurchaseOrderButton.tsx", import.meta.url),
  "utf8",
);

test("draft and clean cancelled purchase orders can be deleted", () => {
  assert.match(governedDeletionMigration, /purchase_order\.status is distinct from 'draft'[\s\S]*purchase_order\.status is distinct from 'cancelled'/);
  assert.match(listPage, /draft\.status === "draft"/);
  assert.match(listPage, /draft\.status === "cancelled"/);
});

test("cancelled purchase orders need no trusted cancellation reason", () => {
  assert.match(governedDeletionMigration, /Only draft or cancelled purchase orders can be deleted/);
  assert.doesNotMatch(governedDeletionMigration, /cancellation_reason/);
  assert.match(listPage, /statuses: \["closed", "cancelled"\]/);
});

test("active purchase orders fail closed without a status exception", () => {
  assert.doesNotMatch(governedDeletionMigration, /'active'/);
  assert.match(governedDeletionMigration, /Only draft or cancelled purchase orders can be deleted/);
});

test("shipped purchase orders fail closed without a status exception", () => {
  assert.doesNotMatch(governedDeletionMigration, /'shipped'/);
  assert.match(governedDeletionMigration, /Only draft or cancelled purchase orders can be deleted/);
});

test("the deletion check locks the current database row and requires an active operator", () => {
  assert.match(governedDeletionMigration, /where po\.id = target_purchase_order_id\s+for update/);
  assert.match(governedDeletionMigration, /operator\.id = target_operator_id\s+and operator\.is_active/);
  assert.match(action, /requireAuthenticatedOperator\(\)/);
  assert.match(action, /deleteDisposablePurchaseOrder\(\{ purchaseOrderId, operatorId: operator\.id \}\)/);
  assert.match(repository, /\.rpc\(\s*"delete_disposable_vault_purchase_order"/);
});

test("draft lines are safely removed with their owning header while unrelated purchase orders are untouched", () => {
  assert.match(governedDeletionMigration, /select count\(\*\)::integer\s+into line_count[\s\S]*where line\.purchase_order_id = purchase_order\.id/);
  assert.match(governedDeletionMigration, /delete from public\.vault_purchase_orders po\s+where po\.id = purchase_order\.id/);
  assert.match(governedDeletionMigration, /Owned lines and their size allocations cascade/);
  assert.doesNotMatch(governedDeletionMigration, /delete from public\.vault_purchase_orders\s*;/);
});

test("payments, receipts, inventory postings, and immutable evidence block deletion", () => {
  assert.match(governedDeletionMigration, /coalesce\(purchase_order\.paid_amount_gbp, 0\) <> 0/);
  assert.match(governedDeletionMigration, /vault_purchase_order_payments/);
  assert.match(governedDeletionMigration, /vault_purchase_order_receipts/);
  assert.match(governedDeletionMigration, /vault_purchase_order_receipt_lines/);
  assert.match(governedDeletionMigration, /vault_purchase_order_receipt_cost_dispositions/);
  assert.match(governedDeletionMigration, /vault_purchase_order_inventory_postings/);
  assert.match(governedDeletionMigration, /vault_governed_inventory_cost_lots/);
  assert.match(governedDeletionMigration, /vault_purchase_order_freight_evidence/);
  assert.match(governedDeletionMigration, /vault_purchase_order_freight_allocation_lines/);
  assert.match(governedDeletionMigration, /vault_purchase_order_gbp_landed_cost_allocation_runs/);
  assert.match(governedDeletionMigration, /vault_purchase_order_gbp_landed_cost_allocation_lines/);
});

test("only approved draft-construction events are removed by the governed delete RPC", () => {
  assert.match(governedDeletionMigration, /event\.event_type is null[\s\S]*event\.event_type not in \([\s\S]*fixed_pack_recommendation_added_to_draft[\s\S]*manual_fixed_pack_added_to_draft/);
  assert.match(governedDeletionMigration, /delete from public\.vault_purchase_order_events event[\s\S]*event\.event_type in \([\s\S]*fixed_pack_recommendation_added_to_draft[\s\S]*manual_fixed_pack_added_to_draft/);
  assert.match(governedDeletionMigration, /Purchase order has non-draft operational event evidence/);
});

test("clean cancelled POs and cancelled POs with approved construction events pass the event gate", () => {
  const approvedDraftEvents = [
    "fixed_pack_recommendation_added_to_draft",
    "manual_fixed_pack_added_to_draft",
  ];
  const eventGate = governedDeletionMigration.match(
    /event\.event_type not in \(([\s\S]*?)\)\s*\)\s*\) then/,
  )?.[1] ?? "";

  assert.deepEqual(
    approvedDraftEvents.filter((eventType) => eventGate.includes(eventType)),
    approvedDraftEvents,
  );
  assert.doesNotMatch(
    governedDeletionMigration,
    /if exists \(\s*select 1\s*from public\.vault_purchase_order_events event\s*where event\.purchase_order_id = purchase_order\.id\s*\) then/,
  );
});

test("unexpected cancelled events fail closed while all operational evidence guards remain present", () => {
  assert.match(governedDeletionMigration, /event\.event_type not in \([\s\S]*fixed_pack_recommendation_added_to_draft[\s\S]*manual_fixed_pack_added_to_draft/);
  for (const relation of [
    "vault_purchase_order_payments",
    "vault_purchase_order_cash_payment_reconciliations",
    "vault_purchase_order_receipts",
    "vault_purchase_order_receipt_lines",
    "vault_purchase_order_receipt_cost_dispositions",
    "vault_purchase_order_inventory_postings",
    "vault_governed_inventory_cost_lots",
    "vault_purchase_order_expected_lead_time_evidence",
    "vault_purchase_order_freight_evidence",
    "vault_purchase_order_fx_commitment_evidence",
    "vault_purchase_order_line_merchandise_cost_evidence",
    "vault_purchase_order_freight_allocation_runs",
    "vault_purchase_order_freight_allocation_lines",
    "vault_purchase_order_gbp_landed_cost_allocation_runs",
    "vault_purchase_order_gbp_landed_cost_allocation_lines",
  ]) assert.match(governedDeletionMigration, new RegExp(relation));
});

test("event append-only protection permits only the postgres-owned governed RPC marker", () => {
  assert.match(governedDeletionMigration, /security definer/);
  assert.match(governedDeletionMigration, /current_user <> 'postgres'/);
  assert.match(eventProtectionMigration, /current_setting\('vault\.disposable_draft_event_deletion', true\) = 'on'/);
  assert.match(governedDeletionMigration, /set_config\('vault\.disposable_draft_event_deletion', 'on', true\)/);
  assert.doesNotMatch(eventProtectionMigration, /disable trigger/i);
  assert.doesNotMatch(eventProtectionMigration, /drop trigger/i);
  assert.match(eventProtectionMigration, /raise exception 'Purchase-order event evidence is append-only'/);
});

test("the applied governed deletion migrations remain unchanged", () => {
  assert.match(originalDeletionMigration, /Only draft or cancelled purchase orders can be deleted/);
  assert.doesNotMatch(eventProtectionMigration, /alter table public\.vault_purchase_order_events.*disable trigger/is);
});

test("the eligible list action requires the mandated destructive confirmation", () => {
  assert.match(button, /Delete this purchase order permanently\? This cannot be undone\./);
  assert.match(button, /window\.confirm/);
  assert.match(action, /Purchase order permanently deleted\./);
});
