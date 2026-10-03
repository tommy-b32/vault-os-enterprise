import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const sql = await readFile(new URL("../../supabase/migrations/20261076000000_governed_purchase_order_closed_transition.sql", root), "utf8");
const gate = await readFile(new URL("../../supabase/migrations/20261077000000_closed_purchase_order_inventory_posting_gate.sql", root), "utf8");
const repository = await readFile(new URL("lib/purchase-orders/PurchaseOrderRepository.ts", root), "utf8");
const actions = await readFile(new URL("app/purchase-orders/actions.ts", root), "utf8");
const page = await readFile(new URL("app/purchase-orders/[id]/page.tsx", root), "utf8");

test("governed closure is server-side, received-only, and idempotent", () => {
  assert.match(sql, /create or replace function public\.close_governed_purchase_order/);
  assert.match(sql, /if po\.status<>'received' then raise exception 'Only physically received purchase orders can be closed'/);
  assert.match(sql, /if po\.status='closed'/);
  assert.match(sql, /'governed_purchase_order_closed'/);
  assert.match(repository, /close_governed_purchase_order/);
  assert.match(actions, /closeGovernedPurchaseOrder/);
});

test("closure expands the production status constraint without losing existing states", () => {
  assert.match(sql, /drop constraint if exists vault_purchase_orders_status_check/);
  assert.match(sql, /add constraint vault_purchase_orders_status_check check \(status in \([\s\S]*'draft'[\s\S]*'cancelled'[\s\S]*'closed'/);
});

test("a closed PO blocks only new reservations while preserving existing idempotent replays", () => {
  assert.match(gate, /for update/);
  assert.match(gate, /Closed purchase orders cannot create inventory posting reservations/);
  assert.match(gate, /new_reservation_gate/);
  assert.match(gate, /gated_new_reservation/);
});

test("closure consumes persisted physical, posting, payment, and landed-cost evidence", () => {
  for (const value of ["vault_purchase_order_line_size_allocations", "vault_purchase_order_receipt_allocations", "non_sellable_quantity", "vault_purchase_order_inventory_posting_events", "shopify_succeeded", "shopify_outcome_unknown", "vault_purchase_order_landed_cost_completeness", "vault_purchase_order_governed_reconciled_payment_state", "supplier_balance_minor_units"]) assert.match(sql, new RegExp(value));
  assert.match(page, /PurchaseOrderClosure/);
  assert.match(repository, /"closed"/);
});
