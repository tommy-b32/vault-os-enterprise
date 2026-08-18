import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const baseMigration = await readFile(new URL("../../supabase/migrations/20260823000000_purchase_order_receiving.sql", root), "utf8");
const allocationMigration = await readFile(new URL("../../supabase/migrations/20260824000000_purchase_order_receipt_variant_allocations.sql", root), "utf8");
const physicalAccountingMigration = await readFile(new URL("../../supabase/migrations/20260829000000_purchase_order_receiving_physical_accounting.sql", root), "utf8");
const migration = [baseMigration, allocationMigration, physicalAccountingMigration].join("\n");
const repository = await readFile(new URL("lib/purchase-orders/PurchaseOrderRepository.ts", root), "utf8");
const actions = await readFile(new URL("app/purchase-orders/actions.ts", root), "utf8");
const page = await readFile(new URL("app/purchase-orders/[id]/page.tsx", root), "utf8");
const component = await readFile(new URL("components/purchase-orders/PurchaseOrderReceiving.tsx", root), "utf8");
const receivingFunction = physicalAccountingMigration.slice(
  physicalAccountingMigration.indexOf("create or replace function public.record_vault_purchase_order_receipt"),
  physicalAccountingMigration.indexOf("revoke all on function public.record_vault_purchase_order_receipt"),
);

function applyReceipt(ordered, previousSellable, previousNonSellable, sellable, nonSellable) {
  const previousPhysical = previousSellable + previousNonSellable;
  const proposedPhysical = sellable + nonSellable;
  if (![sellable, nonSellable].every(Number.isInteger) || proposedPhysical <= 0) {
    throw new Error("invalid receipt");
  }
  if (previousPhysical + proposedPhysical > ordered) throw new Error("over receipt");
  const physicallyAccounted = previousPhysical + proposedPhysical;
  return { physicallyAccounted, remaining: ordered - physicallyAccounted };
}

test("partial and final receipts retain cumulative ordered, received and remaining quantities", () => {
  assert.deepEqual(applyReceipt(10, 0, 0, 6, 2), { physicallyAccounted: 8, remaining: 2 });
  assert.deepEqual(applyReceipt(10, 6, 2, 2, 0), { physicallyAccounted: 10, remaining: 0 });
  assert.throws(() => applyReceipt(10, 6, 2, 3, 0), /over receipt/);
  assert.match(receivingFunction, /already_physically_accounted \+ target_quantity \+ target_non_sellable_quantity > ordered_quantity/);
  assert.match(receivingFunction, /bool_and\(received\.physically_accounted_quantity = received\.ordered_quantity\)/);
});

test("eight sellable plus two damaged units fully account for a ten-unit order", () => {
  assert.deepEqual(applyReceipt(10, 0, 0, 8, 2), {
    physicallyAccounted: 10,
    remaining: 0,
  });
  assert.throws(() => applyReceipt(10, 8, 2, 2, 0), /over receipt/);
});

test("six sellable plus two damaged units leave two physically expected", () => {
  assert.deepEqual(applyReceipt(10, 0, 0, 6, 2), {
    physicallyAccounted: 8,
    remaining: 2,
  });
});

test("historical sellable and non-sellable evidence both prevent physical over-receipt", () => {
  assert.match(receivingFunction, /sum\(\s*receipt_line\.quantity_received \+ receipt_line\.non_sellable_quantity\s*\)/);
  assert.match(receivingFunction, /Physical receipt exceeds the ordered quantity/);
  assert.throws(() => applyReceipt(10, 5, 3, 2, 1), /over receipt/);
});

test("PO completion requires every line to be fully physically accounted", () => {
  assert.match(receivingFunction, /bool_and\(received\.physically_accounted_quantity = received\.ordered_quantity\)/);
  assert.match(receivingFunction, /set status = 'received', received_at = next_received_at/);
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
  assert.match(component, /Ordered[\s\S]*Physically accounted[\s\S]*Sellable received[\s\S]*Non-sellable[\s\S]*Remaining expected/);
  assert.match(component, /line\.orderedQuantity - physicallyAccounted/);
  assert.match(component, /line\.receivedQuantity \+ line\.nonSellableQuantity >= line\.orderedQuantity/);
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
