import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const baseMigration = await readFile(new URL("../../supabase/migrations/20260823000000_purchase_order_receiving.sql", root), "utf8");
const allocationMigration = await readFile(new URL("../../supabase/migrations/20260824000000_purchase_order_receipt_variant_allocations.sql", root), "utf8");
const migration = [baseMigration, allocationMigration].join("\n");
const repository = await readFile(new URL("lib/purchase-orders/PurchaseOrderRepository.ts", root), "utf8");
const actions = await readFile(new URL("app/purchase-orders/actions.ts", root), "utf8");
const page = await readFile(new URL("app/purchase-orders/[id]/page.tsx", root), "utf8");
const component = await readFile(new URL("components/purchase-orders/PurchaseOrderReceiving.tsx", root), "utf8");
const receivingFunction = allocationMigration.slice(
  allocationMigration.indexOf("create function public.record_vault_purchase_order_receipt"),
  allocationMigration.indexOf("revoke all on function public.record_vault_purchase_order_receipt", allocationMigration.indexOf("create function public.record_vault_purchase_order_receipt")),
);

function applyReceipt(ordered, previous, received) {
  if (!Number.isInteger(received) || received <= 0) throw new Error("invalid receipt");
  if (previous + received > ordered) throw new Error("over receipt");
  return { total: previous + received, remaining: ordered - previous - received };
}

test("partial and final receipts retain cumulative ordered, received and remaining quantities", () => {
  assert.deepEqual(applyReceipt(10, 0, 6), { total: 6, remaining: 4 });
  assert.deepEqual(applyReceipt(10, 6, 4), { total: 10, remaining: 0 });
  assert.throws(() => applyReceipt(10, 6, 5), /over receipt/);
  assert.match(receivingFunction, /already_received \+ target_quantity > ordered_quantity/);
  assert.match(receivingFunction, /bool_and\(received\.total_received = received\.ordered_quantity\)/);
});

test("only persisted PO lines and eligible fulfillment states can be received", () => {
  assert.match(receivingFunction, /status not in \('ordered', 'part_paid', 'paid', 'shipped'\)/);
  assert.match(receivingFunction, /line\.id = target_line_id and line\.purchase_order_id = purchase_order\.id/);
  assert.doesNotMatch(receivingFunction, /'draft'|'approved'|'cancelled'/);
  assert.match(receivingFunction, /set status = 'received', received_at = next_received_at/);
});

test("receipt evidence is atomic, append-only and retry-safe", () => {
  assert.match(migration, /create table if not exists public\.vault_purchase_order_receipts/);
  assert.match(migration, /create table if not exists public\.vault_purchase_order_receipt_lines/);
  assert.match(migration, /unique \(purchase_order_id, idempotency_key\)/);
  assert.match(migration, /Purchase-order receipt evidence is append-only/);
  assert.match(migration, /before update or delete on public\.vault_purchase_order_receipts/);
  assert.match(migration, /before update or delete on public\.vault_purchase_order_receipt_lines/);
  assert.match(receivingFunction, /if found then[\s\S]*purchase_order\.status = 'received', false/);
  assert.match(receivingFunction, /insert into public\.vault_purchase_order_receipts[\s\S]*insert into public\.vault_purchase_order_receipt_lines/);
});

test("receiving records true dates, operator evidence and discrepancies", () => {
  assert.match(migration, /received_date date not null/);
  assert.match(migration, /created_by_operator_id uuid not null references public\.vault_operators/);
  assert.match(migration, /discrepancy_note text null/);
  assert.match(actions, /requireAuthenticatedOperator\(\)[\s\S]*recordPurchaseOrderReceipt/);
  assert.match(component, /Count only accepted sellable units/);
});

test("receiving never mutates cash, payments, Shopify inventory, or PO lines", () => {
  assert.doesNotMatch(receivingFunction, /vault_cash_transactions|vault_purchase_order_payments|vault_inventory_levels/);
  assert.doesNotMatch(receivingFunction, /update public\.vault_purchase_order_lines/);
  assert.match(component, /does not alter Shopify inventory automatically/);
  assert.doesNotMatch(actions + repository + component, /shopify-inventory|inventoryAdjust|cash_transaction.*insert/i);
});

test("received unpaid liability remains committed and payable without losing fulfillment truth", () => {
  assert.match(migration, /status in \('approved', 'ordered', 'part_paid', 'shipped', 'received'\)/);
  assert.match(migration, /purchase_order\.status not in \('ordered', 'part_paid', 'shipped', 'received'\)/);
  assert.match(migration, /when purchase_order\.status in \('shipped', 'received'\) then purchase_order\.status/);
  assert.doesNotMatch(receivingFunction, /paid_amount_gbp\s*=|vault_purchase_order_payments/);
});

test("receiving UI exposes totals, history, line inputs, receipt date and refresh", () => {
  assert.match(component, /Ordered[\s\S]*Physically received[\s\S]*Remaining to post/);
  assert.match(component, /Previous receipts/);
  assert.match(component, /name={`allocation:\$\{line\.id\}:\$\{variant\.id\}`}/);
  assert.match(component, /name="received_date"/);
  assert.match(component, /router\.refresh\(\)/);
  assert.match(page, /draft\.received_at/);
});

test("receiving remains downstream of persisted orders and imports no intelligence engine", () => {
  assert.match(repository, /\.rpc\(\s*"record_vault_purchase_order_receipt"/);
  assert.doesNotMatch(actions + component + migration, /DemandIntelligenceEngine|SupplierBasketIntelligenceEngine|PurchaseIntelligenceEngine/);
  assert.doesNotMatch(receivingFunction, /recommended_packs\s*=|recommended_units\s*=/);
});
