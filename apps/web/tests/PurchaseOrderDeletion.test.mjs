import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../../supabase/migrations/20261083000000_delete_disposable_purchase_orders.sql", import.meta.url),
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

test("draft purchase orders can be deleted", () => {
  assert.match(migration, /purchase_order\.status not in \('draft', 'cancelled'\)/);
  assert.match(listPage, /draft\.status === "draft"/);
});

test("cancelled purchase orders can be deleted", () => {
  assert.match(migration, /purchase_order\.status not in \('draft', 'cancelled'\)/);
  assert.match(migration, /Only draft or cancelled purchase orders can be deleted/);
  assert.match(listPage, /draft\.status === "cancelled"/);
});

test("active purchase orders fail closed without a status exception", () => {
  assert.doesNotMatch(migration, /'active'/);
  assert.match(migration, /status not in \('draft', 'cancelled'\)/);
});

test("shipped purchase orders fail closed without a status exception", () => {
  assert.doesNotMatch(migration, /'shipped'/);
  assert.match(migration, /status not in \('draft', 'cancelled'\)/);
});

test("the deletion check locks the current database row and requires an active operator", () => {
  assert.match(migration, /where po\.id = target_purchase_order_id\s+for update/);
  assert.match(migration, /operator\.id = target_operator_id\s+and operator\.is_active/);
  assert.match(action, /requireAuthenticatedOperator\(\)/);
  assert.match(action, /deleteDisposablePurchaseOrder\(\{ purchaseOrderId, operatorId: operator\.id \}\)/);
  assert.match(repository, /\.rpc\(\s*"delete_disposable_vault_purchase_order"/);
});

test("draft lines are safely removed with their owning header while unrelated purchase orders are untouched", () => {
  assert.match(migration, /select count\(\*\)::integer into line_count[\s\S]*where line\.purchase_order_id = purchase_order\.id/);
  assert.match(migration, /delete from public\.vault_purchase_orders po\s+where po\.id = purchase_order\.id/);
  assert.match(migration, /Purchase-order lines and their size allocations are owned by the header[\s\S]*ON DELETE CASCADE/);
  assert.doesNotMatch(migration, /delete from public\.vault_purchase_orders\s*;/);
});

test("payments, receipts, inventory postings, and immutable evidence block deletion", () => {
  assert.match(migration, /coalesce\(purchase_order\.paid_amount_gbp, 0\) <> 0/);
  assert.match(migration, /vault_purchase_order_payments/);
  assert.match(migration, /vault_purchase_order_receipts/);
  assert.match(migration, /vault_purchase_order_receipt_lines/);
  assert.match(migration, /vault_purchase_order_receipt_cost_dispositions/);
  assert.match(migration, /vault_purchase_order_inventory_postings/);
  assert.match(migration, /vault_purchase_order_events/);
  assert.match(migration, /vault_purchase_order_freight_evidence/);
  assert.match(migration, /vault_purchase_order_freight_allocation_lines/);
  assert.match(migration, /vault_purchase_order_gbp_landed_cost_allocation_runs/);
  assert.match(migration, /vault_purchase_order_gbp_landed_cost_allocation_lines/);
});

test("the eligible list action requires the mandated destructive confirmation", () => {
  assert.match(button, /Delete this purchase order permanently\? This cannot be undone\./);
  assert.match(button, /window\.confirm/);
  assert.match(action, /Purchase order permanently deleted\./);
});
